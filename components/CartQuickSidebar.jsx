'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from '@/components/SafeNextImage'
import Link from 'next/link'
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import axios from 'axios'
import { useDispatch, useSelector } from 'react-redux'
import { useStorefrontMarket } from '@/lib/useStorefrontMarket'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import { deleteItemFromCart, fetchCart, uploadCart } from '@/lib/features/cart/cartSlice'
import { useAuth } from '@/lib/useAuth'
import { getCartEntryProductId, getCartEntryQuantity, isFreeGiftEntry } from '@/lib/freeGiftUtils'
import { pushGtmEcommerceEvent, toGtmItem } from '@/lib/pushGtmEcommerceEvent'
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents'
import { GA4_CURRENCY } from '@/lib/ga4Item'
import { resolveCartLinePricing } from '@/lib/bulkBundleCart'
import { decrementCartItem, incrementCartItem } from '@/lib/bundleCartActions'

const getQty = (entry) => {
  if (typeof entry === 'number') return entry
  return entry?.quantity || 0
}

import { getProductThumbnailUrl } from '@/lib/productMedia'

const getImageSrc = (product) => {
  if (!product) return '/placeholder.png'
  return getProductThumbnailUrl(product, { fallback: '/placeholder.png' })
}

export default function CartQuickSidebar() {
  const dispatch = useDispatch()
  const { getToken, user } = useAuth()
  const { cartItems = {}, total = 0 } = useSelector((state) => state.cart || {})
  const products = useSelector((state) => state.product?.list || [])
  const { market, convertPrice, formatDisplay } = useStorefrontMarket()
  const { isArabic } = useStorefrontI18n()
  const pathname = usePathname()

  const [visible, setVisible] = useState(false)

  const previousItemsRef = useRef({})
  const previousTotalRef = useRef(0)

  const productMap = useMemo(() => {
    const map = new Map()
    for (const product of products) {
      const id = String(product?._id || product?.id || '')
      if (id) map.set(id, product)
    }
    return map
  }, [products])

  const cartRows = useMemo(() => {
    const rows = []
    for (const [cartKey, entry] of Object.entries(cartItems || {})) {
      const qty = getCartEntryQuantity(entry)
      if (qty <= 0) continue
      const productId = getCartEntryProductId(cartKey, entry)
      const product = productMap.get(String(productId))
      if (!product) continue

      const isFreeGift = isFreeGiftEntry(entry)
      const pricing = resolveCartLinePricing(product, entry, qty)
      const convertedUnitPrice = convertPrice(pricing.unitPrice)
      const convertedLineTotal = convertPrice(pricing.lineTotal)
      rows.push({
        productId: cartKey,
        actualProductId: productId,
        qty: pricing.displayQuantity ?? qty,
        name: product.name || 'Product',
        image: getImageSrc(product),
        convertedUnitPrice,
        convertedLineTotal,
        isFreeGift,
        product,
        entry,
      })
    }
    return rows
  }, [cartItems, productMap, convertPrice])

  const convertedSubtotal = useMemo(
    () => convertPrice(cartRows.reduce((sum, row) => sum + Number(row.convertedLineTotal || 0), 0)),
    [cartRows, convertPrice],
  )

  const shouldHideOnPage =
    pathname === '/cart' ||
    pathname === '/checkout' ||
    pathname?.startsWith('/dashboard')

  const syncCartIfNeeded = async () => {
    if (!user) return
    try {
      await dispatch(uploadCart({ getToken }))
    } catch {
      // keep UI responsive even if sync fails
    }
  }

  const handleIncrease = async (productId) => {
    const id = String(productId)
    const entry = cartItems?.[id]
    const product = cartRows.find((row) => String(row.productId) === id)?.product
    incrementCartItem(dispatch, { productId: id, entry, product })
    await syncCartIfNeeded()
  }

  const handleDecrease = async (productId) => {
    const id = String(productId)
    const entry = cartItems?.[id]
    const product = cartRows.find((row) => String(row.productId) === id)?.product
    const currentQty = getQty(entry)

    if (!product && currentQty <= 1) {
      await handleDelete(id)
      return
    }

    decrementCartItem(dispatch, { productId: id, entry, product })
    await syncCartIfNeeded()
  }

  const handleDelete = async (productId) => {
    const id = String(productId)
    const row = cartRows.find((entry) => String(entry.productId) === id)
    if (row) {
      pushGtmEcommerceEvent(GTM_EVENTS.REMOVE_FROM_CART, {
        currency: GA4_CURRENCY,
        value: Number(row.product?._cartPrice ?? row.product?.price ?? row.convertedUnitPrice ?? 0) * Number(row.qty || 1),
        items: [toGtmItem(row.product || {
          _id: row.actualProductId,
          name: row.name,
          price: row.product?.price ?? row.convertedUnitPrice,
          quantity: row.qty,
        }, {
          price: Number(row.product?._cartPrice ?? row.product?.price ?? row.convertedUnitPrice ?? 0),
          quantity: row.qty,
        })],
      })
    }

    dispatch(deleteItemFromCart({ productId: id }))

    if (user) {
      try {
        const token = await getToken?.()
        if (token) {
          await axios.delete(`/api/cart?productId=${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { productId: id },
          })
          await dispatch(fetchCart({ getToken }))
          return
        }
      } catch {
        // Fallback to full cart upload when direct delete fails.
      }
    }

    await syncCartIfNeeded()
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    const shouldCompress = visible && !shouldHideOnPage && cartRows.length > 0
    const activeClass = isArabic ? 'cart-sidebar-compressed-left' : 'cart-sidebar-compressed-right'
    const inactiveClass = isArabic ? 'cart-sidebar-compressed-right' : 'cart-sidebar-compressed-left'

    document.body.classList.toggle(activeClass, shouldCompress)
    document.body.classList.remove(inactiveClass)
    // Backward compatibility for legacy class name
    document.body.classList.remove('cart-sidebar-compressed')

    return () => {
      document.body.classList.remove('cart-sidebar-compressed-left')
      document.body.classList.remove('cart-sidebar-compressed-right')
      document.body.classList.remove('cart-sidebar-compressed')
    }
  }, [visible, shouldHideOnPage, cartRows.length, isArabic])

  useEffect(() => {
    const previousItems = previousItemsRef.current || {}
    let increased = false

    for (const [productId, entry] of Object.entries(cartItems)) {
      const previousQty = getQty(previousItems[productId])
      const nextQty = getQty(entry)
      if (nextQty > previousQty) {
        increased = true
        break
      }
    }

    if (increased || total > previousTotalRef.current) {
      setVisible(true)
    }

    previousItemsRef.current = { ...cartItems }
    previousTotalRef.current = total
  }, [cartItems, total])

  if (shouldHideOnPage || cartRows.length === 0) return null

  return (
    <>
      <div className={`pointer-events-none fixed inset-y-0 z-[90] hidden md:block w-[175px] max-w-[calc(100vw-16px)] ${
        isArabic ? 'left-0' : 'right-0'
      }`} dir="ltr">
      <aside
        className={`pointer-events-auto h-screen w-full ${
          isArabic ? 'border-r border-slate-200' : 'border-l border-slate-200'
        } bg-white shadow-2xl transition-transform duration-300 ${
          visible ? 'translate-x-0' : (isArabic ? '-translate-x-full' : 'translate-x-full')
        }`}
        aria-live="polite"
      >
        <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <ShoppingCart size={13} />
              <span>Subtotal</span>
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <p className="text-lg font-extrabold text-slate-900">
            {market.currency} {formatDisplay(convertedSubtotal || 0)}
          </p>

          <div className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
            Free shipping special for you
          </div>

          <div className="mt-3 space-y-2">
            <Link
              href="/checkout"
              onClick={() => setVisible(false)}
              className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-orange-600"
            >
              Checkout
            </Link>
            <Link
              href="/cart"
              onClick={() => setVisible(false)}
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go to cart
            </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="mb-2 text-[11px] font-semibold text-slate-700">Select all ({cartRows.length})</div>

          <div className="space-y-3">
            {cartRows.map((item) => (
              <div key={item.productId} className="rounded-md border border-slate-100 bg-white p-1.5">
                <div className="relative mx-auto h-20 w-full overflow-hidden rounded-md bg-slate-50">
                  <Image src={item.image} alt={item.name} fill className="object-contain" />
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">{item.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-900">
                  {item.isFreeGift ? 'FREE' : `${market.currency} ${formatDisplay(item.convertedUnitPrice || 0)}`}
                </p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  {item.isFreeGift ? (
                    <div className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700">Free gift</div>
                  ) : (
                    <div className="inline-flex items-center rounded-md border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleDecrease(item.productId)}
                        className="inline-flex h-5 w-5 items-center justify-center text-slate-600 hover:bg-slate-100"
                        aria-label={item.qty === 1 ? 'Delete item' : 'Decrease quantity'}
                      >
                        {item.qty === 1 ? <Trash2 size={12} /> : <Minus size={12} />}
                      </button>
                      <span className="min-w-[22px] text-center text-[10px] font-semibold text-slate-700">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => handleIncrease(item.productId)}
                        className="inline-flex h-5 w-5 items-center justify-center text-slate-600 hover:bg-slate-100"
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(item.productId)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
                    aria-label="Delete item"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </aside>
      </div>
    </>
  )
}
