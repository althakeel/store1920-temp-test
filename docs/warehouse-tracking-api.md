# Warehouse Tracking API

APIs for the **warehouse / pickup app** to look up EMX tracking, pickup windows, packed state, courier reasons, and live courier status.

**Full warehouse app guide (tracking + pack + schedule pickup):**  
[warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/warehouse/tracking?q=` | Scan / look up by EMX AWB, order no, Waslah id |
| `POST /api/warehouse/tracking` | Same lookup (scanner-friendly POST) |
| `GET /api/warehouse/tracking?status=` | List pickup / shipping queue |
| `GET /api/warehouse/tracking/:orderId` | One order by Mongo id |
| `POST /api/warehouse/tracking/:orderId` | Force refresh live EMX status |

Related warehouse APIs:

- Pack order: `POST /api/store/orders/pack` (see [warehouse-order-packing-api.md](./warehouse-order-packing-api.md))
- Collect return / RTO: `POST /api/warehouse/returns/collect` (see [warehouse-return-collect-api.md](./warehouse-return-collect-api.md))
- Download EMX label: `GET/POST /api/store/waslah/carrier-label` (Firebase) — show `labelReady` / `Downloaded ×N` in app
- Schedule pickup: `POST /api/store/waslah/pickup` (Firebase seller token)
- Inventory: [warehouse-inventory-api.md](./warehouse-inventory-api.md)

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://store1920.com` |
| Local | `http://localhost:3000` |

---

## Auth

Use **one** of these:

### A) Warehouse API key (recommended for dedicated warehouse app)

```http
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>
```

Env on the server:

```env
WAREHOUSE_SCANNER_API_KEY=your-long-secret
WAREHOUSE_STORE_ID=yourStoreMongoId
```

### B) Seller Firebase token (same as store dashboard)

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

---

## 1. Lookup by tracking / order number

### GET

```http
GET /api/warehouse/tracking?q=1000045345604&live=true
GET /api/warehouse/tracking?awb=1000045345604
GET /api/warehouse/tracking?order=618739
```

### POST

```http
POST /api/warehouse/tracking
Content-Type: application/json
x-warehouse-key: <KEY>

{
  "q": "1000045345604",
  "live": true
}
```

`q` / `awb` / `tracking` / `orderId` are accepted.

`live=true` refreshes EMX status from Waslah and persists it.

### Success

```json
{
  "success": true,
  "mode": "lookup",
  "q": "1000045345604",
  "liveSync": { "changed": true, "skipped": false, "error": null },
  "order": {
    "orderId": "65f...",
    "shortOrderNumber": "618739",
    "status": "WAITING_FOR_PICKUP",
    "courier": "EMX",
    "trackingNumber": "1000045345604",
    "emxTrackingNumber": "1000045345604",
    "trackingUrl": "https://www.emx.ae/all-services/track-a-package?trackingnumber=1000045345604",
    "trackOrderPageUrl": "https://store1920.com/track-order?awb=1000045345604&auto=1",
    "labelReady": true,
    "labelDownloadCount": 2,
    "courierReason": "Not Responding",
    "courierReasonLabel": "Failed Attempt",
    "courierReasonIsFailure": true,
    "pickup": {
      "requested": true,
      "requestedAt": "2026-08-12T13:16:42.000Z",
      "type": "pickup",
      "date": "2026-08-13",
      "time": "09:00-21:00",
      "vehicle": "car"
    },
    "warehousePacking": { "packed": true, "packedAt": "..." },
    "waslah": {
      "orderId": "...",
      "liveStatus": "PICKUP_REQUESTED",
      "currentStatus": "Pickup Requested",
      "events": []
    },
    "customer": { "name": "...", "phone": "...", "email": "..." },
    "shippingAddress": {},
    "items": [{ "name": "...", "quantity": 1, "sku": "...", "image": "..." }],
    "total": 28,
    "currency": "AED"
  }
}
```

### Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing/invalid warehouse key or Firebase token |
| `404` | No order for that tracking / order number in this store |

---

## 2. Pickup / shipping queue list

```http
GET /api/warehouse/tracking?status=WAITING_FOR_PICKUP,PICKUP_REQUESTED&limit=50
GET /api/warehouse/tracking?pickup=pending
GET /api/warehouse/tracking?pickup=requested&packed=true
```

| Param | Values | Description |
|-------|--------|-------------|
| `status` | comma list | Default: `WAITING_FOR_PICKUP,PICKUP_REQUESTED,PROCESSING,ORDER_PLACED,SHIPPED` |
| `packed` | `true` / `false` | Filter warehouse packed flag |
| `pickup` | `requested` / `pending` | Has EMX pickup request or not |
| `limit` | 1–100 | Default `50` |

Response:

```json
{
  "success": true,
  "mode": "list",
  "count": 12,
  "limit": 50,
  "filters": { "status": ["WAITING_FOR_PICKUP"], "packed": null, "pickup": null },
  "orders": [ { "...serialized order..." } ]
}
```

---

## 3. One order + live refresh

```http
GET /api/warehouse/tracking/65f0123abc...?live=true
POST /api/warehouse/tracking/65f0123abc...
```

POST always forces an EMX live sync.

---

## Recommended warehouse app flow

```
Scan EMX barcode / order barcode
        ↓
POST /api/warehouse/tracking { "q": "<scan>", "live": true }
        ↓
Show: trackingNumber, status, pickup window, packed badge,
      courierReason, items, waslah.events
        ↓
If not packed → POST /api/store/orders/pack { "q": "<scan>" }
        ↓
If pickup.pending → POST /api/store/waslah/pickup (Firebase token)
        ↓
Optional: open trackOrderPageUrl for customer share / print
```

See the full guide: [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md)

---

## Env checklist

```env
WAREHOUSE_SCANNER_API_KEY=
WAREHOUSE_STORE_ID=
WASLAH_API_TOKEN=
WASLAH_API_BASE_URL=
```

Restart Next.js after changing env values.
