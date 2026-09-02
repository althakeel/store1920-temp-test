# Store1920 App API Requirements

Last updated: 2026-05-11  
App version target: 1.0.0+1  
Android app id: com.quickfynd.v1

## 1. Purpose

This document is the consolidated API contract for the Store1920 mobile application.

It combines:

- the expected mobile app contract,
- the current web implementation under `app/api`,
- known route mismatches,
- open items that still need backend confirmation before app release.

Use this as the working handoff document for backend and mobile integration.

## 2. API Basics

- Base URL: `https://store1920.com`
- Default content type: `application/json`
- Auth type: Firebase ID token
- Auth header: `Authorization: Bearer <firebase_id_token>`
- Protected endpoints: must validate token and scope data to the authenticated user

### 2.1 Standard success shape

There is no fully consistent success envelope across the current codebase. For new or refactored endpoints, prefer:

```json
{
  "success": true,
  "data": {}
}
```

### 2.2 Standard error shape

Backend should return a consistent shape for all errors:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Recommended status usage:

- `400` validation error
- `401` unauthenticated or invalid token
- `403` forbidden
- `404` not found
- `409` conflict
- `422` semantic validation
- `429` rate limit
- `500` server error

## 3. Status Legend

- `Implemented`: route exists in the current codebase
- `Implemented with mismatch`: route exists but path, auth, or payload differs from the app requirement
- `Candidate`: documented in app requirements but not confirmed in code
- `Missing`: not found in the current codebase

## 4. Authentication and User APIs

| Feature                 | Expected contract                             | Current route status              | Notes                                                                                                                                                                                |
| ----------------------- | --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Get profile             | `GET /api/user/profile` or `GET /api/profile` | Implemented at `GET /api/profile` | Current response returns `profile.name`, `email`, `phone`, `image`, plus referral fields. `id`, `uid`, `phoneVerifiedAt`, `emailVerifiedAt`, `updatedAt` are not currently returned. |
| Update profile          | `PATCH /api/profile`                          | Implemented                       | Request body matches app needs: `name`, `email`, `phone`, `image`.                                                                                                                   |
| Link identities         | `POST /api/user/link-identities`              | Missing                           | No direct route found. Closest implemented behavior is guest-order linking.                                                                                                          |
| Link guest orders       | `POST /api/user/link-guest-orders`            | Implemented                       | Accepts `email` and or `phone`, links guest orders to authenticated account.                                                                                                         |
| Track location/activity | `POST /api/users/track-location`              | Implemented with mismatch         | Route exists, but current implementation also allows guest tracking when no token is provided.                                                                                       |
| Send welcome email      | `POST /api/send-welcome-email`                | Implemented                       | Requires Firebase auth and request body containing at least `email`.                                                                                                                 |

### 4.1 Recommended profile response contract

```json
{
  "profile": {
    "id": "string",
    "uid": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "image": "string",
    "phoneVerifiedAt": "datetime|null",
    "emailVerifiedAt": "datetime|null",
    "updatedAt": "datetime"
  }
}
```

## 5. Product and Catalog APIs

| Feature                 | Expected contract                                               | Current route status                    | Notes                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product listing         | `GET /api/products`                                             | Implemented with mismatch               | Current query params include `limit`, `offset`, `category`, `fastDelivery`, `sortBy`, `includeOutOfStock`, `all`. App spec mentions `search`, `categoryId`, `sort`. |
| Product details by id   | `GET /api/products/:productId` or `GET /api/product/:productId` | Implemented at `GET /api/products/[id]` | Route exists in codebase.                                                                                                                                           |
| Product details by slug | `GET /api/products/by-slug?slug=:slug`                          | Implemented                             | Matches app requirement.                                                                                                                                            |
| Product batch fetch     | `POST /api/products/batch`                                      | Implemented                             | Current implementation expects `{ "productIds": ["id1", "id2"] }`.                                                                                                  |
| Featured products       | `GET /api/store/featured-products`                              | Implemented                             | Available as a store-scoped route.                                                                                                                                  |
| Categories              | `GET /api/categories`                                           | Implemented with mismatch               | Current route returns full category list with populated `children`; query filters like `limit`, `offset`, `parentId` are not implemented.                           |

### 5.1 Product listing minimum contract

Recommended query params:

- `limit`
- `offset`
- `search`
- `category`
- `categoryId`
- `sort`

Current implementation already supports:

- `limit`
- `offset`
- `category`
- `fastDelivery`
- `sortBy`
- `includeOutOfStock`
- `all`

## 6. Review APIs

| Feature            | Expected contract                                                 | Current route status                           | Notes                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get reviews        | `GET /api/review?productId=:id&limit=:n` or related candidates    | Implemented at `GET /api/review?productId=:id` | Current route requires `productId`. `limit` is not currently supported.                                                                                          |
| Review eligibility | `GET /api/review/eligibility?productId=:id` or related candidates | Missing                                        | Eligibility is enforced during review submission by checking prior orders; there is no separate eligibility endpoint yet.                                        |
| Submit review      | `POST /api/review` or related candidates                          | Implemented                                    | Requires Firebase auth and `multipart/form-data`. Current required fields: `productId`, `rating`, `review`. Optional media fields include `images` and `videos`. |
| Delete review      | `DELETE /api/review/:reviewId` or `DELETE /api/reviews/:reviewId` | Missing                                        | No customer-facing delete route found.                                                                                                                           |

### 6.1 Submit review request

Content type:

- `multipart/form-data`

Fields:

- `productId`
- `rating`
- `review`
- `images[]` optional
- `videos[]` optional

Behavior currently enforced in code:

- user must be authenticated,
- user must have purchased the product,
- review is saved as pending approval.

## 7. Order and Checkout APIs

| Feature        | Expected contract                                | Current route status             | Notes                                                                                                                                        |
| -------------- | ------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Create order   | `POST /api/orders` or `POST /api/store/checkout` | Implemented at both routes       | Customer flow is implemented at `POST /api/orders`. Store checkout route also exists.                                                        |
| Order listing  | `GET /api/orders` or `GET /api/orders/history`   | Implemented at `GET /api/orders` | Auth required.                                                                                                                               |
| Order details  | `GET /api/orders/:orderId`                       | Missing for customer API         | No customer-facing `app/api/orders/[orderId]/route.js` was found.                                                                            |
| Cancel order   | `POST /api/orders/cancel`                        | Implemented                      | Current request expects `orderId`; app requirement also expects `reason` and `note`. Those should be standardized if required by mobile app. |
| Return request | `POST /api/orders/return-request`                | Implemented                      | A legacy `POST /api/return-request` route also exists.                                                                                       |
| Track order    | `GET /api/track-order`                           | Implemented                      | Current route supports lookup via `orderId`, `awb`, and `phone`.                                                                             |

### 7.1 Create order notes

Current `POST /api/orders` supports both:

- authenticated checkout using Firebase token,
- guest checkout with `isGuest: true` and guest details.

Current order payload is broader than the mobile spec and includes fields such as:

- `addressId`
- `addressData`
- `items`
- `couponCode`
- `paymentMethod`
- `isGuest`
- `guestInfo`
- `coinsToRedeem`
- `paymentStatus`
- `razorpayPaymentId`
- `razorpayOrderId`
- `razorpaySignature`

## 8. Address APIs

| Feature        | Expected contract                                    | Current route status               | Notes                                               |
| -------------- | ---------------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Address list   | `GET /api/address` or `GET /api/account/addresses`   | Implemented at `GET /api/address`  | Auth required.                                      |
| Add address    | `POST /api/account/addresses` or `POST /api/address` | Implemented at `POST /api/address` | Auth required.                                      |
| Update address | `PUT /api/address`                                   | Implemented                        | Current route expects address `id` in request body. |
| Delete address | `DELETE /api/address?id=:addressId`                  | Implemented                        | Auth required.                                      |

### 8.1 Current address payload shape

The code currently stores fields including:

- `name`
- `email`
- `street`
- `city`
- `state`
- `district`
- `zip`
- `country`
- `phone`
- `phoneCode`
- `alternatePhone`
- `alternatePhoneCode`

Backend should confirm whether the mobile app should use `zip` or `pincode`, or support both.

## 9. Wallet APIs

| Feature        | Expected contract        | Current route status | Notes                                                                     |
| -------------- | ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| Wallet summary | `GET /api/wallet`        | Implemented          | Current response already includes `coins`, `rupeesValue`, `transactions`. |
| Welcome bonus  | `POST /api/wallet/bonus` | Implemented          | Exact request and response contract should be confirmed.                  |

## 10. Coupons and Promotions APIs

| Feature                        | Expected contract     | Current route status      | Notes                                                                                                                                       |
| ------------------------------ | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Coupon list                    | `GET /api/coupons`    | Implemented               | Current route requires `storeId` query param and returns active coupon display data.                                                        |
| Validate coupon, authenticated | `POST /api/coupon`    | Implemented with mismatch | `POST /api/coupon` exists, but `POST /api/coupons` also performs coupon validation/application logic. Backend should standardize one route. |
| Validate coupon, guest/public  | `POST /api/coupons`   | Implemented               | Current request expects `code`, `storeId`, `orderTotal`, and optional `userId`, `cartProductIds`.                                           |
| Spin wheel play                | `POST /api/spin/play` | Implemented               | Route exists.                                                                                                                               |

### 10.1 Coupon validation request

Current `POST /api/coupons` expects:

```json
{
  "code": "SAVE10",
  "storeId": "string",
  "orderTotal": 999,
  "userId": "string",
  "cartProductIds": ["id1", "id2"]
}
```

## 11. Support and Ticket APIs

| Feature       | Expected contract   | Current route status | Notes          |
| ------------- | ------------------- | -------------------- | -------------- |
| Ticket list   | `GET /api/tickets`  | Implemented          | Auth required. |
| Create ticket | `POST /api/tickets` | Implemented          | Auth required. |

### 11.1 Current create ticket payload

```json
{
  "subject": "string",
  "category": "Order Issue | Product Question | Payment Issue | Account Issue | Other",
  "description": "string",
  "priority": "normal | high",
  "orderId": "string"
}
```

## 12. Home and Discovery APIs

| Feature              | Expected contract                                                        | Current route status                                                            | Notes                                                                                |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Featured sections    | `GET /api/public/featured-sections` or related candidates                | Implemented at `GET /api/public/featured-sections` and `GET /api/home/sections` | Two similar routes exist. Backend should define the primary app contract.            |
| Mobile banner slider | `GET /api/store/mobile-banner-slider`                                    | Missing                                                                         | Exact route not found. Nearby routes include category sliders and featured sections. |
| Deals                | `GET /api/deals?includeProducts=true&limit=50` or `GET /api/store/deals` | Implemented with mismatch                                                       | Current route found at `GET /api/products/deals`.                                    |
| Carousel products    | `GET /api/store/carousel-products`                                       | Implemented                                                                     | Route exists.                                                                        |
| Recent searches      | `GET /api/store/recent-searches`                                         | Implemented with mismatch                                                       | Current route found at `GET /api/customer/recent-searches`.                          |
| Save recent search   | `POST /api/store/recent-searches`                                        | Implemented with mismatch                                                       | Current route found at `POST /api/customer/recent-searches`.                         |

## 13. Payment APIs

| Feature                 | Expected contract                                                                                   | Current route status                      | Notes                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Razorpay order creation | `POST /api/razorpay/create-order` or `POST /api/razorpay/order` or `POST /api/payment/create-order` | Implemented at `POST /api/razorpay/order` | Current request expects `amount`, optional `currency`, optional `receipt`. |
| Razorpay verification   | `POST /api/razorpay/verify`                                                                         | Implemented                               | Route exists.                                                              |

### 13.1 Razorpay create order request

```json
{
  "amount": 999,
  "currency": "INR",
  "receipt": "order_123"
}
```

## 14. Shipping and Pincode APIs

| Feature                  | Expected contract                           | Current route status      | Notes                                                                  |
| ------------------------ | ------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Shipping settings        | `GET /api/shipping`                         | Implemented with mismatch | Current route is public and typically expects optional `storeId`.      |
| Delhivery serviceability | `GET /api/delhivery/pincode-serviceability` | Implemented with mismatch | Current route exists at `GET /api/delhivery/pincode?pincode=:pincode`. |
| India Post pincode check | `GET /api/indiapost/pincode`                | Missing                   | No route found.                                                        |

## 15. Additional Implemented User APIs Relevant to Mobile

These were found in code and may be useful to the app even though they were not part of the original checklist:

- `GET /api/wishlist`
- `POST /api/wishlist`
- `GET /api/wishlist/count`
- `GET /api/cart`
- `POST /api/cart`
- `DELETE /api/cart`
- `POST /api/cart/validate`
- `GET /api/browse-history`
- `POST /api/browse-history`
- `DELETE /api/browse-history`

## 16. Open Items to Confirm with Backend

### 16.1 Missing or not finalized routes

1. Wishlist route naming

- Current code uses `GET /api/wishlist` and `POST /api/wishlist`
- App notes mention `POST /api/wishlist/add` and `DELETE /api/wishlist/remove/:productId`
- Backend should standardize one contract

2. Cart sync APIs

- Current code uses `GET|POST|DELETE /api/cart`
- App notes mention `POST /api/cart/add` and `POST /api/cart/sync`
- Backend should confirm whether mobile should use the existing consolidated cart route

3. OTP APIs

- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`
- `POST /api/auth/otp/resend`
- These routes were not found in the current codebase

4. Browse history

- Implemented at `GET|POST|DELETE /api/browse-history`
- This is already available and does not need a new route unless app naming must change

5. Customer order details route

- `GET /api/orders/:orderId` should be added if the mobile app needs direct order detail fetches

6. Review eligibility route

- The backend currently validates review eligibility only during submission
- If the app needs a separate pre-check, add a dedicated endpoint

7. Mobile banner slider route

- `GET /api/store/mobile-banner-slider` was not found
- Backend should confirm replacement route or add it

8. India Post pincode route

- `GET /api/indiapost/pincode` was not found

9. Admin and store panel APIs referenced by app notes

- `/api/store/tickets` exists
- `/api/store/customers/wallet` exists
- `/api/admin/home-sections` exists

## 17. QA Checklist for Backend Developer

- Validate Firebase token on all protected endpoints
- Enforce user scoping on profile, address, wallet, orders, tickets, cart, wishlist, and browse history routes
- Standardize response and error shapes across all endpoints
- Confirm whether profile response must include `id`, `uid`, verification timestamps, and `updatedAt`
- Confirm whether address payload uses `zip`, `pincode`, or both
- Confirm coupon rules for min order, max discount, expiry, exhaustion, product restriction, and per-user limits
- Confirm order status transitions and cancellation constraints
- Add a dedicated customer order-details route if the app depends on it
- Add a dedicated review eligibility route if the app checks eligibility before opening the review form
- Ensure review posting is limited to eligible purchased orders only
- Ensure phone normalization is consistent, ideally E.164
- Ensure pincode validation handles invalid or zero values safely
- Ensure Razorpay verification checks signature securely
- Confirm whether `/api/users/track-location` should remain guest-compatible or become strictly authenticated
- Resolve duplicate or overlapping discovery routes such as featured sections and recent searches

## 18. Recommended Release Checklist Before App Launch

Backend should finalize these items before the Android app is cut against version `1.0.0+1`:

1. Freeze the canonical route for each mobile feature where duplicate routes exist.
2. Normalize all protected endpoints to `Authorization: Bearer <firebase_id_token>`.
3. Add missing high-priority routes: order details, review eligibility, OTP, and any required banner or pincode endpoints.
4. Standardize all errors to the documented contract.
5. Confirm field-level contracts with mobile for profile, address, coupon, and order payloads.
