# Store1920 API Documentation

**Base URL:** `https://store1920.com`  
**API root:** `https://store1920.com/api/...`  
**Last updated:** 2026-07-23

This folder is the **full API documentation set** — from public storefront / mobile app through seller dashboard, platform admin, payments, webhooks, crons, warehouse, and integrations.

---

## Start here

| # | Document | Who it’s for | Coverage |
|---|----------|--------------|----------|
| **0** | **[STORE1920_FULL_API.md](./STORE1920_FULL_API.md)** | **Mobile + all teams** | **Master guide: home APIs, full shopper catalog, auth, links to every surface** |
| 1 | [API_OVERVIEW.md](./API_OVERVIEW.md) | Everyone | Architecture, auth modes, systems map |
| 2 | [MOBILE_APP_API.md](./MOBILE_APP_API.md) | Customer mobile / web shopper | Catalog, cart, checkout, COD/Stripe/Tabby/Tamara, wishlist, track (~90 routes) |
| 2b | [MOBILE_HOME_PAGE_APIS.md](./MOBILE_HOME_PAGE_APIS.md) | Mobile home screen | Same APIs as website homepage + mobile banners |
| 2c | [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md) | App home banners only | Four banner sections, dashboard, public GETs, Flutter checklist |
| 3 | [STORE_DASHBOARD_API.md](./STORE_DASHBOARD_API.md) | Seller `/store` dashboard | Products, orders, shipping, Mobile Features, marketing (~160+ routes) |
| 4 | [ADMIN_API.md](./ADMIN_API.md) | Platform admins | Store approval, home merchandising, coupons |
| 5 | [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md) | Backend / DevOps | Stripe, Tabby, Tamara, Razorpay, Waslah, crons |
| 6 | [ORDER_DETAILS.md](./ORDER_DETAILS.md) | All builders | Order document fields & statuses |
| 7 | [AUTH_SECURITY.md](./AUTH_SECURITY.md) | Auth / security | CAPTCHA, lockout, MFA, sessions |
| 8 | [PAYMENT_SECURITY.md](./PAYMENT_SECURITY.md) | Payments | PCI / fraud / refunds |
| 9 | [WHATSAPP_INTEGRATION_API.md](./WHATSAPP_INTEGRATION_API.md) | Messaging | WhatsApp abandoned cart & orders |
| 10 | [STORE1920_API_AND_ZOHO_CRM.md](./STORE1920_API_AND_ZOHO_CRM.md) | CRM | Zoho sync |
| 11 | [warehouse-order-packing-api.md](./warehouse-order-packing-api.md) | Warehouse app | Packing |
| 12 | [warehouse-inventory-api.md](./warehouse-inventory-api.md) | Warehouse app | Inventory |
| 13 | [warehouse-android-firebase-setup.md](./warehouse-android-firebase-setup.md) | Warehouse setup | Firebase |
| 14 | [GOOGLE_MERCHANT_CENTER_COMPLIANCE.md](./GOOGLE_MERCHANT_CENTER_COMPLIANCE.md) | Ads / Merchant Center | Compliance |

---

## Recommended reading order (mobile)

1. **[STORE1920_FULL_API.md](./STORE1920_FULL_API.md)** — home call order + full shopper table  
2. [MOBILE_HOME_PAGE_APIS.md](./MOBILE_HOME_PAGE_APIS.md) — homepage only  
3. [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md) — banners only (JSON + APIs)  
4. [MOBILE_APP_API.md](./MOBILE_APP_API.md) — checkout / cart deep dive  
5. [ORDER_DETAILS.md](./ORDER_DETAILS.md) when building order UI  

---

## Route volume (approx.)

| Surface | Prefix | ~Count |
|---------|--------|--------|
| Shopper (mobile + public site) | `/api/*` (non-store/admin) | ~90 |
| Seller dashboard | `/api/store/*` | ~160 |
| Platform admin | `/api/admin/*` | ~19 |
| Crons | `/api/cron/*` | 6 |
| Webhooks / ops | Stripe, Tabby, Tamara, Waslah, warehouse, courier | ~30 |

**Total:** ~305 `app/api/**/route.js` handlers.

---

## Auth at a glance

| Audience | Auth |
|----------|------|
| Guest shopper | No token; `isGuest` + `guestInfo` / `anonymousId` |
| Logged-in shopper | `Authorization: Bearer <Firebase ID token>` |
| Seller | Same Bearer + `authSeller(uid)` → `storeId` |
| Platform admin | Same Bearer + email allowlist (`ADMIN_EMAIL` / `NEXT_PUBLIC_ADMIN_EMAIL`) |
| Crons | `Authorization: Bearer <CRON_SECRET>` |
| Payment webhooks | Provider signatures / secrets (never from mobile apps) |

---

## Recommended reading order

1. [API_OVERVIEW.md](./API_OVERVIEW.md) — mental model  
2. Pick your audience doc (Mobile / Store / Admin / Warehouse)  
3. [ORDER_DETAILS.md](./ORDER_DETAILS.md) when building checkout or order UIs  
4. [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md) when wiring payments or Ops

---

## Out of scope for client apps

Do **not** ship these secrets in mobile / seller apps:

- `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, `TABBY_WEBHOOK_SECRET`, Tamara webhook secrets  
- `RAZORPAY_WEBHOOK_SECRET`, `WASLAH_WEBHOOK_SECRET`, Firebase **Admin** credentials  

Clients only use Firebase **client** config + public HTTPS APIs.
