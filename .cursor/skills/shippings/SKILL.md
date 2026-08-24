---
name: shippings
description: Maintains Store1920 shipping settings at /store/shipping, payment method order-total limits (COD, Card, Tabby, Tamara), and checkout enforcement. Use when editing /store/shipping, max payment amounts, hiding Tabby/Tamara/Card at checkout, or /api/shipping.
---

# Shipping Settings (`/store/shipping`)

## Routes & files

| Item | Path |
|------|------|
| Dashboard page | `app/store/shipping/page.jsx` |
| Public API | `app/api/shipping/route.js` (GET public, PUT seller) |
| Model | `models/ShippingSetting.js` |
| Shipping calc | `lib/shipping.js`, `lib/shippingOptions.js` |
| Payment limits | `lib/paymentMethodLimits.js` |
| Checkout enforcement | `app/(public)/checkout/CheckoutPageUI.jsx` |
| Order API validation | `app/api/orders/route.js` |

## Dashboard rules (`/store`)

- English-only, LTR (see `store` skill)
- Currency label from `NEXT_PUBLIC_CURRENCY_SYMBOL` (default AED)

## Payment method enable/disable

Stored on `ShippingSetting`:

| Field | Checkout method | Behavior |
|-------|-----------------|----------|
| `enableCOD` | `cod` | Hidden when `false` |
| `enableCard` | `card` | Hidden when `false` |
| `enableTabby` | `tabby` | Hidden when `false` |
| `enableTamara` | `tamara` | Hidden when `false` |

Defaults are **enabled** (`undefined` treated as on). Dashboard toggles live under **Settings → Payments** and also under **Shipping → Online Payment Methods**.

Use `isPaymentMethodEnabled(setting, method)` from `lib/paymentMethodLimits.js`.

## Payment method limits

Stored on `ShippingSetting`:

| Field | Checkout method | Behavior |
|-------|-----------------|----------|
| `maxCODAmount` | `cod` | Disabled (grayed) when total exceeds limit |
| `maxCardAmount` | `card` | Hidden when total exceeds limit |
| `maxTabbyAmount` | `tabby` | Hidden when total exceeds limit |
| `maxTamaraAmount` | `tamara` | Hidden when total exceeds limit |

**`0` = unlimited** (same as COD).

Limits apply to **order total after wallet** at checkout (`totalAfterWallet`).

### Shared helper (`lib/paymentMethodLimits.js`)

- `isPaymentMethodEnabled(setting, method)`
- `getPaymentMethodMaxAmount(setting, method)`
- `isPaymentMethodOverLimit(setting, method, orderAmount)`
- `getPaymentMethodLimitError(setting, paymentMethod, orderAmount, options)`

Use these helpers in checkout UI and order API — do not duplicate limit logic.

### Adding a new payment limit

1. Add field to `models/ShippingSetting.js`
2. Map in `PAYMENT_LIMIT_FIELDS` / `PAYMENT_ENABLE_FIELDS` in `lib/paymentMethodLimits.js`
3. Save/load in `app/api/shipping/route.js` GET defaults + PUT
4. Add toggle on `app/store/settings/page.jsx` (Payments) and input on `app/store/shipping/page.jsx`
5. Hide/disable in `CheckoutPageUI.jsx` and validate in `app/api/orders/route.js`

## COD section (existing)

- `enableCOD` — toggle
- `codFee` — extra fee added for COD orders
- `maxCODAmount` — max order total; shown disabled at checkout (not hidden)

## Shipping options

Multi-option delivery uses `shippingOptions[]` via `lib/shippingOptions.js`:
- Types: `FLAT_RATE`, `PER_ITEM`, `WEIGHT_BASED`, `FREE`
- Express shipping synced via `upsertExpressShippingOption`

## Do not

- Move payment limits to env vars — they are per-store dashboard settings
- Show Arabic labels on `/store/shipping` dashboard
- Skip server-side validation in `app/api/orders/route.js` when changing checkout limits

## When editing

- [ ] Model + API GET defaults + PUT include new fields
- [ ] Dashboard form loads and saves new fields
- [ ] `paymentMethodLimits.js` updated if new method added
- [ ] Checkout hides/disables and clears invalid selection when total changes
- [ ] Order POST rejects over-limit payment methods
