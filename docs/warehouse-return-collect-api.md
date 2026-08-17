# Warehouse Returns API (Flutter)

Share this document with the **warehouse Flutter app** team.

When a **returned product** is scanned at the warehouse:

1. App shows **Return collected**
2. Store dashboard order status becomes **Returned** (`RETURNED`) or **RTO**
3. Inventory stock is **increased** for the order products (and variants) — once per order

Related docs:

| Doc | Focus |
|-----|--------|
| **This file** | Return scan + status + stock restock |
| [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) | Outbound scan / pack / pickup |
| [warehouse-emx-label-scan.md](./warehouse-emx-label-scan.md) | Door To Door barcode |
| [warehouse-inventory-api.md](./warehouse-inventory-api.md) | Manual stock add by SKU |
| [warehouse-tracking-api.md](./warehouse-tracking-api.md) | Tracking lookup short reference |

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://store1920.com` |
| Local | `http://localhost:3000` |

---

## Auth

Use **one** method on every request:

### A) Warehouse API key (recommended)

```http
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>
```

### B) Seller Firebase token

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

---

## Status meanings (dashboard)

| App / API `type` | Dashboard status | When to use |
|------------------|------------------|-------------|
| `RETURNED` | **Returned** | Customer return after delivery (return needed → collected) |
| `RTO` | **RTO (Not Collected)** | Parcel never delivered / courier returned to origin |

Before warehouse collect, store staff may already have set status to **Return** (`RETURN`) = return needed. After scan, it becomes **Returned**.

---

## Recommended Flutter flow

```
1) Scan returning label / order number
   POST /api/warehouse/tracking
   Body: { "q": "<scan>", "live": true }

2) Show order detail
   - Order #, items, current status
   - If returnCollected.collected == true → already done (show Return collected badge)

3) Operator confirms Return vs RTO (optional; server can infer)

4) Submit collect
   POST /api/warehouse/returns/collect
   Body: { "q": "<scan>", "type": "RETURNED" }

5) UI success
   Title:    Return collected     ← use message / appMessage
   Subtitle: Returned or RTO      ← use statusLabel
   Stock:    show stockRestock.unitCount restocked (optional)
```

---

## 1) Look up order (scan)

**`POST /api/warehouse/tracking`**

```http
POST /api/warehouse/tracking
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045376273",
  "live": true
}
```

`q` may be:

- EMX Door To Door AWB (`1000…`)
- Order number (`618821`)
- Legacy reference (`S1920-618821`)
- Mongo `orderId`

Response includes:

```json
{
  "success": true,
  "order": {
    "orderId": "...",
    "shortOrderNumber": "618821",
    "status": "RETURN",
    "returnCollected": {
      "collected": false,
      "stockRestocked": false
    }
  }
}
```

If `returnCollected.collected` is already `true`, show **Return collected** and do not require a second submit (unless ops force).

---

## 2) Collect return (submit)

**`POST /api/warehouse/returns/collect`**

### Body

```json
{
  "q": "1000045376273",
  "type": "RETURNED",
  "notes": "optional warehouse note",
  "restock": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `q` / `awb` / `tracking` | one of these **or** `orderId` | Scan value |
| `orderId` | if no `q` | Mongo order id |
| `type` | no | `RETURNED` or `RTO`. If omitted, server infers |
| `notes` | no | Free text |
| `restock` | no | Default `true`. Set `false` to skip inventory update |
| `force` | no | Re-run even if already collected (restock only if not already restocked, unless force) |
| `itemIndexes` | no | Optional array of `orderItems` indexes to restock partially, e.g. `[0]` |

### Inference when `type` is omitted

| Current order / courier state | Result status |
|-------------------------------|---------------|
| Delivered / Return / Replacement / return requested | `RETURNED` |
| Never delivered / courier RTO / failed | `RTO` |
| `CANCELLED` | **409** error |

### Success response

```json
{
  "success": true,
  "message": "Return collected",
  "appMessage": "Return collected",
  "alreadyCollected": false,
  "statusChanged": true,
  "previousStatus": "RETURN",
  "status": "RETURNED",
  "statusLabel": "Returned",
  "returnCollected": {
    "collected": true,
    "collectedAt": "2026-08-17T09:00:00.000Z",
    "collectedByName": "Warehouse app",
    "previousStatus": "RETURN",
    "status": "RETURNED",
    "scan": "1000045376273",
    "stockRestocked": true,
    "stockRestockedAt": "2026-08-17T09:00:00.000Z",
    "stockRestock": {
      "productCount": 1,
      "unitCount": 1,
      "lines": [
        {
          "productId": "...",
          "productName": "Green Lion GT-FIT Smart Watch",
          "quantity": 1,
          "variants": [],
          "stockQuantity": 42
        }
      ]
    }
  },
  "stockRestock": {
    "restocked": true,
    "skipped": false,
    "reason": null,
    "productCount": 1,
    "unitCount": 1,
    "lines": [ "...same as above..." ]
  },
  "order": { "...same shape as tracking lookup..." }
}
```

### What the app must show

| Field | UI |
|-------|-----|
| `message` / `appMessage` | **Return collected** |
| `statusLabel` | Subtitle: **Returned** or **RTO** |
| `stockRestock.restocked` | Optional: “Stock +N units” |

### Already collected

If scanned again:

```json
{
  "success": true,
  "message": "Return collected",
  "alreadyCollected": true,
  "stockRestock": {
    "restocked": false,
    "skipped": true,
    "reason": "already_restocked"
  }
}
```

Still show **Return collected**. Stock is **not** added twice.

### Errors

| HTTP | Meaning |
|------|---------|
| `401` | Missing / wrong key or Firebase token |
| `400` | Missing `q` / `orderId` |
| `404` | Order not found for this store |
| `409` | Order is `CANCELLED` |
| `500` | Server error |

---

## Inventory / stock behaviour

On successful collect with `restock: true` (default):

- Each order line’s quantity is **added back** to product `stockQuantity`
- Matching **variants** get their `variants[n].stock` increased
- Product `inStock` is set `true` when stock &gt; 0
- Runs **once** per order (`stockRestockedAt` guard)
- Clears fulfillment reservation markers so a future reship can reserve again

Open store return requests (`REQUESTED` / `APPROVED`) are marked **COMPLETED** when status is `RETURNED`.

---

## Store dashboard effects

After collect:

- Status picker shows **Returned** or **RTO (Not Collected)**
- Chip **Return collected** on the orders table / order details
- Customer may get the usual Returned / RTO email
- Stock quantities update in `/store` inventory

---

## Example requests

### Customer return (after delivery)

```http
POST /api/warehouse/returns/collect
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "618821",
  "type": "RETURNED"
}
```

### RTO (not collected)

```http
POST /api/warehouse/returns/collect
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045376273",
  "type": "RTO"
}
```

### Collect without restocking (rare)

```json
{
  "q": "618821",
  "type": "RETURNED",
  "restock": false
}
```

---

## Flutter checklist

- [ ] Auth header (`x-warehouse-key` or Firebase Bearer)
- [ ] Scan → tracking lookup first
- [ ] Show items + current status
- [ ] Call `/api/warehouse/returns/collect` on confirm
- [ ] Success title = **Return collected**
- [ ] Subtitle = `statusLabel`
- [ ] Handle `alreadyCollected` without error toast
- [ ] Optionally show restocked unit count from `stockRestock`
- [ ] Support both `RETURNED` and `RTO` type buttons if ops need them

---

## Contact / env (backend)

Server env used by this API:

```env
WAREHOUSE_SCANNER_API_KEY=...
WAREHOUSE_STORE_ID=...
```

Deploy required before production Flutter builds can use stock restock on this endpoint.
