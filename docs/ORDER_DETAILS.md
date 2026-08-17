# Order Details

Reference for everything shown and stored for a Store1920 order: identity, AWB/shipping, **automatic EMX send for new orders**, customer, products, and payment.

**UI:** Store dashboard → Orders → **Order Details** modal (`/store/orders`)  
**Schema:** `models/Order.js`  
**Public track:** `/track-order` via `app/api/track-order`

---

## 1. Order identity

| Label (UI) | Field | Notes |
|---|---|---|
| Order No | `shortOrderNumber` | Customer-facing number (e.g. `616808`) |
| Internal ID | `_id` | Mongo ObjectId |
| Store | `storeId` | Required |
| Order status | `status` | See [status values](#order-status-values) |
| Order date | `createdAt` | Set by Mongoose timestamps |
| Last updated | `updatedAt` | |
| Manual order | `manualStoreOrder` | Created in dashboard |
| Created by | `storeCreatedByUid`, `storeCreatedByName` | Staff who created manual order |
| Notes | `notes` | |
| Cancel / return reason | `cancelReason`, `returnReason` | |

---

## 2. Shipping & Tracking (AWB)

After an AWB is created (EMX via Waslah), the order is linked by writing the AWB onto the order document.

### Warehouse packing

| Endpoint | Purpose |
|---|---|
| `POST /api/store/orders/pack` | Packed button — marks packed, status → `WAITING_FOR_PICKUP`, emails customer |
| `GET /api/store/orders/packed` | Packed history |
| `order.warehousePacking` | `{ packed, packedAt, packedByName, ... }` — also on lookup |

See `docs/warehouse-order-packing-api.md`. Store orders list shows a **Packed** tag when `warehousePacking.packed` is true.

### How AWB is created (two paths)

| Path | When | Entry |
|---|---|---|
| **Manual** | Staff clicks Ship with EMX in Order Details | `POST /api/store/waslah/ship` |
| **Automatic (new orders)** | New enrolled order becomes eligible | Inngest `app/order.ready-for-waslah` → same `shipOrderWithWaslah()` |

Both paths end in `buildWaslahStoreOrderUpdate()` and write the same AWB fields onto the order.

### How AWB is linked after create

Ship flow (manual or auto): `shipOrderWithWaslah()` → `buildWaslahStoreOrderUpdate()` in `lib/waslahOrderMapper.js`.

On success the order is updated with:

| Field | Purpose |
|---|---|
| `trackingId` | **Canonical AWB** (indexed; used by public track lookup) |
| `waslah.trackingNumber` | Same AWB under Waslah nest |
| `waslah.orderId` | Waslah 24-char shipment order ID |
| `waslah.reference` | Provider reference (order number, e.g. `618821`; older shipments may be `S1920-618821`) |
| `waslah.cartId` / `waslah.serviceId` | Waslah cart / service |
| `waslah.labelUrl` | Shipping label URL |
| `waslah.labelPrintedAt` | When label was marked printed |
| `waslah.processed` / `processedAt` | Shipment confirmed |
| `courier` | Usually `EMX` |
| `trackingUrl` | EMX / Waslah track URL |
| `status` | Advances to `SHIPPED` when AWB is confirmed (from `ORDER_PLACED` / `PROCESSING`) |

**UI AWB display** (`getOrderAwb`): prefer `waslah.trackingNumber`, else `trackingId` when the order is Waslah/EMX-associated.

**Example (from dashboard):**

| UI label | Example value |
|---|---|
| Provider | EMX via Waslah |
| AWB Number | `62007200700841` |
| Courier | `EMX` |
| Order status (store) | `PROCESSING` / `SHIPPED` |
| Live carrier badge | e.g. Shipped (from Waslah sync) |

### Other Waslah / carrier fields

| Field | Notes |
|---|---|
| `waslah.carrierStatus` | Synced carrier status |
| `waslah.lastSubtag` / `lastSubtagMessage` | Last event detail |
| `waslah.lastEventAt` / `lastEventId` | Last event markers |
| `waslah.unlinkedInWaslah` | Duplicate exists in Waslah but not linked yet |
| Live enrich (API) | `waslah.events[]`, `currentStatus`, `isDelivered`, etc. |

### Manual tracking (other couriers)

Staff can set without Waslah:

- `trackingId`
- `courier`
- `trackingUrl`

### Dashboard actions

- Download label → `waslah.labelUrl`
- Track on EMX → `trackingUrl` or EMX track URL for the AWB
- Refresh EMX status → `POST /api/store/waslah/sync-status` (persists live status; returns event timeline)
- Live poll → every 30s while Order Details is open (non-terminal EMX AWBs)
- Live event timeline → shown in Order Details after refresh (`waslah.events`)

### Live EMX tracking (manual ship)

After you click **Ship with EMX** and an AWB exists:

| Surface | Live tracking |
|---|---|
| Order Details | Live status badge, Refresh button, 30s poll, event timeline |
| Orders list | AWB column + Auto sync (uses `trackingId` or `waslah.trackingNumber`) |
| Public `/track-order` | Lookup by EMX AWB, status card, timeline, 30s poll |
| Webhook | `POST /api/webhooks/waslah` push updates |

Requires `WASLAH_API_TOKEN` (and webhook secret in production). Auto AWB create is separate (`WASLAH_AUTO_SHIP_ENABLED`) and can stay off for manual shipping.

### Public track lookup

Customers can search by AWB, Waslah order ID, order number, phone, or email (`lib/orderTrackingLookup.js`).

Lookup order for identifiers:

1. `trackingId`
2. `waslah.trackingNumber`
3. `waslah.orderId` or Mongo `_id` (24-hex)
4. `shortOrderNumber`

---

## 3. Automatic send to EMX (new orders only)

**Currently off.** Set `WASLAH_AUTO_SHIP_ENABLED=false` — staff ship with the **Ship with EMX** button only.

When the flag is on, auto EMX applies to **new COD and new paid orders only**.  
**Existing / older orders are never auto-sent** — staff must use manual Ship with EMX.

| Order type | Auto EMX? |
|---|---|
| **New COD** (created while flag is on) | Yes — after stock reserved |
| **New paid** (card / Tabby / Tamara / etc., created while flag is on) | Yes — after trusted payment verification |
| **Existing order** (created before flag, or `autoShipEnrolled !== true`) | **No** — manual ship only |
| Old order that later gets paid / edited | **No** (unless it was enrolled at create) |

**Feature flag:** `WASLAH_AUTO_SHIP_ENABLED` = `1` / `true` / `yes` / `on` / `enabled`  
Policy: `lib/waslahAutoShipPolicy.js` · Runner: `lib/waslahAutoShipment.js`

### Enrollment (new orders at create only)

On create (`app/api/orders`), when auto-ship is enabled:

```js
waslah: {
  autoShipEnrolled: true,       // NEW orders only
  autoShipEnrolledAt: <now>,
}
```

Also set: `fulfillmentStockReservationRequired: true`.

Gate in policy: if `waslah.autoShipEnrolled !== true` → reject with `existing_order_not_enrolled` (terminal).  
Turning the flag on later does **not** enroll orders that already exist.

### When it queues (new enrolled orders)

| Trigger | Source string | Ready when |
|---|---|---|
| New **COD** checkout | `new_cod_order` | Stock reserved → `autoShipReadyAt` → queue |
| New **paid** order verified | `paid:<source>` | Trusted `paymentVerification` + `autoShipReadyAt` → queue |
| New manual store create (COD) | store create path | Enrolled + stock reserved + ready |
| New abandoned-cart convert | cart convert path | Same eligibility (must be enrolled at create) |
| Recovery (enrolled only) | cron / Inngest | Missed event, retry due, or expired lease |

### Eligibility checklist (`getWaslahAutoShipEligibility`)

Must all pass:

1. `waslah.autoShipEnrolled === true` ← **blocks all existing / non-enrolled orders**
2. `waslah.autoShipReadyAt` set
3. Stock reserved: `fulfillmentStockReservedAt` + `fulfillmentStockReservationId === _id`
4. Not in trash (`deletedAt` empty)
5. No AWB yet (`trackingId` / `waslah.trackingNumber` empty)
6. Not `waslah.unlinkedInWaslah`
7. Status is `ORDER_PLACED` or `PROCESSING`
8. Has line items
9. Shipping address has name, phone, street, city, state, country
10. Payment (new enrolled only):
    - **New COD** → eligible after ready + stock
    - **New prepaid** → `isPaid`, paid `paymentStatus`, and trusted `paymentVerification` (VERIFIED, AED, amounts match)

### Auto-ship status fields (`waslah.*`)

| Field | Meaning |
|---|---|
| `autoShipEnrolled` / `autoShipEnrolledAt` | Opted into auto EMX **at create** (new orders) |
| `autoShipReadyAt` | Fulfillment ready (stock and/or paid proof) |
| `autoShipStatus` | Lifecycle state (below) |
| `autoShipTrigger` | Why it was queued (e.g. `new_cod_order`) |
| `autoShipAttemptId` / `autoShipAttemptCount` | Attempt tracking |
| `autoShipRequestedAt` / `StartedAt` / `CompletedAt` / `FailedAt` | Timestamps |
| `autoShipNextRetryAt` | Next recovery attempt |
| `autoShipLeaseExpiresAt` | Worker lease (~10 min) |
| `autoShipLastError` / `autoShipLastErrorCode` | Last failure detail |

**`autoShipStatus` values:**

| State | Meaning |
|---|---|
| `PENDING` | Queued for Inngest |
| `PROCESSING` | Worker holds lease, calling Waslah |
| `COMPLETED` | AWB created / already had AWB |
| `RETRY_PENDING` | Transient failure; will retry (backoff) |
| `BLOCKED` | Non-retryable (validation, not eligible, stock fail, …) |
| `NEEDS_RECONCILIATION` | Duplicate Waslah reference — link manually |

### Runtime flow (new COD / new paid only)

```text
NEW order created (autoShipEnrolled: true)
    → COD: stock reserved (+ ready)
      OR paid: payment verified (+ ready)
    → requestWaslahAutoShipment()
    → mark autoShipStatus = PENDING
    → Inngest event (backup) + **immediate processWaslahAutoShipment()**
    → shipOrderWithWaslah()   ← same as manual Ship
    → AWB written: trackingId + waslah.trackingNumber
    → autoShipStatus = COMPLETED

EXISTING order (autoShipEnrolled missing/false)
    → never queued → staff uses manual Ship with EMX
```

Immediate in-process ship is the primary path. Inngest + `/api/cron/waslah-auto-ship` are backups for retries and crash recovery.
**Safety:** one lease per order so manual Ship and auto-ship cannot create two EMX shipments.

**Recovery:** only sweeps enrolled new orders (`autoShipEnrolled: true`).

- Inngest cron every 5 min: `recoverWaslahAutoShipments`
- HTTP cron: `GET /api/cron/waslah-auto-ship` (Bearer `CRON_SECRET`)

### What staff see in Order Details

Same Shipping & Tracking block as manual ship once AWB exists. Auto-specific signals live on `waslah.autoShip*`:

- Enrolled but no AWB yet → check `autoShipStatus` / `autoShipLastError`
- Existing order (not enrolled) → no auto fields / never auto-queued — use **Ship with EMX**
- `BLOCKED` / `NEEDS_RECONCILIATION` → fix address / payment / Waslah link, then ship manually or re-queue after fix

---

## 4. Customer details

Resolved from guest fields, embedded address, and/or linked user.

| Label (UI) | Fields |
|---|---|
| Name | `guestName` · `shippingAddress.name` · `userId.name` (populated) |
| Email | `guestEmail` · `shippingAddress.email` · `userId.email` |
| Phone | `guestPhone` · `shippingAddress.phone` + `phoneCode` |
| Alternate phone | `alternatePhone` / `alternatePhoneCode` (also on `shippingAddress`) |
| Guest order | `isGuest` |
| Linked user | `userId` |
| Saved address ref | `addressId` → Address model |

### `shippingAddress` (embedded snapshot)

| Field | Example / notes |
|---|---|
| `name` | Customer name |
| `email` | |
| `phone`, `phoneCode` | e.g. `+971`, `506304299` |
| `alternatePhone`, `alternatePhoneCode` | |
| `street` | |
| `city` / `district` | City/District |
| `state` | e.g. Dubai/Abu Dhabi |
| `zip` / `pincode` | |
| `country` | e.g. United Arab Emirates |
| `building`, `area` | Optional; used by Waslah mapper |

### Traffic / attribution (optional)

`attribution.utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `utmId`, `utmReferrer`

---

## 5. Order items (products)

Stored on `orderItems[]` (preferred). Legacy parallel array: `items`.

### Line item fields

| Field | Notes |
|---|---|
| `productId` | Ref → Product (populated in store orders API for name/images) |
| `name` | Snapshot name at order time (must not be empty — taken from catalog if cart omits it) |
| `price` | Unit price |
| `quantity` | |
| `variantOptions` | Object (size/color/etc.) |

If `name` was saved empty, Order Details falls back to the populated product (`productId.name` / `images[0]`). Checkout now always writes `product.name` when the cart line has no title.

### Populated product (display)

When APIs populate `productId`: `name`, `slug`, `images`, `sku`, `variants`, `price`, `salePrice`.

**UI shows:** product name, image, quantity, variant label, unit price, line total.

**Example:**

| Product | Qty | Price |
|---|---|---|
| Wireless Battery Powered Air Blower - Big Blower | 1 | AED 75.00 |

Display helpers: `lib/storeOrderLineItems.js` (`getStoreOrderDisplayItems`).

---

## 6. Payment & status

| Label (UI) | Field | Notes |
|---|---|---|
| Total amount | `total` | Order total |
| Shipping fee | `shippingFee` | |
| Payment method | `paymentMethod` | COD, CARD, STRIPE, TABBY, TAMARA, RAZORPAY, WALLET, … |
| Payment status | `paymentStatus` | e.g. Pending |
| Paid flag | `isPaid` | Boolean |
| Payment reference | `paymentReferenceId` | Generic |
| Coupon | `isCouponUsed`, `coupon` | |
| Wallet / coins | `coinsRedeemed`, `walletDiscount`, `coinsEarned`, `rewardsCredited` | |
| Manual discount | `manualDiscount` | `{ type, value, amount, originalTotal }` |

### Provider-specific payment IDs

| Provider | Fields |
|---|---|
| Razorpay | `razorpayPaymentId`, `razorpayOrderId`, `razorpaySignature`, `razorpaySettlement` |
| Stripe | `stripeCheckoutSessionId`, `stripePaymentStatus` |
| Tamara | `tamaraOrderId` |
| Tabby | `tabbyPaymentId` |
| Verification | `paymentVerification` (status, provider, amounts, verifiedAt, …) |
| Failed follow-up | `paymentFailedFollowUp` | Staff recovery discount / method change |

---

## 7. Order status values

Used by the dashboard status picker (`OrderStatusPicker`):

| Status |
|---|
| `ORDER_PLACED` |
| `PROCESSING` |
| `WAITING_FOR_PICKUP` |
| `PICKUP_REQUESTED` |
| `PICKED_UP` |
| `WAREHOUSE_RECEIVED` |
| `SHIPPED` |
| `OUT_FOR_DELIVERY` |
| `DELIVERED` |
| `CANCELLED` |
| `PAYMENT_FAILED` |
| `RTO` |
| `RETURN` |
| `RETURNED` |
| `RETURN_INITIATED` |
| `RETURN_APPROVED` |

Status-only update: `POST /api/store/orders/update-status`  
Full order edit: `PUT /api/store/orders/[orderId]`

---

## 8. Related nested data (not always in Order Details modal)

| Nest | Purpose |
|---|---|
| `returns[]` | Return / replacement requests |
| `deliveryReviews[]` / `averageDeliveryRating` | Delivery ratings |
| `communicationLog[]` | Email / WhatsApp / system messages |
| `zohoCrm` / `zohoInventory` | CRM / inventory sync |
| `trackingContext` | Ads / session (`fbp`, `fbc`, anonymousId, …) |
| Soft delete | `deletedAt`, `deletedBy`, `deletedByName` |

---

## 9. Key files

| Area | Path |
|---|---|
| Schema | `models/Order.js` |
| Order Details UI | `components/store/StoreOrdersClient.jsx` |
| Edit panel | `components/store/StoreEditOrderPanel.jsx` |
| Address form | `components/store/StoreOrderAddressForm.jsx` |
| Line-item helpers | `lib/storeOrderLineItems.js` |
| Display helpers | `lib/orderDisplay.js` |
| Waslah ship + AWB link | `lib/waslahShipmentService.js`, `lib/waslahOrderMapper.js` |
| **Auto EMX policy** | `lib/waslahAutoShipPolicy.js` |
| **Auto EMX queue / worker** | `lib/waslahAutoShipment.js` |
| **Auto EMX Inngest** | `inngest/functions.js` (`auto-ship-waslah-order`, recover cron) |
| **Auto EMX HTTP cron** | `app/api/cron/waslah-auto-ship/route.js` |
| Stock ready for auto | `lib/orderStockReservation.js` |
| Paid → queue auto | `lib/orderPaymentVerification.js` |
| Checkout enroll + COD queue | `app/api/orders/route.js` |
| Ship API (manual) | `app/api/store/waslah/ship/route.js` |
| Sync EMX status | `app/api/store/waslah/sync-status/route.js` |
| Store orders API | `app/api/store/orders/route.js`, `app/api/store/orders/[orderId]/route.js` |
| Public track | `app/track-order/page.jsx`, `app/api/track-order/route.js`, `lib/orderTrackingLookup.js` |

---

## 10. Example Order Details snapshot

Illustrative values matching a typical COD EMX shipment:

```text
Order No:           616808
Status:             PROCESSING (or SHIPPED after AWB confirm)

Shipping & Tracking
  Provider:         EMX via Waslah
  AWB Number:       62007200700841   ← trackingId + waslah.trackingNumber
  Courier:          EMX
  Label:            waslah.labelUrl
  Waslah Order ID:  waslah.orderId

Customer Details
  Name:             rohith -test
  Email:            store1920.com@gmail.com
  Phone:            +971 506304299
  Location:         Dubai/Abu Dhabi, United Arab Emirates
  Street:           dubaio
  City/District:    Al Danah

Order Items
  Wireless Battery Powered Air Blower - Big Blower × 1  →  AED 75.00

Payment & Status
  Total:            AED 75
  Payment Method:   COD
  Payment Status:   Pending
  Order Date:       13/07/2026, 09:34
```

---

## 11. AWB ↔ order connection (checklist)

When AWB create succeeds (manual **or** auto EMX), the backend **must** persist:

1. `trackingId` = AWB  
2. `waslah.trackingNumber` = same AWB  
3. `waslah.orderId` = Waslah shipment id  
4. `courier` = `EMX` (or actual carrier)  
5. `trackingUrl` = track URL  
6. `waslah.labelUrl` when available  
7. `status` → `SHIPPED` when shipment is confirmed  
8. For auto path: `waslah.autoShipStatus` → `COMPLETED`

Then public `/track-order` can find the order by AWB via `trackingId` / `waslah.trackingNumber`.

### Auto EMX env checklist

1. `WASLAH_AUTO_SHIP_ENABLED=false` to keep **manual Ship with EMX only** (recommended while operating manually)  
2. Set `=true` only when you want new COD/paid orders to auto-create AWB again  
3. Waslah / EMX credentials configured  
4. If auto is on: Inngest synced, valid `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`, and `CRON_SECRET` for `/api/cron/waslah-auto-ship`  

### Troubleshooting: “Ready to ship” but no AWB (new COD)

Order Details still shows the manual **Ship with EMX** form until an AWB exists. That does **not** mean auto was skipped.

Check Mongo `waslah` on the order:

| What you see | Meaning |
|---|---|
| `autoShipEnrolled: false` / missing | Not a new enrolled order — manual only |
| `autoShipStatus: PENDING`, `StartedAt: null` | Queued but worker never ran (old bug: Inngest-only). After fix, immediate ship runs at queue time; set `CRON_SECRET` for recovery. |
| `RETRY_PENDING` + `autoShipLastError` | Waslah/network failed — will retry |
| `BLOCKED` + error | Needs fix (stock, address, config) then manual ship or re-queue |
| `COMPLETED` + AWB | Success |

**Example (order 616814):** enrolled COD, stock ready, `autoShipStatus: PENDING`, trigger `new_cod_order`, no AWB — queue worked; worker/cron did not process.
