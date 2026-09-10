import { notFound, redirect } from 'next/navigation';
import { getProductPageData } from '@/lib/productPageData';
import { resolveProductSlugRedirect } from '@/lib/productRedirects';

const EMPTY_PAGE_DATA = {
  product: null,
  reviews: [],
  relatedProducts: [],
  fbt: { enableFBT: false, products: [], bundlePrice: 0, bundleDiscount: 0 },
  categoryChain: [],
};

export async function loadProductPageData(slug, language = 'en') {
  try {
    return await getProductPageData(slug, language);
  } catch (error) {
    console.error('[product-page] failed to load data:', slug, error);
    return EMPTY_PAGE_DATA;
  }
}

/**
 * @param {'product' | 'products'} expectedPath - which URL prefix this route serves
 */
export async function resolveProductPage(slug, language, expectedPath) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) {
    notFound();
  }

  const slugRedirect = resolveProductSlugRedirect(normalizedSlug);
  if (slugRedirect) {
    redirect(slugRedirect);
  }

  const initialData = await loadProductPageData(normalizedSlug, language);

  if (!initialData?.product) {
    notFound();
  }

  const canonicalSlug = String(initialData.product.slug || normalizedSlug).trim();

  if (canonicalSlug && canonicalSlug !== normalizedSlug) {
    redirect(`/product/${canonicalSlug}`);
  }

  if (expectedPath === 'products') {
    redirect(`/product/${canonicalSlug}`);
  }

  return initialData;
}
