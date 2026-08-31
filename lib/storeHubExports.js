/** Shared helpers for /store/exports CSV downloads. */

export const STORE_EXPORT_TYPES = ['orders', 'products', 'categories'];

export function escapeExportCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(headers = [], rows = []) {
  return [
    headers.map(escapeExportCsvCell).join(','),
    ...rows.map((row) => row.map(escapeExportCsvCell).join(',')),
  ].join('\n');
}

/**
 * @param {'full'|'custom'} range
 * @param {string} fromDate YYYY-MM-DD
 * @param {string} toDate YYYY-MM-DD
 * @returns {{ createdAt?: { $gte?: Date, $lte?: Date } }}
 */
export function buildStoreExportDateFilter(range = 'full', fromDate = '', toDate = '') {
  if (String(range || '').toLowerCase() !== 'custom') return {};

  const from = String(fromDate || '').trim();
  const to = String(toDate || '').trim();
  if (!from || !to) {
    const err = new Error('From date and to date are required for a custom range');
    err.status = 400;
    throw err;
  }

  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const err = new Error('Invalid from or to date');
    err.status = 400;
    throw err;
  }
  if (start > end) {
    const err = new Error('From date must be on or before to date');
    err.status = 400;
    throw err;
  }

  end.setHours(23, 59, 59, 999);
  return { createdAt: { $gte: start, $lte: end } };
}

export const CATEGORY_EXPORT_HEADERS = [
  'ID',
  'Name',
  'Name (Arabic)',
  'Slug',
  'Parent ID',
  'Level',
  'Sort Order',
  'Active',
  'URL',
  'Meta Title',
  'Meta Description',
  'Created At',
  'Updated At',
];

export function buildCategoryExportCsv(categories = []) {
  const rows = categories.map((category) => [
    category?._id || '',
    category?.name || '',
    category?.nameAr || '',
    category?.slug || '',
    category?.parentId || '',
    category?.level ?? '',
    category?.sortOrder ?? '',
    category?.isActive === false ? 'No' : 'Yes',
    category?.url || '',
    category?.metaTitle || '',
    category?.metaDescription || '',
    category?.createdAt ? new Date(category.createdAt).toISOString() : '',
    category?.updatedAt ? new Date(category.updatedAt).toISOString() : '',
  ]);
  return rowsToCsv(CATEGORY_EXPORT_HEADERS, rows);
}

export function buildExportFilename(type, range = 'full', fromDate = '', toDate = '') {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeType = String(type || 'export').replace(/[^a-z0-9_-]/gi, '');
  if (String(range).toLowerCase() === 'custom' && fromDate && toDate) {
    return `store-${safeType}-${fromDate}_to_${toDate}.csv`;
  }
  return `store-${safeType}-full-${stamp}.csv`;
}
