---
name: return-policy
description: Maintains the Store1920 public master Return, Refund, Replacement & Cancellation policy at /return-policy using the bilingual PAGE_COPY + PolicyPageLayout pattern. Use when editing return policy content, refunds, replacements, cancellations, return windows, or when the user mentions /return-policy, return policy page, or return/refund policy copy.
---

# Master Return Policy (`/return-policy`)

## Route & file

| Item | Value |
|------|--------|
| URL | `/return-policy` |
| Page | `app/(public)/return-policy/page.jsx` |
| Layout | `components/PolicyPageLayout.jsx` |
| Reference pattern | `app/(public)/shipping-policy/page.jsx` |

## Canonical redirects

These URLs **must** 301 to `/return-policy` (see `next.config.mjs` + thin redirect pages):

- `/refund-policy`
- `/cancellation-and-refunds`
- `/cancellation-policy`

Stub aliases for other policies:

- `/privacy` → `/privacy-policy`
- `/shipping` → `/shipping-policy`
- `/terms` → `/terms-and-conditions`

Do **not** reintroduce separate refund/cancellation public pages or list those URLs in XML/HTML sitemaps or footer.

## Required structure

1. `'use client'` page component
2. `PAGE_COPY` / `buildPageCopy()` with **both** `en` and `ar` keys
3. `useStorefrontI18n()` → `isArabic` → pick Arabic or English copy
4. `PolicyPageLayout` with `dir={isArabic ? 'rtl' : undefined}`
5. Title, intro, sections in bordered card

## Content rules

- Keep legal/policy wording accurate; update **English and Arabic together**
- Master title is **Return, Refund, Replacement & Cancellation**
- Commercial return request window: **7 calendar days** after delivery via My Orders, Return Request, or support
- Change of mind: unused / unactivated / resalable; customer pays the disclosed return-collection charge
- Store1920-error / statutory cases: Store1920 pays return shipping; not limited by the 7-day commercial window
- Do **not** invent “7-day free returns” for change of mind
- Refunds initiated **5–7 business days after approval** (card / Tabby-Tamara / verified UAE bank transfer for COD)
- Return address is the published fulfilment warehouse in `lib/businessIdentity.js` (`getFulfilmentAddressSingleLine()` / `getBusinessAddressSingleLine()`)
- Registered office is the Dubai licence address (`getRegisteredOfficeSingleLine()`). Never list the Sharjah warehouse as the registered office.
- Commercial return rules must expressly **not reduce** mandatory UAE rights (Federal Decree-Law No. 14 of 2023; Federal Law No. 15 of 2020 and its executive regulation)
- Contact: `support@store1920.com` + toll-free support number helpers

## Do not

- Remove bilingual support
- Use a different layout width than `PolicyPageLayout`
- Move this into `/store/**`
- Add duplicate public refund/cancellation routes

## When editing

- [ ] `en` and `ar` updated together
- [ ] Section numbering stays sequential
- [ ] Footer / sitemaps link only to `/return-policy`
- [ ] Redirects for old URLs still present
