/** Official Waslah production subtags → Store1920 order status + UI label. */
export const WASLAH_OFFICIAL_SUBTAG_CATALOG = [
  { subtag: 'DropOff_001', label: 'DropOff Created', message: 'DropOff Created', status: 'PROCESSING' },
  { subtag: 'NewShipment_001', label: 'New Shipment', message: 'Shipment information received', status: 'PROCESSING' },
  { subtag: 'LabelGenerated_001', label: 'Label Generated', message: 'Shipment label generated', status: 'PROCESSING' },
  { subtag: 'PickedUp_002', label: 'Picked Up', message: 'Shipment Collected from Shipper', status: 'PICKED_UP' },
  { subtag: 'InTransit_001', label: 'In Transit', message: 'Shipment is under customs clearance', status: 'SHIPPED' },
  { subtag: 'InTransit_002', label: 'In Transit', message: 'Shipment has been Cleared', status: 'SHIPPED' },
  { subtag: 'InTransit_003', label: 'In Transit', message: 'Ready to connect to airlines', status: 'SHIPPED' },
  { subtag: 'InTransit_004', label: 'In Transit', message: 'Picked up by airlines', status: 'SHIPPED' },
  { subtag: 'InTransit_005', label: 'In Transit', message: 'In Transit to Destination Sorting Facility', status: 'SHIPPED' },
  { subtag: 'InTransit_006', label: 'In Transit', message: 'Shipment Arrived At Delivery Facility', status: 'SHIPPED' },
  { subtag: 'InTransit_007', label: 'In Transit', message: 'Departed Origin Country - In Flight to Destination', status: 'SHIPPED' },
  { subtag: 'InTransit_008', label: 'In Transit', message: 'Arrived at Destination Airport - In Customs Clearance', status: 'SHIPPED' },
  { subtag: 'InTransit_009', label: 'In Transit', message: 'Received by Courier', status: 'SHIPPED' },
  { subtag: 'InTransit_010', label: 'In Transit', message: 'Shipment is Forwarded to Next Facility', status: 'SHIPPED' },
  { subtag: 'Exception_001', label: 'Exception', message: 'Pickup Failed', status: 'SHIPPED' },
  { subtag: 'Exception_002', label: 'Exception', message: 'Shipment was not Cleared', status: 'SHIPPED' },
  { subtag: 'Exception_003', label: 'Exception', message: 'Forcibly Taken by Consignee', status: 'SHIPPED' },
  { subtag: 'Exception_004', label: 'Exception', message: 'Clearance Delay', status: 'SHIPPED' },
  { subtag: 'Exception_005', label: 'Exception', message: 'Shipment Detained/Seized by Regulatory Authority', status: 'SHIPPED' },
  { subtag: 'InSorting_001', label: 'In Sorting', message: 'Received at Waslah Origin Sorting Facility', status: 'SHIPPED' },
  { subtag: 'InSorting_002', label: 'In Sorting', message: 'In Sorting Facility', status: 'SHIPPED' },
  { subtag: 'OutForDelivery_001', label: 'Out for Delivery', message: 'Out for Delivery', status: 'OUT_FOR_DELIVERY' },
  { subtag: 'FailedAttempt_001', label: 'Failed Attempt', message: 'Failed Attempt', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_002', label: 'Failed Attempt', message: 'Refused to Accept', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_003', label: 'Failed Attempt', message: 'Not Responding', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_004', label: 'Failed Attempt', message: 'Incorrect Address', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_005', label: 'Failed Attempt', message: 'Requested Future Delivery', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_006', label: 'Failed Attempt', message: 'Delay beyond Control / Natural Disaster', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_007', label: 'Failed Attempt', message: 'Special Reason', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_008', label: 'Failed Attempt', message: 'Consignee is Out of Delivery Area', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_009', label: 'Failed Attempt', message: 'Returned to Hub', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_010', label: 'Failed Attempt', message: 'Wrong Mobile Number', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_011', label: 'Failed Attempt', message: 'Mobile Switched off', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_012', label: 'Failed Attempt', message: 'Recipient Address Change Requested', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_013', label: 'Failed Attempt', message: 'Cash not Ready', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_014', label: 'Failed Attempt', message: 'Unable to access Consignee Premises', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_015', label: 'Failed Attempt', message: 'Wrong Shipment', status: 'SHIPPED' },
  { subtag: 'FailedAttempt_016', label: 'Failed Attempt', message: 'Incomplete Parcel', status: 'SHIPPED' },
  { subtag: 'Cancelled_001', label: 'Cancelled', message: 'Shipment has been Cancelled', status: 'CANCELLED' },
  { subtag: 'Lost_001', label: 'Shipment Lost', message: 'Shipment has been Lost', status: 'CANCELLED' },
  { subtag: 'Return_Received_001', label: 'Return Received', message: 'Shipment received in RTO facility', status: 'RTO' },
  { subtag: 'RTO_Received_001', label: 'RTO Received', message: 'RTO Received', status: 'RTO' },
  { subtag: 'RTO_Delivered_001', label: 'RTO Delivered', message: 'RTO Delivered', status: 'RTO' },
  { subtag: 'Settled_To_Seller_001', label: 'Settled to Seller', message: 'Settled to Seller', status: 'DELIVERED' },
  { subtag: 'Settled_By_Carrier_001', label: 'Settled by Carrier', message: 'Settled by Carrier', status: 'DELIVERED' },
  { subtag: 'ReturnToShipper_001', label: 'Returned to Shipper', message: 'Returned to Shipper', status: 'RTO' },
  { subtag: 'ToBeReturned_001', label: 'To be Returned', message: 'To be Returned', status: 'RTO' },
  { subtag: 'ReadyForReturn_001', label: 'Ready for Return', message: 'Ready for Return', status: 'RTO' },
  { subtag: 'Delivered_001', label: 'Delivered', message: 'Delivered', status: 'DELIVERED' },
  { subtag: 'Fulfillment_001', label: 'Fulfillment Requested', message: 'Fulfillment Requested', status: 'PROCESSING' },
  { subtag: 'Fulfillment_002', label: 'In Transit', message: 'Shipment Fulfilled', status: 'SHIPPED' },
  { subtag: 'Fulfillment_003', label: 'Fulfillment Failed', message: 'Fulfillment failed for shipment', status: 'CANCELLED' },
  { subtag: 'PickupRequested_001', label: 'Pickup Requested', message: 'Pickup Requested', status: 'PICKUP_REQUESTED' },
  { subtag: 'ReverseRequested_001', label: 'Reverse Order Requested', message: 'Reverse Order Requested', status: 'PROCESSING' },
  { subtag: 'ReadyForCollection_001', label: 'Ready for collection', message: 'Ready for collection by customer', status: 'OUT_FOR_DELIVERY' },
  { subtag: 'OnHold_001', label: 'On Hold', message: 'Shipment put On Hold', status: 'SHIPPED' },
  { subtag: 'Damaged_001', label: 'Damaged', message: 'Shipment Damaged', status: 'CANCELLED' },
  { subtag: 'Disposed_001', label: 'Disposed', message: 'Shipment Disposed', status: 'CANCELLED' },
];

const LEGACY_SUBTAG_STATUS_MAP = {
  InfoReceived_001: 'PROCESSING',
  Pending_001: 'PROCESSING',
  Pending_002: 'PROCESSING',
  Pending_003: 'PROCESSING',
  Pending_004: 'PROCESSING',
  Pending_005: 'PROCESSING',
  Pending_006: 'PROCESSING',
  AvailableForPickup_001: 'WAITING_FOR_PICKUP',
  PickedUp_001: 'PICKED_UP',
  InSorting_003: 'SHIPPED',
  Exception_010: 'RTO',
  Exception_011: 'RTO',
  Exception_012: 'CANCELLED',
  Exception_013: 'CANCELLED',
  Exception_014: 'PROCESSING',
  Exception_020: 'CANCELLED',
  Exception_021: 'CANCELLED',
};

const SUBTAG_STATUS_MAP = {
  ...LEGACY_SUBTAG_STATUS_MAP,
  ...Object.fromEntries(WASLAH_OFFICIAL_SUBTAG_CATALOG.map((entry) => [entry.subtag, entry.status])),
};

const OFFICIAL_SUBTAG_LABELS = Object.fromEntries(
  WASLAH_OFFICIAL_SUBTAG_CATALOG.map((entry) => [entry.subtag, entry.label]),
);

function normalizeWaslahStatusToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const NORMALIZED_SUBTAG_STATUS_MAP = new Map(
  Object.entries(SUBTAG_STATUS_MAP).map(([subtag, status]) => [
    normalizeWaslahStatusToken(subtag),
    status,
  ]),
);

export function mapWaslahSubtagToOrderStatus(subtag = '') {
  const key = String(subtag || '').trim();
  if (!key) return null;

  const exact = SUBTAG_STATUS_MAP[key]
    || NORMALIZED_SUBTAG_STATUS_MAP.get(normalizeWaslahStatusToken(key));
  if (exact) return exact;

  // Waslah can add new numeric variants (for example OutForDelivery_002),
  // and courier webhooks sometimes send human-readable EMX status names.
  const token = normalizeWaslahStatusToken(key).replace(/\d+$/, '');
  if (!token) return null;

  if (
    token.includes('cancel')
    || token.includes('voided')
    || token.startsWith('lost')
    || token.startsWith('damaged')
    || token.startsWith('disposed')
  ) return 'CANCELLED';

  if (
    token.includes('returnreceived')
    || token.includes('customerreturn')
    || token.includes('returnedafterdelivery')
  ) return 'RETURN';

  if (
    token.startsWith('rto')
    || token.includes('returntoshipper')
    || token.includes('returntoorigin')
    || token.includes('returningtoshipper')
    || token.includes('returnedtoshipper')
    || token.includes('returningtosender')
    || token.includes('returnedtosender')
    || token.includes('shipmentreturnedtosender')
    || token.includes('tobereturned')
    || token.includes('readyforreturn')
  ) return 'RTO';

  if (token.includes('outfordelivery')) return 'OUT_FOR_DELIVERY';
  if (
    token.includes('undelivered')
    || token.startsWith('attemptfail')
    || token.startsWith('failedattempt')
  ) return 'SHIPPED';
  if (
    token.includes('delivered')
    || token.includes('settledtoseller')
    || token.includes('settledbycarrier')
  ) return 'DELIVERED';

  if (
    token.includes('pickedup')
    || token.includes('collectedbycourier')
  ) return 'PICKED_UP';

  if (
    token.includes('intransit')
    || token.includes('insorting')
    || token.includes('dispatched')
    || token.includes('forwarded')
    || token.includes('shipped')
    || token.startsWith('exception')
  ) return 'SHIPPED';

  if (token.includes('pickuprequested')) return 'PICKUP_REQUESTED';
  if (token.includes('readyforcollection') || token.includes('availableforpickup')) {
    return 'OUT_FOR_DELIVERY';
  }
  if (token.includes('onhold')) return 'SHIPPED';

  if (
    token.includes('newshipment')
    || token.includes('shipmentcreated')
    || token.includes('labelgenerated')
    || token.includes('waitingforpickup')
    || token.includes('expectingshipment')
    || token.includes('inforeceived')
    || token.startsWith('pending')
    || token.startsWith('dropoff')
    || token.startsWith('fulfillment')
    || token.includes('reverserequested')
  ) return 'PROCESSING';

  return null;
}

/**
 * Courier cancellation closes the AWB, not the merchant's underlying order.
 * Keep it visible in `waslah.appStatus`, but do not copy it to `order.status`.
 */
export function shouldPropagateWaslahStatusToOrder(status = '') {
  const normalized = String(status || '').trim().toUpperCase();
  return Boolean(normalized) && normalized !== 'CANCELLED';
}

const WASLAH_SHIPMENT_STORE_STATUSES = new Set([
  'WAITING_FOR_PICKUP',
  'PICKUP_REQUESTED',
  'PICKED_UP',
  'WAREHOUSE_RECEIVED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
]);

/** After a Waslah AWB is cancelled, roll the store order back so it can be packed/shipped again. */
export function resolveStoreStatusAfterWaslahCancel(order = {}) {
  const current = String(order?.status || '').trim().toUpperCase();
  if (!WASLAH_SHIPMENT_STORE_STATUSES.has(current)) return current || 'PROCESSING';
  if (order?.warehousePacking?.packed === true) return 'WAITING_FOR_PICKUP';
  return 'PROCESSING';
}

const TERMINAL_WASLAH_COURIER_STATUSES = new Set([
  'DELIVERED',
  'RTO',
  'RETURN',
  'RETURNED',
  'CANCELLED',
]);

/** Higher = further along fulfillment. Used to block courier sync from downgrading status. */
const WASLAH_ORDER_STATUS_PROGRESS = {
  ORDER_PLACED: 10,
  PROCESSING: 20,
  WAITING_FOR_PICKUP: 30,
  PICKUP_REQUESTED: 40,
  PICKED_UP: 50,
  WAREHOUSE_RECEIVED: 50,
  SHIPPED: 60,
  IN_TRANSIT: 60,
  OUT_FOR_DELIVERY: 70,
  DELIVERED: 80,
};

export function resolveWaslahOrderStatusTransition(
  courierStatus = '',
  currentStatus = '',
  { packed = false } = {},
) {
  const next = String(courierStatus || '').trim().toUpperCase();
  const current = String(currentStatus || '').trim().toUpperCase();
  if (!shouldPropagateWaslahStatusToOrder(next)) return null;

  if (
    current
    && TERMINAL_WASLAH_COURIER_STATUSES.has(current)
    && next !== current
  ) {
    if (current === 'DELIVERED' && next === 'RETURN') return next;
    return null;
  }

  // Warehouse "Mark packed" sets WAITING_FOR_PICKUP — do not let EMX "label ready"
  // / early courier states push the order back to PROCESSING.
  if (
    packed
    && (next === 'PROCESSING' || next === 'ORDER_PLACED')
    && (
      current === 'WAITING_FOR_PICKUP'
      || current === 'PICKUP_REQUESTED'
      || current === 'PICKED_UP'
      || current === 'WAREHOUSE_RECEIVED'
      || current === 'SHIPPED'
      || current === 'OUT_FOR_DELIVERY'
    )
  ) {
    return null;
  }

  const currentRank = WASLAH_ORDER_STATUS_PROGRESS[current];
  const nextRank = WASLAH_ORDER_STATUS_PROGRESS[next];
  if (
    Number.isFinite(currentRank)
    && Number.isFinite(nextRank)
    && nextRank < currentRank
  ) {
    return null;
  }

  return next;
}

export function isStaleWaslahCancellation(order = {}) {
  const cancelledAwb = String(order?.waslah?.cancelledTrackingNumber || '').trim();
  const liveAwb = String(order?.waslah?.trackingNumber || order?.trackingId || '').trim();
  if (cancelledAwb && liveAwb && cancelledAwb !== liveAwb) return true;

  const cancelledAt = parseWaslahTrackingTimestamp(order?.waslah?.cancelledAt);
  const processedAt = parseWaslahTrackingTimestamp(order?.waslah?.processedAt);
  return Number.isFinite(cancelledAt)
    && Number.isFinite(processedAt)
    && processedAt > cancelledAt;
}

export function getWaslahCourierStatus(order = {}) {
  if (isStaleWaslahCancellation(order)) {
    const liveSubtag = String(order?.waslah?.currentSubtag || '').trim();
    if (liveSubtag && liveSubtag !== 'Cancelled_001') {
      return mapWaslahSubtagToOrderStatus(liveSubtag) || '';
    }
    return '';
  }
  const waslah = order?.waslah || {};
  return String(
    waslah.appStatus
    || waslah.carrierStatus
    || mapWaslahSubtagToOrderStatus(waslah.currentSubtag || waslah.lastSubtag)
    || '',
  ).trim().toUpperCase();
}

export function isWaslahCourierTerminal(order = {}) {
  const courierStatus = getWaslahCourierStatus(order);
  if (courierStatus) return TERMINAL_WASLAH_COURIER_STATUSES.has(courierStatus);
  return TERMINAL_WASLAH_COURIER_STATUSES.has(String(order?.status || '').toUpperCase());
}

/** Fallback when EMX/Waslah sends message text without a known subtag code. */
export function mapWaslahTrackingToOrderStatus({
  subtag = '',
  message = '',
  subtagMessage = '',
} = {}) {
  const fromSubtag = mapWaslahSubtagToOrderStatus(subtag);

  const text = `${subtagMessage} ${message} ${subtag}`.toLowerCase();
  if (
    text.includes('cancelled')
    || text.includes('canceled')
    || text.includes('cancellation')
    || text.includes('shipment cancel')
    || text.includes('voided')
  ) {
    return 'CANCELLED';
  }
  if (
    /\brto\b/.test(text)
    || text.includes('return to shipper')
    || text.includes('returned to shipper')
    || text.includes('return to origin')
    || text.includes('not collected')
    || text.includes('returning to sender')
    || text.includes('returned to sender')
    || text.includes('returned to seller')
  ) {
    return 'RTO';
  }
  if (
    text.includes('return received')
    || text.includes('customer return')
    || text.includes('returned after delivery')
  ) {
    return 'RETURN';
  }
  if (
    text.includes('undelivered')
    || text.includes('failed delivery')
    || text.includes('delivery failed')
    || text.includes('failed to deliver')
    || text.includes('could not deliver')
    || text.includes('not delivered')
    || text.includes('attempt failed')
  ) {
    return 'SHIPPED';
  }
  if (text.includes('delivered') && !text.includes('undelivered') && !text.includes('rto')) {
    return 'DELIVERED';
  }

  // A specific terminal/failure message above must beat a generic tag such as
  // Exception or Pending. Otherwise, prefer the provider's structured subtag.
  if (fromSubtag) return fromSubtag;

  if (text.includes('out for delivery')) {
    return 'OUT_FOR_DELIVERY';
  }
  if (
    text.includes('picked up')
    || text.includes('picked-up')
    || text.includes('collected by courier')
  ) {
    return 'PICKED_UP';
  }
  if (
    text.includes('in transit')
    || text.includes('in-transit')
    || text.includes('sorting')
    || text.includes('dispatched')
    || text.includes('forwarded')
    || text.includes('shipped')
    || text.includes('failed attempt')
    || text.includes('delivery attempt')
    || text.includes('delivery exception')
  ) {
    return 'SHIPPED';
  }
  if (text.includes('ready for collection')) {
    return 'OUT_FOR_DELIVERY';
  }
  if (text.includes('on hold')) {
    return 'SHIPPED';
  }
  if (
    text.includes('shipment created')
    || text.includes('new shipment')
    || text.includes('label generated')
    || text.includes('waiting for pickup')
    || text.includes('dropoff created')
    || text.includes('expecting the shipment')
    || text.includes('fulfillment requested')
  ) {
    return 'PROCESSING';
  }
  if (text.includes('pickup requested')) return 'PICKUP_REQUESTED';
  if (
    text.includes('shipment lost')
    || text.includes('shipment damaged')
    || text.includes('shipment disposed')
    || text.includes('fulfillment failed')
  ) {
    return 'CANCELLED';
  }
  return null;
}

export function parseWaslahTrackingTimestamp(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : Number.NaN;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;

  const text = String(value || '').trim();
  if (!text) return Number.NaN;

  // EMX also emits Dubai-local timestamps such as 19/05/2023 02:51:24 PM.
  const localized = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
  );
  if (localized) {
    const [, dayText, monthText, yearText, hourText, minuteText, secondText = '0', meridiem] = localized;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    let hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (meridiem) {
      hour %= 12;
      if (meridiem.toUpperCase() === 'PM') hour += 12;
    }

    if (
      month >= 1 && month <= 12
      && day >= 1 && day <= 31
      && hour >= 0 && hour <= 23
      && minute >= 0 && minute <= 59
      && second >= 0 && second <= 59
    ) {
      const dubaiOffsetMs = 4 * 60 * 60 * 1000;
      const timestamp = Date.UTC(year, month - 1, day, hour, minute, second) - dubaiOffsetMs;
      const localCheck = new Date(timestamp + dubaiOffsetMs);
      if (
        localCheck.getUTCFullYear() === year
        && localCheck.getUTCMonth() === month - 1
        && localCheck.getUTCDate() === day
      ) return timestamp;
    }
    return Number.NaN;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function isWaslahTrackingEventOlder(incomingTime, storedTime) {
  const incoming = parseWaslahTrackingTimestamp(incomingTime);
  const stored = parseWaslahTrackingTimestamp(storedTime);
  return Number.isFinite(incoming) && Number.isFinite(stored) && incoming < stored;
}

function getWaslahEventTime(entry = {}) {
  return entry?.time
    || entry?.date
    || entry?.created_at
    || entry?.timestamp
    || entry?.updated_at
    || entry?.checkpoint_time
    || entry?.timeStamp
    || entry?.Time_Stamp
    || entry?.event_time
    || entry?.eventTime
    || '';
}

function getWaslahEventSubtag(entry = {}) {
  const statusValue = typeof entry?.status === 'string' ? entry.status : '';
  return String(
    entry?.subtag
    || entry?.subTag
    || entry?.tag
    || entry?.sub_status
    || entry?.subStatus
    || entry?.SubStatus
    || entry?.status_code
    || entry?.statusCode
    || entry?.status?.code
    || statusValue
    || '',
  ).trim();
}

function getWaslahEventMessage(entry = {}) {
  const statusValue = typeof entry?.status === 'string' ? entry.status : '';
  return String(
    entry?.subtag_message
    || entry?.subtagMessage
    || entry?.message
    || entry?.Message
    || entry?.remarks
    || entry?.Remarks
    || entry?.Status
    || entry?.status?.descriptionEn
    || entry?.status?.description
    || statusValue
    || '',
  ).trim();
}

/** Return a stable newest-first list, regardless of the order used by the provider. */
function sortWaslahEventsNewestFirst(entries = []) {
  return [...entries]
    .map((entry, index) => {
      const parsedTime = parseWaslahTrackingTimestamp(getWaslahEventTime(entry));
      return {
        entry,
        index,
        parsedTime: Number.isFinite(parsedTime) ? parsedTime : null,
      };
    })
    .sort((left, right) => {
      if (left.entry?.authoritative && !right.entry?.authoritative) return -1;
      if (!left.entry?.authoritative && right.entry?.authoritative) return 1;
      if (left.parsedTime !== null && right.parsedTime !== null && left.parsedTime !== right.parsedTime) {
        return right.parsedTime - left.parsedTime;
      }
      if (left.parsedTime !== null && right.parsedTime === null) return -1;
      if (left.parsedTime === null && right.parsedTime !== null) return 1;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

/** Pick the newest mapped status from Waslah tracking events. */
export function resolveLatestWaslahAppStatus(events = []) {
  const ordered = sortWaslahEventsNewestFirst(events);
  for (const event of ordered) {
    const mapped = mapWaslahTrackingToOrderStatus({
      subtag: event?.subtag,
      message: event?.remarks || event?.status,
      subtagMessage: event?.status,
    });
    if (mapped) return mapped;
  }
  return null;
}

export function getWaslahOfficialCheckpoint(subtag = '') {
  const key = String(subtag || '').trim();
  return WASLAH_OFFICIAL_SUBTAG_CATALOG.find((entry) => entry.subtag === key) || null;
}

export function getWaslahCheckpointDisplay({
  subtag = '',
  subtagMessage = '',
  message = '',
} = {}) {
  const official = getWaslahOfficialCheckpoint(subtag);
  const detail = String(message || '').trim();
  const heading = String(subtagMessage || '').trim();
  if (official) return detail || official.message || heading || official.label;
  return detail || heading || getWaslahSubtagLabel(subtag) || 'Update';
}

/** True when this checkpoint is a failed delivery / exception / return reason. */
export function isWaslahFailureReasonSubtag(subtag = '') {
  const key = String(subtag || '').trim();
  if (!key) return false;
  if (/^(FailedAttempt|Exception|OnHold|Lost|Damaged|Disposed)_/i.test(key)) return true;
  if (/^(RTO_|ReturnToShipper_|ToBeReturned_|ReadyForReturn_|Return_Received_)/i.test(key)) return true;
  if (/^Cancelled_/i.test(key)) return true;
  return false;
}

/**
 * Human-readable courier reason from EMX/Waslah (why undelivered / failed attempt / RTO).
 * Prefer official catalog message + event remarks over generic status labels.
 */
export function getWaslahCourierReason(order = {}) {
  const waslah = order?.waslah || {};
  const events = Array.isArray(waslah.events) ? waslah.events : [];
  const currentSubtag = String(waslah.currentSubtag || waslah.lastSubtag || '').trim();
  const official = getWaslahOfficialCheckpoint(currentSubtag);

  const fromStored = String(
    waslah.lastSubtagMessage
    || waslah.currentStatus
    || '',
  ).trim();

  const fromOfficial = String(official?.message || official?.label || '').trim();

  // Prefer the newest failure/exception event remarks (actual courier reason).
  let fromFailureEvent = '';
  for (const event of events) {
    const subtag = String(event?.subtag || '').trim();
    if (!isWaslahFailureReasonSubtag(subtag)) continue;
    const text = String(event?.remarks || event?.status || '').trim();
    const eventOfficial = getWaslahOfficialCheckpoint(subtag);
    fromFailureEvent = text
      || String(eventOfficial?.message || eventOfficial?.label || '').trim();
    if (fromFailureEvent) break;
  }

  // Also accept free-text undelivered wording from the latest event.
  const latest = events[0] || null;
  const latestText = String(latest?.remarks || latest?.status || '').trim();
  const latestLooksLikeReason = /undeliver|failed attempt|not respond|incorrect address|refused|wrong mobile|switched off|cash not ready|out of delivery|return to|rto|exception|on hold|damaged|lost/i.test(
    `${latestText} ${latest?.subtag || ''}`,
  );

  const pickRicher = (...candidates) => {
    const cleaned = candidates.map((value) => String(value || '').trim()).filter(Boolean);
    const generic = /^(failed attempt|exception|update|pickup requested|in transit|shipped|out for delivery|delivered)$/i;
    return cleaned.find((value) => !generic.test(value)) || cleaned[0] || '';
  };

  const reason = pickRicher(
    fromFailureEvent,
    latestLooksLikeReason ? latestText : '',
    isWaslahFailureReasonSubtag(currentSubtag) ? fromOfficial : '',
    isWaslahFailureReasonSubtag(currentSubtag) ? fromStored : '',
    fromStored,
    fromOfficial,
    latestText,
  );

  if (!reason) return null;

  const label = String(official?.label || getWaslahSubtagLabel(currentSubtag) || '').trim();
  const location = String(waslah.lastLocation || latest?.location || '').trim();
  const courierStatus = String(
    waslah.appStatus
    || waslah.carrierStatus
    || mapWaslahSubtagToOrderStatus(currentSubtag)
    || '',
  ).trim().toUpperCase();

  return {
    reason,
    label: label && label.toLowerCase() !== reason.toLowerCase() ? label : '',
    location,
    subtag: currentSubtag,
    courierStatus,
    isFailure: isWaslahFailureReasonSubtag(currentSubtag) || Boolean(fromFailureEvent) || latestLooksLikeReason,
  };
}

export function compactWaslahTrackingEvents(events = []) {
  const seen = new Set();
  const compact = [];
  for (const event of Array.isArray(events) ? events : []) {
    const subtag = String(event?.subtag || '').trim();
    const time = event?.time || '';
    const remarks = String(event?.remarks || '').trim();
    const status = String(event?.status || '').trim();
    const key = `${subtag}|${time}|${remarks}|${status}`;
    if (!subtag && !status && !remarks) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    compact.push({
      time,
      status: status || getWaslahSubtagLabel(subtag) || 'Update',
      subtag,
      location: String(event?.location || '').trim(),
      remarks,
    });
  }
  return compact.slice(0, 80);
}

export function mergeWaslahTrackingEvents(existing = [], incoming = []) {
  return compactWaslahTrackingEvents([...(incoming || []), ...(existing || [])]);
}

export function buildWaslahTrackingEvent({
  subtag = '',
  subtagMessage = '',
  message = '',
  time = '',
  location = '',
} = {}) {
  return {
    time: time || '',
    status: getWaslahSubtagLabel(subtag) || String(subtagMessage || '').trim() || 'Update',
    subtag: String(subtag || '').trim(),
    location: String(location || '').trim(),
    remarks: getWaslahCheckpointDisplay({ subtag, subtagMessage, message }),
  };
}

export function getWaslahSubtagLabel(subtag = '') {
  const key = String(subtag || '').trim();
  if (OFFICIAL_SUBTAG_LABELS[key]) return OFFICIAL_SUBTAG_LABELS[key];

  const status = mapWaslahSubtagToOrderStatus(key);
  if (status === 'OUT_FOR_DELIVERY') return 'Out for Delivery';
  if (status === 'DELIVERED') return 'Delivered';
  if (status === 'SHIPPED') return 'Shipped / In Transit';
  if (status === 'PICKED_UP') return 'Picked Up';
  if (status === 'PICKUP_REQUESTED') return 'Pickup Requested';
  if (status === 'PROCESSING') return 'Processing';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'RTO') return 'Return to Shipper';
  if (status === 'RETURN') return 'Customer Return';
  return key.replace(/_/g, ' ');
}

export function buildEmxTrackingUrl(trackingNumber = '') {
  const awb = String(trackingNumber || '').trim();
  if (!awb) return '';
  return `https://www.emx.ae/all-services/track-a-package?trackingnumber=${encodeURIComponent(awb)}`;
}

/** True for EMX barcode AWBs on the carrier label (e.g. 1000045344337). */
export function looksLikeEmxTrackingNumber(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^[a-fA-F0-9]{24}$/.test(text)) return false;
  if (/^S1920-/i.test(text)) return false;
  // Waslah platform order/AWB numbers (first label) — not the EMX barcode.
  if (/^62\d{10,14}$/.test(text)) return false;
  // EMX door-to-door barcode on the carrier label.
  if (/^1000\d{9,12}$/.test(text)) return true;
  // Fallback: other numeric carrier AWBs that are not Waslah 62… numbers.
  return /^\d{10,16}$/.test(text) && !/^62\d+$/.test(text);
}

/** Waslah's own tracking/order number (first label), e.g. 62007200719360. */
export function looksLikeWaslahPlatformTrackingNumber(value = '') {
  const text = String(value || '').trim();
  return /^62\d{10,14}$/.test(text);
}

/** Prefer the EMX tracking number from the carrier label barcode. */
export function getEmxTrackingNumber(order = {}) {
  const candidates = [
    order?.waslah?.emxTrackingNumber,
    order?.waslah?.trackingNumber,
    order?.trackingId,
    order?.awb,
    order?.airwayBillNo,
    order?.waslah?.waslahTrackingNumber,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (looksLikeEmxTrackingNumber(value)) return value;
  }
  return '';
}

export function isWaslahCourierOrder(order = {}) {
  const courier = String(order?.courier || '').toLowerCase();
  return (
    courier.includes('emx')
    || courier.includes('waslah')
    || Boolean(order?.waslah?.orderId || order?.waslah?.trackingNumber)
  );
}

function unwrapWaslahHistoryList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.history)) return payload.data.history;
  if (Array.isArray(payload?.data?.events)) return payload.data.events;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.tracking_history)) return payload.tracking_history;
  return [];
}

function unwrapWaslahCurrentTrackingStatus(payload = {}) {
  const candidates = [
    payload?.tracking_status,
    payload?.trackingStatus,
    payload?.current_tracking_status,
    payload?.currentTrackingStatus,
    payload?.current_status,
    payload?.currentStatus,
    payload?.last_status,
    payload?.lastStatus,
    payload?.order?.tracking_status,
    payload?.order?.trackingStatus,
    payload?.data?.tracking_status,
    payload?.data?.trackingStatus,
  ];

  const candidate = candidates.find((entry) => entry && (typeof entry === 'object' || typeof entry === 'string'));
  if (!candidate) return null;
  if (typeof candidate === 'string') {
    return { status: candidate, subtag_message: candidate };
  }
  return candidate;
}

function normalizeWaslahEvent(entry = {}, { authoritative = false } = {}) {
  const subtag = getWaslahEventSubtag(entry);
  const statusLabel = entry?.subtag_message
    || entry?.subtagMessage
    || entry?.message
    || entry?.Message
    || entry?.Status
    || entry?.status?.descriptionEn
    || entry?.status?.description
    || (typeof entry?.status === 'string' ? entry.status : '')
    || getWaslahSubtagLabel(subtag)
    || 'Update';

  return {
    time: getWaslahEventTime(entry),
    status: statusLabel,
    subtag,
    location: entry?.location
      || entry?.city
      || entry?.checkpoint_location
      || entry?.locationEn
      || '',
    remarks: entry?.message
      || entry?.Message
      || entry?.remarks
      || entry?.Remarks
      || entry?.subtag_message
      || entry?.subtagMessage
      || '',
    ...(authoritative ? { authoritative: true } : {}),
  };
}

/** Normalize Waslah POST /orders/history into the app's unified tracking shape. */
export function normalizeWaslahTrackingHistory(payload, fallbackAwb = '') {
  const list = sortWaslahEventsNewestFirst(unwrapWaslahHistoryList(payload));
  const currentTrackingStatus = unwrapWaslahCurrentTrackingStatus(payload);
  const deepEmx = findEmxTrackingInPayload(payload);
  const fallback = String(fallbackAwb || '').trim();
  const trackingId = String(
    deepEmx
    || (looksLikeEmxTrackingNumber(fallback) ? fallback : '')
    || (looksLikeEmxTrackingNumber(payload?.tracking_number) ? payload.tracking_number : '')
    || (looksLikeEmxTrackingNumber(payload?.trackingNumber) ? payload.trackingNumber : '')
    || '',
  ).trim();

  if (!list.length && !currentTrackingStatus && !trackingId && !fallback) return null;

  const events = list.map(normalizeWaslahEvent);
  const latest = currentTrackingStatus || list[0] || {};
  const latestSubtag = getWaslahEventSubtag(latest);
  const currentEvent = normalizeWaslahEvent(latest, { authoritative: Boolean(currentTrackingStatus) });
  const currentEventAlreadyIncluded = events.some((event) => (
    event.subtag === currentEvent.subtag
    && event.status === currentEvent.status
    && event.remarks === currentEvent.remarks
  ));
  if (currentTrackingStatus && currentEvent.subtag && !currentEventAlreadyIncluded) {
    events.unshift(currentEvent);
  }

  const appStatus = mapWaslahTrackingToOrderStatus({
    subtag: latestSubtag,
    message: getWaslahEventMessage(latest),
    subtagMessage: latest?.subtag_message || latest?.subtagMessage,
  })
    || resolveLatestWaslahAppStatus(events)
    || null;
  const currentStatus = latest?.subtag_message
    || latest?.subtagMessage
    || latest?.message
    || latest?.Message
    || latest?.Status
    || latest?.status?.descriptionEn
    || latest?.status?.description
    || (typeof latest?.status === 'string' ? latest.status : '')
    || getWaslahSubtagLabel(latestSubtag)
    || '';

  return {
    courier: 'EMX',
    trackingId,
    trackingUrl: buildEmxTrackingUrl(trackingId),
    waslah: {
      trackingNumber: trackingId,
      currentStatus,
      currentSubtag: latestSubtag,
      currentEventAt: currentEvent.time || events[0]?.time || '',
      lastSubtagMessage: currentStatus,
      lastLocation: currentEvent.location || events[0]?.location || '',
      appStatus,
      events,
      isDelivered: latestSubtag === 'Delivered_001' || appStatus === 'DELIVERED',
    },
  };
}

export async function fetchNormalizedWaslahTracking(trackingNumber) {
  const { fetchWaslahTrackingHistory, isWaslahConfigured } = await import('./waslah');
  if (!isWaslahConfigured()) {
    throw new Error('Waslah is not configured');
  }
  const payload = await fetchWaslahTrackingHistory(trackingNumber);
  return normalizeWaslahTrackingHistory(payload, trackingNumber);
}

function findEmxTrackingInPayload(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (typeof node === 'string' || typeof node === 'number') {
    const value = String(node).trim();
    return looksLikeEmxTrackingNumber(value) ? value : null;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findEmxTrackingInPayload(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findEmxTrackingInPayload(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
