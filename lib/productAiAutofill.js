export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeSpecRows(rows, columnCount = 2) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!Array.isArray(row)) return null;
      const next = Array.from({ length: columnCount }, (_, idx) => String(row[idx] || '').trim());
      return next;
    })
    .filter((row) => row && row.some((cell) => cell.length > 0));
}

export function buildSpecTableHtml(columns, rows, title = 'Product information') {
  const safeRows = normalizeSpecRows(rows, Math.max(columns?.length || 2, 2));
  if (safeRows.length === 0) return '';

  const safeColumns = Array.isArray(columns) && columns.length >= 2
    ? columns.slice(0, 2).map((col) => String(col || '').trim() || 'Value')
    : ['Property', 'Value'];

  const header = safeColumns
    .map((col) => `<th>${escapeHtml(col)}</th>`)
    .join('');

  const body = safeRows
    .map((row) => {
      const [first, ...rest] = row;
      const cells = [
        `<th scope="row">${escapeHtml(first)}</th>`,
        ...rest.map((cell) => `<td>${escapeHtml(cell)}</td>`),
      ];
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  return `<h2>${escapeHtml(title || 'Product information')}</h2><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildRichDescriptionHtml({
  overview = '',
  details = '',
  features = [],
  specTableHtml = '',
}) {
  const parts = [];

  const intro = String(overview || '').trim();
  const body = String(details || '').trim();

  if (intro) {
    parts.push(`<p>${escapeHtml(intro)}</p>`);
  }
  if (body) {
    parts.push(`<p>${escapeHtml(body)}</p>`);
  }

  const safeFeatures = Array.isArray(features)
    ? features.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  if (safeFeatures.length > 0) {
    parts.push(
      `<h3>Key features</h3><ul>${safeFeatures.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    );
  }

  if (specTableHtml) {
    parts.push(specTableHtml);
  }

  return parts.join('');
}

export function matchCategoryIds(suggestedNames = [], storeCategories = [], max = 3) {
  const suggestions = (Array.isArray(suggestedNames) ? suggestedNames : [])
    .map((name) => String(name || '').trim().toLowerCase())
    .filter(Boolean);

  if (suggestions.length === 0 || !Array.isArray(storeCategories)) {
    return [];
  }

  const scored = storeCategories
    .map((category) => {
      const categoryName = String(category?.name || '').trim().toLowerCase();
      if (!categoryName) return null;

      let score = 0;
      suggestions.forEach((suggestion) => {
        if (suggestion === categoryName) score += 100;
        else if (categoryName.includes(suggestion) || suggestion.includes(categoryName)) score += 70;
        else {
          const suggestionTokens = suggestion.split(/\s+/).filter(Boolean);
          const categoryTokens = categoryName.split(/\s+/).filter(Boolean);
          const overlap = suggestionTokens.filter((token) => categoryTokens.includes(token)).length;
          score += overlap * 20;
        }
      });

      return score > 0 ? { id: String(category._id), score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return Array.from(new Set(scored.map((item) => item.id))).slice(0, max);
}

export function normalizeAutofillList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function parseAutofillJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI returned empty response');
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export function formatProductAutofillPayload(parsed, storeCategories = [], includeArabic = false) {
  const specTableColumns = normalizeAutofillList(parsed.specTableColumns);
  const normalizedColumns = specTableColumns.length >= 2
    ? specTableColumns.slice(0, 2)
    : ['Property', 'Value'];
  const specTableRows = normalizeSpecRows(parsed.specTableRows, normalizedColumns.length);
  const specTableTitle = String(parsed.specTableTitle || 'Product information').trim() || 'Product information';
  const specTableHtml = buildSpecTableHtml(normalizedColumns, specTableRows, specTableTitle);
  const descriptionHtml = buildRichDescriptionHtml({
    overview: parsed.descriptionOverview || parsed.shortDescription,
    details: parsed.descriptionDetails,
    features: normalizeAutofillList(parsed.features),
    specTableHtml,
  });
  const descriptionArHtml = includeArabic
    ? buildRichDescriptionHtml({
      overview: parsed.descriptionOverviewAr || parsed.shortDescriptionAr,
      details: parsed.descriptionDetailsAr || parsed.descriptionAr,
      features: [],
      specTableHtml: buildSpecTableHtml(
        normalizeAutofillList(parsed.specTableColumnsAr).length >= 2
          ? parsed.specTableColumnsAr.slice(0, 2)
          : ['الخاصية', 'القيمة'],
        parsed.specTableRowsAr,
        String(parsed.specTableTitleAr || 'مواصفات المنتج').trim() || 'مواصفات المنتج'
      ),
    })
    : '';

  const specTableColumnsAr = normalizeAutofillList(parsed.specTableColumnsAr);
  const normalizedColumnsAr = specTableColumnsAr.length >= 2
    ? specTableColumnsAr.slice(0, 2)
    : ['الخاصية', 'القيمة'];
  const specTableRowsAr = normalizeSpecRows(parsed.specTableRowsAr, normalizedColumnsAr.length);
  const specTableTitleAr = String(parsed.specTableTitleAr || 'مواصفات المنتج').trim() || 'مواصفات المنتج';

  const suggestedCategoryIds = matchCategoryIds(
    normalizeAutofillList(parsed.suggestedCategories),
    storeCategories,
    3
  );

  return {
    name: String(parsed.name || '').trim(),
    brand: String(parsed.brand || '').trim(),
    shortDescription: String(parsed.shortDescription || '').trim(),
    shortDescription2: String(parsed.shortDescription2 || '').trim(),
    description: descriptionHtml,
    descriptionOverview: String(parsed.descriptionOverview || '').trim(),
    descriptionDetails: String(parsed.descriptionDetails || '').trim(),
    features: normalizeAutofillList(parsed.features).slice(0, 8),
    suggestedCategories: normalizeAutofillList(parsed.suggestedCategories).slice(0, 3),
    suggestedCategoryIds,
    nameAr: String(parsed.nameAr || '').trim(),
    brandAr: String(parsed.brandAr || '').trim(),
    shortDescriptionAr: String(parsed.shortDescriptionAr || '').trim(),
    shortDescription2Ar: String(parsed.shortDescription2Ar || '').trim(),
    descriptionAr: descriptionArHtml || String(parsed.descriptionAr || '').trim(),
    tags: normalizeAutofillList(parsed.tags).slice(0, 10),
    seoTitle: String(parsed.seoTitle || '').trim(),
    seoDescription: String(parsed.seoDescription || '').trim(),
    seoKeywords: normalizeAutofillList(parsed.seoKeywords).slice(0, 10),
    badges: normalizeAutofillList(parsed.badges).slice(0, 6),
    deliveredBy: String(parsed.deliveredBy || '').trim(),
    soldBy: String(parsed.soldBy || '').trim(),
    paymentInfo: String(parsed.paymentInfo || '').trim(),
    specTableTitle,
    specTableColumns: normalizedColumns,
    specTableRows,
    specTableTitleAr,
    specTableColumnsAr: normalizedColumnsAr,
    specTableRowsAr,
    specTableEnabled: specTableRows.length > 0,
    provider: parsed.provider || 'gemini',
    // SKU is seller-managed only. Never accept AI-generated sku/model codes.
  };
}
