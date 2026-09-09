import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { STORE1920_LOGO_SRC } from '@/lib/brandLogo';
import { getDisplayOrderNumber, getOrderCustomerDisplayName, getOrderLineProduct } from '@/lib/orderDisplay';
import { normalizeImportedOrderItems } from '@/lib/importedOrderItems';

const PAYMENT_METHOD_LABELS = {
  COD: 'Cash on Delivery',
  CARD: 'Card',
  STRIPE: 'Stripe',
  TABBY: 'Tabby',
  TAMARA: 'Tamara',
  WALLET: 'Wallet',
  RAZORPAY: 'Razorpay',
};

const ORDER_STATUS_LABELS = {
  ORDER_PLACED: 'Order Placed',
  PROCESSING: 'Processing',
  WAITING_FOR_PICKUP: 'Waiting For Pickup',
  PICKUP_REQUESTED: 'Pickup Requested',
  PICKED_UP: 'Picked Up',
  WAREHOUSE_RECEIVED: 'Warehouse Received',
  SHIPPED: 'Shipped / In Transit',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PAYMENT_FAILED: 'Payment Failed',
  RETURNED: 'Returned',
  RTO: 'RTO (Not Collected)',
  RETURN: 'Return (After Delivery)',
  REPLACEMENT: 'Replacement (After Delivery)',
  RETURN_INITIATED: 'Return Initiated',
  RETURN_APPROVED: 'Return Approved',
};

function formatPaymentMethodLabel(method = '') {
  const key = String(method || '').trim().toUpperCase();
  return PAYMENT_METHOD_LABELS[key] || (key ? key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
}

function formatOrderStatusLabel(status = '') {
  const key = String(status || '').trim().toUpperCase();
  if (ORDER_STATUS_LABELS[key]) return ORDER_STATUS_LABELS[key];
  return key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveInvoicePaymentStatus(order = {}) {
  const paymentStatus = String(order?.paymentStatus || '').trim().toUpperCase();
  if (paymentStatus === 'PAID' || order?.isPaid === true) return 'Paid';
  if (paymentStatus === 'PENDING') return 'Pending';
  if (paymentStatus === 'FAILED' || paymentStatus === 'PAYMENT_FAILED') return 'Failed';
  if (order?.isPaid === false) return 'Unpaid';
  return paymentStatus ? paymentStatus.replace(/_/g, ' ') : 'Pending';
}

function resolveInvoiceAddress(order = {}) {
  const shipping = order?.shippingAddress || order?.address || {};
  const user = order?.userId && typeof order.userId === 'object' ? order.userId : null;

  return {
    name: getOrderCustomerDisplayName(order),
    email: String(
      order?.guestEmail
      || shipping?.email
      || user?.email
      || '',
    ).trim(),
    street: String(shipping?.street || shipping?.address || '').trim(),
    district: String(shipping?.district || '').trim(),
    city: String(shipping?.city || shipping?.district || '').trim(),
    state: String(shipping?.state || '').trim(),
    zip: String(shipping?.zip || shipping?.pincode || '').trim(),
    country: String(shipping?.country || 'United Arab Emirates').trim(),
    phoneCode: String(shipping?.phoneCode || order?.alternatePhoneCode || '+971').trim(),
    phone: String(shipping?.phone || order?.guestPhone || '').trim(),
    alternatePhone: String(order?.alternatePhone || shipping?.alternatePhone || '').trim(),
    alternatePhoneCode: String(order?.alternatePhoneCode || shipping?.alternatePhoneCode || shipping?.phoneCode || '+971').trim(),
  };
}

function buildInvoiceAddressLines(address = {}) {
  const lines = [];

  if (address.street) lines.push(address.street);

  const localityParts = [...new Set([address.district, address.city, address.state].filter(Boolean))];
  if (localityParts.length) {
    const locality = localityParts.join(', ');
    lines.push(address.zip ? `${locality} - ${address.zip}` : locality);
  } else if (address.zip) {
    lines.push(address.zip);
  }

  if (address.country) lines.push(address.country);
  if (address.email) lines.push(address.email);

  return lines;
}

function resolveInvoiceLineItems(order = {}) {
  const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : [];
  const normalized = normalizeImportedOrderItems(rawItems);
  const sourceItems = normalized.length ? normalized : rawItems;

  return sourceItems.map((item) => {
    const product = getOrderLineProduct(item);
    const baseName = String(
      product?.name
      || item?.name
      || item?.productName
      || '',
    ).trim();
    const sku = String(product?.sku || item?.sku || '').trim();
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const price = Number(item?.price ?? product?.price ?? 0);

    return {
      name: baseName ? (sku ? `${baseName} (${sku})` : baseName) : (sku ? `Product (${sku})` : 'Product'),
      quantity,
      price,
      lineTotal: price * quantity,
    };
  }).filter((item) => item.quantity > 0);
}

function appendWrappedLines(doc, lines, x, startY, maxWidth, lineHeight = 5) {
  let y = startY;
  lines.forEach((line) => {
    const chunks = doc.splitTextToSize(String(line), maxWidth);
    chunks.forEach((chunk) => {
      doc.text(chunk, x, y);
      y += lineHeight;
    });
  });
  return y;
}

// Optional: read company details from public env vars (client-safe)
const COMPANY_NAME = process.env.NEXT_PUBLIC_INVOICE_COMPANY_NAME || "Store1920";
const COMPANY_ADDRESS_LINE1 = process.env.NEXT_PUBLIC_INVOICE_ADDRESS_LINE1 || "United Arab Emirates";
const COMPANY_ADDRESS_LINE2 = process.env.NEXT_PUBLIC_INVOICE_ADDRESS_LINE2 || "";
const COMPANY_CONTACT = process.env.NEXT_PUBLIC_INVOICE_CONTACT || "Email: support@Store1920.com";
// Keep ASCII-only to avoid emoji boxes if custom font fails to load
const THANK_YOU_LINE2 = process.env.NEXT_PUBLIC_INVOICE_QUOTE2 || "We hope you love your purchase!";

// Font config for proper AED rendering and better Unicode support
const CORE_FONT_NAME = 'helvetica';
const UNICODE_FONT_NAME = 'RobotoJPDF';
const UNICODE_FONT_REG_VFS = 'Roboto-Regular.ttf';
const UNICODE_FONT_REG_URL = process.env.NEXT_PUBLIC_INVOICE_FONT_URL ||
    'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf';
let unicodeFontLoaded = false;
let unicodeFontBase64 = '';
let compressedLogoDataUrl = '';

const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

function invoiceHasNonAscii(order = {}) {
    const chunks = [
        COMPANY_NAME,
        getDisplayOrderNumber(order),
        getOrderCustomerDisplayName(order),
        order?.guestEmail,
        order?.courier,
        ...(Array.isArray(order?.orderItems) ? order.orderItems : []).flatMap((item) => {
            const product = getOrderLineProduct(item);
            return [product?.name, item?.name, item?.productName, product?.sku, item?.sku];
        }),
        ...Object.values(resolveInvoiceAddress(order)),
    ];
    return chunks.some((value) => /[^\x00-\x7F]/.test(String(value || '')));
}

async function ensureUnicodeFont(doc, needed) {
    if (!needed) {
        doc.setFont(CORE_FONT_NAME, 'normal');
        return CORE_FONT_NAME;
    }
    try {
        if (!unicodeFontBase64) {
            const res = await fetch(UNICODE_FONT_REG_URL);
            unicodeFontBase64 = arrayBufferToBase64(await res.arrayBuffer());
        }
        doc.addFileToVFS(UNICODE_FONT_REG_VFS, unicodeFontBase64);
        doc.addFont(UNICODE_FONT_REG_VFS, UNICODE_FONT_NAME, 'normal');
        doc.addFont(UNICODE_FONT_REG_VFS, UNICODE_FONT_NAME, 'bold');
        unicodeFontLoaded = true;
        doc.setFont(UNICODE_FONT_NAME, 'normal');
        return UNICODE_FONT_NAME;
    } catch {
        doc.setFont(CORE_FONT_NAME, 'normal');
        return CORE_FONT_NAME;
    }
}

function compressLogoForPdf(img, maxPx = 240, quality = 0.62) {
    if (typeof document === 'undefined') return null;
    const width = Number(img.naturalWidth || img.width) || 0;
    const height = Number(img.naturalHeight || img.height) || 0;
    if (!width || !height) return null;

    const scale = Math.min(maxPx / width, maxPx / height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
}

// helpers
const formatAmount = (n) => `AED${Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const loadImage = (src) => new Promise((resolve, reject) => {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    } catch (e) { reject(e); }
});

function fitImageBox(naturalWidth, naturalHeight, maxWidth, maxHeight) {
    const width = Number(naturalWidth) || 0;
    const height = Number(naturalHeight) || 0;
    if (!width || !height) {
        return { width: maxWidth, height: maxHeight };
    }

    const ratio = width / height;
    let boxWidth = maxWidth;
    let boxHeight = boxWidth / ratio;

    if (boxHeight > maxHeight) {
        boxHeight = maxHeight;
        boxWidth = boxHeight * ratio;
    }

    return { width: boxWidth, height: boxHeight };
}

export const generateInvoice = async (order) => {
    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true,
        putOnlyUsedFonts: true,
    });
    const font = await ensureUnicodeFont(doc, invoiceHasNonAscii(order));

    // A4 layout helpers
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = { left: 15, right: 15, top: 15, bottom: 15 };
    const contentWidth = pageWidth - margin.left - margin.right;
    let y = margin.top;

    // Header: Logo
    let logoWidth = 0;
    let logoHeight = 0;
    try {
        const logoUrl = typeof STORE1920_LOGO_SRC === 'string' ? STORE1920_LOGO_SRC : (STORE1920_LOGO_SRC?.src || STORE1920_LOGO_SRC?.default || '');
        const img = await loadImage(logoUrl);
        const fitted = fitImageBox(img.naturalWidth, img.naturalHeight, 28, 16);
        logoWidth = fitted.width;
        logoHeight = fitted.height;
        if (!compressedLogoDataUrl) {
            compressedLogoDataUrl = compressLogoForPdf(img) || '';
        }
        if (compressedLogoDataUrl) {
            doc.addImage(compressedLogoDataUrl, 'JPEG', margin.left, y, logoWidth, logoHeight, 'logo', 'FAST');
        } else {
            doc.addImage(img, 'JPEG', margin.left, y, logoWidth, logoHeight, 'logo', 'FAST');
        }
    } catch {
        // ignore if logo missing
    }

    // Header: Company text
    const infoX = margin.left + (logoWidth ? logoWidth + 5 : 0);
    const headerTextY = logoHeight ? y + Math.min(logoHeight, 16) / 2 : y + 8;
    doc.setFontSize(11);
    doc.setFont(font, 'bold');
    doc.text(COMPANY_NAME, infoX, headerTextY - 3);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(`${COMPANY_ADDRESS_LINE1}${COMPANY_ADDRESS_LINE2 ? `, ${COMPANY_ADDRESS_LINE2}` : ''}`, infoX, headerTextY + 2);
    doc.text(COMPANY_CONTACT, infoX, headerTextY + 7);

    // Header: Invoice title + number
    const orderIdShort = getDisplayOrderNumber(order) || 'Pending';
        doc.setFont(font, 'bold');
        doc.setFontSize(18);
        // Show both INVOICE and order ID together
        doc.text(`INVOICE\n#${orderIdShort}`, pageWidth - margin.right, headerTextY + 2, { align: 'right' });

    y += Math.max(logoHeight, 18) + 4;
    // Divider
    doc.setDrawColor(220);
    doc.line(margin.left, y, pageWidth - margin.right, y);
    y += 6;

    // Order meta (two columns)
    const col1X = margin.left;
    const col2X = margin.left + contentWidth / 2 + 5;

    doc.setFont(font, 'bold'); doc.setFontSize(9);
    doc.text('Invoice Date:', col1X, y);
    doc.text('Payment Method:', col1X, y + 6);
    doc.text('Payment Status:', col2X, y);
    doc.text('Order Status:', col2X, y + 6);

    doc.setFont(font, 'normal');
    doc.text(new Date(order?.createdAt || Date.now()).toLocaleDateString('en-AE'), col1X + 32, y);
    doc.text(formatPaymentMethodLabel(order?.paymentMethod), col1X + 32, y + 6);
    doc.text(resolveInvoicePaymentStatus(order), col2X + 30, y);
    doc.text(formatOrderStatusLabel(order?.status), col2X + 30, y + 6);

    y += 14;

    const billTo = resolveInvoiceAddress(order);
    const addressLines = buildInvoiceAddressLines(billTo);
    const billToWidth = contentWidth / 2 - 5;

    doc.setFont(font, 'bold'); doc.setFontSize(11);
    doc.text('BILL TO', margin.left, y);
    doc.setFontSize(10);
    doc.text(billTo.name, margin.left, y + 8);

    doc.setFont(font, 'normal'); doc.setFontSize(9);
    let billToBottom = appendWrappedLines(doc, addressLines, margin.left, y + 14, billToWidth, 5);

    if (billTo.phone) {
      doc.text(`Phone: ${billTo.phoneCode} ${billTo.phone}`.trim(), margin.left, billToBottom);
      billToBottom += 5;
    }
    if (billTo.alternatePhone) {
      doc.text(`Alternate: ${billTo.alternatePhoneCode} ${billTo.alternatePhone}`.trim(), margin.left, billToBottom);
      billToBottom += 5;
    }

    const trackingTop = y;
    const publicTrackingId = String(
      order?.waslah?.trackingNumber || order?.trackingId || '',
    ).trim();
    if (publicTrackingId) {
        doc.setFont(font, 'bold'); doc.setFontSize(11);
        doc.text('TRACKING DETAILS', margin.left + contentWidth / 2 + 5, trackingTop);
        doc.setFont(font, 'normal'); doc.setFontSize(9);
        doc.text(`Tracking number: ${publicTrackingId}`, margin.left + contentWidth / 2 + 5, trackingTop + 8);
        if (order?.courier) doc.text(`Courier: ${order.courier}`, margin.left + contentWidth / 2 + 5, trackingTop + 14);
        if (order?.trackingUrl) {
            doc.setTextColor(0, 102, 204);
            doc.textWithLink('Track Order', margin.left + contentWidth / 2 + 5, trackingTop + 20, { url: order.trackingUrl });
            doc.setTextColor(0, 0, 0);
        }
    }

    y = Math.max(billToBottom + 8, trackingTop + 34);

    const invoiceItems = resolveInvoiceLineItems(order);
    const tableData = invoiceItems.length
        ? invoiceItems.map((item, i) => [
            i + 1,
            item.name,
            item.quantity,
            formatAmount(item.price),
            formatAmount(item.lineTotal),
        ])
        : [['—', 'No line items found on this order', '—', '—', '—']];

    autoTable(doc, {
        startY: y,
        head: [["Sl No", "Product Name", "Qty", "Price", "Total"]],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 4, font },
        headStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold', lineWidth: 0.2, lineColor: 220 },
        bodyStyles: { lineWidth: 0.2, lineColor: 230 },
        margin: { left: margin.left, right: margin.right },
        columnStyles: {
            0: { cellWidth: 18, halign: 'center' },
            1: { cellWidth: contentWidth - (18 + 20 + 30 + 35) },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 35, halign: 'right' }
        }
    });

    const tableBottom = doc.lastAutoTable?.finalY || y;
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const shippingFee = Number(order?.shippingFee ?? order?.shipping ?? 0);
    let discount = 0;
    if (order?.isCouponUsed && order?.coupon) {
        discount = order.coupon.discountType === 'percentage'
            ? (Number(order.coupon.discount || 0) / 100) * subtotal
            : Number(order.coupon.discount || 0);
    }

    const finalY = tableBottom + 8;

    // Totals (right-aligned)
    doc.setFont(font, 'normal'); doc.setFontSize(10);
    const rightX = pageWidth - margin.right;
    const labelX = rightX - 40;
    doc.text('Subtotal:', labelX, finalY);
    doc.text(formatAmount(subtotal), rightX, finalY, { align: 'right' });
    doc.text('Shipping:', labelX, finalY + 7);
    doc.text(formatAmount(shippingFee), rightX, finalY + 7, { align: 'right' });
    if (discount > 0) {
        doc.text('Discount:', labelX, finalY + 14);
        doc.setTextColor(34, 197, 94);
        doc.text(`-${formatAmount(discount)}`, rightX, finalY + 14, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }
    const walletDiscount = Number(order?.walletDiscount || 0);
    let extraOffset = discount > 0 ? 14 : 0;
    if (walletDiscount > 0) {
        const walletY = finalY + 14 + extraOffset;
        doc.text('Wallet:', labelX, walletY);
        doc.setTextColor(34, 197, 94);
        doc.text(`-${formatAmount(walletDiscount)}`, rightX, walletY, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        extraOffset += 7;
    }

    doc.setFont(font, 'bold'); doc.setFontSize(12);
    const totalY = finalY + 14 + extraOffset;
    doc.text('TOTAL:', labelX, totalY);
    doc.text(formatAmount(order?.total ?? (subtotal + shippingFee - discount)), rightX, totalY, { align: 'right' });

    // Footer
    doc.setDrawColor(230);
    doc.line(margin.left, pageHeight - margin.bottom - 5, rightX, pageHeight - margin.bottom - 5);
    doc.setFont(font, 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(THANK_YOU_LINE2, pageWidth / 2, pageHeight - margin.bottom, { align: 'center' });

    return doc;
};

export const downloadInvoice = async (order) => {
    const doc = await generateInvoice(order);
    const invoiceNo = getDisplayOrderNumber(order) || String(order?._id || order?.id || '').slice(-8);
    doc.save(`Invoice_${invoiceNo}.pdf`);
};

export const printInvoice = async (order) => {
    const doc = await generateInvoice(order);
    doc.autoPrint();
    const url = doc.output('bloburl');
    window.open(url, '_blank');
};
