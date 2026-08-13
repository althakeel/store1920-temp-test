# Mobile Features — App Home Banners

Documentation for **mobile app home banners only** — dashboard setup and public APIs used by the Flutter / native app.

These banners are **not** rendered on the website. The website keeps its own showcase (`/api/public/shop-showcase`). The large hero API can optionally **mirror** website banners when that option is enabled in the dashboard.

| Item | Detail |
|------|--------|
| **Base URL** | `https://store1920.com` |
| **Dashboard hub** | `/store/mobile-features` |
| **Audience** | Android / iOS app home screen |
| **Website** | Not shown on the site (API-only for the app) |

Related (broader home / shopper APIs — not required for banners):
- [MOBILE_HOME_PAGE_APIS.md](./MOBILE_HOME_PAGE_APIS.md)
- [MOBILE_APP_API.md](./MOBILE_APP_API.md)

---

## 1. Four banner sections

Recommended home order (top → bottom):

| # | Section | Dashboard path | Public GET | Max items | Height |
|---|---------|----------------|------------|-----------|--------|
| 1 | Large hero slider | `/store/mobile-features/banners` | `/api/store/mobile-banner-slider` | 8 | `heightPx` default **168** (range 100–400) |
| 2 | Small promo strips | `/store/mobile-features/small-banners` | `/api/store/mobile-small-banners` | 12 | `heightPx` default **68** (range 40–200) |
| 3 | Promo cards | `/store/mobile-features/promo-cards` | `/api/store/mobile-promo-cards` | 8 | `heightPx` default **132** (range 80–300) |
| 4 | Category tiles | `/store/mobile-features/tile-banners` | `/api/store/mobile-tile-banners` | 12 | Layout only (2 per row) — no `heightPx` |

**Hide rule:** if `enabled === false` **or** the `slides` / `tiles` array is empty → **do not render** that section.

**Combined bag (optional):** one call for all four sections (+ `homeLayout`):

```http
GET /api/public/mobile-features
GET /api/public/mobile-features?storeId={storeId}
```

---

## 2. Auth             

| Method | Who | Auth |
|--------|-----|------|
| `GET` (section APIs + public bag) | App | **Public** — no Bearer token |
| `POST` / `PUT` (save section) | Seller dashboard | `Authorization: Bearer <Firebase ID token>` |

Optional query on GETs: `?storeId=` — otherwise the featured / default store preference is used.

Cache headers on public GETs: ~60s (`s-maxage`), with stale-while-revalidate.

---

## 3. Response shapes

### 3.1 Hero / small / promo (slides)

```json
{
  "enabled": true,
  "slideIntervalSeconds": 4,
  "heightPx": 168,
  "slides": [
    {
      "image": "https://cdn.example.com/banner.jpg",
      "link": "/offers",
      "path": "/offers",
      "title": "Festival Sale"
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `enabled` | boolean | `false` or empty `slides` → hide section |
| `slideIntervalSeconds` | number | Auto-play interval; clamped **2–30**, default **4** |
| `heightPx` | number | Widget height in logical pixels (see ranges above) |
| `slides[].image` | string | Required for a slide to appear publicly |
| `slides[].link` | string | Destination (same as `path` after normalize) |
| `slides[].path` | string | Prefer this for navigation (`path ?? link`) |
| `slides[].title` | string | Optional label / accessibility |

**Promo cards only** — each slide may also include:

```json
"showAdBadge": true
```

**Large hero only** — response may include:

```json
"source": "mobile-features"
```

or `"website-shop-showcase"` / `"website-shop-showcase-mirror"` when mirroring website Customize banners. The app can ignore `source`; treat the payload the same either way.

### 3.2 Category tiles

```json
{
  "enabled": true,
  "tiles": [
    {
      "title": "New in",
      "subtitle": "This week",
      "buttonText": "Shop",
      "image": "https://cdn.example.com/tile.jpg",
      "link": "/shop",
      "path": "/shop"
    }
  ]
}
```

No `heightPx` or `slideIntervalSeconds`. Render as a **2-column** grid.

| Field | Type | Notes |
|-------|------|--------|
| `tiles[].title` | string | Primary label |
| `tiles[].subtitle` | string | Secondary text |
| `tiles[].buttonText` | string | CTA label (default `"Shop"`) |
| `tiles[].image` | string | Required to appear publicly |
| `tiles[].link` / `path` | string | Tap destination |

### 3.3 Combined public bag

```http
GET /api/public/mobile-features
```

```json
{
  "success": true,
  "storeId": "...",
  "mobileFeatures": {
    "bannerSlider": { "enabled": true, "slideIntervalSeconds": 4, "heightPx": 168, "slides": [] },
    "smallBanners": { "enabled": true, "slideIntervalSeconds": 4, "heightPx": 68, "slides": [] },
    "promoCards": { "enabled": true, "slideIntervalSeconds": 4, "heightPx": 132, "slides": [] },
    "tileBanners": { "enabled": true, "tiles": [] },
    "homeLayout": { }
  }
}
```

For **banners only**, use `mobileFeatures.bannerSlider`, `.smallBanners`, `.promoCards`, and `.tileBanners`. You can ignore `homeLayout` unless you also build section ordering from it.

---

## 4. Navigation rules

Use **`path ?? link`** for every tap.

| Value | App behavior |
|-------|----------------|
| Starts with `/` (e.g. `/offers`, `/shop`) | In-app route |
| Starts with `http://` or `https://` | External / in-app browser |
| Empty (server normalizes to `/shop`) | Shop / catalog |

---

## 5. Website mirror (large hero only)

On `/store/mobile-features/banners`, sellers can enable **Use website home banners**.

| Mode | What `GET /api/store/mobile-banner-slider` returns |
|------|-----------------------------------------------------|
| Website mode on | Website Customize banner slider (`shopShowcase`), same shape as app slides |
| Website mode off | App-only slides edited in Mobile Features |
| App slides empty (fallback) | May still fall back to website showcase if available |

The app always calls the same endpoint; it does not need a separate website API for the hero when using mobile banner APIs.

---

## 6. Dashboard (seller)

Hub: **`/store/mobile-features`**

Per section editor:

- Enable / disable section
- Auto-slide interval (`slideIntervalSeconds`) — not for tiles
- Height (`heightPx`) — not for tiles
- Add / remove / reorder slides or tiles
- Image upload (client compression; max **4 MB** after compress)
- Promo cards: optional **Ad** badge (`showAdBadge`)
- Large hero: optional mirror of website home banners

Storage: `StorePreference.mobileFeatures` (keys: `bannerSlider`, `smallBanners`, `promoCards`, `tileBanners`).  
Legacy `banners.homeBanners` migrates into `bannerSlider`.

---

## 7. Flutter / native checklist

1. On home load, call all four GETs (no auth), **or** one `GET /api/public/mobile-features`.
2. Skip any section where `enabled` is false or `slides` / `tiles` is empty.
3. Set carousel / banner widget height from `heightPx` (hero, small, promo).
4. Auto-play with `slideIntervalSeconds` (2–30).
5. Navigate with `path ?? link`.
6. Promo cards: show an Ad badge when `showAdBadge === true`.
7. Tiles: 2 columns; use `title`, `subtitle`, `buttonText`, image, and path.
8. Cache images; handle empty lists and network errors without crashing the home screen.

---

## 8. Endpoint summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/store/mobile-banner-slider` | Public | Large hero slides |
| `GET` | `/api/store/mobile-small-banners` | Public | Small strips |
| `GET` | `/api/store/mobile-promo-cards` | Public | Promo cards (+ optional Ad badge) |
| `GET` | `/api/store/mobile-tile-banners` | Public | Category tiles |
| `GET` | `/api/public/mobile-features` | Public | All four (+ `homeLayout`) |
| `POST`/`PUT` | same `/api/store/mobile-*` paths | Seller Bearer | Save that section |

---

## 9. Code map

```
app/store/mobile-features/              ← hub + section editors
app/api/store/mobile-banner-slider/     ← hero
app/api/store/mobile-small-banners/     ← strips
app/api/store/mobile-promo-cards/       ← promo
app/api/store/mobile-tile-banners/      ← tiles
app/api/public/mobile-features/         ← combined public bag
lib/mobileBannerLayout.js               ← clamps, normalize, public payload
lib/mobileFeatures.js                   ← storage merge + website mirror resolve
lib/mobileBannerApi.js                  ← GET/POST/PUT handlers
proxy.ts                                ← public GET allowlist
```
