import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AbandonedCart from '@/models/AbandonedCart';
import Order from '@/models/Order';
import User from '@/models/User';
import {
  autoConvertAbandonedCartsWithPlacedOrders,
  getPlacedOrderLookbackDate,
} from '@/lib/abandonedCartOrderMatch';
import { ACTIVE_RECORD_FILTER, buildTrashMeta } from '@/lib/storeTrash';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { enrichAbandonedCarts, getAbandonedCartTotal, isPlaceholderName } from '@/lib/abandonedCartUtils';
import {
  buildAbandonedCheckoutBaseMatch,
  buildAbandonedCheckoutFilterMatch,
  buildAbandonedCheckoutSearchMatch,
  buildProductCartMatch,
  loadAbandonedCheckoutProducts,
  loadAbandonedCheckoutStats,
  parseDashboardDateTime,
  parseDashboardLimit,
  parseDashboardPage,
} from '@/lib/abandonedCheckoutDashboard';
import { getConversionPaymentMethodLabel, resolveConversionPaymentLink, conversionRequiresPaymentConfirmation, normalizeConversionPaymentMethod } from '@/lib/abandonedCartRecoveryPayment';
import { sendAbandonedCartConversionEmail, sendAbandonedCartRecoveryLinkEmail } from '@/lib/email';
import { getCustomerSiteUrl } from '@/lib/appUrl';
import Store from '@/models/Store';
import { resolveDashboardAccess } from '@/lib/storeAccessControl';
import authAdmin from '@/middlewares/authAdmin';
import {
  applyRecoveryPricingToItems,
  buildRecoveryLink,
  computeRecoveryOfferTotal,
  generateRecoveryToken,
} from '@/lib/abandonedCartRecoveryOffer';
import { sendAbandonedCartWhatsAppReminder } from '@/lib/whatsapp/abandonedCartMessaging';
import {
  createOrderFromAbandonedCart,
  markLinkedOrderPaidFromAbandonedCart,
} from '@/lib/createOrderFromAbandonedCart';
import { formatWhatsAppErrorMessage } from '@/lib/whatsapp/formatWhatsAppError';

async function resolveAbandonedCheckoutAccess(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const access = await resolveDashboardAccess(decodedToken.uid, decodedToken);
  if (!access.isSeller || !access.storeId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const isPlatformAdmin = Boolean(
    decodedToken.email && await authAdmin(decodedToken.uid, decodedToken.email)
  );

  return {
    storeId: String(access.storeId),
    userId: decodedToken.uid,
    userName: String(decodedToken.name || decodedToken.email || 'Store staff').trim(),
    isOwner: Boolean(access.isOwner),
    isPlatformAdmin,
    canDeleteAbandonedCarts: Boolean(access.isOwner || isPlatformAdmin),
  };
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const storeId = await authSeller(userId);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get('view') || 'products').toLowerCase() === 'carts'
      ? 'carts'
      : 'products';
    const page = parseDashboardPage(searchParams.get('page'));
    const limit = parseDashboardLimit(searchParams.get('limit'));
    const filter = String(searchParams.get('filter') || 'all').trim().toLowerCase() || 'all';
    const search = String(searchParams.get('search') || '').trim();
    const productKey = String(searchParams.get('productKey') || '').trim();
    const fromDate = parseDashboardDateTime(searchParams.get('from'));
    const toDate = parseDashboardDateTime(searchParams.get('to'));

    const baseMatch = buildAbandonedCheckoutBaseMatch({ storeId, fromDate, toDate });

    // Light auto-convert: only recent active carts (avoid scanning 5k+ docs on every load).
    const recentActiveCarts = await AbandonedCart.find({
      storeId,
      ...ACTIVE_RECORD_FILTER,
      status: { $in: ['active', 'pending_payment'] },
      lastSeenAt: { $gte: getPlacedOrderLookbackDate(7 * 24 * 60 * 60 * 1000) },
    })
      .sort({ lastSeenAt: -1 })
      .limit(250)
      .select('_id storeId userId email phone phoneCode address items status source anonymousId')
      .lean();

    if (recentActiveCarts.length) {
      const recentOrders = await Order.find({
        storeId,
        ...ACTIVE_RECORD_FILTER,
        createdAt: { $gte: getPlacedOrderLookbackDate(7 * 24 * 60 * 60 * 1000) },
        status: { $nin: ['PAYMENT_FAILED', 'CANCELLED', 'AWAITING_PAYMENT'] },
      })
        .select('storeId status paymentMethod paymentStatus isPaid guestEmail guestPhone alternatePhone shippingAddress userId orderItems items createdAt')
        .limit(500)
        .lean();

      await autoConvertAbandonedCartsWithPlacedOrders(
        recentActiveCarts,
        recentOrders,
        AbandonedCart,
      );
    }

    const [stats, listPayload] = await Promise.all([
      loadAbandonedCheckoutStats(AbandonedCart, baseMatch),
      (async () => {
        if (view === 'products') {
          return loadAbandonedCheckoutProducts(AbandonedCart, {
            baseMatch,
            search,
            page,
            limit,
          });
        }

        const andClauses = [baseMatch, buildAbandonedCheckoutFilterMatch(filter)];
        const searchMatch = buildAbandonedCheckoutSearchMatch(search);
        if (searchMatch) andClauses.push(searchMatch);
        const productMatch = buildProductCartMatch(productKey);
        if (productMatch) andClauses.push(productMatch);

        const cartQuery = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
        const skip = (page - 1) * limit;

        const [carts, total] = await Promise.all([
          AbandonedCart.find(cartQuery)
            .sort({ lastSeenAt: -1, updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          AbandonedCart.countDocuments(cartQuery),
        ]);

        const userIds = [
          ...new Set(carts.map((cart) => cart.userId).filter(Boolean).map(String)),
        ];

        const users = userIds.length
          ? await User.find({
            $or: [
              { _id: { $in: userIds } },
              { firebaseUid: { $in: userIds } },
            ],
          })
            .select('_id firebaseUid name email phone')
            .lean()
          : [];

        const enrichedCarts = enrichAbandonedCarts(carts, users);

        return {
          carts: enrichedCarts.map((cart) => ({
            ...cart,
            _id: String(cart._id),
            status: cart.status || 'active',
          })),
          total,
        };
      })(),
    ]);

    const access = await resolveDashboardAccess(userId, decodedToken);
    const isPlatformAdmin = Boolean(
      decodedToken.email && await authAdmin(userId, decodedToken.email)
    );

    return NextResponse.json({
      view,
      page,
      limit,
      filter,
      search,
      productKey,
      from: fromDate ? fromDate.toISOString() : null,
      to: toDate ? toDate.toISOString() : null,
      stats,
      products: listPayload.products || [],
      carts: listPayload.carts || [],
      total: Number(listPayload.total || 0),
      totalPages: Math.max(1, Math.ceil(Number(listPayload.total || 0) / limit)),
      canDeleteAbandonedCarts: Boolean(access.isOwner || isPlatformAdmin),
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const sellerUid = decodedToken.uid;

    const storeId = await authSeller(sellerUid);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      cartId,
      action,
      convertedCartTotal,
      conversionNote,
      convertedByName,
      customerName,
      convertedByUserId,
      conversionDiscountType,
      conversionDiscountValue,
      conversionPaymentMethod,
      conversionPaymentLink,
      customerEmail: customerEmailInput,
      customerPhone: customerPhoneInput,
      sendCustomerEmail = true,
      recoveryDiscountType,
      recoveryDiscountValue,
      recoveryOfferTotal,
      sendRecoveryEmail = true,
      sendWhatsApp = true,
    } = body || {};

    if (!cartId) {
      return NextResponse.json({ error: 'cartId is required' }, { status: 400 });
    }

    await dbConnect();

    if (action === 'resend-email') {
      const cart = await AbandonedCart.findOne({ _id: cartId, storeId, status: 'converted' }).lean();
      if (!cart) {
        return NextResponse.json({ error: 'Converted cart not found' }, { status: 404 });
      }

      const trimmedResendEmail = String(customerEmailInput || cart.conversionCustomerEmail || cart.email || '').trim().toLowerCase();
      if (!trimmedResendEmail) {
        return NextResponse.json({ error: 'Customer email is required to resend' }, { status: 400 });
      }

      const resendCustomerName = String(customerName || cart.name || '').trim() || 'Customer';

      try {
        const store = await Store.findById(storeId).select('name').lean();
        await sendAbandonedCartConversionEmail({
          email: trimmedResendEmail,
          customerName: resendCustomerName,
          storeName: store?.name || 'Store1920',
          amount: cart.convertedCartTotal,
          currency: cart.currency || 'AED',
          paymentMethodLabel: getConversionPaymentMethodLabel(cart.conversionPaymentMethod),
          paymentLink: cart.conversionPaymentLink,
          items: Array.isArray(cart.items) ? cart.items : [],
          storeId,
        });

        const updatedCart = await AbandonedCart.findByIdAndUpdate(
          cart._id,
          {
            $set: {
              email: trimmedResendEmail,
              conversionCustomerEmail: trimmedResendEmail,
              conversionEmailSent: true,
              conversionEmailSentAt: new Date(),
              conversionEmailError: null,
            },
          },
          { new: true }
        ).lean();

        return NextResponse.json({
          success: true,
          emailSent: true,
          emailError: null,
          customerEmail: trimmedResendEmail,
          cart: { ...updatedCart, _id: String(updatedCart._id) },
        });
      } catch (mailError) {
        const resendError = mailError?.message || 'Failed to send customer email';
        const updatedCart = await AbandonedCart.findByIdAndUpdate(
          cart._id,
          {
            $set: {
              email: trimmedResendEmail,
              conversionCustomerEmail: trimmedResendEmail,
              conversionEmailSent: false,
              conversionEmailError: resendError,
            },
          },
          { new: true }
        ).lean();

        return NextResponse.json({
          success: true,
          emailSent: false,
          emailError: resendError,
          customerEmail: trimmedResendEmail,
          cart: { ...updatedCart, _id: String(updatedCart._id) },
        });
      }
    }

    if (action === 'send-recovery-link') {
      const cart = await AbandonedCart.findOne({ _id: cartId, storeId }).lean();
      if (!cart) {
        return NextResponse.json({ error: 'Abandoned cart not found' }, { status: 404 });
      }
      if (cart.status === 'converted') {
        return NextResponse.json({ error: 'This cart is already converted' }, { status: 409 });
      }

      const cartTotalMax = getAbandonedCartTotal(cart);
      const discountType = ['none', 'amount', 'percent', 'custom'].includes(recoveryDiscountType)
        ? recoveryDiscountType
        : 'percent';

      let offerTotal = Number(recoveryOfferTotal);
      if (!Number.isFinite(offerTotal)) {
        const computed = computeRecoveryOfferTotal(
          cartTotalMax,
          discountType,
          recoveryDiscountValue ?? '',
          recoveryDiscountValue ?? '',
        );
        if (computed.error || computed.final === null) {
          return NextResponse.json({ error: computed.error || 'Enter a valid discount' }, { status: 400 });
        }
        offerTotal = computed.final;
      }

      if (offerTotal > cartTotalMax) {
        return NextResponse.json({
          error: `Offer total cannot exceed the abandoned cart total (${cartTotalMax})`,
        }, { status: 400 });
      }

      if (offerTotal >= cartTotalMax && discountType === 'none') {
        return NextResponse.json({ error: 'Set a discount before sending a recovery link' }, { status: 400 });
      }

      const recoveryToken = cart.recoveryToken || generateRecoveryToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const trimmedCustomerName = String(customerName || cart.name || '').trim() || 'Customer';
      const resolvedCustomerEmail = String(customerEmailInput || cart.email || '').trim().toLowerCase();
      const resolvedCustomerPhone = String(customerPhoneInput || cart.phone || '').trim();
      const discountValue = Number(recoveryDiscountValue);
      const safeDiscountValue = Number.isFinite(discountValue) ? discountValue : null;
      const customerSiteUrl = getCustomerSiteUrl();
      const recoveryLink = buildRecoveryLink(customerSiteUrl, recoveryToken);
      const discountedItems = applyRecoveryPricingToItems(cart.items || [], offerTotal, cartTotalMax);

      const updated = await AbandonedCart.findOneAndUpdate(
        { _id: cartId, storeId, status: { $ne: 'converted' } },
        {
          $set: {
            status: cart.status === 'pending_payment' ? 'pending_payment' : 'active',
            recoveryToken,
            recoveryDiscountType: discountType,
            recoveryDiscountValue: safeDiscountValue,
            recoveryCartTotal: cartTotalMax,
            recoveryOfferTotal: offerTotal,
            recoveryLinkExpiresAt: expiresAt,
            recoveryLinkSentAt: new Date(),
            recoveryLinkSentTo: resolvedCustomerEmail || null,
            ...(trimmedCustomerName ? { name: trimmedCustomerName } : {}),
            ...(resolvedCustomerEmail ? { email: resolvedCustomerEmail } : {}),
            ...(resolvedCustomerPhone ? { phone: resolvedCustomerPhone } : {}),
          },
        },
        { new: true }
      ).lean();

      if (!updated) {
        return NextResponse.json({ error: 'Could not create recovery link' }, { status: 409 });
      }

      let emailSent = false;
      let emailError = null;

      if (sendRecoveryEmail !== false && resolvedCustomerEmail) {
        try {
          const store = await Store.findById(storeId).select('name').lean();
          const discountLabel = discountType === 'percent' && safeDiscountValue
            ? `${safeDiscountValue}% off your cart`
            : discountType === 'amount' && safeDiscountValue
              ? `${cart.currency || 'AED'} ${safeDiscountValue} off your cart`
              : `Special price locked at ${cart.currency || 'AED'} ${offerTotal}`;

          await sendAbandonedCartRecoveryLinkEmail({
            email: resolvedCustomerEmail,
            customerName: trimmedCustomerName,
            storeName: store?.name || 'Store1920',
            originalTotal: cartTotalMax,
            offerTotal,
            currency: cart.currency || 'AED',
            discountLabel,
            recoveryLink,
            items: discountedItems,
            storeId,
          });
          emailSent = true;
        } catch (mailError) {
          emailError = mailError?.message || 'Failed to send recovery email';
        }
      } else if (sendRecoveryEmail !== false && !resolvedCustomerEmail) {
        emailError = 'No customer email available to send';
      }

      let whatsappSent = false;
      let whatsappError = null;
      let whatsappResult = null;
      const phoneForWhatsApp = String(updated.phone || resolvedCustomerPhone || '').trim();

      if (sendWhatsApp !== false && phoneForWhatsApp) {
        try {
          whatsappResult = await sendAbandonedCartWhatsAppReminder(
            { ...updated, phone: phoneForWhatsApp, name: trimmedCustomerName },
            {
              useRecoveryLink: true,
              offerTotal,
            },
          );
          whatsappSent = Boolean(whatsappResult?.success);
          if (whatsappResult?.skipped) {
            whatsappError = whatsappResult.reason || 'WhatsApp skipped';
          }
        } catch (waError) {
          whatsappError = waError?.message || 'Failed to send WhatsApp cart reminder';
        }
      } else if (sendWhatsApp !== false && !phoneForWhatsApp) {
        whatsappError = 'Add a customer phone to send WhatsApp cart reminder';
      }

      return NextResponse.json({
        success: true,
        recoveryLink,
        emailSent,
        emailError,
        whatsappSent,
        whatsappError,
        whatsapp: whatsappResult,
        customerEmail: resolvedCustomerEmail || null,
        cart: { ...updated, _id: String(updated._id) },
      });
    }

    if (action === 'send-whatsapp-cart-reminder') {
      const cart = await AbandonedCart.findOne({ _id: cartId, storeId }).lean();
      if (!cart) {
        return NextResponse.json({ error: 'Abandoned cart not found' }, { status: 404 });
      }
      if (cart.status === 'converted') {
        return NextResponse.json({ error: 'This cart is already converted' }, { status: 409 });
      }

      const variant = String(body?.variant || 'cart').trim() === 'checkout' ? 'checkout' : 'cart';
      const whatsapp = await sendAbandonedCartWhatsAppReminder(cart, {
        variant,
        useRecoveryLink: body?.useRecoveryLink !== false && Boolean(cart.recoveryToken),
        offerTotal: cart.recoveryOfferTotal ?? null,
        buttonPath: body?.buttonPath,
      });

      const sent = Boolean(whatsapp?.success);
      const alreadySent = Boolean(whatsapp?.alreadySent);

      if (sent) {
        await AbandonedCart.updateOne(
          { _id: cartId, storeId },
          {
            $set: {
              whatsappCheckoutReminderStatus: alreadySent ? 'sent' : 'sent',
              whatsappCheckoutReminderSentAt: new Date(),
              whatsappCheckoutReminderError: null,
            },
          },
        );
      } else if (whatsapp?.skipped) {
        const errorText = formatWhatsAppErrorMessage(whatsapp?.reason || 'WhatsApp skipped');
        await AbandonedCart.updateOne(
          { _id: cartId, storeId },
          {
            $set: {
              whatsappCheckoutReminderStatus: 'skipped',
              whatsappCheckoutReminderError: errorText,
            },
          },
        );
      } else {
        const errorText = formatWhatsAppErrorMessage(whatsapp?.reason || whatsapp?.error);
        await AbandonedCart.updateOne(
          { _id: cartId, storeId },
          {
            $set: {
              whatsappCheckoutReminderStatus: 'failed',
              whatsappCheckoutReminderError: errorText,
            },
          },
        );
      }

      return NextResponse.json({
        success: true,
        whatsapp,
        cart: { ...cart, _id: String(cart._id) },
      });
    }

    if (action === 'confirm-payment') {
      const pendingCart = await AbandonedCart.findOne({
        _id: cartId,
        storeId,
        status: 'pending_payment',
      }).lean();

      if (!pendingCart) {
        return NextResponse.json({ error: 'Pending cart not found' }, { status: 404 });
      }

      const staffName = String(
        convertedByName
        || decodedToken.name
        || decodedToken.email
        || 'Store staff',
      ).trim();

      let orderId = String(pendingCart.linkedOrderId || '').trim();
      let order = null;
      let orderCreated = false;

      try {
        if (orderId) {
          order = await markLinkedOrderPaidFromAbandonedCart(pendingCart, { storeId });
        }

        if (!order) {
      const created = await createOrderFromAbandonedCart(pendingCart, {
            storeId,
            finalTotal: pendingCart.convertedCartTotal,
            paymentMethod: pendingCart.conversionPaymentMethod,
            convertedByName: pendingCart.convertedByName || staffName,
            convertedByUserId: pendingCart.convertedBy || sellerUid,
            conversionNote: pendingCart.conversionNote,
            customerName: pendingCart.name,
            customerEmail: pendingCart.conversionCustomerEmail || pendingCart.email,
            customerPhone: pendingCart.phone,
            requestUrl: request.url,
            markPaid: true,
            awaitingPayment: false,
            paymentReferenceId: pendingCart.conversionPaymentLinkId,
            discountType: pendingCart.conversionDiscountType,
            discountValue: pendingCart.conversionDiscountValue,
            cartTotalMax: getAbandonedCartTotal(pendingCart),
          });
          orderId = created.orderId;
          order = created.order;
          orderCreated = created.created;
        }
      } catch (orderError) {
        return NextResponse.json({
          error: orderError.message || 'Failed to create order for this conversion',
        }, { status: 400 });
      }

      const updated = await AbandonedCart.findOneAndUpdate(
        { _id: cartId, storeId, status: 'pending_payment' },
        {
          $set: {
            status: 'converted',
            convertedAt: new Date(),
            ...(orderId ? { linkedOrderId: orderId } : {}),
          },
        },
        { new: true },
      ).lean();

      if (!updated) {
        return NextResponse.json({ error: 'Pending cart not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        orderId,
        orderCreated,
        shortOrderNumber: order?.shortOrderNumber || null,
        cart: { ...updated, _id: String(updated._id) },
      });
    }

    if (action !== 'convert') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const cart = await AbandonedCart.findOne({ _id: cartId, storeId }).lean();
    if (!cart) {
      return NextResponse.json({ error: 'Abandoned cart not found' }, { status: 404 });
    }

    if (cart.status === 'converted') {
      return NextResponse.json({ error: 'This cart is already converted' }, { status: 409 });
    }

    const parsedTotal = Number(convertedCartTotal);
    const cartTotalMax = getAbandonedCartTotal(cart);

    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      return NextResponse.json({ error: 'Enter a valid final order value' }, { status: 400 });
    }

    if (parsedTotal > cartTotalMax) {
      return NextResponse.json({
        error: `Final amount cannot exceed the abandoned cart total (${cartTotalMax})`,
      }, { status: 400 });
    }

    const finalTotal = parsedTotal;

    const allowedDiscountTypes = new Set(['none', 'amount', 'percent', 'custom']);
    const discountType = allowedDiscountTypes.has(conversionDiscountType)
      ? conversionDiscountType
      : 'custom';
    const discountValue = Number(conversionDiscountValue);
    const safeDiscountValue = Number.isFinite(discountValue) ? discountValue : null;

    const trimmedCustomerName = String(customerName || '').trim();
    const resolvedCustomerName = trimmedCustomerName && !isPlaceholderName(trimmedCustomerName)
      ? trimmedCustomerName
      : (isPlaceholderName(cart.name) ? null : cart.name);

    const customerEmail = String(customerEmailInput || cart.email || '').trim().toLowerCase();
    const resolvedCustomerPhone = String(customerPhoneInput || cart.phone || '').trim();
    let resolvedCustomerEmail = customerEmail;

    if (!resolvedCustomerEmail && cart.userId) {
      const linkedUser = await User.findOne({
        $or: [{ _id: cart.userId }, { firebaseUid: cart.userId }],
      }).select('email').lean();
      resolvedCustomerEmail = String(linkedUser?.email || '').trim().toLowerCase();
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || '';

    let paymentDetails;
    try {
      paymentDetails = await resolveConversionPaymentLink({
        paymentMethod: conversionPaymentMethod,
        pastedLink: conversionPaymentLink,
        amount: finalTotal,
        currency: cart.currency || 'AED',
        customerName: resolvedCustomerName || trimmedCustomerName || cart.name || 'Customer',
        customerEmail: resolvedCustomerEmail || undefined,
        abandonedCartId: cartId,
        storeId,
        origin,
      });
    } catch (paymentError) {
      return NextResponse.json({ error: paymentError.message || 'Failed to prepare payment link' }, { status: 400 });
    }

    const requiresPaymentConfirmation = conversionRequiresPaymentConfirmation(paymentDetails.paymentMethod);
    const nextStatus = requiresPaymentConfirmation ? 'pending_payment' : 'converted';
    const staffName = String(
      convertedByName
      || decodedToken.name
      || decodedToken.email
      || 'Store staff',
    ).trim();
    const staffUid = convertedByUserId ? String(convertedByUserId) : sellerUid;
    const recoveryMethod = normalizeConversionPaymentMethod(paymentDetails.paymentMethod);

    let orderId = String(cart.linkedOrderId || '').trim();
    let order = null;
    let orderCreated = false;

    try {
      const orderResult = await createOrderFromAbandonedCart(cart, {
        storeId,
        finalTotal,
        paymentMethod: paymentDetails.paymentMethod,
        convertedByName: staffName,
        convertedByUserId: staffUid,
        conversionNote,
        customerName: resolvedCustomerName || trimmedCustomerName || cart.name,
        customerEmail: resolvedCustomerEmail,
        customerPhone: resolvedCustomerPhone,
        requestUrl: request.url,
        markPaid: recoveryMethod === 'card',
        awaitingPayment: requiresPaymentConfirmation,
        paymentReferenceId: paymentDetails.paymentLinkId,
        discountType,
        discountValue: safeDiscountValue,
        cartTotalMax,
      });
      orderId = orderResult.orderId;
      order = orderResult.order;
      orderCreated = orderResult.created;
    } catch (orderError) {
      return NextResponse.json({
        error: orderError.message || 'Failed to create order for this conversion',
      }, { status: 400 });
    }

    const updated = await AbandonedCart.findOneAndUpdate(
      { _id: cartId, storeId, status: { $ne: 'converted' } },
      {
        $set: {
          status: nextStatus,
          ...(requiresPaymentConfirmation ? {} : { convertedAt: new Date() }),
          convertedBy: staffUid,
          convertedByName: staffName,
          convertedCartTotal: finalTotal,
          conversionNote: String(conversionNote || '').trim() || null,
          conversionDiscountType: discountType,
          conversionDiscountValue: safeDiscountValue,
          conversionPaymentMethod: paymentDetails.paymentMethod,
          conversionPaymentLink: paymentDetails.paymentLink,
          conversionPaymentLinkId: paymentDetails.paymentLinkId,
          linkedOrderId: orderId || null,
          ...(resolvedCustomerName ? { name: resolvedCustomerName } : {}),
          ...(resolvedCustomerEmail ? { email: resolvedCustomerEmail } : {}),
          ...(resolvedCustomerPhone ? { phone: resolvedCustomerPhone } : {}),
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: 'Could not convert cart' }, { status: 409 });
    }

    let emailSent = false;
    let emailError = null;

    if (sendCustomerEmail !== false && resolvedCustomerEmail) {
      try {
        const store = await Store.findById(storeId).select('name').lean();
        await sendAbandonedCartConversionEmail({
          email: resolvedCustomerEmail,
          customerName: resolvedCustomerName || trimmedCustomerName || cart.name || 'Customer',
          storeName: store?.name || 'Store1920',
          amount: finalTotal,
          currency: cart.currency || 'AED',
          paymentMethodLabel: getConversionPaymentMethodLabel(paymentDetails.paymentMethod),
          paymentLink: paymentDetails.paymentLink,
          items: Array.isArray(cart.items) ? cart.items : [],
          storeId,
        });
        emailSent = true;

        await AbandonedCart.findByIdAndUpdate(updated._id, {
          $set: {
            conversionCustomerEmail: resolvedCustomerEmail,
            conversionEmailSent: true,
            conversionEmailSentAt: new Date(),
            conversionEmailError: null,
          },
        });
      } catch (mailError) {
        emailError = mailError?.message || 'Failed to send customer email';
        await AbandonedCart.findByIdAndUpdate(updated._id, {
          $set: {
            conversionCustomerEmail: resolvedCustomerEmail,
            conversionEmailSent: false,
            conversionEmailError: emailError,
          },
        });
      }
    } else if (sendCustomerEmail !== false && !resolvedCustomerEmail) {
      emailError = 'No customer email available to send';
      await AbandonedCart.findByIdAndUpdate(updated._id, {
        $set: {
          conversionEmailSent: false,
          conversionEmailError: emailError,
        },
      });
    }

    const finalCart = await AbandonedCart.findById(updated._id).lean();

    return NextResponse.json({
      success: true,
      emailSent,
      emailError,
      customerEmail: resolvedCustomerEmail || null,
      pendingPayment: requiresPaymentConfirmation,
      orderId: orderId || null,
      orderCreated,
      shortOrderNumber: order?.shortOrderNumber || null,
      cart: { ...finalCart, _id: String(finalCart._id) },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to convert cart' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await dbConnect();

    const auth = await resolveAbandonedCheckoutAccess(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const cartId = searchParams.get('cartId');

    if (!cartId) {
      return NextResponse.json({ error: 'cartId is required' }, { status: 400 });
    }

    const trashed = await AbandonedCart.findOneAndUpdate(
      { _id: cartId, storeId: auth.storeId, ...ACTIVE_RECORD_FILTER },
      {
        $set: buildTrashMeta(auth.userId, auth.userName || 'Store staff'),
      },
      { new: true },
    ).lean();

    if (!trashed) {
      return NextResponse.json({ error: 'Abandoned cart not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, cartId: String(trashed._id), message: 'Cart moved to trash' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to move cart to trash' }, { status: 500 });
  }
}
