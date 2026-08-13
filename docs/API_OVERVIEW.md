# Store1920 API Overview (End-to-End)

**Audience:** Anyone integrating with Store1920  
**Base URL:** `https://store1920.com`  
**Last updated:** 2026-07-14

This is the **from-scratch map** of the whole platform: how auth, catalog, cart, checkout, payments, seller ops, warehouse, and messaging fit together. Detailed endpoints live in the linked docs.

---

## 1. Systems map

```
┌─────────────────────────────────────────────────────────────────┐
│                     Clients                                      │
│  Web storefront │ Shopper mobile │ Seller /store │ Admin │ WMS  │
└────────────┬────────────┬────────────┬────────────┬─────────────┘
             │            │            │            │
             ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js API  https://store1920.com/api/*            │
│  Public shopper │ /store/* seller │ /admin/* │ /cron │ webhooks │
└────────────┬────────────────────────────────────────────────────┘
             │
     ┌───────┼───────────────┬────────────────┬──────────────┐
     ▼       ▼               ▼                ▼              ▼
 Firebase  MongoDB      Stripe/Tabby      Waslah/EMX      WhatsApp
  Auth      orders       Tamara/COD        Delhivery       WABA
            products     Razorpay(leg.)    C3 Xpress       Zoho CRM
```

---

## 2. Core concepts

| Concept | Meaning |
|---------|---------|
| **Currency** | AED |
| **Product id** | MongoDB `_id` (24-char hex) |
| **Store** | Seller entity; products belong to a `storeId` |
| **User** | Firebase `uid` = Mongo `User._id` |
| **Guest** | Checkout without account; tracked via email/phone/`anonymousId` |
| **Order** | Created by `POST /api/orders` or seller manual create; statuses in [ORDER_DETAILS.md](./ORDER_DETAILS.md) |
| **Abandoned cart** | Saved for recovery SMS/WhatsApp; restore via token links |

---

## 3. Authentication modes

### 3.1 Firebase (all interactive clients)

1. Configure Firebase **client** SDK (same project as website).
2. Sign in → `getIdToken()` → send on every protected call:

```http
Authorization: Bearer <firebase_id_token>
```

3. Server verifies with Firebase Admin → `uid`.

### 3.2 Who gets access after verify

| Check | Result |
|-------|--------|
| Shopper APIs | `userId = uid` |
| `authSeller(uid)` | Owner or team member → `storeId` |
| `authAdmin(uid, email)` | Email in admin allowlist |
| Guest order | `isGuest: true` — no Bearer |

### 3.3 Machine auth

| Caller | Header |
|--------|--------|
| Vercel crons | `Authorization: Bearer <CRON_SECRET>` |
| Stripe | `stripe-signature` |
| Tabby / Tamara / Razorpay / Waslah | Provider-specific secrets |

---

## 4. Shopper journey (website + mobile)

Detailed in [MOBILE_APP_API.md](./MOBILE_APP_API.md).

```
Home content → Categories / Search → PDP → Cart
    → Validate cart → Shipping settings → Create order
    → COD done | Stripe/Tabby/Tamara redirect → verify-*
    → Track order / returns / reviews
```

**Deep links**

| URL | API |
|-----|-----|
| `/cart?restore=TOKEN` | `GET /api/abandoned-cart-restore/TOKEN` |
| `/recover-cart/TOKEN` | `GET /api/abandoned-cart-recovery/TOKEN` |

---

## 5. Seller journey (`/store`)

Detailed in [STORE_DASHBOARD_API.md](./STORE_DASHBOARD_API.md).

```
Firebase seller login → /api/store/is-seller
  → Products / categories → Orders list
  → Pack → Waslah/Delhivery ship → Labels
  → Coupons, marketing, WhatsApp, tickets, settings
```

UI rule: seller dashboard is **English LTR** (see project store skill).

---

## 6. Payment flow (UAE)

| Method | Create order response | Confirm |
|--------|----------------------|---------|
| **COD** | Immediate `orderId` | Dashboard / packing |
| **STRIPE** | Checkout `session.url` | Webhook + `POST /api/orders/verify-stripe` |
| **TABBY** | `checkout_url` | Webhook + `verify-tabby` |
| **TAMARA** | `checkout_url` | Webhook + `verify-tamara` |
| **WALLET** | Immediate if balance OK | — |

Limits (`maxCODAmount`, `maxCardAmount`, `maxTabbyAmount`, `maxTamaraAmount`) come from `GET /api/shipping`.

Stuck “Awaiting payment”: seller **Recheck payment** or cron `GET /api/cron/reconcile-payments`.

Full webhook secrets: [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md).

---

## 7. Order lifecycle (simplified)

```
ORDER_PLACED / awaiting payment
        ↓
   Paid / COD accepted
        ↓
  CONFIRMED → PROCESSING → Packed → Shipped
        ↓
     DELIVERED → reviews / returns
```

Field-level detail: [ORDER_DETAILS.md](./ORDER_DETAILS.md).

---

## 8. Messaging & CRM

| System | Doc |
|--------|-----|
| WhatsApp abandoned cart & order confirm | [WHATSAPP_INTEGRATION_API.md](./WHATSAPP_INTEGRATION_API.md) |
| Zoho CRM Contacts + Deals | [STORE1920_API_AND_ZOHO_CRM.md](./STORE1920_API_AND_ZOHO_CRM.md) |

---

## 9. Warehouse

| Doc | Purpose |
|-----|---------|
| [warehouse-order-packing-api.md](./warehouse-order-packing-api.md) | Packing flows |
| [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) | EMX tracking, pickup, labels |
| [warehouse-tracking-api.md](./warehouse-tracking-api.md) | Tracking API short reference |
| [warehouse-inventory-api.md](./warehouse-inventory-api.md) | Stock |
| [warehouse-android-firebase-setup.md](./warehouse-android-firebase-setup.md) | App Firebase setup |

---

## 10. Language & localization

- Storefront: English + Arabic (`Accept-Language`, cookie `storefrontLanguage`, or `?lang=en|ar`).
- Seller `/store`: English only.
- Product fields often include `name` / `nameAr`, `shortDescription` / `shortDescriptionAr`.

---

## 11. Document index

See [README.md](./README.md) for the complete docs table and route counts.

---

## 12. Security checklist

- [ ] Never put Admin / webhook / cron secrets in mobile or Electron apps  
- [ ] Refresh Firebase ID tokens on `401`  
- [ ] Prefer native deep links for cart restore; call restore API then hydrate products  
- [ ] After BNPL/card redirect, always call `verify-*` (do not trust client-only “paid” flags)  
- [ ] Treat webhook bodies as untrusted; server re-fetches provider status where implemented (e.g. Tamara)
