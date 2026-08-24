import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import { ensurePersistedShortOrderNumber } from '@/lib/orderDisplayServer';
import {
  createOrLinkWaslahOrder,
  createWaslahReverseOrder,
  buildWaslahFallbackReference,
  addOrdersToWaslahCart,
  waslahPickupCheckout,
  printWaslahReceipt,
  isWaslahConfigured,
  getWaslahPublicConfig,
  ensureWaslahOrderService,
  resolveWaslahServiceId,
  resolveWaslahOrderLink,
  isWaslahAlreadyProcessedError,
  isWaslahDuplicateReferenceError,
  isWaslahCheckoutCompleteError,
  isWaslahOrderProcessed,
  getWaslahOrder,
  cancelWaslahOrder,
  extractWaslahShipmentDetails,
  extractWaslahPrintReceiptUrl,
} from '@/lib/waslah';
import { buildEmxTrackingUrl } from '@/lib/waslahTracking';
import { resolveEmxCarrierLabelUrl } from '@/lib/waslahEmxLabelPdf';
import {
  buildWaslahOrderPayload,
  buildWaslahBaseReference,
  buildWaslahCanonicalReference,
  buildWaslahReshipReference,
  buildDefaultPickupInfo,
  validateWaslahOrderPayload,
  buildWaslahStoreOrderUpdate,
  isWaslahReversePickupOrder,
} from '@/lib/waslahOrderMapper';
import { hydrateOrderForWaslah } from '@/lib/hydrateWaslahOrder';
import { getWaslahAutoShipEligibility } from '@/lib/waslahAutoShipPolicy';

const SHIPMENT_OPERATION_LEASE_MS = 15 * 60 * 1000;

function shipmentError(message, { status = 500, code = null, detail = null, hint = null } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.detail = detail;
  error.hint = hint;
  return error;
}

function toAtomicOrderSet(update = {}) {
  const atomic = {};
  for (const [key, value] of Object.entries(update)) {
    if (key !== 'waslah') atomic[key] = value;
  }
  for (const [key, value] of Object.entries(update.waslah || {})) {
    // Automatic-shipping state is controlled by the attempt worker and payment
    // reversal handlers. The mapper starts from a hydrated snapshot, so copying
    // these fields here could resurrect PROCESSING over a newer BLOCKED state.
    if (key.startsWith('autoShip')) continue;
    atomic[`waslah.${key}`] = value;
  }
  return atomic;
}

async function assertLatestAutoEligibility(orderId) {
  const latestOrder = await Order.findById(orderId).lean();
  const latestEligibility = getWaslahAutoShipEligibility(latestOrder || {});
  if (!latestEligibility.eligible) {
    throw shipmentError(
      `Order is no longer eligible for automatic EMX shipping: ${latestEligibility.reason}`,
      {
        status: 409,
        code: 'WASLAH_AUTO_SHIP_INELIGIBLE',
        detail: latestEligibility,
      },
    );
  }
  return latestOrder;
}

/**
 * Shared Waslah/EMX shipment orchestration used by both the authenticated store
 * endpoint and unattended automatic shipping. It is resumable whenever a
 * Waslah order ID was persisted before a later cart/checkout/label failure.
 */
export async function shipOrderWithWaslah({
  orderId,
  storeId = '',
  pickupInfo: pickupOverrides = {},
  skipPickup: skipPickupOption = false,
  paymentMethod = 'credit_limit',
  serviceId = '',
  reference = '',
  dryRun = false,
  testCreateOnly = false,
  syncOnly = false,
  manualWaslahOrderId = '',
  allowFallbackReference = true,
  requireAutoEligibility = false,
} = {}) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw shipmentError('orderId is required', { status: 400, code: 'ORDER_ID_REQUIRED' });
  }
  if (!isWaslahConfigured()) {
    throw shipmentError(
      'Waslah is not configured. Set WASLAH_API_TOKEN and WASLAH_API_BASE_URL in .env',
      { status: 503, code: 'WASLAH_NOT_CONFIGURED' },
    );
  }

  await dbConnect();
  const orderQuery = { _id: normalizedOrderId };
  if (storeId) orderQuery.storeId = String(storeId);

  let rawOrder = await Order.findOne(orderQuery).lean();
  if (!rawOrder) {
    throw shipmentError('Order not found', { status: 404, code: 'ORDER_NOT_FOUND' });
  }

  rawOrder = await ensurePersistedShortOrderNumber(rawOrder);
  // Return/replacement reverse pickups must collect from the customer address.
  let skipPickup = isWaslahReversePickupOrder(rawOrder) ? false : Boolean(skipPickupOption);

  // Manual shipping and the background worker share this database lease. The
  // canonical provider reference below is a second line of defence if a
  // process dies after Waslah accepts the order but before its ID is saved.
  let shipmentOperationClaimId = null;
  if (!dryRun) {
    const claimStartedAt = new Date();
    const claimId = crypto.randomUUID();
    const claimedOrder = await Order.findOneAndUpdate(
      {
        ...orderQuery,
        $or: [
          { 'waslah.shipmentOperationClaimId': { $exists: false } },
          { 'waslah.shipmentOperationClaimId': null },
          { 'waslah.shipmentOperationLeaseExpiresAt': { $exists: false } },
          { 'waslah.shipmentOperationLeaseExpiresAt': null },
          { 'waslah.shipmentOperationLeaseExpiresAt': { $lte: claimStartedAt } },
        ],
      },
      {
        $set: {
          'waslah.shipmentOperationClaimId': claimId,
          'waslah.shipmentOperationStartedAt': claimStartedAt,
          'waslah.shipmentOperationLeaseExpiresAt': new Date(
            claimStartedAt.getTime() + SHIPMENT_OPERATION_LEASE_MS,
          ),
        },
      },
      { new: true },
    ).lean();

    if (!claimedOrder) {
      throw shipmentError('An EMX shipment operation is already running for this order.', {
        status: 409,
        code: 'WASLAH_SHIPMENT_IN_PROGRESS',
        hint: 'Wait a moment, then refresh the EMX status instead of creating another shipment.',
      });
    }

    shipmentOperationClaimId = claimId;
    rawOrder = claimedOrder;
  }

  let order;
  let displayReference = '';
  let requestedReference = '';
  let waslahReference = '';
  let legacyFallbackReference = '';
  let canonicalReference = '';
  let legacyMongoReference = '';
  let preferredServiceId = '';
  try {
    order = await hydrateOrderForWaslah(rawOrder);
    displayReference = String(getDisplayOrderNumber(order) || '').replace(/^#/, '');
    const storedReference = String(order.waslah?.reference || '').replace(/^#/, '');
    requestedReference = String(reference || '').replace(/^#/, '').trim();
    canonicalReference = buildWaslahCanonicalReference(order);
    legacyMongoReference = String(normalizedOrderId);
    const baseReference = String(canonicalReference || storedReference || '').replace(/-R\d+$/i, '');
    const hasNoLinkedWaslahOrder = !String(order.waslah?.orderId || '').trim();
    const storedIsOriginalReference = Boolean(storedReference && storedReference === baseReference);
    const needsFreshWaslahReference = Boolean(
      order.waslah?.cancelledAt
      || order.waslah?.unlinkedInWaslah
      || Number(order.waslah?.cancelCount || 0) > 0
      || (hasNoLinkedWaslahOrder && storedIsOriginalReference),
    );
    waslahReference = needsFreshWaslahReference
      ? (buildWaslahReshipReference(order) || `${baseReference}-R1` || legacyMongoReference)
      : (storedReference
        || requestedReference
        || canonicalReference
        || legacyMongoReference);
    legacyFallbackReference = allowFallbackReference || needsFreshWaslahReference
      ? (buildWaslahReshipReference(waslahReference) || buildWaslahFallbackReference(displayReference, order._id))
      : '';
    preferredServiceId = String(serviceId || order.waslah?.serviceId || '').trim();
  } catch (error) {
    if (shipmentOperationClaimId) {
      await Order.findOneAndUpdate(
        {
          _id: normalizedOrderId,
          'waslah.shipmentOperationClaimId': shipmentOperationClaimId,
        },
        {
          $set: {
            'waslah.shipmentOperationClaimId': null,
            'waslah.shipmentOperationLeaseExpiresAt': null,
          },
        },
      ).catch(() => {});
      shipmentOperationClaimId = null;
    }
    throw error;
  }

  try {
    let resolvedServiceId = preferredServiceId;
    if (!dryRun) {
      try {
        resolvedServiceId = await resolveWaslahServiceId({
          orderId: order.waslah?.orderId || '',
          preferredServiceId,
          serviceType: 'DOM',
        });
      } catch (serviceError) {
        throw shipmentError(
          serviceError?.message || 'No Waslah courier service is selected',
          {
            status: 400,
            code: 'WASLAH_SERVICE_REQUIRED',
            hint: 'Fetch an EMX service ID in Store Orders, set WASLAH_SERVICE_ID in the server environment, then restart the server.',
          },
        );
      }
    }

    const payload = buildWaslahOrderPayload(order, {
      reference: waslahReference,
      serviceId: resolvedServiceId || preferredServiceId,
    });
    const validationIssues = validateWaslahOrderPayload(payload);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        createOrderUrl: getWaslahPublicConfig().createOrderUrl,
        payload,
        validationIssues,
        message: validationIssues.length
          ? 'Preview only - fix validation issues before creating a Waslah order.'
          : 'Preview only - no Waslah API calls were made.',
      };
    }

    if (validationIssues.length) {
      throw shipmentError(validationIssues.join(' '), {
        status: 400,
        code: 'WASLAH_VALIDATION_FAILED',
        detail: { validationIssues, payload },
      });
    }

    if (requireAutoEligibility) {
      await assertLatestAutoEligibility(normalizedOrderId);
    }

    const normalizedManualWaslahOrderId = String(manualWaslahOrderId || '').trim();
    let waslahOrderId = order.waslah?.orderId || normalizedManualWaslahOrderId || null;
    let waslahServiceId = resolvedServiceId || preferredServiceId || null;
    let linkedExistingWaslahOrder = Boolean(order.waslah?.orderId || normalizedManualWaslahOrderId);
    let usedFallbackWaslahReference = false;

    if (syncOnly || (normalizedManualWaslahOrderId && !order.waslah?.orderId)) {
      const linked = await resolveWaslahOrderLink({
        waslahOrderId: normalizedManualWaslahOrderId,
        references: [
          waslahReference,
          requestedReference,
          displayReference,
          canonicalReference,
          legacyMongoReference,
          legacyFallbackReference,
        ].filter(Boolean),
      });
      if (!linked?.orderId) {
        throw shipmentError('Could not find the existing Waslah shipment to link.', {
          status: 404,
          code: 'WASLAH_LINK_REQUIRED',
          hint: 'Open ship.waslah.ae, copy the 24-character Waslah Order ID, then use Link & download AWB in Store Orders.',
        });
      }
      waslahOrderId = linked.orderId;
      linkedExistingWaslahOrder = true;
      if (linked.reference) payload.reference = linked.reference;
    } else if (!waslahOrderId) {
      // Never create under an alternate reference. A retry can safely find the
      // canonical reference if the previous process crashed before persistence.
      const created = String(payload.order_type || '').toLowerCase() === 'return'
        ? await createWaslahReverseOrder(payload, {
            outboundWaslahOrderId: String(order.waslah?.orderId || '').trim(),
            fallbackReference: legacyFallbackReference,
          })
        : await createOrLinkWaslahOrder(payload, {
            fallbackReference: legacyFallbackReference,
          });
      waslahOrderId = created.waslahOrderId;
      linkedExistingWaslahOrder = Boolean(created.linkedExisting);
      usedFallbackWaslahReference = Boolean(created.usedFallbackReference);
      if (created.reference) payload.reference = created.reference;

      if (!waslahOrderId) {
        throw shipmentError('Waslah did not return an order id', {
          status: 502,
          code: 'WASLAH_ORDER_ID_MISSING',
        });
      }
    }

    // Persist the external ID before any cart/checkout/label call. A retry can
    // resume this same shipment and cannot accidentally create a second AWB.
    if (waslahOrderId) {
      await Order.findByIdAndUpdate(normalizedOrderId, {
        $set: {
          'waslah.orderId': waslahOrderId,
          'waslah.serviceId': waslahServiceId || order.waslah?.serviceId || null,
          'waslah.reference': payload.reference || order.waslah?.reference || null,
          'waslah.unlinkedInWaslah': false,
        },
      });
      order.waslah = {
        ...(order.waslah || {}),
        orderId: waslahOrderId,
        serviceId: waslahServiceId || order.waslah?.serviceId || null,
        reference: payload.reference || order.waslah?.reference || null,
        unlinkedInWaslah: false,
      };
    }

    // Creating/linking the provider draft and persisting its ID can take long
    // enough for a refund, dispute, or store-status change to arrive. Re-read
    // the order before doing anything that schedules fulfillment.
    if (requireAutoEligibility) {
      await assertLatestAutoEligibility(normalizedOrderId);
    }

    if (testCreateOnly) {
      const preview = await Order.findById(normalizedOrderId).lean();
      return {
        success: true,
        testCreateOnly: true,
        waslahOrderId,
        linkedExisting: linkedExistingWaslahOrder,
        usedFallbackReference: usedFallbackWaslahReference,
        message: linkedExistingWaslahOrder
          ? 'Linked existing Waslah order for this reference (cart/pickup/label skipped).'
          : (usedFallbackWaslahReference
            ? `Waslah order created with alternate reference ${payload.reference} (cart/pickup/label skipped).`
            : 'Waslah order created (cart/pickup/label skipped). Use full ship for pickup + label.'),
        order: preview,
      };
    }

    let cartId = order.waslah?.cartId || null;
    let cartResult = null;
    let checkoutResult = null;
    let syncedExistingShipment = Boolean(order.waslah?.processed);
    let waslahOrderDetail = null;

    if (waslahOrderId) {
      try {
        waslahOrderDetail = await getWaslahOrder(waslahOrderId);
        if (isWaslahOrderProcessed(waslahOrderDetail)) syncedExistingShipment = true;
      } catch (fetchError) {
        console.warn('[waslah-shipment] Could not pre-check Waslah order:', fetchError?.message);
      }
    }

    const pickupInfo = buildDefaultPickupInfo(pickupOverrides || {});
    if (!skipPickup && !syncedExistingShipment) {
      waslahServiceId = await ensureWaslahOrderService(waslahOrderId, {
        createPayload: payload,
        preferredServiceId: waslahServiceId || preferredServiceId,
        serviceType: payload?.shipment?.service_type || 'DOM',
      });

      // Service selection is another external round trip. Keep this check as
      // close as possible to the cart/pickup mutation.
      if (requireAutoEligibility) {
        await assertLatestAutoEligibility(normalizedOrderId);
      }

      try {
        cartResult = await addOrdersToWaslahCart({
          orderIds: [waslahOrderId],
          pickupInfo,
          serviceId: waslahServiceId,
        });
        cartId = cartResult?._id || cartResult?.cart_id || cartId;

        if (cartId) {
          // A provider reversal can race the cart call. Never proceed to the
          // pickup checkout on the strength of the earlier snapshot.
          if (requireAutoEligibility) {
            await assertLatestAutoEligibility(normalizedOrderId);
          }
          try {
            checkoutResult = await waslahPickupCheckout(cartId, paymentMethod || 'credit_limit');
          } catch (checkoutError) {
            if (!isWaslahCheckoutCompleteError(checkoutError)) throw checkoutError;
            syncedExistingShipment = true;
          }
        }
      } catch (cartError) {
        if (!isWaslahAlreadyProcessedError(cartError)) throw cartError;
        syncedExistingShipment = true;
      }
    } else if (order.waslah?.processed) {
      syncedExistingShipment = true;
    }

    if (syncedExistingShipment && !waslahOrderDetail) {
      try {
        waslahOrderDetail = await getWaslahOrder(waslahOrderId);
      } catch (fetchError) {
        console.warn('[waslah-shipment] Could not refresh Waslah order:', fetchError?.message);
      }
    }

    let labelUrl = order.waslah?.labelUrl || null;
    try {
      const printResult = await printWaslahReceipt([waslahOrderId], { withLabel: true, carrierLabelOnly: true });
      const rawUrl = extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel: true }) || printResult?.url || null;
      if (rawUrl) {
        labelUrl = await resolveEmxCarrierLabelUrl(rawUrl, {
          orderId: normalizedOrderId,
          waslahOrderId,
        }) || rawUrl;
      }
    } catch (printError) {
      if (!syncedExistingShipment) throw printError;
      console.warn('[waslah-shipment] Label refresh failed for processed order:', printError?.message);
    }

    // Label print often assigns the EMX 1000… AWB after cart/checkout.
    // Re-fetch Waslah order so we persist the barcode used on the physical label.
    try {
      const refreshed = await getWaslahOrder(waslahOrderId);
      if (refreshed) waslahOrderDetail = refreshed;
    } catch (refreshError) {
      console.warn('[waslah-shipment] Post-label Waslah refresh failed:', refreshError?.message || refreshError);
    }

    let shipmentDetails = extractWaslahShipmentDetails({
      waslahOrder: waslahOrderDetail,
      cartResult,
      waslahOrderId,
    });
    cartId = cartId || shipmentDetails.cartId;
    let trackingNumber = shipmentDetails.trackingNumber
      || shipmentDetails.emxTrackingNumber
      || null;

    // One short retry — EMX AWB can lag a second behind print-receipt.
    if (!trackingNumber) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const delayed = await getWaslahOrder(waslahOrderId);
        if (delayed) {
          waslahOrderDetail = delayed;
          shipmentDetails = extractWaslahShipmentDetails({
            waslahOrder: waslahOrderDetail,
            cartResult,
            waslahOrderId,
          });
          trackingNumber = shipmentDetails.trackingNumber
            || shipmentDetails.emxTrackingNumber
            || null;
        }
      } catch (retryError) {
        console.warn('[waslah-shipment] Delayed AWB retry failed:', retryError?.message || retryError);
      }
    }
    const courierName = shipmentDetails.courierName || order.courier || 'EMX';

    const update = buildWaslahStoreOrderUpdate(order, {
      waslahOrderId,
      waslahServiceId,
      payload,
      trackingNumber,
      emxTrackingNumber: shipmentDetails.emxTrackingNumber || trackingNumber,
      waslahTrackingNumber: shipmentDetails.waslahTrackingNumber,
      courierName,
      labelUrl,
      cartId,
      alreadyProcessed: syncedExistingShipment || Boolean(trackingNumber),
    });

    const atomicUpdate = toAtomicOrderSet(update);
    const desiredOrderStatus = atomicUpdate.status;
    delete atomicUpdate.status;

    // Shipment facts (AWB, courier and provider IDs) remain useful even when a
    // concurrent cancellation/reversal occurs. Persist them without restoring
    // stale workflow state, then advance the commercial status only if it is
    // still in an active pre-shipment state.
    const previousAwb = String(order.waslah?.trackingNumber || order.trackingId || '').trim();
    const nextAwb = String(trackingNumber || '').trim();
    const previousWaslahOrderId = String(order.waslah?.orderId || '').trim();
    const shipmentChanged = Boolean(
      (waslahOrderId && waslahOrderId !== previousWaslahOrderId)
      || (previousAwb && nextAwb && previousAwb !== nextAwb),
    );

    if (checkoutResult && pickupInfo) {
      atomicUpdate['waslah.pickupRequestedAt'] = new Date();
      atomicUpdate['waslah.pickupType'] = pickupInfo.type || 'pickup';
      atomicUpdate['waslah.pickupDate'] = pickupInfo.pickup_date || null;
      atomicUpdate['waslah.pickupTime'] = pickupInfo.pickup_time || null;
      atomicUpdate['waslah.pickupVehicle'] = pickupInfo.pickup_vehicle || null;
    }

    await Order.findByIdAndUpdate(normalizedOrderId, { $set: atomicUpdate });
    if (shipmentChanged) {
      const { buildStatusEmailUnset } = await import('@/lib/orderStatusCustomerNotify');
      await Order.findByIdAndUpdate(normalizedOrderId, { $unset: buildStatusEmailUnset() });
    }
    if (desiredOrderStatus === 'SHIPPED') {
      await Order.findOneAndUpdate(
        {
          _id: normalizedOrderId,
          status: { $in: ['ORDER_PLACED', 'PROCESSING'] },
        },
        { $set: { status: desiredOrderStatus } },
      );
    }
    const updated = await Order.findById(normalizedOrderId).lean();

    let finalOrder = updated;
    if (trackingNumber) {
      try {
        const { syncWaslahStatusForOrder } = await import('@/lib/waslahOrderStatusSync');
        const syncResult = await syncWaslahStatusForOrder(updated, { persist: true, force: true });
        finalOrder = syncResult.order || updated;
      } catch (syncError) {
        console.warn('[waslah-shipment] Live status sync failed:', syncError?.message || syncError);
      }
    }

    const previousStatus = String(order.status || '').toUpperCase();
    const shippedStatus = String(finalOrder?.status || updated?.status || '').toUpperCase();
    if (shippedStatus === 'SHIPPED' && previousStatus !== 'SHIPPED') {
      try {
        const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
        await notifyCustomerOfOrderStatusChange(finalOrder || updated, 'SHIPPED', {
          previousStatus,
          source: 'waslah_ship',
        });
      } catch (emailError) {
        console.error('[waslah-shipment] shipped email failed', emailError?.message || emailError);
      }
    }

    const awbText = trackingNumber ? `AWB ${trackingNumber}` : 'AWB pending';
    const labelText = labelUrl ? 'Label ready - print and attach to parcel.' : '';
    let message = `Waslah shipment created. ${awbText}. ${labelText}`.trim();
    if (syncedExistingShipment) {
      message = `Already in Waslah. ${awbText} synced. ${labelText} EMX pickup may already be scheduled - no need to ship again.`;
    } else if (syncOnly && linkedExistingWaslahOrder) {
      message = `Synced from Waslah. ${awbText}. ${labelText}`;
    } else if (checkoutResult?.success || checkoutResult?.message) {
      message = isWaslahReversePickupOrder(order)
        ? `Pickup scheduled for ${pickupInfo.pickup_date} (${pickupInfo.pickup_time}). ${awbText}. ${labelText} EMX will collect from the customer and deliver to the warehouse.`
        : `Pickup scheduled for ${pickupInfo.pickup_date} (${pickupInfo.pickup_time}). ${awbText}. ${labelText} EMX will collect on the pickup date.`;
    } else if (usedFallbackWaslahReference) {
      message = `Shipped with alternate Waslah reference ${payload.reference} because ${displayReference} was already used. ${awbText}.`;
    } else if (linkedExistingWaslahOrder) {
      message = `Linked existing Waslah shipment and continued pickup. ${awbText}.`;
    }

    return {
      success: true,
      alreadyProcessed: syncedExistingShipment,
      linkedExisting: linkedExistingWaslahOrder,
      usedFallbackReference: usedFallbackWaslahReference,
      waslahOrderId,
      cartId,
      trackingNumber,
      labelUrl,
      courier: courierName,
      checkout: checkoutResult,
      pickupInfo,
      createOrderUrl: getWaslahPublicConfig().createOrderUrl,
      message,
      order: finalOrder,
    };
  } catch (error) {
    error.orderId = error.orderId || normalizedOrderId;
    error.reference = error.reference || displayReference || null;
    throw error;
  } finally {
    if (shipmentOperationClaimId) {
      try {
        await Order.findOneAndUpdate(
          {
            _id: normalizedOrderId,
            'waslah.shipmentOperationClaimId': shipmentOperationClaimId,
          },
          {
            $set: {
              'waslah.shipmentOperationClaimId': null,
              'waslah.shipmentOperationLeaseExpiresAt': null,
            },
          },
        );
      } catch (releaseError) {
        console.error('[waslah-shipment] Could not release shipment operation lease:', releaseError);
      }
    }
  }
}

const MAX_BULK_SHIP_ORDERS = 25;

/**
 * Create EMX/Waslah shipments for many store orders (skip pickup by default).
 * Processes sequentially so one failure does not block the rest.
 */
export async function shipOrdersWithWaslah({
  orderIds = [],
  storeId = '',
  pickupInfo: pickupOverrides = {},
  skipPickup = true,
  paymentMethod = 'credit_limit',
  serviceId = '',
} = {}) {
  const uniqueIds = [...new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];

  if (!uniqueIds.length) {
    throw shipmentError('At least one orderId is required', {
      status: 400,
      code: 'ORDER_ID_REQUIRED',
    });
  }
  if (uniqueIds.length > MAX_BULK_SHIP_ORDERS) {
    throw shipmentError(`Select at most ${MAX_BULK_SHIP_ORDERS} orders to send to EMX`, {
      status: 400,
      code: 'BULK_SHIP_LIMIT',
    });
  }

  const results = [];
  const orders = [];
  let succeeded = 0;
  let failed = 0;

  for (const orderId of uniqueIds) {
    try {
      const result = await shipOrderWithWaslah({
        orderId,
        storeId,
        pickupInfo: pickupOverrides,
        skipPickup,
        paymentMethod,
        serviceId,
        allowFallbackReference: false,
      });
      succeeded += 1;
      if (result?.order) orders.push(result.order);
      results.push({
        orderId,
        success: true,
        trackingNumber: result?.trackingNumber || result?.order?.trackingId || null,
        waslahOrderId: result?.waslahOrderId || result?.order?.waslah?.orderId || null,
        message: result?.message || null,
      });
    } catch (error) {
      failed += 1;
      results.push({
        orderId,
        success: false,
        error: error?.message || 'Send to EMX failed',
        code: error?.code || null,
        reference: error?.reference || null,
      });
    }
  }

  return {
    success: succeeded > 0,
    succeeded,
    failed,
    total: uniqueIds.length,
    results,
    orders,
    message: failed
      ? `Sent ${succeeded} of ${uniqueIds.length} order(s) to EMX; ${failed} failed. Schedule pickup next.`
      : `Sent ${succeeded} order(s) to EMX. Schedule pickup next.`,
  };
}

const PICKUP_REQUEST_STATUS_ELIGIBLE = new Set([
  'ORDER_PLACED',
  'CONFIRMED',
  'PROCESSING',
  'WAITING_FOR_PICKUP',
  'RETURN',
  'REPLACEMENT',
]);

/**
 * Schedule an EMX pickup for an order that already has a Waslah shipment.
 * Reuses POST /cart + POST /cart/pickup-checkout.
 */
export async function requestWaslahPickupForOrder({
  orderId,
  storeId = '',
  pickupInfo: pickupOverrides = {},
  paymentMethod = 'credit_limit',
  serviceId = '',
} = {}) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw shipmentError('orderId is required', { status: 400, code: 'ORDER_ID_REQUIRED' });
  }
  if (!isWaslahConfigured()) {
    throw shipmentError(
      'Waslah is not configured. Set WASLAH_API_TOKEN and WASLAH_API_BASE_URL in .env',
      { status: 503, code: 'WASLAH_NOT_CONFIGURED' },
    );
  }

  await dbConnect();
  const orderQuery = { _id: normalizedOrderId };
  if (storeId) orderQuery.storeId = String(storeId);

  const order = await Order.findOne(orderQuery).lean();
  if (!order) {
    throw shipmentError('Order not found', { status: 404, code: 'ORDER_NOT_FOUND' });
  }

  const waslahOrderId = String(order.waslah?.orderId || '').trim();
  if (!waslahOrderId) {
    throw shipmentError('Ship with EMX first, then request pickup.', {
      status: 400,
      code: 'WASLAH_ORDER_REQUIRED',
    });
  }
  if (order.waslah?.cancelledAt && !waslahOrderId) {
    throw shipmentError('This Waslah shipment was cancelled. Ship again before requesting pickup.', {
      status: 409,
      code: 'WASLAH_SHIPMENT_CANCELLED',
    });
  }

  const pickupInfo = buildDefaultPickupInfo(pickupOverrides || {});
  const preferredServiceId = String(serviceId || order.waslah?.serviceId || '').trim();
  let waslahServiceId = preferredServiceId;
  let cartId = order.waslah?.cartId || null;
  let cartResult = null;
  let checkoutResult = null;
  let alreadyScheduled = false;

  waslahServiceId = await ensureWaslahOrderService(waslahOrderId, {
    preferredServiceId,
    serviceType: 'DOM',
  });

  try {
    cartResult = await addOrdersToWaslahCart({
      orderIds: [waslahOrderId],
      pickupInfo,
      serviceId: waslahServiceId,
    });
    cartId = cartResult?._id || cartResult?.cart_id || cartId;

    if (cartId) {
      try {
        checkoutResult = await waslahPickupCheckout(cartId, paymentMethod || 'credit_limit');
      } catch (checkoutError) {
        if (!isWaslahCheckoutCompleteError(checkoutError)) throw checkoutError;
        alreadyScheduled = true;
      }
    }
  } catch (cartError) {
    if (!isWaslahAlreadyProcessedError(cartError)) throw cartError;
    alreadyScheduled = true;
  }

  const pickupRequestedAt = new Date();
  const previousStatus = String(order.status || '').toUpperCase();
  const nextStatus = PICKUP_REQUEST_STATUS_ELIGIBLE.has(previousStatus)
    ? 'PICKUP_REQUESTED'
    : previousStatus;

  let waslahOrderDetail = null;
  try {
    waslahOrderDetail = await getWaslahOrder(waslahOrderId);
  } catch (fetchError) {
    console.warn('[waslah-pickup] Could not refresh Waslah order for AWB:', fetchError?.message);
  }

  const shipmentDetails = extractWaslahShipmentDetails({
    waslahOrder: waslahOrderDetail,
    cartResult,
    waslahOrderId,
  });
  const trackingNumber = shipmentDetails.trackingNumber
    || shipmentDetails.emxTrackingNumber
    || null;
  const courierName = shipmentDetails.courierName || order.courier || 'EMX';

  let labelUrl = order.waslah?.labelUrl || null;
  try {
    const printResult = await printWaslahReceipt([waslahOrderId], { withLabel: true, carrierLabelOnly: true });
    const rawUrl = extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel: true }) || printResult?.url || null;
    if (rawUrl) {
      labelUrl = await resolveEmxCarrierLabelUrl(rawUrl, {
        orderId: normalizedOrderId,
        waslahOrderId,
      }) || rawUrl;
    }
  } catch (printError) {
    console.warn('[waslah-pickup] Label refresh failed:', printError?.message);
  }

  const updated = await Order.findByIdAndUpdate(
    normalizedOrderId,
    {
      $set: {
        ...(nextStatus !== previousStatus ? { status: nextStatus } : {}),
        ...(trackingNumber ? { trackingId: trackingNumber, courier: courierName } : {}),
        ...(trackingNumber ? {
          trackingUrl: buildEmxTrackingUrl(trackingNumber),
        } : {}),
        'waslah.cartId': cartId,
        'waslah.serviceId': waslahServiceId || order.waslah?.serviceId || null,
        'waslah.pickupRequestedAt': pickupRequestedAt,
        'waslah.pickupType': pickupInfo.type || 'pickup',
        'waslah.pickupDate': pickupInfo.pickup_date || null,
        'waslah.pickupTime': pickupInfo.pickup_time || null,
        'waslah.pickupVehicle': pickupInfo.pickup_vehicle || null,
        ...(trackingNumber ? {
          'waslah.trackingNumber': trackingNumber,
          'waslah.emxTrackingNumber': trackingNumber,
          'waslah.processed': true,
        } : {}),
        ...(shipmentDetails.waslahTrackingNumber ? {
          'waslah.waslahTrackingNumber': shipmentDetails.waslahTrackingNumber,
        } : {}),
        ...(labelUrl ? { 'waslah.labelUrl': labelUrl } : {}),
      },
    },
    { new: true },
  ).lean();

  if (nextStatus === 'PICKUP_REQUESTED' && previousStatus !== 'PICKUP_REQUESTED') {
    try {
      const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
      await notifyCustomerOfOrderStatusChange(updated, 'PICKUP_REQUESTED', {
        previousStatus,
        source: 'waslah_pickup',
      });
    } catch (emailError) {
      console.error('[waslah-pickup] customer email failed', emailError?.message || emailError);
    }
  }

  const dateLabel = pickupInfo.pickup_date || 'the selected date';
  const timeLabel = pickupInfo.pickup_time ? ` (${pickupInfo.pickup_time})` : '';
  const awbText = trackingNumber ? ` EMX tracking ${trackingNumber}.` : '';
  const message = alreadyScheduled
    ? `EMX pickup is already scheduled for this shipment. Requested window: ${dateLabel}${timeLabel}.${awbText}`
    : `Pickup requested for ${dateLabel}${timeLabel}.${awbText} Print the carrier label and attach it before collection.`;

  return {
    success: true,
    alreadyScheduled,
    cartId,
    pickupInfo,
    trackingNumber,
    labelUrl,
    message,
    order: updated,
  };
}

const MAX_BULK_PICKUP_ORDERS = 25;

/**
 * Schedule EMX pickup for many store orders (same pickup window).
 * Processes sequentially so one Waslah failure does not block the rest.
 */
export async function requestWaslahPickupForOrders({
  orderIds = [],
  storeId = '',
  pickupInfo: pickupOverrides = {},
  paymentMethod = 'credit_limit',
  serviceId = '',
} = {}) {
  const uniqueIds = [...new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];

  if (!uniqueIds.length) {
    throw shipmentError('At least one orderId is required', {
      status: 400,
      code: 'ORDER_ID_REQUIRED',
    });
  }
  if (uniqueIds.length > MAX_BULK_PICKUP_ORDERS) {
    throw shipmentError(`Select at most ${MAX_BULK_PICKUP_ORDERS} orders for bulk pickup`, {
      status: 400,
      code: 'BULK_PICKUP_LIMIT',
    });
  }

  const results = [];
  const orders = [];
  let succeeded = 0;
  let failed = 0;

  for (const orderId of uniqueIds) {
    try {
      const result = await requestWaslahPickupForOrder({
        orderId,
        storeId,
        pickupInfo: pickupOverrides,
        paymentMethod,
        serviceId,
      });
      succeeded += 1;
      if (result?.order) orders.push(result.order);
      results.push({
        orderId,
        success: true,
        alreadyScheduled: Boolean(result?.alreadyScheduled),
        trackingNumber: result?.trackingNumber || null,
        message: result?.message || null,
      });
    } catch (error) {
      failed += 1;
      results.push({
        orderId,
        success: false,
        error: error?.message || 'Pickup failed',
        code: error?.code || null,
      });
    }
  }

  return {
    success: succeeded > 0,
    succeeded,
    failed,
    total: uniqueIds.length,
    pickupInfo: buildDefaultPickupInfo(pickupOverrides || {}),
    results,
    orders,
    message: failed
      ? `Pickup scheduled for ${succeeded} of ${uniqueIds.length} order(s); ${failed} failed.`
      : `Pickup scheduled for ${succeeded} order(s).`,
  };
}

/**
 * Create the reverse EMX pickup on the original sale order (customer → warehouse).
 * Does not clone a second store order and does not overwrite the outbound AWB.
 */
export async function shipReversePickupForOriginalOrder({
  orderId,
  storeId = '',
  pickupInfo: pickupOverrides = {},
  pickupAddress = null,
  paymentMethod = 'credit_limit',
  serviceId = '',
  returnReason = '',
  returnRequestNumber = '',
} = {}) {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw shipmentError('orderId is required', { status: 400, code: 'ORDER_ID_REQUIRED' });
  }
  if (!isWaslahConfigured()) {
    return { skipped: true, reason: 'waslah_not_configured' };
  }

  await dbConnect();
  const orderQuery = { _id: normalizedOrderId };
  if (storeId) orderQuery.storeId = String(storeId);
  const rawOrder = await Order.findOne(orderQuery).lean();
  if (!rawOrder) {
    throw shipmentError('Order not found', { status: 404, code: 'ORDER_NOT_FOUND' });
  }

  if (rawOrder.waslahReturn?.trackingNumber) {
    return {
      success: true,
      skipped: false,
      alreadyProcessed: true,
      waslahOrderId: rawOrder.waslahReturn.orderId,
      trackingNumber: rawOrder.waslahReturn.trackingNumber || null,
      message: 'Reverse pickup is already on EMX for this order.',
    };
  }

  const reverseOrder = {
    ...rawOrder,
    fulfillmentKind: 'RETURN',
    waslah: {},
    status: 'PICKUP_REQUESTED',
    ...(pickupAddress && typeof pickupAddress === 'object' ? { shippingAddress: pickupAddress } : {}),
  };
  const hydrated = await hydrateOrderForWaslah(reverseOrder);
  const baseReference = buildWaslahBaseReference(hydrated);
  const reference = String(rawOrder.waslahReturn?.reference || '')
    || (baseReference ? `${baseReference}-RP` : `RP${String(normalizedOrderId).slice(-8)}`);

  let resolvedServiceId = String(serviceId || rawOrder.waslahReturn?.serviceId || rawOrder.waslah?.serviceId || '').trim();
  try {
    resolvedServiceId = await resolveWaslahServiceId({
      orderId: '',
      preferredServiceId: resolvedServiceId,
      serviceType: 'DOM',
    }) || resolvedServiceId;
  } catch (serviceError) {
    throw shipmentError(
      serviceError?.message || 'No Waslah courier service is selected',
      {
        status: 400,
        code: 'WASLAH_SERVICE_REQUIRED',
        hint: 'Fetch an EMX service ID in Store Orders, set WASLAH_SERVICE_ID in the server environment, then restart the server.',
      },
    );
  }

  const payload = buildWaslahOrderPayload(hydrated, {
    reference,
    serviceId: resolvedServiceId,
    originalWaslahOrderId: rawOrder.waslah?.orderId,
    originalTrackingNumber: rawOrder.waslah?.trackingNumber || rawOrder.trackingId,
    originalReference: baseReference,
    returnReason: String(returnReason || '').trim() || 'Customer return',
    returnRequestNumber: String(returnRequestNumber || '').trim(),
  });
  const validationIssues = validateWaslahOrderPayload(payload);
  if (validationIssues.length) {
    throw shipmentError(validationIssues.join(' '), {
      status: 400,
      code: 'WASLAH_VALIDATION_FAILED',
      detail: { validationIssues, payload },
    });
  }

  let waslahOrderId = String(rawOrder.waslahReturn?.orderId || '').trim();
  if (waslahOrderId) {
    let existingWaslah = null;
    try {
      existingWaslah = await getWaslahOrder(waslahOrderId);
    } catch (fetchError) {
      console.warn('[waslah-reverse-pickup] Could not load existing reverse order:', fetchError?.message);
    }
    const existingDetails = extractWaslahShipmentDetails({
      waslahOrder: existingWaslah,
      waslahOrderId,
    });
    const existingTracking = existingDetails.trackingNumber || existingDetails.emxTrackingNumber || null;
    if (existingTracking) {
      await Order.findByIdAndUpdate(normalizedOrderId, {
        $set: {
          'waslahReturn.orderId': waslahOrderId,
          'waslahReturn.reference': payload.reference || reference,
          'waslahReturn.trackingNumber': existingTracking,
          'waslahReturn.processed': Boolean(existingTracking),
        },
      });
      return {
        success: true,
        skipped: false,
        alreadyProcessed: true,
        waslahOrderId,
        trackingNumber: existingTracking,
        message: 'Reverse pickup is already on EMX for this order.',
      };
    }
    try {
      await cancelWaslahOrder(waslahOrderId);
    } catch (cancelError) {
      console.warn('[waslah-reverse-pickup] Could not cancel incomplete reverse draft:', cancelError?.message || cancelError);
    }
    waslahOrderId = '';
  }

  if (!waslahOrderId) {
    const created = await createWaslahReverseOrder(payload, {
      outboundWaslahOrderId: String(rawOrder.waslah?.orderId || '').trim(),
      fallbackReference: `${reference}-2`,
    });
    waslahOrderId = created?.waslahOrderId || null;
  }

  if (!waslahOrderId) {
    throw shipmentError('Waslah did not return an order id', {
      status: 502,
      code: 'WASLAH_ORDER_ID_MISSING',
    });
  }

  await Order.findByIdAndUpdate(normalizedOrderId, {
    $set: {
      'waslahReturn.orderId': waslahOrderId,
      'waslahReturn.reference': payload.reference || reference,
      'waslahReturn.serviceId': resolvedServiceId || null,
    },
  });

  const pickupInfo = buildDefaultPickupInfo(pickupOverrides || {});
  let cartResult = null;
  let checkoutResult = null;
  let waslahServiceId = resolvedServiceId || null;

  try {
    waslahServiceId = await ensureWaslahOrderService(waslahOrderId, {
      createPayload: payload,
      preferredServiceId: resolvedServiceId,
      serviceType: payload?.shipment?.service_type || 'DOM',
    });
    cartResult = await addOrdersToWaslahCart({
      orderIds: [waslahOrderId],
      pickupInfo,
      serviceId: waslahServiceId,
    });
    const cartId = cartResult?._id || cartResult?.cart_id || null;
    if (cartId) {
      try {
        checkoutResult = await waslahPickupCheckout(cartId, paymentMethod || 'credit_limit');
      } catch (checkoutError) {
        if (!isWaslahCheckoutCompleteError(checkoutError)) throw checkoutError;
      }
    }
  } catch (pickupError) {
    if (!isWaslahAlreadyProcessedError(pickupError)) {
      throw shipmentError(
        pickupError?.message || 'Failed to schedule reverse pickup with EMX',
        {
          status: pickupError?.status || 502,
          code: pickupError?.code || 'WASLAH_REVERSE_PICKUP_FAILED',
          detail: pickupError?.detail || null,
        },
      );
    }
  }

  let waslahOrderDetail = null;
  try {
    waslahOrderDetail = await getWaslahOrder(waslahOrderId);
  } catch (fetchError) {
    console.warn('[waslah-reverse-pickup] Could not load Waslah order:', fetchError?.message);
  }

  let labelUrl = null;
  try {
    const printResult = await printWaslahReceipt([waslahOrderId], { withLabel: true, carrierLabelOnly: true });
    const rawUrl = extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel: true }) || printResult?.url || null;
    if (rawUrl) {
      labelUrl = await resolveEmxCarrierLabelUrl(rawUrl, {
        orderId: normalizedOrderId,
        waslahOrderId,
      }) || rawUrl;
    }
  } catch (printError) {
    console.warn('[waslah-reverse-pickup] Label fetch failed:', printError?.message);
  }

  try {
    const refreshed = await getWaslahOrder(waslahOrderId);
    if (refreshed) waslahOrderDetail = refreshed;
  } catch (refreshError) {
    console.warn('[waslah-reverse-pickup] Post-label Waslah refresh failed:', refreshError?.message);
  }

  const shipmentDetails = extractWaslahShipmentDetails({
    waslahOrder: waslahOrderDetail,
    cartResult,
    waslahOrderId,
  });
  const trackingNumber = shipmentDetails.trackingNumber || shipmentDetails.emxTrackingNumber || null;
  const cartId = cartResult?._id || cartResult?.cart_id || shipmentDetails.cartId || null;

  await Order.findByIdAndUpdate(normalizedOrderId, {
    $set: {
      'waslahReturn.orderId': waslahOrderId,
      'waslahReturn.reference': payload.reference || reference,
      'waslahReturn.trackingNumber': trackingNumber,
      'waslahReturn.labelUrl': labelUrl,
      'waslahReturn.cartId': cartId,
      'waslahReturn.serviceId': waslahServiceId || resolvedServiceId || null,
      'waslahReturn.processed': Boolean(trackingNumber),
      'waslahReturn.pickupRequestedAt': checkoutResult ? new Date() : (rawOrder.waslahReturn?.pickupRequestedAt || null),
      'waslahReturn.pickupDate': pickupInfo.pickup_date || null,
      'waslahReturn.pickupTime': pickupInfo.pickup_time || null,
      'waslahReturn.pickupVehicle': pickupInfo.pickup_vehicle || null,
    },
  });

  const awbText = trackingNumber ? ` AWB ${trackingNumber}.` : '';
  return {
    success: true,
    skipped: false,
    waslahOrderId,
    trackingNumber,
    labelUrl,
    message: checkoutResult || trackingNumber
      ? `EMX will collect from the customer and deliver to the warehouse.${awbText}`
      : `Reverse pickup is on EMX. Tracking is not ready yet.${awbText}`,
  };
}

export function getWaslahShipmentHttpError(error) {
  const duplicate = error?.code === 'WASLAH_DUPLICATE_REFERENCE'
    || isWaslahDuplicateReferenceError(error);
  const status = duplicate
    ? 409
    : (error?.status >= 400 && error.status < 600 ? error.status : 500);
  return {
    duplicate,
    status,
    code: duplicate ? 'WASLAH_DUPLICATE_REFERENCE' : (error?.code || null),
  };
}
