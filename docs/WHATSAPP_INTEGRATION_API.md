# Store1920 WhatsApp Integration API

Last updated: 2026-06-16  
Base URL: `https://store1920.com`

This document is for the WhatsApp / Elastic WABA integration team.

---

## 1. Authentication

Protected endpoints require one of:

```http
Authorization: Bearer <ORDER_CONFIRM_WEBHOOK_SECRET>
```

or

```http
X-Webhook-Secret: <ORDER_CONFIRM_WEBHOOK_SECRET>
```

Store1920 will share the secret separately. Do not publish it in templates or public docs.

---

## 2. Product API

Use this API to fetch product details for WhatsApp template variables (name, image, price, product URL, button slug).

### Endpoint

```http
GET /api/whatsapp/product?slug={product-slug}
```

Alternative:

```http
GET /api/whatsapp/product?productId={mongo_product_id}
```

### Example request

```http
GET https://store1920.com/api/whatsapp/product?slug=neck-face-massager
Authorization: Bearer <ORDER_CONFIRM_WEBHOOK_SECRET>
```

### Example response

```json
{
  "success": true,
  "product": {
    "id": "665f8c2f9a1b2c3d4e5f6789",
    "name": "Neck & Face Massager",
    "slug": "neck-face-massager",
    "sku": "NFM-001",
    "price": 199,
    "originalPrice": 249,
    "currency": "AED",
    "imageUrl": "https://www.store1920.com/static/media/10.25166b26357ac6cfe3ef.webp",
    "productUrl": "https://store1920.com/product/neck-face-massager",
    "cartUrl": "https://store1920.com/cart",
    "checkoutUrl": "https://store1920.com/checkout",
    "ordersUrl": "https://store1920.com/orders",
    "homeUrl": "https://store1920.com/",
    "freeShipping": true,
    "freeShippingLabel": "Available",
    "inStock": true,
    "brand": "Store1920",
    "shortDescription": "Portable neck and face massager"
  }
}
```

### WhatsApp template usage

| Template field | API field |
|----------------|-----------|
| Product name | `product.name` |
| Product image | `product.imageUrl` |
| Product price | `product.price` + `product.currency` |
| Free shipping | `product.freeShippingLabel` |
| Product card URL | `product.productUrl` |
| Shop Now / Shop Again button slug `{{1}}` | `product.slug` |

---

## 3. Order Confirm Webhook

Use this webhook when Store1920 should send an order-related WhatsApp notification.

### Health check

```http
GET https://store1920.com/api/order-confirm-webhook
```

### Trigger notification

```http
POST https://store1920.com/api/order-confirm-webhook
Authorization: Bearer <ORDER_CONFIRM_WEBHOOK_SECRET>
Content-Type: application/json
```

### Request body

```json
{
  "event": "cod_confirmation",
  "orderId": "665f8c2f9a1b2c3d4e5f6789",
  "orderNumber": "45821"
}
```

You can send either `orderId` or `orderNumber`.

### Supported events

| Event | WhatsApp use case | Template |
|-------|-------------------|----------|
| `cod_confirmation` | COD order confirmation | `order_confirmation_final` |
| `order_confirmed` | Same as COD confirmation | `order_confirmation_final` |
| `order_paid` | Paid order confirmation | `confirmation_paid_order` |
| `paid_confirmation` | Paid order confirmation | `confirmation_paid_order` |
| `order_shipped` | Order shipped notification | `order_shipped` |
| `order_reminder` | Pending order reminder | `order_reminder_` |
| `abandoned_checkout` | Abandoned checkout reminder | `cart_reminder_1920` (button → `/checkout`) |
| `cart_reminder` | Add to cart reminder | `cart_reminder_1920` (button → `/cart`) |
| `order_delivered` | Reserved for delivered template | — |
| `promotional_offer` | Reserved for coupon / promo template | — |

### Cart reminder without order

`cart_reminder` and `abandoned_checkout` can be sent **without** an order if you provide customer phone + product:

```json
{
  "event": "cart_reminder",
  "phone": "526478393",
  "phoneCode": "+971",
  "customerName": "Ahmed",
  "cartTotal": 99,
  "slug": "neck-face-massager"
}
```

Store1920 maps this to Elastic WABA template `cart_reminder_1920`:

| Component | Value |
|-----------|--------|
| Header image | `product.imageUrl` |
| Body {{1}} | Customer name |
| Body {{2}} | Cart total / price (e.g. `99 AED`) |
| Body {{3}} | Free shipping label (`Available`) |
| Button URL {{1}} | `/cart` or `/checkout` |

Elastic API endpoint used internally:

```text
POST {WABA_API_BASE_URL}/{WABA_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WABA_TOKEN_CART_REMINDER}
```

### Example response

```json
{
  "success": true,
  "event": "cod_confirmation",
  "order": {
    "id": "665f8c2f9a1b2c3d4e5f6789",
    "orderNumber": "ST1920-45821",
    "status": "ORDER_PLACED",
    "paymentMethod": "COD"
  },
  "customer": {
    "customerName": "Ahmed",
    "phone": "501234567",
    "phoneCode": "+971",
    "orderNumber": "ST1920-45821"
  },
  "product": {
    "name": "Neck & Face Massager",
    "slug": "neck-face-massager",
    "productUrl": "https://store1920.com/product/neck-face-massager",
    "imageUrl": "https://...",
    "price": 199,
    "currency": "AED",
    "freeShippingLabel": "Available"
  },
  "whatsapp": {
    "success": true,
    "queueId": "abc123",
    "status": "queued"
  }
}
```

---

## 4. Button destination URLs

| Template | Button | URL |
|----------|--------|-----|
| Add to Cart Reminder | View Cart | `https://store1920.com/cart` |
| Abandoned Checkout Reminder | Complete Order | `https://store1920.com/checkout` |
| COD Confirmation | Track Order | `https://store1920.com/orders` |
| Order Delivered | Shop Again | `https://store1920.com/product/{{1}}` |
| Promotional Offer / Coupon | Shop Now | `https://store1920.com/product/{{1}}` |

`{{1}}` = product slug only (example: `neck-face-massager`). Do not send `/product/...` or `/products`.

### Product card header link

```text
https://store1920.com/product/{{1}}
```

Example:

```text
https://store1920.com/product/neck-face-massager
```

---

## 5. Quick reference

```text
Product API:
GET https://store1920.com/api/whatsapp/product?slug=neck-face-massager

Order webhook:
POST https://store1920.com/api/order-confirm-webhook

Webhook health:
GET https://store1920.com/api/order-confirm-webhook
```

---

## 6. Notes

- Phone numbers are normalized to international format before sending to WABA.
- If customer phone is missing, WhatsApp sending is skipped and the API returns a `skipped` reason.
- `order_delivered` and `promotional_offer` events are reserved until the final WhatsApp templates are approved.

---

## 8. Automatic triggers (Store1920 backend)

These WhatsApp templates are sent automatically without calling the webhook:

| Template | When it sends |
|----------|----------------|
| `order_confirmation_final` | COD / unpaid order placed |
| `confirmation_paid_order` | Card, Razorpay, Wallet, or paid order placed; Stripe/Tamara/Tabby after payment webhook |
| `order_shipped` | Seller sets order status to `SHIPPED` or shipping email API is called |
| `order_reminder_` | Store dashboard → Orders → order detail → **Order reminder**, or webhook event `order_reminder` |
| `cart_reminder_1920` | Store dashboard → Abandoned checkout → **Send WhatsApp reminder**, or webhook event `cart_reminder` |

Each template uses its own bearer token env var (see `.env.example`):

```text
WABA_TOKEN_ORDER_CONFIRMATION   → order_confirmation_final
WABA_TOKEN_PAID_ORDER           → confirmation_paid_order
WABA_TOKEN_SHIPPED              → order_shipped
WABA_TOKEN_REMINDER             → order_reminder_
WABA_TOKEN_CART_REMINDER        → cart_reminder_1920
```

### Store dashboard manual send API

```http
POST /api/store/whatsapp/send
Authorization: Bearer <firebase_seller_token>
Content-Type: application/json

{ "template": "cart_reminder", "cartId": "..." }
{ "template": "order_reminder", "orderId": "..." }
{ "template": "order_confirmation" | "order_paid" | "order_shipped", "orderId": "..." }
```

---

## 9. Contact

Technical contact: Store1920 backend team  
Support email: support@store1920.com
