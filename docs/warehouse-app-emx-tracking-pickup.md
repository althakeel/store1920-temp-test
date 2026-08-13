# Warehouse App — EMX Tracking & Pickup Guide

Documentation for the **warehouse / pickup Android (or other) app** that scans EMX labels, shows order details, packing state, pickup windows, and live courier reasons.

Related docs:

| Doc | Focus |
|-----|--------|
| This file | Tracking + pickup + order details for warehouse app |
| [warehouse-tracking-api.md](./warehouse-tracking-api.md) | Short tracking endpoint reference |
| [warehouse-order-packing-api.md](./warehouse-order-packing-api.md) | Pack button / packed history |
| [warehouse-inventory-api.md](./warehouse-inventory-api.md) | Stock / SKU scanner |
| [warehouse-android-firebase-setup.md](./warehouse-android-firebase-setup.md) | Firebase Auth for Android |

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://store1920.com` |

---

## Auth

Use **one** method per request.

### A) Warehouse API key (recommended for dedicated warehouse app)

```http
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>
```

Server env:

```env
WAREHOUSE_SCANNER_API_KEY=your-long-secret
WAREHOUSE_STORE_ID=yourStoreMongoId
```

Works for:

- `GET/POST /api/warehouse/tracking`
- `GET/POST /api/warehouse/tracking/:orderId`
- `GET/PATCH /api/warehouse/inventory` (scanner stock)

### B) Seller Firebase ID token (pack + schedule pickup)

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

Required for:

- `POST /api/store/orders/pack`
- `GET /api/store/orders/packed`
- `POST /api/store/waslah/pickup`
- `POST /api/store/waslah/carrier-label` / `GET ...?orderId=` (download EMX label PDF — show Downloaded ×N in app)

See [warehouse-android-firebase-setup.md](./warehouse-android-firebase-setup.md).

---

## Warehouse workflow (recommended screens)

```
1) Pickup queue
   GET /api/warehouse/tracking?status=WAITING_FOR_PICKUP,PICKUP_REQUESTED&packed=true

2) Scan EMX barcode / order number
   POST /api/warehouse/tracking  { "q": "<scan>", "live": true }

3) Order detail screen
   Show: order #, AWB, items, packed badge, pickup date/time,
         courierReason, waslah.events (history),
         labelReady / Downloaded ×N / Not printed

4) If not packed
   POST /api/store/orders/pack  { "q": "<scan>" }   (Firebase token)

5) Download / print EMX carrier label (if labelReady)
   GET  /api/store/waslah/carrier-label?orderId=...
   or POST /api/store/waslah/carrier-label { "orderIds": ["..."] }

6) If pickup not requested yet (pickup.requested = false)
   POST /api/store/waslah/pickup  { "orderId": "...", "pickupInfo": {...} }
```

Typical status path:

`PROCESSING` → pack → `WAITING_FOR_PICKUP` → schedule pickup → `PICKUP_REQUESTED` → EMX collects → in transit / delivered / failed attempt reasons

---

## 1. Scan / look up tracking (warehouse key OK)

### POST (best for scanners)

```http
POST /api/warehouse/tracking
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045345604",
  "live": true
}
```

Accepted lookup fields: `q`, `awb`, `tracking`, `orderId`  
Also works with store order number, e.g. `"q": "618739"`.

`live: true` (default on POST) refreshes EMX status from Waslah and saves it.

### GET equivalent

```http
GET /api/warehouse/tracking?q=1000045345604&live=true
x-warehouse-key: <KEY>
```

### Success shape (important fields)

```json
{
  "success": true,
  "mode": "lookup",
  "q": "1000045345604",
  "liveSync": { "changed": true, "skipped": false, "error": null },
  "order": {
    "orderId": "65f0...",
    "shortOrderNumber": "618739",
    "status": "WAITING_FOR_PICKUP",
    "courier": "EMX",
    "trackingNumber": "1000045345604",
    "emxTrackingNumber": "1000045345604",
    "trackingUrl": "https://www.emx.ae/...",
    "trackOrderPageUrl": "https://store1920.com/track-order?awb=1000045345604&auto=1",
    "labelReady": true,
    "labelDownloadCount": 1,
    "courierReason": "Not Responding",
    "courierReasonLabel": "Failed Attempt",
    "courierReasonIsFailure": true,
    "pickup": {
      "requested": true,
      "requestedAt": "2026-08-12T13:16:42.000Z",
      "type": "pickup",
      "date": "2026-08-13",
      "time": "09:00-21:00",
      "vehicle": "motorcycle"
    },
    "warehousePacking": {
      "packed": true,
      "packedAt": "2026-08-12T10:00:00.000Z",
      "packedByName": "Warehouse staff"
    },
    "waslah": {
      "orderId": "6a4f...",
      "liveStatus": "SHIPPED",
      "currentStatus": "Not Responding",
      "currentSubtag": "FailedAttempt_003",
      "lastLocation": "Dubai",
      "lastEventAt": "2026-08-13T08:00:00.000Z",
      "events": [
        {
          "time": "2026-08-13T08:00:00.000Z",
          "status": "Failed Attempt",
          "subtag": "FailedAttempt_003",
          "location": "Dubai",
          "remarks": "Not Responding"
        }
      ]
    },
    "customer": { "name": "...", "phone": "...", "email": "..." },
    "shippingAddress": {},
    "items": [
      { "name": "Product", "quantity": 1, "sku": "SKU-1", "image": "https://..." }
    ],
    "total": 109.9,
    "currency": "AED",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### Field guide for UI

| Field | Show as |
|-------|---------|
| `shortOrderNumber` | Order # |
| `trackingNumber` / `emxTrackingNumber` | EMX AWB barcode |
| `status` | Store workflow status |
| `waslah.liveStatus` / `waslah.currentStatus` | Live EMX status |
| `courierReason` | **Reason** (undelivered / failed attempt text) |
| `courierReasonIsFailure` | Highlight amber/red when `true` |
| `labelReady` | Enable **Download label** when `true` |
| `labelDownloadCount` | Badge: `Downloaded ×N` (0 = never downloaded) |
| `labelPrintedAt` | Last download/print time (UTC ISO → Asia/Dubai) |
| `labelUrl` | Cached EMX PDF URL after first successful download (optional open/print) |
| `pickup.date` + `pickup.time` | Scheduled pickup window |
| `pickup.requested` | Badge: Pickup scheduled / Not scheduled |
| `warehousePacking.packed` | Packed badge |
| `waslah.events[]` | Tracking history list (`remarks` = note/reason, `time` = UTC ISO — convert to Asia/Dubai in app) |
| `items[]` | Pack checklist |
| `trackOrderPageUrl` | Open customer track page / share |

---

## 2. Pickup / shipping queue list

```http
GET /api/warehouse/tracking?status=WAITING_FOR_PICKUP,PICKUP_REQUESTED&limit=50
x-warehouse-key: <KEY>
```

Useful filters:

| Query | Example | Meaning |
|-------|---------|---------|
| `status` | `WAITING_FOR_PICKUP,PICKUP_REQUESTED` | Queue statuses |
| `packed` | `true` / `false` | Only packed / not packed |
| `pickup` | `pending` | Has Waslah AWB but pickup not requested |
| `pickup` | `requested` | Pickup already scheduled |
| `limit` | `50` | Max 100 |

Examples:

```http
GET /api/warehouse/tracking?pickup=pending&packed=true
GET /api/warehouse/tracking?status=WAITING_FOR_PICKUP&packed=false
GET /api/warehouse/tracking?pickup=requested&limit=100
```

Response:

```json
{
  "success": true,
  "mode": "list",
  "count": 12,
  "limit": 50,
  "filters": {
    "status": ["WAITING_FOR_PICKUP", "PICKUP_REQUESTED"],
    "packed": null,
    "pickup": null
  },
  "orders": [ { "...same order object as lookup..." } ]
}
```

---

## 3. One order by Mongo id + live refresh

```http
GET /api/warehouse/tracking/{orderId}?live=true
POST /api/warehouse/tracking/{orderId}
x-warehouse-key: <KEY>
```

`POST` always forces an EMX live sync (same as Refresh EMX status in the seller dashboard).

---

## 4. Mark packed (Firebase token)

```http
POST /api/store/orders/pack
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json

{
  "q": "1000045345604",
  "notes": "optional warehouse note"
}
```

Or:

```json
{ "orderId": "65f0..." }
```

Effects:

1. `warehousePacking.packed = true`
2. Store status → `WAITING_FOR_PICKUP`
3. Customer email (status change)
4. Dashboard shows **Packed** tag

Full details: [warehouse-order-packing-api.md](./warehouse-order-packing-api.md)

---

## 5. Schedule EMX pickup (Firebase token)

Call this when `order.pickup.requested === false` and the order already has a Waslah/EMX shipment (`waslah.orderId` / AWB present).

```http
POST /api/store/waslah/pickup
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json

{
  "orderId": "65f0...",
  "pickupInfo": {
    "type": "pickup",
    "pickup_date": "2026-08-14",
    "pickup_time": "09:00-21:00",
    "pickup_vehicle": "motorcycle"
  },
  "paymentMethod": "credit_limit"
}
```

Bulk:

```json
{
  "orderIds": ["65f0...", "65f1..."],
  "pickupInfo": {
    "type": "pickup",
    "pickup_date": "2026-08-14",
    "pickup_time": "09:00-21:00",
    "pickup_vehicle": "motorcycle"
  }
}
```

### `pickupInfo` fields

| Field | Values | Notes |
|-------|--------|-------|
| `type` | `pickup` (default) or `dropoff` | Warehouse collection vs drop-off |
| `pickup_date` | `YYYY-MM-DD` | UAE calendar day |
| `pickup_time` | e.g. `09:00-21:00` | Window string Waslah expects |
| `pickup_vehicle` | `motorcycle` / `car` / `van` | Default often `motorcycle` |

If `pickupInfo` is omitted, the server uses UAE defaults (next eligible day after 10:00 Dubai cutoff, skip Sunday).

After success, re-fetch tracking — expect:

- `pickup.requested = true`
- `pickup.date` / `pickup.time` / `pickup.vehicle` filled
- `status` often `PICKUP_REQUESTED`

---

## 6. Download EMX carrier label (Firebase token) — show in app

Warehouse app should treat label download like the seller dashboard:

- Show **Download Carrier Label** when `labelReady === true`
- Show **Not printed** when `labelReady && labelDownloadCount === 0`
- Show **Downloaded ×N** when `labelDownloadCount >= 1` (N = `labelDownloadCount`)
- After download, refresh tracking lookup so count / status update

### Label fields from tracking API

```json
{
  "labelReady": true,
  "labelDownloadCount": 2,
  "labelPrintedAt": "2026-08-12T12:09:00.987Z",
  "labelUrl": "https://.../uploads/emx-carrier-1000045345604-....pdf"
}
```

| Field | App UI |
|-------|--------|
| `labelReady: false` | Hide download button — order not sent to EMX yet |
| `labelReady: true` + `labelDownloadCount: 0` | Red/amber badge **Not printed** + Download button |
| `labelDownloadCount: 1+` | Green badge **Downloaded ×1** / **×2** / **×3**… |
| `labelPrintedAt` | Optional “Last downloaded: Today, 16:09” (Asia/Dubai) |
| `labelUrl` | Optional secondary open/share of last cached PDF |

Suggested badges (same idea as `/store/orders`):

```text
labelReady && count == 0  →  "Not printed"
labelReady && count >= 1  →  "Downloaded ×{count}"
```

### Single order — GET (returns PDF bytes)

```http
GET /api/store/waslah/carrier-label?orderId=65f0...
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

Success:

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="emx-carrier-label-{AWB}.pdf"`
- Body = EMX-only carrier label PDF (Waslah receipt pages stripped)

Android tip: save the response body to a file / open with a PDF viewer / send to a printer. Do **not** expect JSON on success.

### One or many orders — POST (returns PDF bytes)

```http
POST /api/store/waslah/carrier-label
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json

{
  "orderIds": ["65f0...", "65f1..."]
}
```

Rules:

- `orderIds` required (array). Max **25** orders per request
- Only orders with a Waslah shipment (`labelReady`) are included
- Multiple PDFs are merged into one file for bulk print

Success: same as GET — raw PDF (`emx-carrier-labels-{count}-{date}.pdf`).

### What happens on the server after download

1. Increments `waslah.labelDownloadCount` (+1 each download)
2. Sets `waslah.labelPrintedAt`
3. May upload EMX PDF to S3 → `waslah.labelUrl`
4. May move store status → `WAITING_FOR_PICKUP` (if still early status)
5. May email customer on that status change

After a successful PDF download, the app should:

```http
POST /api/warehouse/tracking
{ "q": "<same scan or orderId>", "live": false }
```

Then refresh the detail screen badges from the new `labelDownloadCount` / `status`.

### Label download errors

| Status | Meaning |
|--------|---------|
| `400` | Missing `orderId` / `orderIds`, or none of the orders are on EMX yet |
| `401` / `403` | Firebase token missing or user is not store staff |
| `404` | Order not found, or no label PDF available yet |
| `502` | Waslah/print upstream failed |
| `503` | Waslah not configured on server |

### Curl examples

```bash
# Single label PDF
curl -L "https://store1920.com/api/store/waslah/carrier-label?orderId=65f0..." \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -o emx-label.pdf

# Bulk labels (merged PDF)
curl -L -X POST "https://store1920.com/api/store/waslah/carrier-label" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderIds":["65f0...","65f1..."]}' \
  -o emx-labels.pdf
```

---

## Tracking history UI notes

`order.waslah.events` is newest-first when synced from Waslah.

Each event:

```json
{
  "time": "2026-08-12T12:13:55.449Z",
  "status": "Cancelled",
  "subtag": "Cancelled_001",
  "location": "",
  "remarks": "Shipment cancelled by seller"
}
```

App display tips:

- Convert `time` from UTC ISO → **Asia/Dubai**
- If Dubai calendar day is today → show `Today, HH:mm`
- Show `remarks` (or `status`) as the note/reason line
- Prefer top-level `courierReason` on list rows for failed delivery reasons

Common failure reasons (examples):

- Not Responding  
- Incorrect Address  
- Refused to Accept  
- Wrong Mobile Number  
- Cash not Ready  
- Returned to Hub  

---

## Error reference

| Status | Typical cause |
|--------|----------------|
| `401` | Missing/invalid `x-warehouse-key` or Firebase token |
| `403` | Firebase user is not a store seller |
| `404` | Order/AWB not found for this store |
| `400` | Invalid body (missing `orderId` / `q`) |
| `502` / `503` | Waslah not configured or upstream error |

---

## Env checklist (server)

```env
WAREHOUSE_SCANNER_API_KEY=
WAREHOUSE_STORE_ID=
WASLAH_API_TOKEN=
WASLAH_API_BASE_URL=
WASLAH_SERVICE_ID=
WASLAH_DEFAULT_PICKUP_TIME=09:00-21:00
WASLAH_DEFAULT_PICKUP_VEHICLE=motorcycle
```

Restart Next.js after changing env values.

---

## Quick curl smoke tests

```bash
# Lookup by EMX AWB
curl -s "https://store1920.com/api/warehouse/tracking?q=1000045345604&live=true" \
  -H "x-warehouse-key: $WAREHOUSE_SCANNER_API_KEY"

# Pickup pending queue
curl -s "https://store1920.com/api/warehouse/tracking?pickup=pending&packed=true&limit=20" \
  -H "x-warehouse-key: $WAREHOUSE_SCANNER_API_KEY"

# Pack (Firebase)
curl -s -X POST "https://store1920.com/api/store/orders/pack" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"q":"1000045345604"}'

# Download EMX carrier label PDF (Firebase)
curl -L "https://store1920.com/api/store/waslah/carrier-label?orderId=65f0..." \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -o emx-label.pdf

# Schedule pickup (Firebase)
curl -s -X POST "https://store1920.com/api/store/waslah/pickup" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"65f0...","pickupInfo":{"type":"pickup","pickup_date":"2026-08-14","pickup_time":"09:00-21:00","pickup_vehicle":"motorcycle"}}'
```
