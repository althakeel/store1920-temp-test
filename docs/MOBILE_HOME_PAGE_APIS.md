# Mobile App — Homepage APIs

**Purpose:** Same APIs the **website homepage** uses, mapped for the **mobile app home screen**.  
**Base URL:** `https://store1920.com`  
**Last updated:** 2026-07-23

Related:
- **Master API guide (home + all shopper):** [STORE1920_FULL_API.md](./STORE1920_FULL_API.md)
- Full shopper API: [MOBILE_APP_API.md](./MOBILE_APP_API.md)
- App banners: [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md)
- Overview: [API_OVERVIEW.md](./API_OVERVIEW.md)
- Docs index: [README.md](./README.md)

---

## 1. Quick rule

| Website homepage piece | Mobile app should |
|------------------------|-------------------|
| Hero / banner sliders / showcase image banners | Prefer **`GET /api/public/shop-showcase`** (same as website) **or** `GET /api/store/mobile-banner-slider` (mirrors showcase when “Use website home banners” is on) |
| Product grids, categories, deals, featured sections | Use the **same public APIs** as the website |
| Navbar / footer / website chrome | Skip (native app UI) |

---

## 2. Call order for mobile home (copy this)

```
1. GET /api/public/tracking-context
      → storeId

2. In parallel:
   GET /api/store/mobile-banner-slider          ← large hero
   GET /api/store/mobile-small-banners
   GET /api/store/mobile-promo-cards
   GET /api/store/mobile-tile-banners
   — or instead —
   GET /api/public/mobile-features?storeId={storeId}
   plus:
   GET /api/store/featured-products?includeProducts=true&limit=12
   GET /api/home/sections
   GET /api/public/featured-sections
   GET /api/store/home-menu-categories
   GET /api/store/explore-interests/public
   GET /api/categories

3. If products missing from sections:
   POST /api/products/batch   { "productIds": ["..."] }
   and/or GET /api/products?limit=12&slim=true

4. After login (optional):
   GET /api/browse-history
```

**Do not skip for mobile home banners:**  
`GET /api/public/shop-showcase` is the **same** website home showcase API — the app can use it directly.  
`GET /api/store/mobile-banner-slider` returns the same website banner slider when “Use website home banners” is enabled in `/store/mobile-features/banners`.

---

## 3. Website homepage → mobile API map

Website home: `app/(public)/page.jsx` → `HomePageClient` sections.

| # | Website section | Website API(s) | Mobile app API | Same? |
|---|-----------------|----------------|----------------|-------|
| 1 | Hero banner | `/api/public/shop-showcase` | Four mobile banner APIs or `/api/public/mobile-features` | **Replace** |
| 2 | Shop showcase banners | `/api/public/shop-showcase` | Same as above | **Replace** |
| 3 | Primary / secondary banner sliders | `/api/public/shop-showcase` | Same as above | **Replace** |
| 4 | Home category icons | `/api/store/home-menu-categories` | Same | **Same** |
| 5 | Featured / top picks products | `/api/store/featured-products?includeProducts=true` | Same | **Same** |
| 5b | Featured layout | `/api/store/appearance/sections/public` | Same (optional) | **Same** |
| 6 | Top deals | `/api/home/sections` + `/api/products` or `/api/products/batch` | Same | **Same** |
| 7 | Category / featured sliders | `/api/public/featured-sections` (+ batch if needed) | Same | **Same** |
| 8 | Explore your interests | `/api/store/explore-interests/public` + `/api/categories` + `/api/products` | Same | **Same** |
| 9 | Recently viewed | `/api/browse-history` (Bearer) | Same when logged in | **Same** |
| 10 | Recommended products | `/api/store/explore-interests/public` + `/api/products/batch` | Same | **Same** |

---

## 4. APIs to implement on mobile home

### A. App-only banners (from Store → Mobile Features)

See full overview: [MOBILE_FEATURES_DOCUMENTATION.md](./MOBILE_FEATURES_DOCUMENTATION.md).

```http
GET /api/store/mobile-banner-slider
GET /api/store/mobile-small-banners
GET /api/store/mobile-promo-cards
GET /api/store/mobile-tile-banners
GET /api/public/mobile-features
GET /api/public/mobile-features?storeId={storeId}
```

**Auth:** none on GET  

**Section response (hero / small / promo example):**

```json
{
  "enabled": true,
  "slideIntervalSeconds": 4,
  "heightPx": 168,
  "slides": [
    {
      "image": "https://...",
      "link": "/shop",
      "path": "/shop",
      "title": "Sale"
    }
  ]
}
```

**Combined bag** includes `bannerSlider`, `smallBanners`, `promoCards`, `tileBanners`, and **`homeLayout`**
(ordered list of website-same + app sections with `enabled`, `path`, `method` for the Flutter home screen).

Seller configures order by drag-and-drop at `/store/mobile-features`.

---

### B. Same as website — use these

| Method | Endpoint | Home UI |
|--------|----------|---------|
| `GET` | `/api/public/tracking-context` | Bootstrap `storeId` |
| `GET` | `/api/store/home-menu-categories` | Category icon row |
| `GET` | `/api/store/featured-products?includeProducts=true&limit=12` | Featured product grid |
| `GET` | `/api/store/appearance/sections/public` | Optional layout flags |
| `GET` | `/api/home/sections` | Top Deals / home section config |
| `GET` | `/api/public/featured-sections` | Horizontal category/product sliders |
| `GET` | `/api/store/explore-interests/public` | Explore interests + recommended IDs |
| `GET` | `/api/categories` | Category chips / tree |
| `GET` | `/api/products?limit=12` (or with `category=`, `slim=true`) | Product lists |
| `POST` | `/api/products/batch` | Body `{ "productIds": ["..."] }` hydrate cards |
| `GET` | `/api/browse-history` | Recently viewed — **Bearer** required |

---

### C. Website-only — skip on mobile home

| Endpoint | Why skip |
|----------|----------|
| `GET /api/public/shop-showcase` | Website banners / showcase layout |
| `GET /api/store/navbar-menu` | Website navbar |
| `GET /api/store/settings` | Website chrome |
| `GET /api/store/navbar-menu` (footer) | Website footer |

---

## 5. Example responses (what you need)

### Featured products

```http
GET /api/store/featured-products?includeProducts=true&limit=12
```

Use returned `products` (or `productIds` + batch).

### Featured sections (category sliders)

```http
GET /api/public/featured-sections
```

Each section usually includes title, image, and products / product IDs.

### Home sections (Top Deals)

```http
GET /api/home/sections
```

If a section has `productIds` but no products, call:

```http
POST /api/products/batch
Content-Type: application/json

{ "productIds": ["6a3a...", "6a3b..."] }
```

### Categories

```http
GET /api/categories
```

Tree with `children` for chips / navigation.

---

## 6. Suggested mobile home layout

| Order | Block | API |
|------:|-------|-----|
| 1 | Large hero slider | `/api/store/mobile-banner-slider` |
| 2 | Small promo strips | `/api/store/mobile-small-banners` |
| 3 | Promo cards | `/api/store/mobile-promo-cards` |
| 4 | Category tiles | `/api/store/mobile-tile-banners` |
| 5 | Category icons | `/api/store/home-menu-categories` |
| 6 | Featured products | `/api/store/featured-products?includeProducts=true` |
| 7 | Top deals | `/api/home/sections` + products/batch |
| 8 | Featured / category sliders | `/api/public/featured-sections` |
| 9 | Explore interests | `/api/store/explore-interests/public` + `/api/categories` |
| 10 | Recently viewed | `/api/browse-history` (logged in) |
| 11 | Recommended | explore-interests public + `/api/products/batch` |

---

## 7. Checklist for mobile developers

- [ ] Call `tracking-context` once and cache `storeId`
- [ ] Load the four banner section GETs (or `/api/public/mobile-features`)
- [ ] Skip a section when `enabled` is false or `slides`/`tiles` is empty
- [ ] Do **not** drive the app home slider from `/api/public/shop-showcase`
- [ ] Parallel-fetch product/section APIs listed in section 2
- [ ] Use `/api/products/batch` whenever you only have IDs
- [ ] Pass `Accept-Language: ar` or `en` when you want localized product names
- [ ] After login, load `/api/browse-history` for recently viewed

---

## 8. Full shopper API

For cart, checkout, orders, wishlist, payments, etc. see [MOBILE_APP_API.md](./MOBILE_APP_API.md).  
This document is **homepage / home screen only**.
