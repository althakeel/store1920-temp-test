import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import { ensurePersistedShortOrderNumber } from '@/lib/orderDisplayServer';
import {
  createOrLinkWaslahOrder,
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
  extractWaslahShipmentDetails,
} from '@/lib/waslah';
import {
  buildWaslahOrderPayload,
  buildWaslahCanonicalReference,
  buildWaslahReshipReference,
  buildDefaultPickupInfo,
  validateWaslahOrderPayload,
  buildWaslahStoreOrderUpdate,
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
  skipPickup = false,
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
    legacyMongoReference = `S1920-${normalizedOrderId}`;
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
      const created = await createOrLinkWaslahOrder(payload, {
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
      const printResult = await printWaslahReceipt([waslahOrderId], { withLabel: true });
      labelUrl = printResult?.url || labelUrl;
    } catch (printError) {
      if (!syncedExistingShipment) throw printError;
      console.warn('[waslah-shipment] Label refresh failed for processed order:', printError?.message);
    }

    const shipmentDetails = extractWaslahShipmentDetails({
      waslahOrder: waslahOrderDetail,
      cartResult,
      waslahOrderId,
    });
    cartId = cartId || shipmentDetails.cartId;
    const trackingNumber = shipmentDetails.trackingNumber
      || order.trackingId
      || order.waslah?.trackingNumber
      || null;
    const courierName = shipmentDetails.courierName || order.courier || 'EMX';

    const update = buildWaslahStoreOrderUpdate(order, {
      waslahOrderId,
      waslahServiceId,
      payload,
      trackingNumber,
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
      message = `Pickup scheduled for ${pickupInfo.pickup_date} (${pickupInfo.pickup_time}). ${awbText}. ${labelText} EMX will collect on the pickup date.`;
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
