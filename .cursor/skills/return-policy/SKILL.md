---
name: return-policy
description: Maintains the Store1920 public master Return, Refund, Exchange & Cancellation policy at /return-policy using the bilingual PAGE_COPY + PolicyPageLayout pattern. Use when editing return policy content, refunds, exchanges, cancellations, return windows, or when the user mentions /return-policy, return policy page, or return/refund policy copy.
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
- Master title includes Return, Refund, Exchange **and** Cancellation
- Returns are **not free** (customer pays return shipping unless Store1920 error)
- Return window and eligibility: follow existing numbered sections; do not invent “7-day free returns”
- Contact: `support@Store1920.com` + toll-free support number helpers

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
