import { notFound } from 'next/navigation';
import CategoryPageView from '@/components/category/CategoryPageView';
import {
  resolveCategoryByPathSegments,
  getCategoryProducts,
  getCategoryHeaderStats,
  CATEGORY_PRODUCTS_PAGE_SIZE,
} from '@/lib/categoryPageData';
import {
  buildBreadcrumbListJsonLd,
  buildCategoryCanonicalUrl,
  buildCategoryMetaDescription,
  buildCategoryMetaTitle,
} from '@/lib/categorySeo';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { slug = [] } = await params;
  const resolved = await resolveCategoryByPathSegments(slug);
  if (!resolved) {
    return { title: 'Category Not Found | Store1920' };
  }

  const { category, chain } = resolved;
  const title = buildCategoryMetaTitle(category);
  const description = buildCategoryMetaDescription(category);
  const canonical = buildCategoryCanonicalUrl(chain);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }) {
  const { slug = [] } = await params;

  const resolved = await resolveCategoryByPathSegments(slug);
  if (!resolved) notFound();

  const { category, chain, children, all = [] } = resolved;
  const [{ products, total }, headerStats] = await Promise.all([
    getCategoryProducts(category._id, {
      page: 1,
      limit: CATEGORY_PRODUCTS_PAGE_SIZE,
      allCategories: all,
    }),
    getCategoryHeaderStats(category._id, { allCategories: all }),
  ]);
  const jsonLd = buildBreadcrumbListJsonLd(chain);

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
