# Backend reply — Warehouse EMX label scan / order lookup

**Date:** 2026-08-13  
**To:** Store1920 Warehouse app (`com.store1920wareshouse.app`)  
**From:** Store1920 backend  

---

## Verdict

| Check | Result |
|--------|--------|
| Door To Door AWB stored on order? | **Yes** — on `trackingId` + `waslah.trackingNumber` |
| `/api/warehouse/tracking` on production? | **No — route missing (HTML 404)** until server redeploy |
| Item images in API payload? | Supported after deploy (`items[].image` absolute HTTPS from product thumbnail) |
| `WASLAH_SERVICE_ID` / EMX service | **Configured**; example orders have real `serviceId` |

**Primary blocker for the app:** production has **not** deployed the warehouse tracking API yet. Authenticated pack still exists (`/api/store/orders/pack` → JSON 401 without token). Tracking lookup returns the Next.js HTML soft-404 page, so the Flutter client cannot parse order JSON.

After `git pull` + `npm run build` + process restart on `store1920.com`, the three curl lookups below will work with Firebase Bearer (or `x-warehouse-key` once configured).

---

## Example label — AWB ↔ order (corrected)

The handoff mixed two nearby labels. DB mapping:

| Label AWB (Door To Door) | Store order | Reference | Status |
|--------------------------|-------------|-----------|--------|
| `1000045376273` | **#618752** | `S1920-618752` | `PICKUP_REQUESTED`, label printed |
| `1000045376277` | **#618751** | `S1920-618751` | `PICKUP_REQUESTED`, label printed |

So scanning `1000045376277` must open **#618751**, not #618752.  
Scanning `S1920-618752` / `618752` / `1000045376273` opens **#618752**.

Mongo fields for #618752:

- `trackingId`: `1000045376273`
- `waslah.trackingNumber`: `1000045376273`
- `waslah.emxTrackingNumber`: was `null` (legacy gap) — **backfilled** on 2026-08-13 to match Door To Door AWB
- `waslah.reference`: `S1920-618752`
- `waslah.serviceId`: `65f2cc65c86ee80013093256` (present — not “no service” in DB)
- `courier`: `EMX`

Lookup keys the API uses (after deploy):

- `waslah.emxTrackingNumber`
- `trackingId`
- `waslah.trackingNumber`
- `waslah.reference` (`S1920-…`)
- `shortOrderNumber` (`618752`)

---

## Smoke tests (after production redeploy)

Expect **401** without auth, **404 JSON** `{ "error": "Order not found" }` for unknown AWB, **200 JSON** with `success: true` when found.

```bash
# By EMX AWB for #618752
curl -s "https://store1920.com/api/warehouse/tracking?q=1000045376273&live=false" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"

# By reference
curl -s "https://store1920.com/api/warehouse/tracking?q=S1920-618752&live=false" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"

# By order number
curl -s "https://store1920.com/api/warehouse/tracking?q=618752&live=false" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Expected success shape (abbreviated):

```json
{
  "success": true,
  "mode": "lookup",
  "order": {
    "shortOrderNumber": "618752",
    "trackingNumber": "1000045376273",
    "emxTrackingNumber": "1000045376273",
    "courier": "EMX",
    "labelReady": true,
    "items": [{ "name": "...", "quantity": 1, "sku": "...", "image": "https://..." }]
  }
}
```

**Today (pre-deploy):** same URLs return **HTTP 404 HTML** (soft site 404), not JSON — that is an ops/deploy issue, not a scanner bug.

---

## Env confirmation

| Variable | Local/server `.env` check |
|----------|---------------------------|
| `WASLAH_API_BASE_URL` | `https://gateway.waslah.ae/api/v1` |
| `WASLAH_API_TOKEN` | set |
| `WASLAH_PREFERRED_COURIER` | `EMX` |
| `WASLAH_SERVICE_ID` | set (orders persist `waslah.serviceId`) |
| `WAREHOUSE_SCANNER_API_KEY` / `WAREHOUSE_STORE_ID` | optional; **not required** if app uses Firebase seller Bearer |

**Service Type: None** on some EMX PDFs is a Waslah/EMX print quirk. Our orders for this batch already store a real `serviceId`. New ship/label flows should keep writing that service; Refresh EMX / re-print if a label looks blank.

---

## App vs backend classification (updated)

| Symptom | Owner |
|---------|--------|
| Camera never fills AWB | App / device |
| Typed AWB → HTML soft 404 / non-JSON | **Backend deploy** (`/api/warehouse/tracking` missing on prod) |
| Typed AWB → JSON 404 after deploy | Backend data / wrong AWB↔order (see table above) |
| Typed AWB finds order; pack/pickup fails | Backend endpoint for that action |
| Finds wrong order number for scanned AWB | Label mix-up — trust AWB→order map, not handwritten notes |

**Source of truth after deploy:** typed Door To Door AWB against `POST/GET /api/warehouse/tracking`.

---

## Item images

Serializer already returns absolute `https://…` thumbnails from populated `productId` (not video-first). Inline `orderItems[].image` may be empty; product relation is what fills `items[].image`. After deploy, if an image is still null, that SKU lacks usable product media in catalog.

---

## Backend follow-ups (done / next)

1. Confirmed AWB linkage for #618751 / #618752.  
2. Confirmed production **missing** warehouse tracking route until redeploy of commit that added `app/api/warehouse/tracking`.  
3. Harden scan normalization (digits-only, GS1 `00`/`01` strip, `S1920-…`).  
4. Backfill `waslah.emxTrackingNumber` where only `trackingId` / `waslah.trackingNumber` were set.  
5. Ops: pull `main`, rebuild, restart Next on production, then re-run the three curls with a seller token.
