function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function joinList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(' | ');
  if (value == null) return '';
  return String(value);
}

function formatVariants(variants = []) {
  if (!Array.isArray(variants) || !variants.length) return '';
  return variants.map((variant) => {
    const options = variant?.options && typeof variant.options === 'object'
      ? Object.entries(variant.options)
          .map(([key, val]) => `${key}:${val}`)
          .join(';')
      : '';
    const parts = [
      variant?.sku ? `sku=${variant.sku}` : '',
      options ? `options=${options}` : '',
      variant?.price != null ? `price=${variant.price}` : '',
      variant?.stockQuantity != null ? `stock=${variant.stockQuantity}` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }).join(' || ');
}

export const PRODUCT_DETAILS_CSV_HEADERS = [
  'id',
  'name',
  'nameAr',
  'slug',
  'sku',
  'brand',
  'brandAr',
  'categories',
  'categoryIds',
  'tags',
  'price',
  'mrp',
  'costPrice',
  'stockQuantity',
  'soldCount',
  'inStock',
  'published',
  'fastDelivery',
  'freeShippingEligible',
  'allowReturn',
  'allowReplacement',
  'hsCode',
  'originCountry',
  'shippingWeightKg',
  'shortDescription',
  'shortDescriptionAr',
  'shortDescription2',
  'description',
  'descriptionAr',
  'seoTitle',
  'seoDescription',
  'seoKeywords',
  'images',
  'externalImages',
  'hasVariants',
  'variants',
  'imageAspectRatio',
  'useProductsPath',
  'createdAt',
  'updatedAt',
];

export function buildProductDetailsCsvRows(products = []) {
  return products.map((product) => {
    const categoryNames = Array.isArray(product.categoryNames) && product.categoryNames.length
      ? product.categoryNames
      : [];
    const categoryIds = [
      product.category,
      ...(Array.isArray(product.categories) ? product.categories : []),
    ].filter(Boolean);

    return {
      id: product._id || '',
      name: product.name || '',
      nameAr: product.nameAr || '',
      slug: product.slug || '',
      sku: product.sku || '',
      brand: product.brand || '',
      brandAr: product.brandAr || '',
      categories: categoryNames.join(', ') || joinList(categoryIds),
      categoryIds: joinList(categoryIds),
      tags: joinList(product.tags),
      price: product.price ?? '',
      mrp: product.AED ?? product.mrp ?? '',
      costPrice: product.costPrice ?? '',
      stockQuantity: product.stockQuantity ?? 0,
      soldCount: product.soldCount ?? 0,
      inStock: Boolean(product.inStock),
      published: product.published !== false,
      fastDelivery: Boolean(product.fastDelivery),
      freeShippingEligible: Boolean(product.freeShippingEligible),
      allowReturn: product.allowReturn !== false,
      allowReplacement: product.allowReplacement !== false,
      hsCode: product.hsCode || '',
      originCountry: product.originCountry || '',
      shippingWeightKg: product.shippingWeightKg ?? '',
      shortDescription: stripHtml(product.shortDescription),
      shortDescriptionAr: stripHtml(product.shortDescriptionAr),
      shortDescription2: stripHtml(product.shortDescription2),
      description: stripHtml(product.description),
      descriptionAr: stripHtml(product.descriptionAr),
      seoTitle: product.seoTitle || '',
      seoDescription: product.seoDescription || '',
      seoKeywords: joinList(product.seoKeywords),
      images: joinList(product.images),
      externalImages: joinList(product.externalImages),
      hasVariants: Boolean(product.hasVariants),
      variants: formatVariants(product.variants),
      imageAspectRatio: product.imageAspectRatio || '',
      useProductsPath: Boolean(product.useProductsPath),
      createdAt: product.createdAt || '',
      updatedAt: product.updatedAt || '',
    };
  });
}

export function buildProductDetailsCsv(products = []) {
  const rows = buildProductDetailsCsvRows(products);
  const lines = [
    PRODUCT_DETAILS_CSV_HEADERS.join(','),
    ...rows.map((row) =>
      PRODUCT_DETAILS_CSV_HEADERS.map((header) => escapeCsv(row[header])).join(',')
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}
