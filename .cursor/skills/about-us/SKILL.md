---
name: about-us
description: Maintains the Store1920 public About Us page at /about-us — bilingual EN/AR PAGE_COPY, brand story, UAE legal identity, and storefront design. Use when editing /about-us, About Us, who we are, or the Smart living / Smarter prices hero.
---

# About Us (`/about-us`)

## Route & file

| Item | Value |
|------|--------|
| URL | `/about-us` |
| Page | `app/(public)/about-us/page.jsx` |
| Identity | `lib/businessIdentity.js`, `lib/storeContact.js`, `lib/brandLogo.js` |

## Required structure

1. `'use client'` page with `PAGE_COPY` **en** and **ar**
2. `useStorefrontI18n()` → `isArabic` → pick copy
3. Root wrapper `dir={isArabic ? 'rtl' : 'ltr'}`
4. One visible `<h1>` (the hero headline)
5. Links: Shop `/`, Business information `/business-information`

## Content rules

- Keep English and Arabic updated together
- Legal owner is ALTHAKEEL LLC from `STORE1920_LEGAL_NAME` / `STORE1920_LEGAL_NAME_AR` + trade license number
- Mention both the Dubai registered office and the Sharjah fulfilment/returns warehouse; do not combine them into one address
- Fast delivery only on **eligible** items; do not invent “7-day free returns”
- Eligible returns copy must match the master `/return-policy` (7-day unused; free return shipping only for wrong/damaged/defective/not-as-described)
- Contact comes from `STORE1920_SUPPORT_EMAIL` and `STORE1920_CUSTOMER_SUPPORT_PHONE`

## Design

- Public storefront page — not `/store` dashboard
- Prefer a light editorial layout over a full-viewport dark hero
- Store1920 red `#E52721` as accent; keep logo from `STORE1920_LOGO_PATH`
- Mobile and desktop both readable; do not smash Arabic headlines

## Do not

- Move About Us into `/store/**`
- Duplicate a second public About route
- Soften or invent policy claims
- Drop bilingual support

## When editing

- [ ] `en` and `ar` updated together
- [ ] One H1 remains
- [ ] Footer / sitemap still point to `/about-us`
- [ ] Legal names and license stay sourced from helpers
