# Warehouse Return Scan API (Flutter / Scanner App)

Use this API when the warehouse team **scans a returned product** (EMX label, return AWB, order number, or return case id).

After a successful **collect** scan:

1. Store dashboard order status → **`RETURNED`** (or **`RTO`**)
2. App shows **Return collected**
3. **Product stock is increased** (product id + quantity returned)
4. Open return case (`RET-1920-…`) moves to **Received at warehouse** → QC (stock after QC pass)

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://store1920.com` |
| Local dev | `http://localhost:3000` |

---

## Authentication

Send **one** of these headers on every request:

### Option A — Warehouse API key (recommended for scanner app)

```http
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>
```

### Option B — Seller Firebase token

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

### Server environment (backend team)

```env
WAREHOUSE_SCANNER_API_KEY=your-secret-key
WAREHOUSE_STORE_ID=your-store-id
```

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| **GET** | `/api/warehouse/returns/scan?q=<scan>` | Preview scan — order + product ids, no status change |
| **POST** | `/api/warehouse/returns/scan` | Lookup **or** collect (see `action` below) |
| **POST** | `/api/warehouse/returns/collect` | Collect only (legacy; same behaviour as `action: "collect"`) |

**Recommended for new apps:** use **`/api/warehouse/returns/scan`** only.

---

## What can be scanned (`q`)

| Scan value | Example |
|------------|---------|
| Return case id | `RET-1920-000123` |
| Return pickup EMX AWB | `1000045876794` |
| Original delivery EMX AWB | `1000045607497` |
| Return reference | `618957-RP` |
| Store order number | `618957` |
| Legacy reference | `S1920-618957` |
| Mongo order id | `674a1b2c3d4e5f6789012345` |

---

## Flow for Flutter app

```
┌─────────────┐     GET/POST lookup      ┌──────────────────────────────┐
│ Scan barcode│ ───────────────────────► │ /api/warehouse/returns/scan  │
└─────────────┘                          └──────────────────────────────┘
       │                                              │
       │  Show order #, items, productId, status      │
       ▼                                              │
┌─────────────┐     POST action=collect              │
│ Confirm     │ ─────────────────────────────────────┘
└─────────────┘
       │
       ▼
  UI: "Return collected"
  Status: RETURNED
  Stock: +N units (returnedProducts)
```

---

## 1) Preview scan (lookup)

### GET

```http
GET /api/warehouse/returns/scan?q=1000045876794
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>
```

### POST (lookup)

```http
POST /api/warehouse/returns/scan
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045876794",
  "action": "lookup"
}
```

### Lookup response

```json
{
  "success": true,
  "mode": "lookup",
  "q": "1000045876794",
  "canCollect": true,
  "alreadyCollected": false,
  "status": "RETURN",
  "statusLabel": "Returned",
  "returnCollected": {
    "collected": false,
    "stockRestocked": false
  },
  "returnCase": {
    "returnNumber": "RET-1920-000045",
    "status": "IN_TRANSIT",
    "type": "RETURN",
    "items": [
      {
        "productId": "674abc123def456789012345",
        "productName": "Green Lion Smart Watch",
        "sku": "GL-GT-FIT",
        "quantity": 1
      }
    ]
  },
  "returnedProducts": [
    {
      "itemIndex": 0,
      "productId": "674abc123def456789012345",
      "productName": "Green Lion Smart Watch",
      "sku": "GL-GT-FIT",
      "quantity": 1,
      "variantOptions": null
    }
  ],
  "order": {
    "orderId": "674a1b2c3d4e5f6789012345",
    "shortOrderNumber": "618957",
    "status": "RETURN",
    "returnPickup": {
      "orderId": "waslah-return-order-id",
      "trackingNumber": "1000045876794",
      "reference": "618957-RP",
      "originalTrackingNumber": "1000045607497"
    },
    "items": [
      {
        "itemIndex": 0,
        "productId": "674abc123def456789012345",
        "name": "Green Lion Smart Watch",
        "quantity": 1,
        "sku": "GL-GT-FIT"
      }
    ]
  }
}
```

---

## 2) Collect return (status → RETURNED)

### POST

```http
POST /api/warehouse/returns/scan
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045876794",
  "action": "collect",
  "type": "RETURNED",
  "notes": "Received at warehouse dock 2"
}
```

Alternative — omit `action`, set `confirm`:

```json
{
  "q": "618957",
  "confirm": true,
  "type": "RETURNED"
}
```

### Body fields

| Field | Required | Description |
|-------|----------|-------------|
| `q` / `awb` / `scan` / `tracking` | Yes* | Barcode or reference from scanner |
| `orderId` | Yes* | Mongo order id if no scan string |
| `action` | No | `lookup` (default) or `collect` |
| `confirm` | No | `true` = same as `action: "collect"` |
| `type` | No | `RETURNED` (customer return) or `RTO` (not delivered). Default inferred |
| `notes` | No | Warehouse note |
| `restock` | No | Default `true`. Set `false` to skip stock update |
| `force` | No | Re-process if already collected |
| `itemIndexes` | No | Partial restock, e.g. `[0]` for first line only |

\* One of `q` or `orderId` is required.

### Collect success response

```json
{
  "success": true,
  "mode": "collect",
  "message": "Return collected",
  "appMessage": "Return collected",
  "alreadyCollected": false,
  "statusChanged": true,
  "previousStatus": "RETURN",
  "status": "RETURNED",
  "statusLabel": "Returned",
  "returnCollected": {
    "collected": true,
    "collectedAt": "2026-09-01T09:30:00.000Z",
    "status": "RETURNED",
    "scan": "1000045876794",
    "stockRestocked": true,
    "stockRestockedAt": "2026-09-01T09:30:00.000Z"
  },
  "returnedProducts": [
    {
      "productId": "674abc123def456789012345",
      "productName": "Green Lion Smart Watch",
      "sku": "GL-GT-FIT",
      "quantity": 1,
      "stockQuantity": 42
    }
  ],
  "stockRestock": {
    "restocked": true,
    "skipped": false,
    "productCount": 1,
    "unitCount": 1,
    "lines": [
      {
        "productId": "674abc123def456789012345",
        "productName": "Green Lion Smart Watch",
        "quantity": 1,
        "stockQuantity": 42
      }
    ]
  },
  "order": {
    "orderId": "674a1b2c3d4e5f6789012345",
    "shortOrderNumber": "618957",
    "status": "RETURNED"
  }
}
```

### What the app should display

| Field | UI text |
|-------|---------|
| `appMessage` | **Return collected** |
| `statusLabel` | **Returned** or **RTO** |
| `returnedProducts[].productName` | Product name returned |
| `returnedProducts[].productId` | Internal product id (for logs) |
| `stockRestock.unitCount` | Optional: “Stock +1 unit” |

---

## Status changes

| Before scan | After collect (`type: RETURNED`) |
|-------------|--------------------------------|
| `DELIVERED` | `RETURNED` |
| `RETURN` | `RETURNED` |
| `REPLACEMENT` | `RETURNED` |
| Undelivered / courier RTO | `RTO` (when `type: RTO` or inferred) |

Dashboard shows **Returned** in the orders list and order detail.

---

## Stock behaviour

| Scenario | Stock updated when |
|----------|-------------------|
| Simple return (no `RET-1920` case) | **Immediately on scan** |
| Return case in progress (`RET-1920-…`) | **After QC pass** in store dashboard (scan marks received → QC) |

Stock is **never added twice** for the same order (`stockRestockedAt` guard).

Each returned line updates:

- `Product.stockQuantity`
- Matching variant `variants[n].stock` if applicable
- `Product.inStock = true` when quantity &gt; 0

---

## Errors

| HTTP | `error` | Meaning |
|------|---------|---------|
| `401` | Unauthorized | Wrong or missing API key / token |
| `400` | q or orderId is required | Empty scan |
| `404` | Order not found | Scan not linked to this store |
| `409` | Cannot collect… | Order is `CANCELLED` |
| `500` | Server error | Retry or contact backend |

---

## Example cURL

### Preview

```bash
curl -s "https://store1920.com/api/warehouse/returns/scan?q=618957" \
  -H "x-warehouse-key: YOUR_KEY"
```

### Collect

```bash
curl -s -X POST "https://store1920.com/api/warehouse/returns/scan" \
  -H "Content-Type: application/json" \
  -H "x-warehouse-key: YOUR_KEY" \
  -d '{"q":"618957","action":"collect","type":"RETURNED"}'
```

---

## Flutter checklist

- [ ] Set `x-warehouse-key` on all requests
- [ ] On scan → **GET or POST lookup** first
- [ ] Show `order.items` with `productId`, name, qty
- [ ] Show `returnPickup.trackingNumber` if return EMX AWB exists
- [ ] Confirm button → **POST `action: "collect"`**
- [ ] Success screen: `appMessage` + `statusLabel`
- [ ] List `returnedProducts` with product names
- [ ] Handle `alreadyCollected: true` without error (still show success)
- [ ] Support return AWB scan (`waslahReturn` tracking number)

---

## Related docs

- [warehouse-return-collect-api.md](./warehouse-return-collect-api.md) — legacy collect endpoint details
- [warehouse-tracking-api.md](./warehouse-tracking-api.md) — outbound shipment lookup
- [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) — pack / pickup flow
