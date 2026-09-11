'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { useStorefrontMarket } from '@/lib/useStorefrontMarket'
import { getProductThumbnailUrl } from '@/lib/productMedia'
import { getProductPath } from '@/lib/productUrl'
import CurrencySymbol from '@/components/CurrencySymbol'

const SocialProofPopup = () => {
  const [visible, setVisible] = useState(false)
  const [currentProduct, setCurrentProduct] = useState(null)
  const [products, setProducts] = useState([])
  const [mounted, setMounted] = useState(false)
  const { market, convertPrice } = useStorefrontMarket()

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Fetch recent products
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/social-proof-products')
        
        if (!res.ok) {
          // API response not OK
        } else {
          const data = await res.json()
          
          if (data.success && data.products && data.products.length > 0) {
            setProducts(data.products)
            return
          }
        }
      } catch (error) {
        // API error
      }
      
      // If API fails or returns no products, fetch from regular products endpoint
      try {
        const res2 = await fetch('/api/products?limit=20')
        const data2 = await res2.json()
        if (data2.products && data2.products.length > 0) {
          setProducts(data2.products)
        }
      } catch (error2) {
        // Fallback also failed
      }
    }

    fetchProducts()
  }, [mounted])

  useEffect(() => {
    if (products.length === 0) {
      return
    }

    const showRandomProduct = () => {
      const randomProduct = products[Math.floor(Math.random() * products.length)]
      const randomCustomers = Math.floor(Math.random() * 5) + 2 // 2-6 customers
      const randomSoldCount = Math.floor(Math.random() * 200) + 50 // 50-250 sold
      const randomStock = Math.floor(Math.random() * 30) + 5 // 5-35 left
      
      setCurrentProduct({
        ...randomProduct,
        verifiedCustomers: randomCustomers,
        soldInLastHour: randomSoldCount,
        leftInStock: randomStock
      })
      setVisible(true)

      // Auto hide after 8 seconds
      setTimeout(() => {
        setVisible(false)
      }, 8000)
    }

    // Show first popup after 2 seconds (for testing - change to 5000 for production)
    const initialTimeout = setTimeout(() => {
      showRandomProduct()
    }, 2000)

    // Show popup every 30-45 seconds
    const interval = setInterval(() => {
      const randomDelay = Math.floor(Math.random() * 15000) + 30000 // 30-45 seconds
      setTimeout(showRandomProduct, randomDelay)
    }, 45000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [products])

  if (!mounted) {
    return null
  }

  if (!visible || !currentProduct) {
    return null
  }

  return (
    <div 
      className="hidden lg:block fixed bottom-4 left-4 z-[9999] transform transition-all duration-500 ease-out"
      style={{ 
        maxWidth: '340px',
        width: '340px',
        transform: visible ? 'translateX(0)' : 'translateX(-120%)',
        opacity: visible ? 1 : 0
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl border-2 border-green-500 overflow-hidden animate-slideIn">
        {/* Green Badge */}
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => setVisible(false)}
          className="absolute top-2 right-2 z-10 bg-white/80 backdrop-blur-sm rounded-full p-1 hover:bg-white transition"
        >
          <X size={14} className="text-slate-600" />
        </button>

        <Link href={getProductPath(currentProduct)} onClick={() => setVisible(false)}>
          <div className="flex gap-3 p-3 hover:bg-slate-50 transition cursor-pointer">
            {/* Product Image */}
            <div className="relative w-16 h-16 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden">
              {getProductThumbnailUrl(currentProduct, { fallback: '' }) ? (
                <img
                  src={getProductThumbnailUrl(currentProduct)}
                  alt={currentProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  No Image
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 text-xs line-clamp-2 mb-1.5">
                {currentProduct.name}
              </h3>

              {/* Verified Customers */}
              <div className="flex items-center gap-1 mb-1">
                <div className="flex items-center gap-1 text-[10px] text-slate-600">
                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="font-medium">{currentProduct.verifiedCustomers}</span>
                  <span>verified customers</span>
                </div>
              </div>

              {/* Sold Count */}
              <div className="flex items-center gap-1 text-[10px] text-orange-600 mb-0.5">
                <span className="text-sm">🔥</span>
                <span className="font-semibold">{currentProduct.soldInLastHour}+</span>
                <span>sold today</span>
              </div>

              {/* Stock Warning */}
              <div className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                <span className="text-xs">⏰</span>
                <span>Only</span>
                <span className="font-bold text-red-700">{currentProduct.leftInStock}</span>
                <span>left</span>
              </div>
            </div>
          </div>
        </Link>

        {/* Price Tag */}
        {currentProduct.price && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-3 py-1.5 flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="inline-flex items-baseline gap-1 text-sm font-bold text-white">
                <CurrencySymbol currency={market.currency} />
                {Math.round(convertPrice(Number(currentProduct.price) || 0))}
              </span>
              {currentProduct.AED > currentProduct.price && (
                <span className="inline-flex items-baseline gap-1 text-xs text-white/70 line-through">
                  <CurrencySymbol currency={market.currency} />
                  {Math.round(convertPrice(Number(currentProduct.AED) || 0))}
                </span>
              )}
            </div>
            <Link 
              href={getProductPath(currentProduct)}
              onClick={() => setVisible(false)}
              className="bg-white text-green-600 px-3 py-1 rounded-md text-xs font-semibold hover:bg-green-50 transition"
            >
              View
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default SocialProofPopup
