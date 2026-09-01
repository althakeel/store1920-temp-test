# Store1920 Full API Documentation

**Product:** Store1920 ecommerce (UAE)  
**Base URL:** `https://store1920.com`  
**API root:** `https://store1920.com/api/...`  
**Currency:** AED  
**Last updated:** 2026-07-23  

This is the **master guide** for:

1. **Mobile app** (shopper) APIs  
2. **Homepage / home screen** APIs (website parity + app banners)  
3. Index of **all major API surfaces** (seller, admin, webhooks, warehouse)

For deep flow detail (checkout payloads, order fields), follow the linked specialized docs at the end.

---

## 1. Quick start

| You are building… | Read this section | Then open |
|-------------------|-------------------|-----------|
| Mobile home screen | [§3 Homepage APIs](#3-homepage--mobile-home-apis) | [MOBILE_HOME_PAGE_APIS.md](./MOBILE_HOME_PAGE_APIS.md) |
| Full shopper app | [§4 Shopper catalog](#4-shopper--mobile-api-catalog) | [MOBILE_APP_API.md](./MOBILE_APP_API.md) |
| Seller `/store` dashboard | [§6 Other surfaces](#6-other-api-surfaces) | [STORE_DASHBOARD_API.md](./STORE_DASHBOARD_API.md) |
| Platform admin | §6 | [ADMIN_API.md](./ADMIN_API.md) |
| Payments / crons | §6 | [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md) |

```
Production:  https://store1920.com/api/...
Auth header: Authorization: Bearer <Firebase ID token>
```

There is **no** separate Store1920 password-login API. Identity is **Firebase**.  
`/api/auth/*` adds CAPTCHA, lockout, MFA, email/phone verify, and sessions on top.

---

## 2. Authentication

| Mode | When | How |
|------|------|-----|
| **Public** | Home, catalog, shipping GET, blogs, track order, mobile banners | No `Authorization` |
| **Firebase Bearer** | Cart, wishlist, address, profile, logged-in orders, wallet, spin | `Authorization: Bearer <idToken>` |
| **Guest checkout** | Place order without account | `POST /api/orders` with `isGuest: true` + `guestInfo` |
| **Guest tracking** | Abandoned cart / analytics | Device `anonymousId` (+ optional `sessionId`) |
| **Token links** | Cart restore / recovery | Path token (no Bearer) |
| **Seller Bearer** | Saving products, mobile banners, orders | Same Firebase token + `authSeller` → `storeId` |
| **Cron** | Scheduled jobs | `Authorization: Bearer <CRON_SECRET>` |
| **Payment webhooks** | Stripe / Tabby / Tamara / etc. | Provider signatures — **never call from the app** |

**Locale (optional):** `Accept-Language: ar` or `en`, or `?lang=ar|en`.

### Public `/api/store/*` GETs (mobile may call)

These are allowlisted for **GET only** (mutations still need seller Bearer):

- `/api/store/featured-products`
- `/api/store/home-menu-categories`
- `/api/store/explore-interests/public`
- `/api/store/appearance/sections/public`
- `/api/store/mobile-banner-slider`
- `/api/store/mobile-small-banners`
- `/api/store/mobile-promo-cards`
- `/api/store/mobile-tile-banners`
- `/api/store/settings`, `/api/store/navbar-menu` (website chrome — skip on native home)
- `/api/store/signin-modal`

---

## 3. Homepage / mobile home APIs

### 3.1 Recommended mobile home call order

```
1. GET /api/public/tracking-context
      → storeId

2. App banners (pick one):
   A) Four section GETs:
      GET /api/store/mobile-banner-slider
      GET /api/store/mobile-small-banners
      GET /api/store/mobile-promo-cards
      GET /api/store/mobile-tile-banners
   B) Combined bag:
      GET /api/public/mobile-features?storeId={storeId}

3. Same content as website home (parallel):
   GET /api/store/featured-products?includeProducts=true&limit=12
   GET /api/home/sections
   GET /api/public/featured-sections
   GET /api/store/home-menu-categories
   GET /api/store/explore-interests/public
   GET /api/categories
   (optional) GET /api/store/appearance/sections/public
   (optional website hero) GET /api/public/shop-showcase

4. If sections return IDs only:
   POST /api/products/batch   { "productIds": ["..."] }
   and/or GET /api/products?limit=12&slim=true

5. After login (optional):
   GET /api/browse-history
```

**Hide rule for banners:** if `enabled === false` **or** `slides` / `tiles` is empty → do not render that section.

### 3.2 Website homepage → mobile map

| # | Website section | Website / shared API | Mobile app |
|---|-----------------|----------------------|------------|
| 1 | Hero / showcase | `GET /api/public/shop-showcase` | Prefer **app banners** (or showcase if mirroring website) |
| 2 | Large / small / promo / tile banners | Configured in `/store/mobile-features` | Four GETs or `GET /api/public/mobile-features` |
| 3 | Home category icons | `GET /api/store/home-menu-categories` | Same |
| 4 | Featured products | `GET /api/store/featured-products?includeProducts=true` | Same |
| 5 | Top deals / home sections | `GET /api/home/sections` + products/batch | Same |
| 6 | Featured / category sliders | `GET /api/public/featured-sections` | Same |
| 7 | Explore interests | `GET /api/store/explore-interests/public` + categories/products | Same |
| 8 | Recently viewed | `GET /api/browse-history` (Bearer) | Same when logged in |
| 9 | Navbar / footer / settings | `navbar-menu`, `settings` | **Skip** (native chrome) |

Code constants for layout sections: `lib/mobileHomeApis.js`.

### 3.3 App banner APIs (detail)

| Section | Dashboard | Public GET | Notes |
|---------|-----------|------------|-------|
| Large hero | `/store/mobile-features/banners` | `GET /api/store/mobile-banner-slider` | Max 8 slides; `heightPx` default ~168 |
| Small strips | `/store/mobile-features/small-banners` | `GET /api/store/mobile-small-banners` | Max 12 |
| Promo cards | `/store/mobile-features/promo-cards` | `GET /api/store/mobile-promo-cards` | Max 8; optional `showAdBadge` |
| Category tiles | `/store/mobile-features/tile-banners` | `GET /api/store/mobile-tile-banners` | Max 12; 2 per row |
| Combined | — | `GET /api/public/mobile-features?storeId=` | All four + `homeLayout` |

**Example slide:**

```json
{
  "image": "https://...",
  "link": "/offers",
  "path": "/offers",
  "title": "Festival Sale"
}
```

Navigation: use `path ?? link`. Paths starting with `/` → in-app route; `http` → browser / WebView.

Full banner field reference: [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md).

---

## 4. Shopper / mobile API catalog

### 4.1 Bootstrap & home content

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/public/tracking-context` | Default `storeId` | Public |
| `GET` | `/api/store-info` | Store metadata | Public |
| `GET` | `/api/top-bar-settings` | Promo top bar | Public |
| `GET` | `/api/home/sections` | Home sections / top deals | Public |
| `GET` | `/api/home-selection` | Home selection payload | Public |
| `GET` | `/api/public/shop-showcase` | Website showcase / hero | Public |
| `GET` | `/api/public/featured-sections` | Featured sliders | Public |
| `GET` | `/api/public/category-sliders` | Category sliders | Public |
| `GET` | `/api/public/offers` | Offers listing | Public |
| `GET` | `/api/public/mobile-features` | Combined mobile banners | Public |
| `GET` | `/api/social-proof-products` | Social-proof strip | Public |
| `GET` | `/api/store/featured-products` | Featured products | Public GET |
| `GET` | `/api/store/home-menu-categories` | Home category icons | Public GET |
| `GET` | `/api/store/explore-interests/public` | Explore / recommended IDs | Public GET |
| `GET` | `/api/store/appearance/sections/public` | Layout flags | Public GET |
| `GET` | `/api/store/mobile-banner-slider` | Large banners | Public GET |
| `GET` | `/api/store/mobile-small-banners` | Small banners | Public GET |
| `GET` | `/api/store/mobile-promo-cards` | Promo cards | Public GET |
| `GET` | `/api/store/mobile-tile-banners` | Tile banners | Public GET |

### 4.2 Blogs

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/public/blogs` | List published blogs (`storeId`, `lang`, `page`, `limit`, `q`, `sort`) | Public |
| `GET` | `/api/public/blogs/[slug]` | Single blog by slug | Public |

Seller manage: `/api/store/blogs` (Bearer seller) — see store dashboard docs.

### 4.3 Auth security (`/api/auth/*`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/auth/security-config` | Password policy, lockout, CAPTCHA flags |
| `GET` | `/api/auth/captcha` | CAPTCHA challenge |
| `POST` | `/api/auth/pre-login` | Gate before Firebase sign-in |
| `POST` | `/api/auth/login-result` | Record success/failure for lockout |
| `POST`/`PUT` | `/api/auth/password-reset` | Request / confirm reset OTP |
| `POST`/`PUT` | `/api/auth/email-verify` | Email OTP |
| `POST`/`PUT` | `/api/auth/phone-verify` | Phone OTP |
| `GET`/`POST`/`PUT` | `/api/auth/mfa` | MFA status / send / verify |
| `GET`/`POST`/`DELETE` | `/api/auth/sessions` | List / register / revoke sessions |

Details: [AUTH_SECURITY.md](./AUTH_SECURITY.md).

### 4.4 Catalog

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/products` | List / filter (`slim`, `category`, `limit`, …) | Public |
| `POST` | `/api/products/batch` | Hydrate by `productIds` | Public |
| `GET` | `/api/products/by-slug` | Product by slug | Public |
| `GET` | `/api/products/page` | Full PDP payload | Public |
| `GET` | `/api/products/[id]/fbt` | Frequently bought together | Public |
| `GET` | `/api/products/deals` | Deals | Public |
| `GET` | `/api/products/top-rated` | Top rated | Public |
| `GET` | `/api/categories` | Category tree | Public |
| `GET` | `/api/search-products` | Keyword search | Public |
| `POST` | `/api/search-by-image` | Visual search | Public |

### 4.5 Cart & recovery

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET`/`POST`/`DELETE` | `/api/cart` | Server cart | Bearer |
| `POST` | `/api/cart/validate` | Pre-checkout validate | Bearer / guest body |
| `POST` | `/api/guest/abandoned-cart` | Guest abandoned cart | Public |
| `POST` | `/api/abandoned-checkout` | Abandoned checkout signal | Public / guest |
| `GET` | `/api/abandoned-cart-restore/[token]` | Restore cart deep link | Token |
| `GET` | `/api/abandoned-cart-recovery/[token]` | Recovery offer | Token |
| `POST` | `/api/abandoned-cart-recovery/confirm` | Confirm recovery | Token |
| `GET`/`POST` | `/api/guest/convert-account` | Guest → account | Token |

### 4.6 Checkout, orders, payments

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST`/`GET` | `/api/orders` | Create / list orders | Guest body or Bearer |
| `POST` | `/api/orders/cancel` | Cancel | Bearer / owner |
| `POST` | `/api/orders/verify-stripe` | After Stripe return | Public + session |
| `POST` | `/api/orders/verify-tabby` | After Tabby return | Public + payment id |
| `POST` | `/api/orders/verify-tamara` | After Tamara return | Public + order id |
| `POST` | `/api/orders/confirm-paid` | Confirm paid | Public / Bearer |
| `POST` | `/api/payment-cancelled` | User cancelled payment | Public |
| `POST` | `/api/orders/prepaid-upsell` | COD prepaid upsell | Bearer / owner |
| `POST` | `/api/orders/return-request` | Return request | Bearer |
| `POST` | `/api/stripe` | Stripe session helper | As implemented |

**Do not call** Stripe/Tabby/Tamara **webhooks** from the mobile app.

Payment security notes: [PAYMENT_SECURITY.md](./PAYMENT_SECURITY.md).  
Order fields: [ORDER_DETAILS.md](./ORDER_DETAILS.md).

### 4.7 Shipping

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/shipping` | Fees, COD, max amounts (`?storeId=`) | Public |

### 4.8 Address, wishlist, profile

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET`/`POST`/`PUT`/`DELETE` | `/api/address` | Address book | Bearer |
| `PUT`/`DELETE` | `/api/address/[id]` | By id | Bearer |
| `GET`/`POST` | `/api/wishlist` | Wishlist | Bearer |
| `GET` | `/api/wishlist/count` | Count | Bearer |
| `GET`/`PATCH` | `/api/profile` | Profile | Bearer |
| `POST` | `/api/account/delete` | Delete account | Bearer |
| `POST` | `/api/user/link-guest-orders` | Link guest orders | Bearer |

### 4.9 Coupons, wallet, spin, offers, referral

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/api/coupon` | Validate code | Bearer |
| `GET`/`POST` | `/api/coupons` | Coupons | Bearer |
| `GET` | `/api/wallet` | Balance + history | Bearer |
| `POST` | `/api/wallet/bonus` | Welcome coins | Bearer |
| `GET` | `/api/spin/campaign` | Spin config | Public |
| `POST` | `/api/spin/play` | Play spin | Bearer |
| `GET` | `/api/personalized-offers/resolve/[slug]` | Resolve offer | Public |
| `GET`/`POST` | `/api/personalized-offers/validate/[token]` | Offer token | Token |
| `GET` | `/api/referral/my-code` | Referral code | Bearer |
| `POST` | `/api/referral/claim` | Claim referral | Bearer |
| `POST` | `/api/giveaways/eligible` | Giveaway check | Bearer |

### 4.10 Track, returns, reviews, support

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/track-order` | Track by phone / email / orderId / AWB | Public |
| `GET`/`POST` | `/api/return-request` | Return request | Mixed |
| `GET`/`POST` | `/api/review` | Reviews | Public / Bearer |
| `GET` | `/api/review/can-review` | Eligibility | Bearer |
| `POST` | `/api/review/helpful` | Helpful vote | Public / Bearer |
| `GET`/`POST` | `/api/tickets` | Support tickets | Bearer |
| `GET`/`POST`/`PATCH` | `/api/tickets/[ticketId]` | Ticket detail | Bearer |
| `POST` | `/api/chatbot` | Storefront chatbot | Public |

### 4.11 History & analytics (shopper)

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET`/`POST`/`DELETE` | `/api/browse-history` | Recently viewed | Bearer |
| `GET`/`POST`/`DELETE` | `/api/customer/recent-searches` | Recent searches | Bearer |
| `GET`/`POST` | `/api/email-preferences` | Email prefs | Bearer |
| `POST` | `/api/analytics/customer-behavior` | Behavior events | Public / Bearer |
| `POST` | `/api/analytics/track-attribution` | Ads attribution | Public |

---

## 5. Typical shopper journeys

### 5.1 Browse → PDP → cart

```
GET /api/categories
GET /api/products?slim=true&limit=20
GET /api/products/page?slug=...
GET /api/products/{id}/fbt
POST /api/cart   (Bearer)
POST /api/cart/validate
```

### 5.2 Checkout (COD)

```
GET /api/shipping?storeId=...
GET /api/address          (Bearer) or guest address fields
POST /api/orders         (isGuest or Bearer)
→ order success / track
```

### 5.3 Checkout (Stripe / Tabby / Tamara)

```
POST /api/orders  → redirect URL
(user pays on provider)
POST /api/orders/verify-stripe|verify-tabby|verify-tamara
→ /order-success
```

### 5.4 Home screen only

See [§3.1](#31-recommended-mobile-home-call-order).

---

## 6. Other API surfaces

| Surface | Prefix | Doc |
|---------|--------|-----|
| Seller dashboard | `/api/store/*` | [STORE_DASHBOARD_API.md](./STORE_DASHBOARD_API.md) |
| Platform admin | `/api/admin/*` | [ADMIN_API.md](./ADMIN_API.md) |
| Webhooks & crons | `/api/stripe`, `/api/tabby/webhook`, `/api/cron/*`, … | [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md) |
| Warehouse packing | warehouse routes | [warehouse-order-packing-api.md](./warehouse-order-packing-api.md) |
| Warehouse return scan | `/api/warehouse/returns/scan` | [warehouse-return-scan-api.md](./warehouse-return-scan-api.md) — **lookup + collect**, product ids, RETURNED, stock |
| Warehouse return collect | `/api/warehouse/returns/collect` | [warehouse-return-collect-api.md](./warehouse-return-collect-api.md) — legacy collect only |
| Warehouse EMX tracking / pickup / labels | `/api/warehouse/tracking`, Waslah pickup/label | [warehouse-app-emx-tracking-pickup.md](./warehouse-app-emx-tracking-pickup.md) |
| Warehouse tracking (short) | `/api/warehouse/tracking` | [warehouse-tracking-api.md](./warehouse-tracking-api.md) |
| Warehouse inventory | warehouse routes | [warehouse-inventory-api.md](./warehouse-inventory-api.md) |
| WhatsApp | messaging APIs | [WHATSAPP_INTEGRATION_API.md](./WHATSAPP_INTEGRATION_API.md) |
| Zoho CRM | sync APIs | [STORE1920_API_AND_ZOHO_CRM.md](./STORE1920_API_AND_ZOHO_CRM.md) |
| Architecture map | — | [API_OVERVIEW.md](./API_OVERVIEW.md) |

**Approx. route volume:** ~300+ handlers under `app/api/**/route.js`.

---

## 7. Errors & conventions

Typical error:

```json
{ "error": "Unauthorized" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad input |
| `401` | Missing/invalid Firebase token |
| `403` | Forbidden (not seller / not owner) |
| `404` | Not found |
| `429` | Rate limited |
| `500` | Server error |

**Product ids** are MongoDB ObjectIds (24-char hex).  
**Money** is AED numbers (not fils) unless a provider doc says otherwise.

---

## 8. What never belongs in the mobile app

- `CRON_SECRET`
- Stripe / Tabby / Tamara / Razorpay **webhook** secrets
- Firebase **Admin** credentials  
- Seller-only mutation endpoints (product create/update, order packing, Waslah ship)

Clients only need Firebase **client** config + public HTTPS APIs.

---

## 9. Doc index (full set)

| Doc | Audience |
|-----|----------|
| **[STORE1920_FULL_API.md](./STORE1920_FULL_API.md)** (this file) | Everyone — master index |
| [README.md](./README.md) | Docs map |
| [API_OVERVIEW.md](./API_OVERVIEW.md) | Architecture |
| [MOBILE_APP_API.md](./MOBILE_APP_API.md) | Full shopper flows |
| [MOBILE_HOME_PAGE_APIS.md](./MOBILE_HOME_PAGE_APIS.md) | Home screen only |
| [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md) | App banners only |
| [AUTH_SECURITY.md](./AUTH_SECURITY.md) | Auth hardening |
| [PAYMENT_SECURITY.md](./PAYMENT_SECURITY.md) | Payments / PCI |
| [ORDER_DETAILS.md](./ORDER_DETAILS.md) | Order schema |
| [STORE_DASHBOARD_API.md](./STORE_DASHBOARD_API.md) | Seller |
| [ADMIN_API.md](./ADMIN_API.md) | Platform admin |
| [WEBHOOKS_AND_CRONS.md](./WEBHOOKS_AND_CRONS.md) | Ops |

---

*Generated for Store1920 mobile + web integrations. Prefer production base URL above; staging may differ by deployment.*
