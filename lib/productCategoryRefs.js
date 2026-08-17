export function isCategoryObjectId(value) {
  const normalized = String(value || '').trim();
  return /^[a-f0-9]{24}$/i.test(normalized);
}

export function dedupeCategoryIds(ids = []) {
  return Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)));
}

/** Keep only canonical category ObjectIds (drops legacy slug/name strings). */
export function sanitizeCategoryIdsForSave(ids = []) {
  return dedupeCategoryIds(ids).filter(isCategoryObjectId);
}

export function buildCategoryIdMatch(categoryId) {
  const id = String(categoryId || '').trim();
  if (!isCategoryObjectId(id)) return null;

  return {
    $or: [
      { category: id },
      { categories: id },
    ],
  };
}

export function buildCategoryIdsMatch(categoryIds = []) {
  const idList = dedupeCategoryIds(categoryIds).filter(isCategoryObjectId);
  if (!idList.length) return null;

  return {
    $or: [
      { category: { $in: idList } },
      { categories: { $in: idList } },
    ],
  };
}

export function isSameCategoryRef(left, right) {
  const a = String(left || '').trim();
  const b = String(right || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

export function collectProductCategoryRefs(product = {}) {
  const refs = [];
  if (product?.category) refs.push(product.category);
  if (Array.isArray(product?.categories)) refs.push(...product.categories);
  return dedupeCategoryIds(refs);
}

/** Remove one category from a product. Also drops slug/name leftovers for that category. */
export function buildProductCategoriesAfterRemoval(product = {}, categoryId = '', aliases = []) {
  const targets = [categoryId, ...(Array.isArray(aliases) ? aliases : [aliases])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const current = collectProductCategoryRefs(product);
  const remaining = current.filter((id) => !targets.some((target) => isSameCategoryRef(id, target)));
  const hadCategory = remaining.length !== current.length;

  return {
    hadCategory,
    remaining,
    isLastCategory: hadCategory && remaining.length === 0,
    category: remaining[0] || '',
    categories: remaining,
  };
}
