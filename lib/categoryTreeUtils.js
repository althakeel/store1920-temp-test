import { buildCategoryUrl, parseCategoryPathSegments } from '@/lib/categorySlug';

export function buildCategoryIdAliases(categories = []) {
  const aliases = new Map();

  for (const category of categories) {
    const id = String(category?._id || '').trim();
    if (!id) continue;

    aliases.set(id, id);
    aliases.set(id.toLowerCase(), id);

    const slug = String(category?.slug || '').trim().toLowerCase();
    if (slug) aliases.set(slug, id);

    const legacySourceId = String(category?.legacySourceId || '').trim();
    if (legacySourceId) {
      aliases.set(legacySourceId, id);
      aliases.set(legacySourceId.toLowerCase(), id);
      const legacyTermMatch = legacySourceId.match(/^sql:term:(\d+)$/i);
      if (legacyTermMatch) aliases.set(legacyTermMatch[1], id);
    }
  }

  return aliases;
}

export function normalizeCategoryParentIds(categories = [], aliases = new Map()) {
  return categories.map((category) => {
    const rawParentId = String(category?.parentId || '').trim();
    if (!rawParentId) {
      return { ...category, parentId: null };
    }

    const resolvedParentId = aliases.get(rawParentId)
      || aliases.get(rawParentId.toLowerCase())
      || rawParentId;

    return { ...category, parentId: resolvedParentId };
  });
}

export function resolveCategoryHref(ancestors = [], leaf = null) {
  const nodes = leaf ? [...ancestors, leaf] : [...ancestors];
  const slugs = nodes
    .map((node) => String(node?.slug || '').trim())
    .filter(Boolean);

  if (!slugs.length) return '/shop';

  const lastNode = nodes[nodes.length - 1];
  const storedUrl = String(lastNode?.url || '').trim();
  if (storedUrl.startsWith('/category/')) {
    const storedSegments = parseCategoryPathSegments(storedUrl);
    if (storedSegments.join('/') === slugs.join('/')) {
      return storedUrl;
    }
  }

  return buildCategoryUrl(nodes.map((node) => ({ slug: node.slug })));
}

export function findCategoryByPathSegments(categories = [], pathSegments = []) {
  const segments = pathSegments
    .map((segment) => String(segment || '').trim().toLowerCase())
    .filter(Boolean);

  if (!segments.length) return null;

  const chain = [];
  let parentId = null;

  for (const segment of segments) {
    let match = categories.find((item) => {
      if (String(item?.slug || '').toLowerCase() !== segment) return false;
      if (!parentId) return !String(item?.parentId || '').trim();
      return String(item.parentId || '') === String(parentId);
    });

    if (!match && segments.length === 1) {
      match = categories.find((item) => String(item?.slug || '').toLowerCase() === segment);
    }

    // Legacy deep paths: stop at longest valid prefix instead of hard 404.
    if (!match) break;

    chain.push(match);
    parentId = match._id;
  }

  if (!chain.length) {
    // Leaf-only fallback (slug exists but parent path changed).
    const leaf = segments[segments.length - 1];
    const leafMatch = categories.find((item) => String(item?.slug || '').toLowerCase() === leaf);
    if (!leafMatch) return null;
    const rebuilt = [];
    let current = leafMatch;
    const guard = new Set();
    while (current && !guard.has(String(current._id))) {
      guard.add(String(current._id));
      rebuilt.unshift(current);
      const pid = String(current.parentId || '').trim();
      current = pid
        ? categories.find((item) => String(item._id) === pid)
        : null;
    }
    const category = rebuilt[rebuilt.length - 1];
    const children = categories
      .filter((item) => String(item.parentId || '') === String(category._id))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
        || String(a.name || '').localeCompare(String(b.name || '')));
    return {
      category,
      chain: rebuilt,
      children,
      pathRedirect: true,
    };
  }

  const category = chain[chain.length - 1];
  const children = categories
    .filter((item) => String(item.parentId || '') === String(category._id))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
      || String(a.name || '').localeCompare(String(b.name || '')));

  return {
    category,
    chain,
    children,
    pathRedirect: chain.length !== segments.length,
  };
}
