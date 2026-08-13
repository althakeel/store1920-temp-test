import { notFound, redirect } from 'next/navigation';
import CategoryPageView from '@/components/category/CategoryPageView';
import {
  resolveCategoryByPathSegments,
  getCategoryProducts,
  getCategoryHeaderStats,
  CATEGORY_PRODUCTS_PAGE_SIZE,
} from '@/lib/categoryPageData';
import {
  buildBreadcrumbListJsonLd,
  buildCategoryCollectionJsonLd,
  buildCategoryPageMetadata,
} from '@/lib/categorySeo';
import { buildCategoryUrl } from '@/lib/categorySlug';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

/**
 * Puts Store → Categories SEO fields into the document <head>
 * (title, meta description, canonical, Open Graph, Twitter).
 */
export async function generateMetadata({ params }) {
  const { slug = [] } = await params;
  const resolved = await resolveCategoryByPathSegments(slug);
  if (!resolved) {
    return { title: 'Category Not Found | Store1920' };
  }

  const { category, chain } = resolved;
  return buildCategoryPageMetadata(category, chain);
}

export default async function CategoryPage({ params }) {
  const { slug = [] } = await params;

  const resolved = await resolveCategoryByPathSegments(slug);
  if (!resolved) notFound();

  const { category, chain, children, all = [], pathRedirect = false } = resolved;

  // Legacy / incomplete category paths → canonical matched category URL.
  if (pathRedirect) {
    redirect(buildCategoryUrl(chain));
  }

  const [{ products, total }, headerStats] = await Promise.all([
    getCategoryProducts(category._id, {
      page: 1,
      limit: CATEGORY_PRODUCTS_PAGE_SIZE,
      allCategories: all,
    }),
    getCategoryHeaderStats(category._id, { allCategories: all }),
  ]);
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd(chain);
  const collectionJsonLd = buildCategoryCollectionJsonLd(category, chain);

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />

      <CategoryPageView
        category={category}
        chain={chain}
        children={children}
        products={products}
        total={total}
        headerStats={headerStats}
      />
    </div>
  );
}
