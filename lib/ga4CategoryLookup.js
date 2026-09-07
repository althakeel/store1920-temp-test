let categoryNameById = new Map();
let fetchStarted = false;

function walkCategories(nodes, map) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const id = String(node?._id || node?.id || '').trim();
    const name = String(node?.name || '').trim();
    if (id && name) map.set(id, name);
    if (Array.isArray(node?.children) && node.children.length) {
      walkCategories(node.children, map);
    }
  }
}

export function rememberGa4Categories(categories = []) {
  const next = new Map(categoryNameById);
  walkCategories(categories, next);
  categoryNameById = next;
}

export function lookupGa4CategoryName(categoryId) {
  const id = String(categoryId || '').trim();
  if (!id) return '';
  return categoryNameById.get(id) || '';
}

export function ensureGa4CategoryCache() {
  if (typeof window === 'undefined' || fetchStarted || categoryNameById.size > 0) return;
  fetchStarted = true;
  fetch('/api/categories', { credentials: 'same-origin', cache: 'default' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (Array.isArray(data?.categories)) rememberGa4Categories(data.categories);
    })
    .catch(() => {
      fetchStarted = false;
    });
}
