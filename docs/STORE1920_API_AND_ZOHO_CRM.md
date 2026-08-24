# Store1920 API & Zoho CRM Integration Guide

**Document purpose:** Share with Zoho Inventory / CRM integration partners.  
**Product:** Store1920 e‑commerce platform  
**Base URL (production):** `https://store1920.com`  
**API root:** `https://store1920.com/api/...`  
**Last updated:** 2026-08-18

> **Orders sync to Zoho Inventory, not Zoho CRM.**  
> CRM Contacts/Deals are optional. If OAuth was generated with `ZohoCRM.*` scopes only, Inventory sales orders will not create. Reconnect with `ZohoInventory.FullAccess.all`.  
> Official OAuth: https://www.zoho.com/inventory/api/v1/oauth/#overview

---

## 1. How Store1920 talks to Zoho CRM

Store1920 pushes **confirmed orders** into Zoho CRM as:

| Store1920 | Zoho CRM module | Action |
|-----------|-----------------|--------|
| Customer (guest or account) | **Contacts** | Upsert by Email (preferred) or Phone |
| Paid / confirmed order | **Deals** | Create new Deal linked to Contact |

Sync runs **automatically** after order confirmation notifications, and can also be triggered **manually** from the seller dashboard API.

### 1.1 When an order is synced

An order is synced when **all** of the following are true:

- `ZOHO_CRM_ENABLED=true`
- Zoho OAuth is configured (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`)
- Order is **not** failed / cancelled
- Order is **not** awaiting payment
- Order does **not** already have `zohoCrm.dealId`

### 1.2 Contact field mapping (Store1920 → Zoho CRM Contacts)

| Zoho CRM field | Source from Store1920 order |
|----------------|-----------------------------|
| `First_Name` | Shipping / guest / user name (first word) |
| `Last_Name` | Remaining name words (or `-`) |
| `Email` | `shippingAddress.email` → `guestEmail` → user email |
| `Phone` | Normalized UAE/local phone (`+971…`) |
| `Mailing_Street` | `shippingAddress.street` |
| `Mailing_City` | `shippingAddress.city` |
| `Mailing_State` | `shippingAddress.state` / `district` |
| `Mailing_Country` | `shippingAddress.country` (default `UAE`) |
| `Lead_Source` | Always `Store1920` |

**Upsert rules:**  
- Duplicate check field = `Email` if email exists, else `Phone`  
- Zoho API: `POST /crm/v6/Contacts/upsert`

### 1.3 Deal field mapping (Store1920 → Zoho CRM Deals)

| Zoho CRM field | Source |
|----------------|--------|
| `Deal_Name` | `Order {displayOrderNumber}` |
| `Stage` | Env `ZOHO_CRM_DEAL_STAGE` (default `Qualification`) |
| `Amount` | `order.total` (AED) |
| `Closing_Date` | Order `createdAt` (YYYY-MM-DD) |
| `Description` | Order number, payment method, status, total, line items |
| `Contact_Name` | `{ id: contactId }` from upsert |
| `Layout` | Optional – `ZOHO_CRM_DEAL_LAYOUT_ID` |

**Create:** `POST /crm/v6/Deals`

### 1.4 Example Deal description text

```
Store1920 order 12345
Payment: COD
Status: ORDER_PLACED
Total: AED 59.90
Items:
- Sup Game Box Mini Handheld Console with 400 Games x1 @ AED 59.90
```

### 1.5 Data stored back on Store1920 order

```json
{
  "zohoCrm": {
    "contactId": "6883…",
    "dealId": "6883…",
    "syncedAt": "2026-07-08T12:00:00.000Z",
    "syncStatus": "synced",
    "lastError": null
  }
}
```

Possible `syncStatus` values: `syncing` | `synced` | `failed`

---

## 2. Zoho OAuth setup (Zoho Inventory — required for orders)

Store1920 uses **OAuth 2.0** as documented by Zoho Inventory:

https://www.zoho.com/inventory/api/v1/oauth/#overview

- Access token header: `Authorization: Zoho-oauthtoken {access_token}`
- Refresh tokens via `POST https://accounts.zoho.{dc}/oauth/v2/token` (`grant_type=refresh_token`)
- Data centers: `.com` `.eu` `.in` `.com.au` `.ca` (plus `.sa` / `.jp` if that is the account DC)

### Required scopes (Inventory)

**Required for order sync (sales orders, customers, items):**

```
ZohoInventory.FullAccess.all
```

Equivalent minimum if you prefer granular scopes:

```
ZohoInventory.contacts.CREATE,ZohoInventory.contacts.READ,ZohoInventory.contacts.UPDATE,ZohoInventory.items.CREATE,ZohoInventory.items.READ,ZohoInventory.items.UPDATE,ZohoInventory.salesorders.CREATE,ZohoInventory.salesorders.READ,ZohoInventory.salesorders.UPDATE,ZohoInventory.settings.READ
```

Do **not** generate the token with only:

```
ZohoCRM.modules.ALL,ZohoCRM.settings.ALL
```

A CRM-only token will refresh successfully and still fail `/inventory/v1/*`.

### Optional CRM scopes (same token)

Only if you also want Contacts + Deals:

```
ZohoInventory.FullAccess.all,ZohoCRM.modules.ALL,ZohoCRM.settings.ALL
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ZOHO_CLIENT_ID` | API client ID |
| `ZOHO_CLIENT_SECRET` | API client secret |
| `ZOHO_REFRESH_TOKEN` | Long-lived refresh token **with Inventory scopes** |
| `ZOHO_REGION` | `com` \| `eu` \| `in` \| `com.au` \| `jp` \| `sa` \| `ca` (default `com`) |
| `ZOHO_REDIRECT_URI` | Browser OAuth callback, e.g. `https://store1920.com/api/zoho/callback` |
| `ZOHO_API_DOMAIN` | Optional override (e.g. `www.zohoapis.com`) |
| `ZOHO_ACCOUNTS_DOMAIN` | Optional override |
| `ZOHO_ORGANIZATION_ID` | Inventory organization id (`GET /inventory/v1/organizations`) |
| `ZOHO_INVENTORY_ENABLED` | `true` (default) to push sales orders |
| `ZOHO_CRM_ENABLED` | `true` only if the token also has CRM scopes |
| `ZOHO_CRM_DEAL_STAGE` | Deal stage name (default `Qualification`) |
| `ZOHO_CRM_DEAL_LAYOUT_ID` | Optional deal layout ID |

### Option A — Self Client (Generate Code)

1. Zoho API Console → Self Client → Generate Code.  
2. Scope: `ZohoInventory.FullAccess.all`  
3. Within the code lifetime, call:

```http
GET https://store1920.com/api/zoho/exchange?code={GRANT_CODE}
```

4. Copy `refresh_token` into `ZOHO_REFRESH_TOKEN`.  
5. Open `GET /api/zoho/status` and copy an Inventory `organization_id` into `ZOHO_ORGANIZATION_ID`. Restart.

The JSON warns if the exchanged token is CRM-only.

### Option B — Browser OAuth (official authorize URL)

1. Register redirect URI `{origin}/api/zoho/callback` on the client.  
2. Set `ZOHO_REDIRECT_URI` to that URL.  
3. Open:

```http
GET https://store1920.com/api/zoho/authorize
```

This redirects to:

`https://accounts.zoho.com/oauth/v2/auth?scope=ZohoInventory.FullAccess.all&client_id=...&response_type=code&redirect_uri=...&access_type=offline&prompt=consent`

4. After Accept, `/api/zoho/callback` returns the `refresh_token`.

### Connection health checks

```http
GET https://store1920.com/api/zoho/status
```

Reports `inventoryAccess` vs `crmAccess`. Orders need `inventoryAccess: true`.

```http
GET https://store1920.com/api/zoho/diagnose
```

Finds the working data center and probes Inventory vs CRM APIs.

```http
GET /api/store/zoho/inventory/test
Authorization: Bearer <seller_token>
```

Lists Inventory organizations for the connected token.

---

## 3. Store1920 Zoho API endpoints (for operators / Zoho partners)

> **Auth:** Seller/dashboard routes require Firebase ID token:  
> `Authorization: Bearer <firebase_id_token>`

### 3.1 CRM – manual sync one order

```http
POST /api/store/zoho/crm/sync
Authorization: Bearer <seller_token>
Content-Type: application/json

{
  "orderId": "65f1a2b3c4d5e6f7a8b9c0d1",
  "force": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `orderId` | Yes | MongoDB order `_id` |
| `force` | No | Re-sync even if already synced |

**Success example:**

```json
{
  "success": true,
  "contactId": "…",
  "dealId": "…",
  "crm": { "enabled": true, "dealStage": "Qualification" },
  "order": { "...": "updated order document" }
}
```

**Skipped example:**

```json
{
  "skipped": true,
  "reason": "already_synced"
}
```

Skip reasons include: `zoho_crm_disabled`, `order_not_found`, `already_synced`, `order_not_eligible`, `already_synced_or_in_progress`.

### 3.2 Zoho status (seller dashboard)

```http
GET /api/store/zoho/status
Authorization: Bearer <seller_token>
```

### 3.3 Inventory – order destination (required)

Orders become **Zoho Inventory sales orders** (`POST /inventory/v1/salesorders`), with Inventory contacts/customers.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/store/zoho/inventory/test` | Connectivity / list Inventory organizations |
| `POST` | `/api/store/zoho/inventory/sync` | Sync one order to Zoho Inventory sales order |

CRM Deals are optional and use a different API (`/crm/v6`).

---

## 4. Direction of data (important for Zoho CRM)

| Direction | Supported today? | Notes |
|-----------|------------------|-------|
| Store1920 → Zoho CRM (Contacts + Deals) | **Yes** | Automatic + manual |
| Zoho CRM → Store1920 (webhook / push) | **Not implemented** | Orders are owned by Store1920 |
| Zoho CRM reading Store1920 REST as customer master | **Not the primary design** | Prefer CRM as the destination CRM of record for deals |

If Zoho needs **inbound** sync (Zoho → website), that would be a separate project (webhooks + API key).

---

## 5. Website API overview (all domains)

Store1920 exposes ~290 Next.js App Router routes under `/api/*`.  
They fall into these groups:

### 5.1 Authentication patterns

| Pattern | Used by | Header / secret |
|---------|---------|-----------------|
| **Firebase Bearer (customer)** | Cart, profile, wishlist, tickets, addresses | `Authorization: Bearer <firebase_id_token>` |
| **Firebase Bearer (seller)** | `/api/store/*` dashboard APIs | Same header; user must own/operate a store |
| **Public (no auth)** | Catalog, shipping rates, search, public homepage data | None |
| **Webhook secrets** | Stripe, Tabby, Tamara, Waslah, Razorpay | Provider signatures / shared secrets |
| **Cron secret** | `/api/cron/*` | App-configured cron auth |

### 5.2 Storefront / customer APIs (summary)

| Area | Example routes | Methods |
|------|----------------|---------|
| Catalog | `/api/products`, `/api/products/by-slug`, `/api/products/batch`, `/api/categories`, `/api/search-products` | GET |
| Cart | `/api/cart`, `/api/cart/validate` | GET/POST |
| Checkout & shipping | `/api/shipping`, `/api/coupon`, `/api/orders` | GET/POST |
| Payments | `/api/stripe`, `/api/orders/verify-stripe`, `/api/orders/verify-tabby`, `/api/tabby/webhook`, `/api/tamara/webhook`, `/api/stripe/webhook` | POST |
| Account | `/api/profile`, `/api/address`, `/api/wishlist`, `/api/wallet` | GET/POST |
| Reviews | `/api/review`, `/api/review/can-review` | GET/POST |
| Support | `/api/tickets`, `/api/tickets/[ticketId]` | GET/POST |
| Tracking | `/api/track-order`, `/api/public/tracking-context` | GET |

### 5.3 Seller dashboard APIs (`/api/store/*`)

| Area | Example routes |
|------|----------------|
| Products | `/api/store/product`, publish/stock/FBT toggles, bulk import |
| Categories | `/api/store/categories`, import, product-stats |
| Orders | `/api/store/orders`, `/api/store/orders/[orderId]`, status, CSV, notifications |
| Customers | `/api/store/customers`, export, wallet |
| Reviews / tickets | `/api/store/reviews`, `/api/store/tickets/*` |
| Shipping / Waslah | `/api/store/waslah/ship`, `/api/store/waslah/status` |
| Reports | `/api/store/sales-report`, `/api/store/orders-by-product` |
| Zoho | `/api/store/zoho/status`, `/api/store/zoho/crm/sync`, inventory sync |
| Media | `/api/store/upload-image`, `/api/store/upload/presign` |

### 5.4 Admin APIs (`/api/admin/*`)

Store approval, home sections, admin coupons, inventory history, etc. (admin Firebase role).

### 5.5 Integrations & webhooks

| Integration | Routes |
|-------------|--------|
| **Zoho CRM / OAuth** | `/api/zoho/*`, `/api/store/zoho/*` |
| **Zoho Inventory** | `/api/store/zoho/inventory/*` |
| **Waslah courier** | `/api/store/waslah/*`, `/api/webhooks/waslah` |
| **Stripe** | `/api/stripe`, `/api/stripe/webhook` |
| **Tabby / Tamara** | `/api/tabby/webhook`, `/api/tamara/webhook` |
| **Razorpay** | `/api/razorpay/*`, `/api/webhooks/razorpay` |
| **Google Merchant** | `/api/feeds/google-merchant`, `/api/store/google-merchant/*` |
| **Meta / marketing** | `/api/store/meta-integration`, marketing expense sync |
| **WhatsApp** | `/api/store/whatsapp/send`, abandoned-cart cron |
| **Delhivery / C3Xpress** | `/api/delhivery/*`, `/api/c3xpress/*`, store send-to-delhivery |

### 5.6 Cron / background

| Route | Purpose |
|-------|---------|
| `/api/cron/abandoned-checkout-whatsapp` | Abandoned cart WhatsApp |
| `/api/cron/behavioral-triggers` | Marketing triggers |
| `/api/cron/product-ai-autofill` | Product AI jobs |

---

## 6. Orders API context (useful for CRM mapping)

Orders are created via storefront checkout (`POST /api/orders` and payment confirm flows).  
Important order fields used for Zoho CRM:

| Field | Meaning |
|-------|---------|
| `_id` | Internal Mongo id (used by sync API) |
| `shortOrderNumber` / display number | Shown in Deal name |
| `total` | Deal amount (AED) |
| `paymentMethod` | COD, Card, Tabby, Tamara, Stripe, etc. |
| `status` | Lifecycle status |
| `shippingAddress` | Name, phone, email, street, city, country |
| `guestEmail` / `guestPhone` / `guestName` | Guest checkout |
| `orderItems[]` | Line items (`name`, `quantity`, `price`, product refs) |
| `zohoCrm` | Sync state (see §1.5) |

---

## 7. Error handling (Zoho CRM sync)

| Situation | Behavior |
|-----------|----------|
| Zoho not configured | Sync skipped / HTTP 503 on manual sync |
| Missing email and phone | Contact upsert fails → `zohoCrm.syncStatus = failed` |
| Zoho API error | Error message stored in `zohoCrm.lastError` |
| Duplicate deal protection | Second sync skipped unless `force: true` |

Manual retries: call `POST /api/store/zoho/crm/sync` with `"force": true`.

---

## 8. Security notes for Zoho partners

1. **Never** put Zoho client secrets or refresh tokens in frontend code or shared Notion pages with public access.
2. Seller `Bearer` tokens are **Firebase ID tokens** (short-lived); they are not API keys for Zoho.
3. Public catalog APIs do **not** expose customer PII or Zoho IDs.
4. Prefer sharing this document + a non-production sandbox when testing CRM field layouts.

---

## 9. Checklist for Zoho CRM team

- [ ] Confirm CRM org / data center region (`com`, `eu`, `sa`, …)
- [ ] Create or approve Self Client with Contacts + Deals scopes
- [ ] Confirm Deal layout / stage names match `ZOHO_CRM_DEAL_STAGE`
- [ ] Confirm Contact duplicate rules (Email / Phone) are acceptable
- [ ] Optionally provide Deal Layout ID for `ZOHO_CRM_DEAL_LAYOUT_ID`
- [ ] Decide whether Inventory sync is also in scope (separate modules)
- [ ] Agree on Deal stage progression after Store1920 creates the Deal (handled inside Zoho, not Store1920 today)

---

## 10. Contact / ownership

| Item | Owner |
|------|--------|
| Storefront & order APIs | Store1920 engineering |
| Zoho CRM modules / stages / layouts | Zoho CRM admin |
| OAuth client & refresh token | Store1920 ops (in server env) |
| Field mapping questions | Use this document §1 |

---

## Appendix A – Minimal sequence diagram

```
Customer places order on Store1920
        │
        ▼
Payment confirmed / order eligible
        │
        ▼
Store1920 orderConfirmationNotifications
        │
        ├─► Email / WhatsApp (optional)
        │
        └─► syncOrderToZohoInventoryOnce(order)
                 │
                 ├─► Zoho POST /inventory/v1/contacts
                 └─► Zoho POST /inventory/v1/salesorders
                          │
                          ▼
                 Store zohoInventory.salesOrderId on Order

        (optional) syncOrderToZohoCrmOnce(order) → CRM Contacts + Deals
```

## Appendix B – Full Zoho-related route list

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/zoho/status` | Public | OAuth + Inventory vs CRM probe |
| GET | `/api/zoho/authorize` | Public (ops) | Start Inventory OAuth consent |
| GET | `/api/zoho/callback` | Public (ops) | Inventory OAuth redirect |
| GET | `/api/zoho/exchange` | Public (ops only) | Grant → refresh token |
| GET | `/api/zoho/diagnose` | Public (ops only) | Region + Inventory probe |
| GET | `/api/store/zoho/status` | Seller Bearer | Dashboard Zoho status |
| POST | `/api/store/zoho/crm/sync` | Seller Bearer | Manual CRM sync (optional) |
| POST | `/api/store/zoho/inventory/sync` | Seller Bearer | Manual Inventory sales-order sync |
| GET | `/api/store/zoho/inventory/test` | Seller Bearer | Inventory org test |

---

*End of document.*
