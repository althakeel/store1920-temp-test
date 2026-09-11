# Google Merchant Center — Misrepresentation Compliance

**Status context:** UAE products blocked for Misrepresentation (review requested Jul 10, 2026).  
**Store:** https://store1920.com  
**Legal entity:** ALTHAKEEL GENERAL TRADING L.L.C (License 641210)  
**Last updated:** 2026-09-11

Use this checklist before you request another Merchant Center review. Website changes alone are not enough — **Merchant Center Business information must match the website exactly**.

---

## 1. What Google asked for

| Area | Website action |
|------|----------------|
| Transparency | Legal name, license, address, phone, email, policies, contact paths |
| Reputation | Reviews on product pages; clear About / Business Information |
| Store design & SSL | HTTPS site; professional footer with contact + policies |
| Merchant Center settings | Fill Business information identically to the site |
| Data consistency | Feed price/availability/title/link match product pages |

Official policy: [Misrepresentation](https://support.google.com/merchants/answer/6150127)

---

## 2. Website pages Google should crawl

| Page | URL |
|------|-----|
| Business Information | https://store1920.com/business-information |
| About Us | https://store1920.com/about-us |
| Contact Us | https://store1920.com/contact-us |
| Shipping Policy | https://store1920.com/shipping-policy |
| Return Policy | https://store1920.com/return-policy |
| Privacy Policy | https://store1920.com/privacy-policy |
| Terms & Conditions | https://store1920.com/terms-and-conditions |
| Terms of Sale | https://store1920.com/terms-of-sale |
| Product feed | https://store1920.com/api/feeds/google-merchant |

Footer on every page must show (as **text**, not only images): legal/brand name, phone, email, physical address, policy links.

---

## 3. Identity values to copy into Merchant Center

Keep these **identical** in GMC → Business information, Google Business Profile, and the website (`lib/businessIdentity.js`):

| Field | Value |
|-------|--------|
| Legal name | ALTHAKEEL GENERAL TRADING L.L.C |
| Brand / store name | Store1920 |
| Trade license | 641210 |
| Commercial register | 1994147 |
| Phone | 8007861920 |
| Email | support@store1920.com |
| Registered office | Dubai office exactly as printed on the DED trade licence (see `STORE1920_REGISTERED_OFFICE_*` in `lib/businessIdentity.js`) |
| Fulfilment and returns | Warehouse No. 1, 18 Maleha St, Industrial Area, Sharjah, United Arab Emirates |
| Country | United Arab Emirates (AE) |
| Hours | Sunday – Thursday, 9:00 AM – 6:00 PM (UAE time) |
| Website | https://store1920.com |

---

## 4. Pre-appeal checklist

### Merchant Center (manual)

- [ ] Business name / address / phone / email match the site
- [ ] Return policy URL: `https://store1920.com/return-policy`
- [ ] Shipping settings match `/shipping-policy` and checkout fees
- [ ] Website claimed & verified
- [ ] Active product feed still submitted (do not delete feed while suspended)
- [ ] Customer service phone reaches a real line / voicemail with business name

### Website (code — implemented)

- [x] `/business-information` with license + registered office + fulfilment/returns + phone + hours
- [x] Footer contact: phone, email, registered office and fulfilment/returns (text)
- [x] Contact page: phone, email, address, hours, legal name
- [x] Checkout links: terms, sale, privacy, **shipping**, **returns**
- [x] Product buybox links to shipping + return policies
- [x] Privacy policy covers cookies, ads/personalization, data rights
- [x] Organization JSON-LD includes address + telephone
- [x] Merchant feed URL available

### Product data

- [ ] Spot-check 10–20 products: title, price (AED), availability, image, landing URL match feed
- [ ] No fake urgency / fake stock counters that contradict inventory
- [ ] Landing pages load over HTTPS without soft 404s

---

## 5. After deploying website fixes

1. Wait for production deploy (HTTPS live).
2. Open the pages above in an incognito window and confirm address/phone are visible as text.
3. Update Merchant Center Business information to match section 3.
4. Request a new review in Merchant Center (do **not** create a new GMC account).
5. In the appeal notes, point reviewers to:
   - `https://store1920.com/business-information`
   - `https://store1920.com/contact-us`
   - Policy URLs in section 2
   - That Store1920 is operated by ALTHAKEEL GENERAL TRADING L.L.C, UAE license 641210

---

## 6. Do not

- Create a second Merchant Center / Ads account to bypass the suspension
- Delete the product feed while appealing
- Put contact details only inside images or PDFs
- Use a different phone/address in GMC than on the website
