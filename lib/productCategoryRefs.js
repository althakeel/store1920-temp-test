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

/** Add one category to a product. Keeps existing categories; sets primary if empty. */
export function buildProductCategoriesAfterAddition(product = {}, categoryId = '') {
  const id = String(categoryId || '').trim();
  if (!isCategoryObjectId(id)) {
    return {
      alreadyHad: false,
      category: String(product?.category || ''),
      categories: collectProductCategoryRefs(product),
      changed: false,
    };
  }

  const current = collectProductCategoryRefs(product);
  const alreadyHad = current.some((ref) => isSameCategoryRef(ref, id));
  if (alreadyHad) {
    return {
      alreadyHad: true,
      category: String(product?.category || current[0] || id),
      categories: sanitizeCategoryIdsForSave(current),
      changed: false,
    };
  }

  const categories = sanitizeCategoryIdsForSave([...current, id]);
  const primary = String(product?.category || '').trim();
  const category = isCategoryObjectId(primary) ? primary : (categories[0] || id);

  return {
    alreadyHad: false,
    category,
    categories: categories.length ? categories : [id],
    changed: true,
  };
}

/** Replace product categories (and primary). Empty list clears categories. */
export function buildProductCategoriesAfterSet(categoryIds = [], primaryCategoryId = '') {
  const categories = sanitizeCategoryIdsForSave(categoryIds);
  const preferred = String(primaryCategoryId || '').trim();
  const category = (
    isCategoryObjectId(preferred) && categories.some((id) => isSameCategoryRef(id, preferred))
      ? preferred
      : (categories[0] || '')
  );

  return {
    category,
    categories,
    changed: true,
  };
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
