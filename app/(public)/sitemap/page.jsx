import Link from 'next/link';
import { getHtmlSitemapData } from '@/lib/htmlSitemapData';
import SitemapProductsSection from '@/components/SitemapProductsSection';
import { STORE1920_BRAND_NAME } from '@/lib/brandLogo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sitemap | Store1920',
  description:
    'Browse every public page, category, product, and blog post on Store1920. This HTML sitemap updates automatically from the live catalog.',
};

const NAV_LABELS = {
  shop: 'Shop',
  budget: 'Budget',
  categories: 'Categories',
  products: 'Products',
  blogs: 'Blog',
  account: 'Account',
  help: 'Help',
  policies: 'Policies',
  about: 'About',
};

function SectionBlock({ section }) {
  const links = Array.isArray(section.links) ? section.links : [];

  return (
    <section id={`sitemap-${section.id}`} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-stone-300 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E52721]">
            {NAV_LABELS[section.id] || 'Section'}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{section.title}</h2>
        </div>
        {links.length > 0 ? (
          <p className="text-sm text-stone-500">{links.length.toLocaleString()} links</p>
        ) : null}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-stone-500">{section.emptyMessage || 'Nothing listed yet.'}</p>
      ) : (
        <ul className="columns-1 gap-x-10 sm:columns-2">
          {links.map((link) => {
            const depth = Number(link.depth) || 0;
            return (
              <li
                key={`${section.id}-${link.path}`}
                className="mb-2.5 break-inside-avoid"
                style={depth > 0 ? { paddingInlineStart: `${Math.min(depth, 3) * 0.85}rem` } : undefined}
              >
                <Link
                  href={link.path || '#'}
                  className="text-sm font-medium text-stone-800 transition hover:text-[#E52721]"
                  title={link.description || link.text}
                >
                  {depth > 0 ? <span className="me-1 text-stone-300">–</span> : null}
                  {link.text}
                </Link>
                {link.description ? (
                  <p className="ms-0.5 text-xs text-stone-500">{link.description}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function SitemapPage() {
  const { sections, products, stats } = await getHtmlSitemapData();

  const beforeProducts = sections.filter((section) => (
    section.id === 'shop' || section.id === 'budget' || section.id === 'categories'
  ));
  const afterProducts = sections.filter((section) => (
    section.id !== 'shop' && section.id !== 'budget' && section.id !== 'categories'
  ));

  const navItems = [
    ...beforeProducts.map((section) => ({ id: section.id, label: NAV_LABELS[section.id] || section.title })),
    { id: 'products', label: 'Products' },
    ...afterProducts.map((section) => ({ id: section.id, label: NAV_LABELS[section.id] || section.title })),
  ];

  return (
    <div className="min-h-screen bg-[#f4f2ef] text-stone-900">
      <header className="relative overflow-hidden bg-[#1c1917] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(229,39,33,0.35), transparent 42%), radial-gradient(circle at 88% 10%, rgba(255,255,255,0.08), transparent 35%), linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative mx-auto max-w-[1280px] px-4 py-14 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#fca5a5]">
            {STORE1920_BRAND_NAME}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Site map
          </h1>
          <p className="mt-4 max-w-2xl text-base text-stone-300 md:text-lg">
            A live directory of pages, categories, products, and posts — rebuilt from the catalog whenever it changes.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {[
              { label: 'Categories', value: stats.categories },
              { label: 'Products', value: stats.products },
              { label: 'Posts', value: stats.blogs },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-stone-200 backdrop-blur-sm"
              >
                <span className="font-semibold text-white">{Number(item.value || 0).toLocaleString()}</span>
                <span className="ms-2 text-stone-400">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-400">
            <span>Search Console:</span>
            <a href="/sitemap.xml" className="text-white underline-offset-4 hover:underline">/sitemap.xml</a>
            <a href="/sitemap-products.xml" className="hover:text-white">products</a>
            <a href="/sitemap-categories.xml" className="hover:text-white">categories</a>
            <a href="/sitemap-pages.xml" className="hover:text-white">pages</a>
            <a href="/sitemap-blog.xml" className="hover:text-white">blog</a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Jump to</p>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#sitemap-${item.id}`}
                className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-500 hover:text-stone-900 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:px-2 lg:py-1.5 lg:hover:bg-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-14">
          {beforeProducts.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}

          <SitemapProductsSection
            initialLinks={products.initialLinks}
            total={products.total}
            initialPage={products.page}
            pageSize={products.limit}
            initialHasMore={products.hasMore}
          />

          {afterProducts.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}

          <section className="border-t border-stone-300 pt-10">
            <h3 className="text-xl font-semibold text-stone-900">Need a hand?</h3>
            <p className="mt-2 max-w-xl text-stone-600">
              If you still can&apos;t find a page, support can point you the right way.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/support"
                className="rounded-lg bg-[#1c1917] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Contact support
              </Link>
              <Link
                href="/help"
                className="rounded-lg border border-stone-400 bg-transparent px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-stone-700"
              >
                Help center
              </Link>
              <Link
                href="/"
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900"
              >
                ← Home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
