let categoryById = new Map();
let categoryIdByName = new Map();
let cachePromise = null;

function walkCategories(nodes, byId, byName, parentId = '') {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const id = String(node?._id || node?.id || '').trim();
    const name = String(node?.name || '').trim();
    const resolvedParent = String(node?.parentId || parentId || '').trim();
    if (id) {
      byId.set(id, { name, parentId: resolvedParent });
    }
    if (name) {
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, id || name);
    }
    if (Array.isArray(node?.children) && node.children.length) {
      walkCategories(node.children, byId, byName, id);
    }
  }
}

export function rememberGa4Categories(categories = []) {
  const byId = new Map(categoryById);
  const byName = new Map(categoryIdByName);
  walkCategories(categories, byId, byName);
  categoryById = byId;
  categoryIdByName = byName;
}

export function lookupGa4CategoryName(categoryId) {
  const id = String(categoryId || '').trim();
  if (!id) return '';
  return categoryById.get(id)?.name || '';
}

export function lookupGa4CategoryPath(categoryRef) {
  const raw = String(
    categoryRef && typeof categoryRef === 'object'
      ? (categoryRef._id || categoryRef.id || categoryRef.name || '')
      : (categoryRef || ''),
  ).trim();
  if (!raw) return [];

  let current = raw;
  if (!categoryById.has(current)) {
    const mapped = categoryIdByName.get(raw.toLowerCase());
    if (mapped) current = mapped;
  }

  const names = [];
  const seen = new Set();
  while (current && !seen.has(current) && names.length < 8) {
    seen.add(current);
    const node = categoryById.get(current);
    if (node) {
      if (node.name) names.unshift(node.name);
      current = node.parentId;
      continue;
    }
    if (!/^[a-f0-9]{24}$/i.test(current)) names.unshift(current);
    break;
  }

  return names.slice(0, 3);
}

export function ensureGa4CategoryCache() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (categoryById.size > 0) return Promise.resolve();
  if (cachePromise) return cachePromise;

  cachePromise = fetch('/api/categories', { credentials: 'same-origin', cache: 'default' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (Array.isArray(data?.categories)) rememberGa4Categories(data.categories);
    })
    .catch(() => {
      cachePromise = null;
    });

  return cachePromise;
}

export function waitForGa4CategoryCache(timeoutMs = 1200) {
  if (typeof window === 'undefined') return Promise.resolve();
  const pending = ensureGa4CategoryCache();
  if (categoryById.size > 0) return Promise.resolve();
  return Promise.race([
    pending,
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}
