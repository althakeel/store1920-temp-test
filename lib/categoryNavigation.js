import { getLocalizedCategoryName } from '@/lib/categoryLocalization';
import { toPublicCategoryPath } from '@/lib/categorySlug';
import { buildCategoryAncestorChain, resolveCategoryHref } from '@/lib/categoryTreeUtils';

export function getCategoryRecordId(category) {
  return String(category?._id || category?.id || '').trim();
}

export function getCategoryParentRecordId(category) {
  return String(category?.parentId || category?.parent || '').trim();
}

export function getCategoryDisplayName(category, language = 'en') {
  return getLocalizedCategoryName(category, language);
}

export function isDisplayableCategoryName(name = '') {
  const label = getCategoryDisplayName({ name });
  if (!label || label.length < 2) return false;
  if (/^\d+$/.test(label)) return false;
  if (/^[a-f0-9]{24}$/i.test(label)) return false;
  return true;
}

export function filterRootParentCategories(categories = []) {
  return filterParentCategories(categories);
}

export function buildCategoryShopLink(category, allCategories = []) {
  if (!category) return '/shop';

  const list = Array.isArray(allCategories) ? allCategories : [];
  if (list.length) {
    const href = resolveCategoryHref(buildCategoryAncestorChain(list, category));
    if (href && href !== '/shop') return href;
  }

  const slug = String(category?.slug || '').trim();
  if (slug) return toPublicCategoryPath(slug);
  return '/shop';
}

export function buildParentCategoryNavMenuItems(categories = [], language = 'en') {
  const parents = filterParentCategories(categories);

  return parents.map((category) => {
    const categoryId = getCategoryRecordId(category);
    const children = getDirectChildCategories(categories, category);

    return {
      name: getCategoryDisplayName(category, language),
      link: buildCategoryShopLink(category, categories),
      slug: String(category?.slug || '').trim(),
      icon: '',
      hasDropdown: children.length > 0,
      categoryId,
      megaMenu: {
        linkColumns: children.length > 8 ? 3 : children.length > 4 ? 2 : 1,
        links: children.map((child) => ({
          name: getCategoryDisplayName(child, language),
          link: buildCategoryShopLink(child, categories),
          children: getDirectChildCategories(categories, child).map((grandchild) => ({
            name: getCategoryDisplayName(grandchild, language),
            link: buildCategoryShopLink(grandchild, categories),
          })),
        })),
        images: [],
      },
    };
  });
}

export function dedupeSimilarParentCategories(parents = []) {
  const list = [...parents].sort(
    (left, right) => getCategoryDisplayName(left).length - getCategoryDisplayName(right).length,
  );
  const kept = [];

  for (const category of list) {
    const name = getCategoryDisplayName(category).toLowerCase();
    const dominated = kept.some((existing) => {
      const existingName = getCategoryDisplayName(existing).toLowerCase();
      if (name === existingName) return true;
      return (
        name.startsWith(`${existingName} `)
        || name.startsWith(`${existingName}&`)
        || name.startsWith(`${existingName},`)
      );
    });
    if (!dominated) kept.push(category);
  }

  return kept.sort((left, right) => getCategoryDisplayName(left).localeCompare(getCategoryDisplayName(right)));
}

export function filterParentCategories(categories = []) {
  const list = Array.isArray(categories) ? categories : [];
  const ids = new Set(list.map(getCategoryRecordId).filter(Boolean));
  const parentIdsWithChildren = new Set();

  list.forEach((category) => {
    const parentId = getCategoryParentRecordId(category);
    if (parentId) parentIdsWithChildren.add(parentId);

    const categoryId = getCategoryRecordId(category);
    if (categoryId && Array.isArray(category.children) && category.children.length > 0) {
      parentIdsWithChildren.add(categoryId);
    }
  });

  const filtered = list.filter((category) => {
    const name = getCategoryDisplayName(category);
    if (!isDisplayableCategoryName(name)) return false;

    const categoryId = getCategoryRecordId(category);
    const parentId = getCategoryParentRecordId(category);
    const isRoot = !parentId || !ids.has(parentId);

    return isRoot && categoryId && parentIdsWithChildren.has(categoryId);
  });

  return dedupeSimilarParentCategories(filtered);
}

export function getDirectChildCategories(categories = [], parentCategory) {
  const parentId = getCategoryRecordId(parentCategory);
  if (!parentId) return [];

  const nestedChildren = Array.isArray(parentCategory?.children) ? parentCategory.children : [];
  const flatChildren = categories.filter(
    (item) => getCategoryParentRecordId(item) === parentId,
  );

  const merged = new Map();

  [...nestedChildren, ...flatChildren].forEach((item) => {
    const itemId = getCategoryRecordId(item) || String(item?.slug || item?.name || '').trim();
    if (!itemId || merged.has(itemId)) return;
    merged.set(itemId, item);
  });

  return Array.from(merged.values())
    .filter((item) => isDisplayableCategoryName(getCategoryDisplayName(item)))
    .sort((left, right) => getCategoryDisplayName(left).localeCompare(getCategoryDisplayName(right)));
}

export function resolveStoreNavMenuItems(settings = {}, categories = [], language = 'en') {
  const parentNav = buildParentCategoryNavMenuItems(categories, language);
  const customItems = Array.isArray(settings?.navMenuItems) ? settings.navMenuItems : [];

  if (settings?.navMenuUseParentCategories) {
    return parentNav;
  }

  if (!customItems.length && parentNav.length > 0) {
    return parentNav;
  }

  return customItems;
}
