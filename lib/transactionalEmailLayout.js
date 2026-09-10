import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { emailLogoHeader } from '@/lib/brandLogo';
import { getProductAbsoluteUrl } from '@/lib/productUrl';
import { getStoreOrderDisplayItems, formatStoreOrderLineSubtitle } from '@/lib/storeOrderLineItems';
import { getAbandonedCartDisplayItems } from '@/lib/abandonedCartLineItems';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';
import { getCustomerSiteUrl } from '@/lib/appUrl';

const BASE_URL = getCustomerSiteUrl();

const PAYMENT_METHOD_LABELS = {
  COD: 'Cash on Delivery',
  CARD: 'Card',
  STRIPE: 'Stripe',
  TABBY: 'Tabby',
  TAMARA: 'Tamara',
  WALLET: 'Wallet',
  RAZORPAY: 'Razorpay',
};

export function formatPaymentMethodForEmail(method = '') {
  const key = String(method || '').trim().toUpperCase();
  return PAYMENT_METHOD_LABELS[key]
    || (key ? key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
}

function toAbsoluteAssetUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export const EMAIL_CONTENT_MAX_WIDTH = 620;

export function emailHasPageLayout(html = '') {
  if (typeof html !== 'string') return false;
  return /max-width:\s*(?:600|620|640)px/i.test(html);
}

export function ensureEmailPageLayout(html = '') {
  if (typeof html !== 'string' || !html.trim()) return html;
  if (emailHasPageLayout(html)) return html;

  const width = EMAIL_CONTENT_MAX_WIDTH;
  const trimmed = html.trim();
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1].trim() : trimmed;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @media only screen and (max-width: ${width}px) {
      .store1920-email-shell { padding: 20px 12px !important; }
      .store1920-email-container { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="store1920-email-shell" style="background:#f5f5f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="store1920-email-container" style="max-width:${width}px;width:100%;background:#ffffff;padding:32px 24px;">
          <tr>
            <td style="font-size:15px;line-height:1.7;color:#444444;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatEmailMoney(amount, currency = 'AED') {
  const num = Number(amount) || 0;
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEmailDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function fetchFastSellingProductsForEmail(limit = 4) {
  try {
    await connectDB();
    const products = await Product.find({
      ...STOREFRONT_PUBLISHED_FILTER,
      inStock: { $ne: false },
    })
      .select('name slug price AED images useProductsPath tags')
      .sort({ createdAt: -1 })
      .limit(Math.max(limit * 3, 12))
      .lean();

    const ranked = [...products].sort((a, b) => {
      const aBoost = /best.?seller|top.?sell|bestseller/i.test((a.tags || []).join(' ')) ? 1 : 0;
      const bBoost = /best.?seller|top.?sell|bestseller/i.test((b.tags || []).join(' ')) ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return ranked.slice(0, limit).map((product) => ({
      _id: product._id,
      name: product.name,
      slug: product.slug,
      price: product.price ?? product.AED,
      image: Array.isArray(product.images) ? product.images[0] : '',
      useProductsPath: product.useProductsPath,
    }));
  } catch (error) {
    console.error('[transactionalEmailLayout] fast-selling fetch failed:', error);
    return [];
  }
}

export function formatEmailLineQuantityLabel(item = {}) {
  if (item.quantityLabel) return item.quantityLabel;

  const product = item.productId && typeof item.productId === 'object' ? item.productId : null;
  return formatStoreOrderLineSubtitle(item, product, null);
}

function stripBundleFromVariantLabel(label = '') {
  return String(label || '')
    .replace(/\s*·?\s*Bundle\s+\d+\s*$/i, '')
    .replace(/^Bundle\s+\d+\s*·?\s*/i, '')
    .trim();
}

function mapDisplayItemForEmail(item = {}) {
  const variantLabel = String(item.variantLabel || '').trim();
  const extraVariant = item.isBulkBundle ? stripBundleFromVariantLabel(variantLabel) : variantLabel;

  return {
    name: item.name,
    subtitle: extraVariant,
    image: toAbsoluteAssetUrl(item.image || ''),
    quantity: item.isBulkBundle ? item.packQuantity : item.quantity,
    packQuantity: item.packQuantity,
    bundleUnits: item.bundleUnits,
    isBulkBundle: item.isBulkBundle,
    quantityLabel: formatEmailLineQuantityLabel(item),
    price: item.price,
    lineTotal: item.lineTotal,
  };
}

export function renderEmailItemsList(items = [], { currency = 'AED', label = 'ITEMS ORDERED' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const rows = items.map((item) => {
    const name = escapeHtml(item?.name || item?.productName || 'Product');
    const variant = escapeHtml(item?.variant || item?.subtitle || '');
    const qtyDisplay = escapeHtml(item?.quantityLabel || formatEmailLineQuantityLabel(item));
    const lineTotal = Number(item?.lineTotal ?? ((item?.price || 0) * Number(item?.quantity || 1)));
    const image = toAbsoluteAssetUrl(item?.image || item?.images?.[0] || '');

    return `
      <tr>
        <td style="padding:18px 0;border-bottom:1px solid #e8e8e8;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="72" style="vertical-align:top;padding-right:16px;">
                ${image
                  ? `<img src="${escapeHtml(image)}" alt="${name}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border:1px solid #efefef;" />`
                  : `<div style="width:64px;height:64px;background:#f4f4f4;border:1px solid #efefef;"></div>`}
              </td>
              <td style="vertical-align:top;">
                <div style="font-size:15px;font-weight:700;color:#111111;line-height:1.4;">${name}</div>
                ${variant ? `<div style="font-size:13px;color:#8a8a8a;margin-top:4px;">${variant}</div>` : ''}
              </td>
              <td width="130" style="vertical-align:top;text-align:right;">
                <div style="font-size:13px;color:#8a8a8a;line-height:1.4;">${qtyDisplay}</div>
                <div style="font-size:15px;font-weight:700;color:#111111;margin-top:4px;">${formatEmailMoney(lineTotal, currency)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="margin:32px 0 0;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;margin-bottom:12px;">${escapeHtml(label)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
    </div>
  `;
}

export function renderEmailTotals(rows = [], { currency = 'AED' } = {}) {
  if (!rows.length) return '';
  const lines = rows.map((row, index) => {
    const isTotal = row.isTotal || index === rows.length - 1;
    return `
      <tr>
        <td style="padding:${isTotal ? '14px 0 0' : '8px 0 0'};font-size:${isTotal ? '16px' : '14px'};color:${isTotal ? '#111111' : '#666666'};font-weight:${isTotal ? '700' : '400'};">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:${isTotal ? '14px 0 0' : '8px 0 0'};font-size:${isTotal ? '16px' : '14px'};color:#111111;text-align:right;font-weight:${isTotal ? '700' : '500'};white-space:nowrap;">
          ${typeof row.value === 'string' ? row.value : formatEmailMoney(row.value, currency)}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:28px;">
      ${lines}
    </table>
  `;
}

export function renderEmailAddressColumns({ billing, shipping } = {}) {
  if (!billing && !shipping) return '';

  const renderBlock = (title, block) => {
    if (!block) return '<td width="50%" style="vertical-align:top;"></td>';
    const lines = (block.lines || []).filter(Boolean).map((line) => `<div style="font-size:14px;line-height:1.7;color:#444444;">${line}</div>`).join('');
    return `
      <td width="50%" style="vertical-align:top;padding-right:12px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;margin-bottom:10px;">${escapeHtml(title)}</div>
        ${lines}
      </td>
    `;
  };

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:36px;">
      <tr>
        ${renderBlock('BILLING INFO', billing)}
        ${renderBlock('SHIPPING ADDRESS', shipping)}
      </tr>
    </table>
  `;
}

export function renderEmailCta({ label, href, align = 'left' } = {}) {
  if (!label || !href) return '';
  return `
    <div style="margin:28px 0;text-align:${align};">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:14px 28px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
        ${escapeHtml(label)}
      </a>
    </div>
  `;
}

function renderFastSellingProductCard(product, { cardWidth = '100%' } = {}) {
  const name = escapeHtml(product.name || 'Product');
  const image = toAbsoluteAssetUrl(product.image || '');
  const url = getProductAbsoluteUrl(product, BASE_URL);
  const price = formatEmailMoney(product.price || 0);

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="${cardWidth}" style="width:${cardWidth};border:1px solid #e8e8e8;border-collapse:separate;background:#ffffff;">
      <tr>
        <td style="padding:0;background:#f8f8f8;">
          <a href="${escapeHtml(url)}" style="text-decoration:none;display:block;line-height:0;">
            ${image
              ? `<img src="${escapeHtml(image)}" alt="${name}" width="260" height="160" style="display:block;width:100%;max-width:100%;height:160px;object-fit:cover;border:0;" />`
              : `<div style="width:100%;height:160px;background:#f0f0f0;"></div>`}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 12px 14px;vertical-align:top;">
          <a href="${escapeHtml(url)}" style="display:block;font-size:13px;font-weight:700;color:#111111;text-decoration:none;line-height:1.35;min-height:36px;">${name}</a>
          <div style="margin-top:8px;font-size:14px;font-weight:700;color:#111111;">${price}</div>
          <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:8px;font-size:12px;color:#666666;text-decoration:underline;font-weight:600;">Shop now</a>
        </td>
      </tr>
    </table>
  `;
}

export function renderFastSellingProducts(products = []) {
  if (!Array.isArray(products) || products.length === 0) return '';

  const items = products.slice(0, 6);
  const mobileSliderCells = items.map((product) => `
    <td class="fast-selling-slide" style="width:148px;min-width:148px;padding-right:12px;vertical-align:top;">
      ${renderFastSellingProductCard(product, { cardWidth: '148px' })}
    </td>
  `).join('');

  const gridRows = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];
    gridRows.push(`
      <tr>
        <td width="50%" style="width:50%;padding:${index === 0 ? '0' : '12px'} 6px 0 0;vertical-align:top;">
          ${renderFastSellingProductCard(left)}
        </td>
        <td width="50%" style="width:50%;padding:${index === 0 ? '0' : '12px'} 0 0 6px;vertical-align:top;">
          ${right ? renderFastSellingProductCard(right) : '&nbsp;'}
        </td>
      </tr>
    `);
  }

  return `
    <div style="margin-top:40px;padding-top:28px;border-top:1px solid #e8e8e8;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;margin-bottom:16px;">FAST SELLING PRODUCTS</div>

      <div class="fast-selling-mobile" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        <div style="overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding-bottom:4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:100%;">
            <tr>
              ${mobileSliderCells}
            </tr>
          </table>
        </div>
      </div>

      <div class="fast-selling-desktop" style="display:block;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
          ${gridRows.join('')}
        </table>
      </div>

      <div style="margin-top:18px;text-align:center;">
        <a href="${BASE_URL}/top-selling" style="font-size:13px;color:#111111;text-decoration:underline;font-weight:600;">View all top sellers</a>
      </div>
    </div>
  `;
}

export function renderEmailSupportFooter({
  message = "If you need help with anything please don't hesitate to drop us an email:",
} = {}) {
  return `
    <div style="margin-top:36px;padding-top:24px;border-top:1px solid #e8e8e8;font-size:14px;line-height:1.8;color:#666666;">
      <p style="margin:0 0 8px;">${escapeHtml(message)}</p>
      <p style="margin:0;">
        <a href="mailto:${STORE1920_SUPPORT_EMAIL}" style="color:#111111;text-decoration:underline;font-weight:600;">${STORE1920_SUPPORT_EMAIL}</a>
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#9a9a9a;">© ${new Date().getFullYear()} Store1920. All rights reserved.</p>
    </div>
  `;
}

export function buildLoginOtpEmailHtml({
  code = '',
  minutes = 10,
  name = '',
  title = 'Your login code',
  intro = 'Use this one-time code to finish signing in. Do not share it with anyone.',
  preheader = '',
} = {}) {
  const digits = String(code || '').replace(/\D/g, '');
  const boxes = digits.split('').map((digit) => `
    <td align="center" valign="middle" width="46" style="width:46px;padding:0 3px;">
      <div style="width:44px;height:52px;line-height:52px;border:1px solid #ddd6fe;background:#f5f3ff;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#5b21b6;">
        ${escapeHtml(digit)}
      </div>
    </td>
  `).join('');

  return wrapTransactionalEmail({
    title,
    preheader: preheader || `Your Store1920 code expires in ${minutes} minutes.`,
    greeting: name || '',
    intro,
    includeFastSelling: false,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 0;border-collapse:separate;">
        <tr>${boxes}</tr>
      </table>
      <p style="margin:16px 0 0;text-align:center;font-size:13px;color:#6b6b6b;">Expires in ${minutes} minutes</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#666666;">If you did not request this code, you can ignore this email. Your account stays secure.</p>
    `,
  });
}

export function wrapTransactionalEmail({
  title,
  preheader = '',
  greeting,
  intro = '',
  orderNo = '',
  orderDate = '',
  bodyHtml = '',
  promoProducts = null,
  includeFastSelling = true,
} = {}) {
  const promoSection = includeFastSelling
    ? renderFastSellingProducts(Array.isArray(promoProducts) ? promoProducts : [])
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>` : ''}
  <style>
    @media only screen and (max-width: 519px) {
      .fast-selling-mobile { display: block !important; max-height: none !important; overflow: visible !important; }
      .fast-selling-desktop { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:${EMAIL_CONTENT_MAX_WIDTH}px;width:100%;background:#ffffff;padding:40px 32px 36px;">
          <tr>
            <td style="text-align:center;padding:8px 0 24px;border-bottom:1px solid #eeeeee;">
              ${emailLogoHeader({ maxWidth: 108, href: BASE_URL })}
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;font-weight:700;color:#111111;">${escapeHtml(title)}</h1>
              ${greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#444444;">Hey ${escapeHtml(greeting)},</p>` : ''}
              ${intro ? `<p style="margin:0;font-size:15px;line-height:1.7;color:#444444;">${intro}</p>` : ''}
              ${orderNo ? `
                <div style="margin-top:28px;">
                  <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#111111;font-weight:700;">ORDER NO. ${escapeHtml(orderNo)}</div>
                  ${orderDate ? `<div style="font-size:13px;color:#8a8a8a;margin-top:6px;">${escapeHtml(orderDate)}</div>` : ''}
                </div>
              ` : ''}
              ${bodyHtml}
              ${promoSection}
              ${renderEmailSupportFooter()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function buildTransactionalEmail(options = {}) {
  const promoProducts = options.promoProducts
    ?? (options.includeFastSelling === false ? [] : await fetchFastSellingProductsForEmail(options.promoLimit || 6));
  return wrapTransactionalEmail({ ...options, promoProducts });
}

export function resolveEmailShippingAddress(order = {}, overrides = {}) {
  const shipping = order?.shippingAddress || order?.address || {};
  const user = order?.userId && typeof order.userId === 'object' ? order.userId : null;

  return {
    name: String(overrides.name || order?.guestName || shipping?.name || user?.name || '').trim(),
    email: String(overrides.email || order?.guestEmail || shipping?.email || user?.email || '').trim(),
    phone: String(shipping?.phone || order?.guestPhone || '').trim(),
    phoneCode: String(shipping?.phoneCode || order?.alternatePhoneCode || '+971').trim(),
    street: String(shipping?.street || shipping?.address || '').trim(),
    district: String(shipping?.district || '').trim(),
    city: String(shipping?.city || shipping?.district || '').trim(),
    state: String(shipping?.state || '').trim(),
    zip: String(shipping?.zip || shipping?.pincode || '').trim(),
    country: String(shipping?.country || 'United Arab Emirates').trim(),
  };
}

export function mapOrderItemsForEmail(orderItems = [], order = {}) {
  const pseudoOrder = {
    ...order,
    orderItems: Array.isArray(orderItems) ? orderItems : [],
  };

  return getStoreOrderDisplayItems(pseudoOrder)
    .map(mapDisplayItemForEmail)
    .filter((item) => item.name);
}

export function mapCartItemsForEmail(items = [], cartContext = {}) {
  const cart = {
    ...cartContext,
    items: Array.isArray(items) ? items : [],
    cartTotal: cartContext.cartTotal ?? cartContext.total ?? null,
  };

  return getAbandonedCartDisplayItems(cart)
    .map(mapDisplayItemForEmail)
    .filter((item) => item.name);
}

export function buildAddressBlock(address = {}, fallbackName = '') {
  if (!address || typeof address !== 'object') return null;

  const name = escapeHtml(address.name || fallbackName || '');
  const street = escapeHtml(address.street || address.address || '');

  const localityParts = [...new Set(
    [address.district, address.city, address.state].map((part) => String(part || '').trim()).filter(Boolean),
  )];
  const zip = String(address.zip || address.pincode || '').trim();
  let localityLine = '';
  if (localityParts.length) {
    localityLine = escapeHtml(zip ? `${localityParts.join(', ')} - ${zip}` : localityParts.join(', '));
  } else if (zip) {
    localityLine = escapeHtml(zip);
  }

  const country = escapeHtml(address.country || '');
  const emailLine = address.email
    ? `<a href="mailto:${escapeHtml(address.email)}" style="color:#111111;text-decoration:underline;">${escapeHtml(address.email)}</a>`
    : '';
  const phone = address.phone
    ? escapeHtml(`${address.phoneCode || '+971'} ${address.phone}`.trim())
    : '';

  const lines = [
    name,
    street,
    localityLine,
    country,
    emailLine,
    phone ? `Phone: ${phone}` : '',
  ].filter(Boolean);

  return lines.length ? { lines } : null;
}
