# Store1920 Mobile App API Guide

**Audience:** iOS / Android / Flutter / React Native shopper apps  
**Product:** Store1920 ecommerce (UAE)  
**Base URL (production):** `https://store1920.com`  
**API root:** `https://store1920.com/api/...`  
**Currency:** AED  
**Auth:** Firebase Authentication (ID token)  
**Last updated:** 2026-07-23

This document covers **customer (shopper) APIs** used by the public website and intended for the mobile app. Seller dashboard (`/api/store/*`), platform admin (`/api/admin/*`), crons, and payment webhooks are out of scope for the shopper app (see [Appendix B](#appendix-b--non-shopper-api-surface)).

**Master guide (home + full catalog in one file):** [`docs/STORE1920_FULL_API.md`](./STORE1920_FULL_API.md)

**Full docs set (all audiences):** start at [`docs/README.md`](./README.md) and [`docs/API_OVERVIEW.md`](./API_OVERVIEW.md).

**Homepage → mobile home screen APIs only:** [`docs/MOBILE_HOME_PAGE_APIS.md`](./MOBILE_HOME_PAGE_APIS.md).

Related docs:
- [`docs/ORDER_DETAILS.md`](./ORDER_DETAILS.md) — order document fields
- [`docs/STORE_DASHBOARD_API.md`](./STORE_DASHBOARD_API.md) — seller `/store` APIs
- [`docs/ADMIN_API.md`](./ADMIN_API.md) — platform admin
- [`docs/WEBHOOKS_AND_CRONS.md`](./WEBHOOKS_AND_CRONS.md) — payments + crons
- [`docs/STORE1920_API_AND_ZOHO_CRM.md`](./STORE1920_API_AND_ZOHO_CRM.md) — Zoho CRM sync
- [`docs/WHATSAPP_INTEGRATION_API.md`](./WHATSAPP_INTEGRATION_API.md) — WhatsApp messaging

---

## 1. Conventions

### 1.1 Request headers

| Header | Required | Notes |
|--------|----------|-------|
| `Content-Type: application/json` | JSON bodies | Most endpoints |
| `Authorization: Bearer <Firebase ID token>` | Logged-in calls | From `user.getIdToken()` |
| `Accept-Language: ar` or `en` | Optional | Prefer Arabic when `ar` / `ar-*` |
| Cookie `storefrontLanguage=en\|ar` | Optional | Website uses cookie; mobile can use header / `?lang=` |

### 1.2 Auth modes

| Mode | How the app sends it |
|------|----------------------|
| **Public** | No auth header |
| **Firebase Bearer** | `Authorization: Bearer <idToken>` — server verifies with Firebase Admin; `uid` becomes `userId` |
| **Guest checkout** | `isGuest: true` + `guestInfo` on `POST /api/orders` (no Bearer) |
| **Guest tracking** | Persist a device `anonymousId` (+ optional `sessionId`) for abandoned cart / analytics |
| **Token links** | Path tokens for cart restore, recovery offers, guest→account convert |

### 1.3 Firebase (mobile)

Use the same Firebase project as the website (`NEXT_PUBLIC_FIREBASE_*` values).

1. Sign in (email/password, Google, phone OTP, etc.) via Firebase Client SDK.
2. For every authenticated API call:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Refresh the ID token when you get `401` (call `getIdToken(true)`).

There is **no** separate Store1920 login API. Auth is entirely Firebase; APIs only verify the token.

### 1.4 Cart entry shape

Server cart (`GET/POST /api/cart`) is an object keyed by product id (or cart line key):

```json
{
  "6a3a7defa917bf49b371cddf": {
    "quantity": 1,
    "price": 16,
    "variantOptions": { "Color": "Black" }
  }
}
```

Legacy form `productId → number` (qty only) is also accepted in places via helpers.

### 1.5 Order line items (`POST /api/orders`)

```json
{
  "id": "6a3a7defa917bf49b371cddf",
  "quantity": 1,
  "variantOptions": { "Color": "Black" },
  "offerToken": null,
  "freeGift": null
}
```

- `id` must be a Mongo product `_id` (24-char hex).
- Use `offerToken` only for personalized offer checkouts (COD usually blocked for those).

### 1.6 Errors

Typical JSON error:

```json
{ "error": "Unauthorized" }
```

Status codes: `400` validation, `401` auth, `403` forbidden, `404` not found, `422` unprocessable, `500` server.

---

## 2. Suggested mobile flows

### 2.1 Cold start / home

1. `GET /api/public/tracking-context` → default `storeId`
2. Parallel: `GET /api/home/sections`, `GET /api/public/featured-sections`, `GET /api/public/category-sliders`, `GET /api/public/shop-showcase`, `GET /api/public/mobile-features` (app), `GET /api/top-bar-settings`, `GET /api/categories`
3. Persist `storeId` + generate `anonymousId` (UUID) once per install

### 2.2 Browse → PDP

1. `GET /api/products?...` or `GET /api/search-products?keyword=`
2. `GET /api/products/page?slug=` **or** `GET /api/products/by-slug?slug=`
3. Optional: `GET /api/products/{id}/fbt`, `POST /api/products/batch` for cart/wishlist hydration
4. Logged-in: `POST /api/browse-history` with `{ "productId" }`

### 2.3 Guest cart → checkout

1. Keep cart **local** on device
2. Debounce `POST /api/guest/abandoned-cart` with `anonymousId` (+ phone/email when known)
3. `POST /api/cart/validate` before pay
4. `GET /api/shipping?storeId=` for fees / payment max amounts
5. `POST /api/orders` with `isGuest: true` + `guestInfo`

### 2.4 Logged-in cart → checkout

1. Firebase sign-in → `POST /api/user/link-guest-orders`
2. `POST /api/cart` to sync full cart object
3. `GET/POST /api/address` for shipping
4. Optional: `POST /api/coupon` / wallet redeem / `recoveryToken`
5. `POST /api/orders` with Bearer + `addressId` or `addressData`

### 2.5 Pay & confirm

| Method | After `POST /api/orders` | App next step |
|--------|--------------------------|---------------|
| `COD` / `WALLET` | Immediate success `{ orderId, total, ... }` | Order success screen |
| `STRIPE` | `{ session, orderId }` | Open `session.url` (SFSafari / Custom Tabs / WebView) → return → `POST /api/orders/verify-stripe` |
| `TABBY` | `{ checkout_url, orderId, ... }` | Open URL → `POST /api/orders/verify-tabby` |
| `TAMARA` | `{ checkout_url, tamara_order_id, orderId }` | Open URL → `POST /api/orders/verify-tamara` |
| User cancels pay | — | `POST /api/payment-cancelled` with `{ orderId }` |

### 2.6 WhatsApp / SMS cart deep link

URL form: `https://store1920.com/cart?restore=<token>`

Mobile app should:

1. Intercept / open `GET /api/abandoned-cart-restore/{token}`
2. Merge `items[].productId` + `items[].entry` into local/server cart
3. Hydrate with `POST /api/products/batch`
4. Do **not** drop lines before products load

Discount recovery links use `/recover-cart/{recoveryToken}` → `GET /api/abandoned-cart-recovery/{token}`; pass `recoveryToken` on `POST /api/orders`.

---

## 3. Auth & account

### `GET /api/profile` — Bearer

Returns shopper profile (`name`, `email`, `phone`, `image`, referral fields).

### `PATCH /api/profile` — Bearer

Body (any subset): `{ "name", "phone", "image", "email" }`

### `POST /api/account/delete` — Bearer

Permanently deletes account data + Firebase user. Irreversible.

### `POST /api/user/link-guest-orders` — Bearer

After login, attach past guest orders that match email/phone.

```json
{ "email": "user@example.com", "phone": "501234567" }
```

Optional; contact is also taken from the Firebase token / profile.

### Guest → account convert

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/guest/convert-account?token=` | Public token |
| `POST` | `/api/guest/convert-account` | Body `{ "token" }` |

### Email preferences

| Method | Path |
|--------|------|
| `GET` | `/api/email-preferences?email=` |
| `POST` | `/api/email-preferences` body `{ "email", "type": "promotional\|orders\|updates", "value": true\|false }` |

---

## 4. Catalog

### Products

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/api/products` | Public | List / shop filters |
| `GET` | `/api/products/by-slug?slug=` | Public | Single product (`lang` optional) |
| `GET` | `/api/products/page?slug=` | Public | Full PDP payload |
| `POST` | `/api/products/batch` | Public | Body `{ "productIds": ["..."] }` |
| `GET` | `/api/products/{id}/fbt` | Public | Frequently bought together |
| `GET` | `/api/products/deals` | Public | Deals |
| `GET` | `/api/products/top-rated` | Public | Top rated |
| `GET` | `/api/public/offers` | Public | Offers page + pagination |

**`GET /api/products` query (common):**

| Param | Example | Meaning |
|-------|---------|---------|
| `page`, `limit`, `offset` | `1`, `24` | Pagination |
| `paginated` | `true` | Paginated response shape |
| `category` / `categories` | slug or id | Filter |
| `fastDelivery` | `true` | Fast delivery only |
| `inStockOnly` / `includeOutOfStock` | bool | Stock |
| `bestSeller` | `true` | Bestsellers |
| `minPrice`, `maxPrice`, `priceFilter` | numbers | Price |
| `sortBy` / `sort` | e.g. price | Sort |
| `slim` | `true` | Smaller payload |

**Batch response:** `{ "products": [ ... ] }` — ordered, published only, localized when language resolved.

### Mobile app design (seller-managed)

Configure under **Store dashboard → Mobile Features** (four banner sections).  
Details: [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md).

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/api/store/mobile-banner-slider` | Public | Large hero slides |
| `GET` | `/api/store/mobile-small-banners` | Public | Small promo strips |
| `GET` | `/api/store/mobile-promo-cards` | Public | Promo cards (+ optional Ad badge) |
| `GET` | `/api/store/mobile-tile-banners` | Public | Category tiles |
| `GET` | `/api/public/mobile-features` | Public | All four sections; optional `?storeId=` |
| `POST`/`PUT` | `/api/store/mobile-*` section routes | Seller Bearer | Save one section |
| `GET` / `PUT` | `/api/store/mobile-features` | Seller Bearer | Dashboard load / merge save |

**Section GET shape (hero example):**

```json
{
  "enabled": true,
  "slideIntervalSeconds": 4,
  "heightPx": 168,
  "slides": [
    { "image": "https://...", "link": "/shop", "path": "/shop", "title": "" }
  ]
}
```

Website showcase banners (`/api/public/shop-showcase`) are separate and not used for the native app home.

### Categories & search

| Method | Path | Notes |
|--------|------|-------|
| `GET /api/categories` | Tree with `children` |
| `GET /api/search-products?keyword=&page=&limit=` | Text search; also `category`, `excludeId` |
| `GET /api/search-by-image` | Visual search (if enabled) |

### Home / storefront content

| Method | Path |
|--------|------|
| `GET` | `/api/public/tracking-context` → `{ storeId }` |
| `GET` | `/api/home/sections` |
| `GET` | `/api/home-selection` |
| `GET` | `/api/public/featured-sections` |
| `GET` | `/api/public/category-sliders` |
| `GET` | `/api/public/shop-showcase` |
| `GET` | `/api/public/mobile-features` |
| `GET` | `/api/social-proof-products` |
| `GET` | `/api/top-bar-settings` |
| `GET` | `/api/store-info` |

### Recent searches — Bearer

| Method | Path |
|--------|------|
| `GET` | `/api/customer/recent-searches` |
| `POST` | `/api/customer/recent-searches` |
| `DELETE` | `/api/customer/recent-searches` |

---

## 5. Cart

| Method | Path | Auth | Body / notes |
|--------|------|------|--------------|
| `GET` | `/api/cart` | Bearer (optional) | Without auth → `{ "cart": {} }` |
| `POST` | `/api/cart` | Bearer | `{ "cart": { ... }, "customerInfo"? }` — upserts user cart + abandoned tracking |
| `DELETE` | `/api/cart` | Bearer | Remove line (`productId`) |
| `POST` | `/api/cart/validate` | Public | `{ "cartItems": { ... } }` → `{ valid, validItems, invalidItems, message }` |
| `POST` | `/api/giveaways/eligible` | Public | Free-gift eligibility for current cart |
| `POST` | `/api/guest/abandoned-cart` | Guest ids | Must send `items[]` + (`guestEmail` **or** `guestPhone` **or** `anonymousId`) |

### Guest abandoned cart body

```json
{
  "anonymousId": "device-uuid",
  "sessionId": "session-uuid",
  "guestEmail": null,
  "guestPhone": "501234567",
  "guestPhoneCode": "+971",
  "guestName": "Ali",
  "items": [
    {
      "productId": "6a3a7defa917bf49b371cddf",
      "quantity": 1,
      "price": 16,
      "name": "Product name",
      "variantOptions": null
    }
  ]
}
```

### Cart restore (WhatsApp / email deep link)

```http
GET /api/abandoned-cart-restore/{token}
```

**200:**

```json
{
  "success": true,
  "cartId": "...",
  "storeId": "...",
  "currency": "AED",
  "cartTotal": 16,
  "items": [
    {
      "productId": "6a3a7defa917bf49b371cddf",
      "entry": { "quantity": 1, "price": 16 }
    }
  ]
}
```

**404:** invalid / converted / empty cart.

---

## 6. Checkout, orders & payments

### `POST /api/orders`

**Auth:** Bearer **or** `isGuest: true`.

#### Logged-in body (minimal)

```json
{
  "paymentMethod": "COD",
  "addressId": "64f...",
  "items": [{ "id": "6a3a7defa917bf49b371cddf", "quantity": 1 }],
  "couponCode": null,
  "coinsToRedeem": 0,
  "trackingContext": {},
  "attribution": {},
  "recoveryToken": null
}
```

Or inline address:

```json
{
  "paymentMethod": "STRIPE",
  "addressData": {
    "name": "Ali",
    "email": "ali@example.com",
    "street": "Street 1",
    "city": "Dubai",
    "state": "Dubai",
    "country": "United Arab Emirates",
    "zip": "00000",
    "phone": "501234567",
    "phoneCode": "+971"
  },
  "items": [{ "id": "6a3a7defa917bf49b371cddf", "quantity": 1 }]
}
```

#### Guest body

```json
{
  "isGuest": true,
  "paymentMethod": "COD",
  "guestInfo": {
    "name": "Ali",
    "email": "ali@example.com",
    "phone": "501234567",
    "address": "Street 1",
    "city": "Dubai",
    "state": "Dubai",
    "country": "United Arab Emirates",
    "pincode": "00000"
  },
  "items": [{ "id": "6a3a7defa917bf49b371cddf", "quantity": 1 }]
}
```

`guestInfo.street` is accepted as alias for `address`.

#### `paymentMethod` values (UAE)

| Value | Behaviour |
|-------|-----------|
| `COD` | Order created immediately (subject to `maxCODAmount`) |
| `STRIPE` | Returns Stripe Checkout `session` — open `session.url` |
| `TABBY` | Returns BNPL checkout URL |
| `TAMARA` | Returns BNPL checkout URL |
| `WALLET` | Pay with wallet coins (1 coin ≈ 1 AED) |

Payment method max amounts come from `GET /api/shipping` (`maxCODAmount`, `maxCardAmount`, `maxTabbyAmount`, `maxTamaraAmount`). `0` usually means “no limit configured”.

#### Success responses (examples)

**COD / wallet:**

```json
{
  "message": "Order Placed Successfully",
  "orderId": "...",
  "id": "...",
  "total": 16,
  "orderIds": ["..."],
  "prepaidUpsellToken": "..."
}
```

**Stripe:** `{ "session": { "id", "url", ... }, "orderId": "..." }`  
**Tamara / Tabby:** `{ "checkout_url": "https://...", "orderId": "...", ... }`

### List / get orders

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/orders` | Bearer — history (`limit`, `offset`) |
| `GET` | `/api/orders?orderId=` | Public guest + ownership when signed in |

### Payment verification (call after provider return)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/orders/verify-stripe` | `{ "orderId", "sessionId"? }` — Bearer or matching session |
| `POST` | `/api/orders/verify-tabby` | `{ "orderId" }` |
| `POST` | `/api/orders/verify-tamara` | `{ "orderId" }` |
| `POST` | `/api/payment-cancelled` | `{ "orderId", "reason"? }` |
| `POST` | `/api/orders/prepaid-upsell` | COD → prepaid Stripe upsell; Bearer **or** `prepaidUpsellToken` |

### Cancel

```http
POST /api/orders/cancel
Authorization: Bearer ...
```

```json
{ "orderId": "...", "reason": "Changed mind" }
```

Allowed only in early statuses (e.g. `ORDER_PLACED`, `CONFIRMED`, `PROCESSING`, pickup-related early states).

### Abandoned recovery checkout

| Method | Path |
|--------|------|
| `GET` | `/api/abandoned-cart-recovery/{token}` — offer totals + discounted items |
| `POST` | `/api/abandoned-cart-recovery/confirm` — `{ "sessionId" }` after Stripe |
| `POST` | `/api/abandoned-checkout` — track checkout drop-off |

Pass `recoveryToken` into `POST /api/orders` so offer prices apply.

### Razorpay (legacy / secondary)

`POST /api/razorpay/order`, `POST /api/razorpay/verify` exist. Primary UAE methods are COD / Stripe / Tabby / Tamara. Prefer those unless product explicitly needs Razorpay.

---

## 7. Address — all Bearer

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/address` | — |
| `POST` | `/api/address` | `{ "name","email","street","city","state","district?","zip","country","phone","phoneCode" }` (default phoneCode `+971`) |
| `PUT` | `/api/address` | `{ "id", "address": { ... } }` |
| `PUT` | `/api/address/{id}` | address fields |
| `DELETE` | `/api/address/{id}` | — |

---

## 8. Wishlist — Bearer

| Method | Path | Body / query |
|--------|------|--------------|
| `GET` | `/api/wishlist` | optional `?view=count` |
| `GET` | `/api/wishlist/count` | badge |
| `POST` | `/api/wishlist` | `{ "productId", "action": "add" \| "remove" }` |

---

## 9. Coupons, wallet, referral, offers, spin

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/coupon` | Bearer | `{ "code", "cartTotal?", "productIds?", "storeId?" }` |
| `GET` | `/api/coupons?storeId=` | Public (+ Bearer for private) | Displayable coupons |
| `POST` | `/api/coupons` | Mixed | Validate/apply `{ code, storeId, orderTotal, userId?, cartProductIds? }` |
| `GET` | `/api/personalized-offers/validate/{token}` | Public | Load offer |
| `POST` | `/api/personalized-offers/validate/{token}` | Public | Consume / checkout check |
| `GET` | `/api/personalized-offers/resolve/{slug}` | Public | Resolve by slug |
| `GET` | `/api/referral/my-code` | Bearer | Get/create code |
| `POST` | `/api/referral/claim` | Bearer | `{ "referralCode" }` before first order |
| `GET` | `/api/wallet` | Bearer | `{ coins, rupeesValue, transactions }` |
| `POST` | `/api/wallet/bonus` | Bearer | One-time welcome coins |
| `GET` | `/api/spin/campaign?storeId=` | Public | Spin config |
| `POST` | `/api/spin/play` | Bearer | `{ "storeId" }` daily play |

Redeem wallet on order create with `coinsToRedeem`.

---

## 10. Shipping

```http
GET /api/shipping?storeId={storeId}
```

Public. Important fields on `setting`:

- `flatRate`, `freeShippingMin`, `estimatedDays`
- `enableCOD`, `codFee`
- `maxCODAmount`, `maxCardAmount`, `maxTabbyAmount`, `maxTamaraAmount`
- `shippingOptions` (resolved options list)

`PUT /api/shipping` is **seller-only** — do not use from the shopper app.

---

## 11. Track order, returns, reviews, support

### Track (public)

```http
GET /api/track-order?phone=501234567
GET /api/track-order?email=ali@example.com
GET /api/track-order?orderId=...
GET /api/track-order?awb=...
```

Optional `carrier=c3xpress|waslah|emx`. Response includes order + live courier events when available.

### Returns

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/return-request` | Bearer (multipart/JSON) |
| `GET` | `/api/return-request` | Bearer |
| `POST` | `/api/orders/return-request` | Bearer — attach to order: `{ orderId, itemIndex, reason, type, description, images }` |
| `GET` | `/api/orders/return-request` | Bearer |

### Reviews

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/review` | Public (by product) |
| `POST` | `/api/review` | Bearer — multipart; delivered orders only |
| `GET` | `/api/review/can-review` | Bearer |
| `POST` | `/api/review/helpful` | Mixed |
| `POST` | `/api/orders/delivery-review` | Customer delivery rating |

### Support tickets — Bearer

| Method | Path |
|--------|------|
| `GET/POST` | `/api/tickets` |
| `GET/POST/PATCH` | `/api/tickets/{ticketId}` |

---

## 12. Analytics & history

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/analytics/customer-behavior` | Public + identity | `{ storeId, eventType, sessionId?, anonymousId?, userId?, email?, phone?, metadata? }` |
| `POST` | `/api/analytics/heatmap-clicks` | Public | Batch UI clicks |
| `POST` | `/api/analytics/track-attribution` | Public | UTMs → `{ attributionId }` |
| `GET/POST/DELETE` | `/api/browse-history` | Bearer | Recently viewed |
| `POST` | `/api/users/track-location` | Optional | Geo |

Always send `storeId` from `/api/public/tracking-context` when posting analytics.

---

## 13. Misc customer endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/chatbot` | Storefront chatbot |
| `GET` | `/api/rating` | Ratings helpers |
| `POST` | `/api/upload` / ImageKit auth | Media upload helpers (if app uploads review images server-side) |
| `GET` | `/api/feeds/google-merchant` | Feed — not for mobile UI |
| `POST` | `/api/notifications/*` | Prefer server-triggered; not primary app UX |

---

## 14. Deep links the app should handle

| Link | Purpose | API |
|------|---------|-----|
| `/cart?restore={token}` | Restore abandoned cart | `GET /api/abandoned-cart-restore/{token}` |
| `/recover-cart/{token}` | Discounted recovery cart | `GET /api/abandoned-cart-recovery/{token}` |
| Order success return URLs from Stripe/Tabby/Tamara | Confirm payment | matching `verify-*` |
| Guest convert email links | Create account | `/api/guest/convert-account` |

Universal Links / App Links should map these paths into native screens that call the APIs above (not only open WebView), when possible.

---

## 15. Order status primer (shopper-visible)

Typical progression (exact set may include carrier-specific values):

`ORDER_PLACED` → `CONFIRMED` / `PROCESSING` → packed / shipped → `DELIVERED`  
Payment pending prepaid: awaiting payment / failed / paid paths  
Cancelled: `CANCELLED` / payment-failed variants

See [`docs/ORDER_DETAILS.md`](./ORDER_DETAILS.md) for full field reference.

---

## Appendix A — Full shopper-facing route index

~90 customer-facing routes under `/api` (excluding `/api/store/*` and `/api/admin/*`):

```
/api/abandoned-cart-recovery/[token]
/api/abandoned-cart-recovery/confirm
/api/abandoned-cart-restore/[token]
/api/abandoned-checkout
/api/account/delete
/api/address
/api/address/[id]
/api/analytics/customer-behavior
/api/analytics/heatmap-clicks
/api/analytics/track-attribution
/api/browse-history
/api/cart
/api/cart/validate
/api/categories
/api/chatbot
/api/coupon
/api/coupons
/api/customer/recent-searches
/api/email-preferences
/api/feeds/google-merchant
/api/giveaways/eligible
/api/guest/abandoned-cart
/api/guest/convert-account
/api/home-selection
/api/home/sections
/api/imagekit-auth
/api/imagekit-auth/upload
/api/notifications/guest-order
/api/notifications/order-status
/api/orders
/api/orders/cancel
/api/orders/check-razorpay-settlement
/api/orders/confirm-paid
/api/orders/delivery-review
/api/orders/prepaid-upsell
/api/orders/return-request
/api/orders/verify-stripe
/api/orders/verify-tabby
/api/orders/verify-tamara
/api/payment-cancelled
/api/personalized-offers
/api/personalized-offers/resolve/[slug]
/api/personalized-offers/validate/[token]
/api/products
/api/products/[id]/fbt
/api/products/batch
/api/products/by-slug
/api/products/deals
/api/products/page
/api/products/top-rated
/api/profile
/api/promotional-emails
/api/promotional-emails/templates
/api/public/category-sliders
/api/public/featured-sections
/api/public/mobile-features
/api/public/offers
/api/public/shop-showcase
/api/public/tracking-context
/api/rating
/api/razorpay/order
/api/razorpay/verify
/api/referral/claim
/api/referral/my-code
/api/return-request
/api/review
/api/review/can-review
/api/review/helpful
/api/search-by-image
/api/search-products
/api/send-login-email
/api/send-shipping-email
/api/send-signout-email
/api/send-welcome-email
/api/shipping
/api/social-proof-products
/api/spin/campaign
/api/spin/play
/api/store-info
/api/stripe
/api/tickets
/api/tickets/[ticketId]
/api/top-bar-settings
/api/track-order
/api/upload
/api/user/link-guest-orders
/api/users/track-location
/api/wallet
/api/wallet/bonus
/api/whatsapp/product
/api/wishlist
/api/wishlist/count
```

---

## Appendix B — Non-shopper API surface

These exist on the same host but are **not** for the customer mobile app:

| Prefix / area | Count (approx.) | Audience |
|---------------|-----------------|----------|
| `/api/store/*` | ~160 | Seller dashboard |
| `/api/admin/*` | ~19 | Platform admin |
| `/api/cron/*` | ~6 | Scheduled jobs (`CRON_SECRET`) |
| Webhooks (`/api/*/webhook`, `/api/webhooks/*`) | ~8 | Stripe, Tabby, Tamara, Razorpay, Waslah, etc. |
| Ops (`/api/warehouse/*`, `/api/zoho/*`, `/api/c3xpress/*`, `/api/delhivery/*`, debug/test) | ~21 | Internal / logistics |

Warehouse packing docs: [`docs/warehouse-order-packing-api.md`](./warehouse-order-packing-api.md), [`docs/warehouse-inventory-api.md`](./warehouse-inventory-api.md).

**Do not call payment webhooks from the app.** After a BNPL/card redirect, call the `verify-*` endpoints instead; webhooks finalize payment server-side.

---

## Appendix C — Minimal integration checklist

- [ ] Firebase project configured; ID tokens sent as Bearer
- [ ] Stable `anonymousId` per install
- [ ] `storeId` from `/api/public/tracking-context`
- [ ] Language: `Accept-Language` or `?lang=`
- [ ] Local cart + optional `POST /api/cart` when logged in
- [ ] Validate cart → shipping → create order
- [ ] Handle Stripe/Tabby/Tamara return + verify
- [ ] Deep link: `?restore=` and `/recover-cart/`
- [ ] Orders list, track-order, wishlist, addresses
- [ ] Never embed Firebase Admin / webhook secrets in the app

---

## Appendix D — Example authenticated request (Swift / Kotlin / Dart)

```http
GET /api/wishlist HTTP/1.1
Host: store1920.com
Authorization: Bearer <firebase_id_token>
Accept: application/json
Accept-Language: en
```

```http
POST /api/orders HTTP/1.1
Host: store1920.com
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "paymentMethod": "COD",
  "addressId": "<address_mongo_id>",
  "items": [{ "id": "<product_mongo_id>", "quantity": 1 }]
}
```

For questions on seller or warehouse APIs, use the linked docs above rather than this shopper guide.
