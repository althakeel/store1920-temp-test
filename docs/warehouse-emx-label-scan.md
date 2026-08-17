# Warehouse App — Scan EMX “Door To Door” Label

How the warehouse app should scan the **EMX carrier label** (the page with the blue **emx** logo and the black **Door To Door** bar).

---

## What barcode to scan

On the EMX label, scan the **vertical barcode** under **Door To Door**.

| Label field | Example | Use in app |
|-------------|---------|------------|
| **Door To Door barcode** | `1000045376273` | **Primary scan value** → warehouse tracking lookup |
| Human-readable digits next to barcode | same `1000…` number | Same as above if camera fails |
| **Reference** | `S1920-618752` | Fallback (store order reference) |
| Order no only | `618752` | Fallback |
| Waslah receipt barcode `62…` | (other page) | Do **not** use for customer/EMX tracking |

The Door To Door code is the **EMX AWB**. It almost always starts with **`1000`** and is **13 digits** (sometimes 10–16 digits).

```http
POST /api/warehouse/tracking
Content-Type: application/json
x-warehouse-key: <WAREHOUSE_SCANNER_API_KEY>

{
  "q": "1000045376273",
  "live": true
}
```

---

## Why the app cannot scan / find the order

### 1) Scanner did not read the Door To Door code

Common camera issues on this label:

- Barcode is **printed vertically** — rotate the phone / enable vertical barcode modes
- Glare, blur, or low light on glossy label paper
- Scanner returns extra characters (spaces, GS1 prefix `00`/`01`, leading zeros)

**App requirement:** before calling the API, normalize the scan:

1. Trim spaces  
2. Keep digits only for EMX AWBs  
3. If value matches `00`/`01` + `1000…`, strip the `00`/`01` prefix  
4. Prefer values matching `^1000\d{9,12}$`

Server lookup already tries several normalized candidates (digits-only, GS1 strip, `S1920-…` reference).

### 2) Wrong barcode was scanned

Do **not** scan:

- SKU / product barcodes on the box  
- Random text QR (unless it is the Store1920 track URL)  
- Waslah first-label `62…` numbers  

Only the **Door To Door / EMX `1000…`** AWB (or `S1920-…` reference) is supported for warehouse order lookup.

### 3) Order not linked in Store1920 yet

Lookup searches:

- `waslah.emxTrackingNumber`
- `trackingId`
- `waslah.trackingNumber`
- `waslah.reference` (`S1920-618752`)
- store order number (`618752`)

If the label was printed but Store1920 never saved the EMX AWB:

1. Open **Store → Orders**  
2. Click **Refresh EMX status** on that order  
3. Scan again  

Or look up by reference:

```json
{ "q": "S1920-618752", "live": true }
```

### 4) Label shows **Service Type: None** (important)

On some labels the **Service Type** box shows **None**.

That means the Waslah/EMX shipment may have been created **without a courier service selected** on that order (or the label template omitted it).

Effects:

- EMX / warehouse systems may reject or ignore the parcel for pickup routing  
- Tracking/history can stay empty or stuck  
- Door To Door barcode may still print, but the shipment is not fully “active”

**Fix on Store1920 server:**

```env
WASLAH_SERVICE_ID=<EMX domestic service Mongo id>
WASLAH_PREFERRED_COURIER=EMX
```

Then:

1. Restart Next.js  
2. In Store Orders, confirm EMX service is selected (“Fetch EMX service ID” if needed)  
3. Cancel broken shipment if needed → **Send to EMX** again → download label  
4. New label should show a real service (not **None**) and a scannable Door To Door AWB linked in our DB  

---

## Recommended warehouse scan flow

```
Point camera at Door To Door barcode (rotate if vertical)
        ↓
Read value (expect 1000…………)
        ↓
Normalize (digits only / strip GS1)
        ↓
POST /api/warehouse/tracking { "q": "<awb>", "live": true }
        ↓
404? → try Reference S1920-… or order no → Refresh EMX status in dashboard
        ↓
Show order details, packed state, pickup window, courier reason
```

### Android scanner tips

- Prefer a library that supports **Code 128** (EMX Door To Door is typically Code 128)  
- Allow **portrait + landscape** decode  
- Reject scans shorter than 10 digits for AWB mode  
- Show the raw scan string on failure so staff can type `1000…` manually  

---

## Manual test for this label

Label example:

- AWB / Door To Door: `1000045376273`  
- Reference: `S1920-618752`  
- Receiver: Anas Tm  

```bash
curl -s "https://store1920.com/api/warehouse/tracking?q=1000045376273&live=true" \
  -H "x-warehouse-key: $WAREHOUSE_SCANNER_API_KEY"

curl -s "https://store1920.com/api/warehouse/tracking?q=S1920-618752&live=true" \
  -H "x-warehouse-key: $WAREHOUSE_SCANNER_API_KEY"
```

Expected: `success: true` and `order.trackingNumber` / `order.emxTrackingNumber` = `1000045376273`.

If both return `404`, the AWB is not stored on any Store1920 order yet — refresh/sync that shipment from Store Orders.

---

## Related docs

- [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) — full warehouse tracking + pickup + labels  
- [warehouse-tracking-api.md](./warehouse-tracking-api.md) — endpoint short reference  
