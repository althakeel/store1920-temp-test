import { PDFDocument } from 'pdf-lib';
import { extractWaslahPrintReceiptUrl } from '@/lib/waslahReceipts';
import { uploadToS3 } from '@/lib/storage';

/**
 * Waslah print-receipt returns a combined PDF. Layout varies:
 *   A) [Waslah, EMX] repeated per order
 *   B) [all Waslah pages…][all EMX pages…]
 * Always prefer EMX carrier label pages only (barcode 1000… / "emx" / Door To Door).
 */

export function pickEmxCarrierLabelPageIndexes(pageCount = 0) {
  const total = Number(pageCount) || 0;
  if (total <= 0) return [];
  if (total === 1) return [0];

  // Fallback when content detection is unavailable: assume alternating Waslah, EMX.
  const indexes = [];
  for (let i = 1; i < total; i += 2) {
    indexes.push(i);
  }
  if (total % 2 === 1 && total > 2) {
    indexes.push(total - 1);
  }
  return indexes;
}

function scorePdfPageBytes(pageBytes) {
  const text = Buffer.from(pageBytes).toString('latin1');
  let score = 0;

  if (/1000\d{9,12}/.test(text)) score += 8;
  if (/Door\s*To\s*Door/i.test(text)) score += 5;
  if (/\bemx\b/i.test(text)) score += 4;
  if (/Account\s*Number|NonDocument|Service\s*Type/i.test(text)) score += 2;

  if (/Waslah/i.test(text)) score -= 6;
  if (/No\.\s*of\s*shipments/i.test(text)) score -= 4;
  if (/Ref\.\s*Number|Order\s*Number/i.test(text) && !/1000\d{9,12}/.test(text)) score -= 2;
  if (/S1920-/i.test(text) && !/1000\d{9,12}/.test(text)) score -= 1;

  return score;
}

/**
 * Inspect each page alone and keep pages that look like EMX carrier labels.
 */
export async function detectEmxCarrierLabelPageIndexes(sourcePdf) {
  const pageCount = sourcePdf.getPageCount();
  if (pageCount <= 0) return [];
  if (pageCount === 1) return [0];

  const scores = [];
  for (let index = 0; index < pageCount; index += 1) {
    const probe = await PDFDocument.create();
    const [copied] = await probe.copyPages(sourcePdf, [index]);
    probe.addPage(copied);
    const bytes = await probe.save();
    scores.push({ index, score: scorePdfPageBytes(bytes) });
  }

  const emxPages = scores.filter((entry) => entry.score > 0).map((entry) => entry.index);
  if (emxPages.length) return emxPages;

  // Bulk layout: first half Waslah, second half EMX.
  if (pageCount >= 4 && pageCount % 2 === 0) {
    const half = pageCount / 2;
    const secondHalf = [];
    for (let i = half; i < pageCount; i += 1) secondHalf.push(i);
    const secondHalfLooksBetter = scores
      .slice(half)
      .reduce((sum, entry) => sum + entry.score, 0)
      >= scores.slice(0, half).reduce((sum, entry) => sum + entry.score, 0);
    if (secondHalfLooksBetter) return secondHalf;
  }

  return pickEmxCarrierLabelPageIndexes(pageCount);
}

export async function extractEmxCarrierLabelPdf(pdfBytes) {
  const input = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  const source = await PDFDocument.load(input, { ignoreEncryption: true });
  const pageCount = source.getPageCount();

  if (pageCount <= 0) {
    throw new Error('Waslah PDF has no pages to extract');
  }

  const keepIndexes = await detectEmxCarrierLabelPageIndexes(source);
  if (!keepIndexes.length) {
    throw new Error('Could not find EMX carrier label pages in Waslah PDF');
  }

  // Single page and it scored as EMX (or unknown) — return as-is only if it does not look like Waslah-only.
  if (pageCount === 1) {
    const score = scorePdfPageBytes(input);
    if (score < 0) {
      throw new Error('Waslah returned a receipt-only PDF without an EMX carrier label page');
    }
    return input;
  }

  if (keepIndexes.length === pageCount) {
    // Detection kept everything — still try alternating EMX pages to avoid Waslah receipts.
    const fallback = pickEmxCarrierLabelPageIndexes(pageCount);
    if (fallback.length && fallback.length < pageCount) {
      const output = await PDFDocument.create();
      const copied = await output.copyPages(source, fallback);
      copied.forEach((page) => output.addPage(page));
      return Buffer.from(await output.save());
    }
    return input;
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, keepIndexes);
  copied.forEach((page) => output.addPage(page));
  return Buffer.from(await output.save());
}

/**
 * Merge already-extracted EMX-only PDF buffers into one file.
 */
export async function mergeEmxCarrierLabelPdfs(pdfBuffers = []) {
  const output = await PDFDocument.create();
  let added = 0;

  for (const buffer of pdfBuffers) {
    if (!buffer?.length) continue;
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = await output.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => {
      output.addPage(page);
      added += 1;
    });
  }

  if (!added) {
    throw new Error('No EMX carrier label pages were found for the selected orders');
  }

  return Buffer.from(await output.save());
}

export async function downloadAndExtractEmxCarrierLabelPdf(sourceUrl) {
  const url = String(sourceUrl || '').trim();
  if (!url) throw new Error('Label PDF URL is required');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Waslah label PDF (HTTP ${response.status})`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  return extractEmxCarrierLabelPdf(input);
}

/**
 * Download Waslah combined PDF, keep EMX pages only, upload to S3, return public URL.
 * Falls back to the original Waslah URL if S3 upload is unavailable.
 */
export async function resolveEmxCarrierLabelUrl(printResultOrUrl, {
  orderId = '',
  waslahOrderId = '',
} = {}) {
  const sourceUrl = typeof printResultOrUrl === 'string'
    ? printResultOrUrl
    : extractWaslahPrintReceiptUrl(printResultOrUrl, { preferCarrierLabel: true });

  if (!sourceUrl) return null;

  try {
    const emxPdf = await downloadAndExtractEmxCarrierLabelPdf(sourceUrl);
    const stamp = Date.now();
    const safeOrder = String(orderId || waslahOrderId || 'label').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const uploaded = await uploadToS3({
      buffer: emxPdf,
      fileName: `emx-carrier-${safeOrder}-${stamp}.pdf`,
      folder: 'uploads',
      contentType: 'application/pdf',
    });
    return uploaded?.url || sourceUrl;
  } catch (error) {
    console.warn('[waslah-emx-label] Could not isolate EMX carrier page:', error?.message || error);
    return sourceUrl;
  }
}
