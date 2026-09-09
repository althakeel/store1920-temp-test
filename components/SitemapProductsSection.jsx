'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

export default function SitemapProductsSection({
  initialLinks = [],
  total = 0,
  initialPage = 1,
  pageSize = 50,
  initialHasMore = false,
}) {
  const [links, setLinks] = useState(initialLinks);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const nextPage = page + 1;
      const { data } = await axios.get('/api/public/sitemap-products', {
        params: { page: nextPage, limit: pageSize },
      });

      const nextLinks = Array.isArray(data?.links) ? data.links : [];
      setLinks((prev) => {
        const seen = new Set(prev.map((item) => item.path));
        const merged = [...prev];
        nextLinks.forEach((item) => {
          if (item?.path && !seen.has(item.path)) {
            seen.add(item.path);
            merged.push(item);
          }
        });
        return merged;
      });
      setPage(data?.page || nextPage);
      setHasMore(Boolean(data?.hasMore));
    } catch (err) {
      console.error('Sitemap products scroll load failed:', err);
      setError('Could not load more products. Scroll again to retry.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = listRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root, rootMargin: '160px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <section id="sitemap-products" className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-stone-300 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E52721]">Live catalog</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">Products</h2>
        </div>
        <p className="text-sm text-stone-500">
          Loaded {links.length.toLocaleString()} / {total.toLocaleString()}
          <span className="mx-2 text-stone-300">·</span>
          <Link href="/shop" className="font-medium text-stone-800 underline-offset-2 hover:text-[#E52721] hover:underline">
            Shop all
          </Link>
          <span className="mx-2 text-stone-300">·</span>
          <a href="/sitemap-products.xml" className="font-medium text-stone-800 underline-offset-2 hover:text-[#E52721] hover:underline">
            XML
          </a>
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-stone-500">No published products yet.</p>
      ) : (
        <div
          ref={listRef}
          className="max-h-[32rem] overflow-y-auto rounded-xl border border-stone-200 bg-white/80 p-4 backdrop-blur-sm"
        >
          <ul className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
            {links.map((link) => (
              <li key={link.path} className="mb-2 break-inside-avoid">
                <Link
                  href={link.path || '#'}
                  className="text-sm text-stone-700 transition hover:text-[#E52721]"
                  title={link.text}
                >
                  {link.text}
                </Link>
              </li>
            ))}
          </ul>
          <div ref={sentinelRef} className="mt-4 border-t border-stone-100 pt-3 text-center text-xs text-stone-400">
            {loading ? 'Loading more products…' : hasMore ? 'Scroll inside this list to load more' : 'All listed products loaded'}
          </div>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-[#E52721]">{error}</p> : null}
    </section>
  );
}
