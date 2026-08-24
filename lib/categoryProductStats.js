export function collectProductCategoryIds(product = {}) {
  const ids = new Set();

  if (product?.category) {
    ids.add(String(product.category));
  }

  if (Array.isArray(product?.categories)) {
    product.categories.forEach((categoryId) => {
      if (categoryId) ids.add(String(categoryId));
    });
  }

  return ids;
}

/** Products tagged directly on each category ID (no children). */
export function buildCategoryProductCounts(products = []) {
  const counts = {};

  products.forEach((product) => {
    collectProductCategoryIds(product).forEach((categoryId) => {
      counts[categoryId] = (counts[categoryId] || 0) + 1;
    });
  });

  return counts;
}

function collectDescendantIds(childrenByParent, rootId) {
  const root = String(rootId || '').trim();
  if (!root) return [];

  const ids = [root];
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    const children = childrenByParent.get(current) || [];
    for (const childId of children) {
      if (ids.includes(childId)) continue;
      ids.push(childId);
      queue.push(childId);
    }
  }
  return ids;
}

/**
 * Counts like the storefront: products tagged on this category OR any subcategory.
 * Matches /category/... and /shop category expansion.
 */
export function buildInclusiveCategoryProductCounts(products = [], categories = []) {
  const childrenByParent = new Map();
  const allIds = [];

  for (const category of categories) {
    const id = String(category?._id || '').trim();
    if (!id) continue;
    allIds.push(id);
    const parentId = String(category?.parentId || '').trim();
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(id);
  }

  const descendantSets = new Map();
  for (const id of allIds) {
    descendantSets.set(id, new Set(collectDescendantIds(childrenByParent, id)));
  }

  const counts = {};
  for (const id of allIds) counts[id] = 0;

  for (const product of products) {
    const productCats = collectProductCategoryIds(product);
    if (!productCats.size) continue;

    for (const [categoryId, descSet] of descendantSets.entries()) {
      let hit = false;
      for (const productCatId of productCats) {
        if (descSet.has(productCatId)) {
          hit = true;
          break;
        }
      }
      if (hit) counts[categoryId] += 1;
    }
  }

  return counts;
}
