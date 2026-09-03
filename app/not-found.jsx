'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getProductThumbnailUrl } from '@/lib/productMedia'
import { PRODUCT_CARD_GRID_CLASS_4, PRODUCT_CARD_CELL_CLASS } from '@/lib/storefrontCarousel'
import { getProductPath } from '@/lib/productUrl'
import { STORE1920_BRAND_NAME } from '@/lib/brandLogo'

const FALLBACK_IMAGE = 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'

const getProductImage = (product) => getProductThumbnailUrl(product, { fallback: FALLBACK_IMAGE })

const getProductPrice = (product) => {
  const value = Number(product?.price ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

const QUICK_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/fast-delivery', label: 'Fast Delivery' },
  { href: '/offers', label: 'Offers' },
  { href: '/blogs', label: 'Blog' },
  { href: '/contact-us', label: 'Contact' },
]

export default function NotFound() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products?limit=8', { cache: 'no-store' })
        const data = await response.json()
        if (!active) return
        const productList = Array.isArray(data?.products) ? data.products : []
        setProducts(productList.filter((item) => item?.slug || item?._id).slice(0, 8))
      } catch {
        if (active) setProducts([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProducts()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f5f2] text-[#1c1917]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 0% 0%, rgba(143,52,4,0.08), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 10%, rgba(28,25,23,0.05), transparent 50%), linear-gradient(180deg, #faf8f5 0%, #f1eee9 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(28,25,23,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(28,25,23,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(180deg, black 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        {/* Hero — one composition */}
        <section className="relative overflow-hidden rounded-2xl border border-[#e7e0d8] bg-[#fffdfb]/90 px-6 py-10 shadow-[0_24px_60px_rgba(28,25,23,0.06)] sm:px-10 sm:py-14 lg:px-14">
          <p
            className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none text-[9rem] font-black leading-none text-[#8f3404]/[0.07] sm:text-[12rem] lg:right-6 lg:text-[14rem]"
            style={{ fontFamily: 'var(--font-poppins), var(--font-montserrat), system-ui, sans-serif' }}
            aria-hidden
          >
            404
          </p>

          <p
            className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8f3404]"
            style={{ animation: 'nfFade 500ms ease both' }}
          >
            {STORE1920_BRAND_NAME}
          </p>

          <h1
            className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-[#1c1917] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: 'var(--font-poppins), var(--font-montserrat), system-ui, sans-serif', animation: 'nfRise 560ms ease 60ms both' }}
          >
            Lost the aisle.
            <span className="mt-1 block font-semibold text-[#57534e]">Found better picks.</span>
          </h1>

          <p
            className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#57534e]"
            style={{ animation: 'nfRise 560ms ease 120ms both' }}
          >
            This page isn’t here, but your cart still is. Jump home, keep shopping, or browse what’s moving right now.
          </p>

          <div
            className="mt-8 flex flex-wrap gap-3"
            style={{ animation: 'nfRise 560ms ease 180ms both' }}
          >
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-[#8f3404] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#732a03]"
            >
              Go Home
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center justify-center rounded-xl border border-[#d6cfc6] bg-white px-6 py-3 text-sm font-semibold text-[#1c1917] transition hover:border-[#8f3404]/40 hover:bg-[#faf7f3]"
            >
              Continue Shopping
            </Link>
            <Link
              href="/fast-delivery"
              className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-[#8f3404] underline-offset-4 hover:underline"
            >
              Fast Delivery
            </Link>
          </div>

          <nav
            className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#ebe4dc] pt-6 text-sm text-[#78716c]"
            style={{ animation: 'nfRise 560ms ease 240ms both' }}
            aria-label="Quick links"
          >
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="font-medium transition hover:text-[#8f3404]">
                {link.label}
              </Link>
            ))}
          </nav>
        </section>

        {/* Product recommendations */}
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f3404]">Still shopping</p>
              <h2
                className="mt-1 text-2xl font-black text-[#1c1917] sm:text-3xl"
                style={{ fontFamily: 'var(--font-poppins), var(--font-montserrat), system-ui, sans-serif' }}
              >
                Popular right now
              </h2>
            </div>
            <Link href="/shop" className="shrink-0 text-sm font-bold text-[#8f3404] hover:underline">
              View all
            </Link>
          </div>

          {loading ? (
            <div className={PRODUCT_CARD_GRID_CLASS_4}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`${PRODUCT_CARD_CELL_CLASS} overflow-hidden rounded-xl border border-[#ebe4dc] bg-white`}>
                  <div className="aspect-square animate-pulse bg-[#f0ebe5]" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-4/5 animate-pulse rounded bg-[#f0ebe5]" />
                    <div className="h-4 w-2/5 animate-pulse rounded bg-[#f0ebe5]" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className={PRODUCT_CARD_GRID_CLASS_4}>
              {products.map((product, index) => {
                const href = getProductPath(product)
                const price = getProductPrice(product)

                return (
                  <Link
                    key={product._id || product.slug}
                    href={href}
                    className={`${PRODUCT_CARD_CELL_CLASS} group block h-full overflow-hidden rounded-xl border border-[#ebe4dc] bg-white transition duration-300 hover:-translate-y-0.5 hover:border-[#d6cfc6] hover:shadow-[0_16px_32px_rgba(28,25,23,0.08)]`}
                    style={{ animation: `nfRise 420ms ease ${index * 45}ms both` }}
                  >
                    <div className="relative aspect-square overflow-hidden bg-[#faf7f3]">
                      <img
                        src={getProductImage(product)}
                        alt={product?.name || 'Product image'}
                        className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.04]"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-1.5 p-3">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-[#1c1917]">
                        {product?.name || 'Product'}
                      </p>
                      <p className="text-base font-black text-[#8f3404]">
                        AED {price.toLocaleString()}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d6cfc6] bg-white/70 px-6 py-10 text-center">
              <p className="text-sm text-[#57534e]">Recommendations are not available right now.</p>
              <Link href="/shop" className="mt-3 inline-block text-sm font-bold text-[#8f3404] hover:underline">
                Browse full catalog
              </Link>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        @keyframes nfFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nfRise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
