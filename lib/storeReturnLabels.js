export function getOrderFulfillmentKind(order = {}) {
  const kind = String(order?.fulfillmentKind || '').toUpperCase();
  if (kind === 'RETURN' || kind === 'REPLACEMENT') return kind;

  // Follow-up jobs always point at the original sale. Never treat the original
  // customer order as a pickup/replacement shipment just because its status is RETURN.
  if (order?.sourceOrderId) {
    const status = String(order?.status || '').toUpperCase();
    if (status === 'REPLACEMENT') return 'REPLACEMENT';
    return 'RETURN';
  }

  return 'SALE';
}

export function isReturnFollowUpOrder(order = {}) {
  return getOrderFulfillmentKind(order) === 'RETURN';
}

export function isReplacementFollowUpOrder(order = {}) {
  return getOrderFulfillmentKind(order) === 'REPLACEMENT';
}

/** Pickup clones created on approve — not real sales. Hide from the orders table. */
export function isReturnPickupCloneOrder(order = {}) {
  if (getOrderFulfillmentKind(order) === 'REPLACEMENT') return false;
  if (order?.sourceOrderId && getOrderFulfillmentKind(order) === 'RETURN') return true;
  if (String(order?.attribution?.utmMedium || '').toLowerCase() === 'return_order') return true;
  if (/Return of order #|Send\/schedule EMX pickup from the customer/i.test(String(order?.notes || ''))) {
    return true;
  }
  return false;
}

function linkedPickupCloneId(order = {}, returnEntry = {}) {
  const pickupId = returnEntry?.returnPickupOrderId;
  if (!pickupId) return '';
  const pickup = String(pickupId);
  const original = String(order?._id || '');
  if (!pickup || pickup === original) return '';
  return pickup;
}

/** Drop cloned reverse-pickup orders. Keep the original sale and replacement shipments. */
export function excludeReturnPickupCloneOrders(orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  const cloneIds = new Set();

  for (const order of list) {
    if (isReturnPickupCloneOrder(order)) {
      cloneIds.add(String(order._id));
    }
    for (const entry of order?.returns || []) {
      const pickupId = linkedPickupCloneId(order, entry);
      if (pickupId) cloneIds.add(pickupId);
    }
  }

  if (!cloneIds.size) return list;
  return list.filter((order) => !cloneIds.has(String(order._id)));
}

function sourceOrderLabel(order = {}) {
  return String(order?.sourceOrderNumber || '').replace(/^#/, '').trim();
}

export function getOrderFulfillmentBadge(order = {}) {
  const kind = getOrderFulfillmentKind(order);
  const source = sourceOrderLabel(order);

  if (kind === 'RETURN') {
    return {
      key: 'fulfillment-return-pickup',
      label: source ? `Pickup · original #${source}` : 'Return pickup',
      className: 'rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white',
      title: source
        ? `EMX pickup from the customer for original order #${source}.`
        : 'EMX pickup from the customer.',
    };
  }

  if (kind === 'REPLACEMENT') {
    return {
      key: 'fulfillment-replacement',
      label: source ? `Replacement order · for #${source}` : 'Replacement order',
      className: 'rounded-full bg-sky-700 px-2 py-0.5 text-[11px] font-bold text-white',
      title: source
        ? `New outbound replacement shipment for original order #${source}.`
        : 'New outbound replacement shipment.',
    };
  }

  return null;
}

export function getOriginalReturnRequestTag(order = {}) {
  if (getOrderFulfillmentKind(order) !== 'SALE') return null;
  const status = String(order?.status || '').toUpperCase();
  if (status === 'REPLACEMENT') {
    return {
      key: 'customer-replacement',
      label: 'Replacement requested',
      className: 'rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800',
      title: 'Customer asked for a replacement. Pickup stays on this original order.',
    };
  }
  if (['RETURN', 'RETURN_APPROVED', 'RETURN_INITIATED', 'RETURN_REQUESTED'].includes(status)) {
    return {
      key: 'customer-return',
      label: 'Customer return',
      className: 'rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-semibold text-pink-800',
      title: 'Original delivered order. EMX collects the parcel from the customer.',
    };
  }
  return null;
}
