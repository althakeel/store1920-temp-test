'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'

const ExitIntentPopup = () => {
  const [showPopup, setShowPopup] = useState(false)
  const [hasShown, setHasShown] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Don't show on dashboard, store, or admin pages
  const shouldShowPopup = !pathname?.startsWith('/dashboard') && 
                          !pathname?.startsWith('/store') && 
                          !pathname?.startsWith('/admin')

  useEffect(() => {
    // Don't run if on excluded pages
    if (!shouldShowPopup) return

    // Check if user opted out
    const dontShow = localStorage.getItem('exitPopupDontShow')
    if (dontShow === 'true') {
      setDontShowAgain(true)
      return
    }

    // Check if already shown in this session
    const shown = sessionStorage.getItem('exitPopupShown')
    if (shown) {
      setHasShown(true)
      return
    }

    const handleMouseLeave = (e) => {
      // Only trigger when mouse leaves from top of page (typical exit behavior)
      if (e.clientY < 10 && !hasShown) {
        setShowPopup(true)
        setHasShown(true)
        sessionStorage.setItem('exitPopupShown', 'true')
      }
    }

    // Add event listener for mouse leaving viewport
    document.addEventListener('mouseleave', handleMouseLeave)

    // Cleanup
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [hasShown, shouldShowPopup])

  // Check if user has items in cart or recently viewed products
  useEffect(() => {
    // Don't run if on excluded pages or if user opted out
    if (!shouldShowPopup || dontShowAgain) return

    // Check localStorage for cart items
    const checkCart = () => {
      try {
        const cartData = localStorage.getItem('cart')
        if (cartData) {
          const cart = JSON.parse(cartData)
          if (cart && Object.keys(cart).length > 0) {
            return true
          }
        }
      } catch (error) {
        console.error('Error checking cart:', error)
      }
      return false
    }

    // If user has items in cart, be more aggressive with popup
    if (checkCart()) {
      const timer = setTimeout(() => {
        if (!hasShown && !sessionStorage.getItem('exitPopupShown')) {
          setShowPopup(true)
          setHasShown(true)
          sessionStorage.setItem('exitPopupShown', 'true')
        }
      }, 30000) // Show after 30 seconds if they have cart items

      return () => clearTimeout(timer)
    }
  }, [hasShown, shouldShowPopup, dontShowAgain])

  const handleClose = () => {
    setShowPopup(false)
  }

  const handleDontShowAgain = () => {
    localStorage.setItem('exitPopupDontShow', 'true')
    setDontShowAgain(true)
    setShowPopup(false)
  }

  const handleContinueShopping = () => {
    setShowPopup(false)
    router.push('/products')
  }

  const handleCheckout = () => {
    setShowPopup(false)
    router.push('/checkout')
  }

  if (!showPopup) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[9998] backdrop-blur-sm animate-fadeIn"
        onClick={handleClose}
      />
      
      {/* Popup */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-slideUp relative">
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
          >
            <X size={24} />
          </button>

          {/* Content */}
          <div className="p-8 text-center">
            {/* Icon */}
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🛍️</span>
            </div>

            {/* Heading */}
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Wait! Don't Leave Yet!
            </h2>
            
            <p className="text-slate-600 mb-6">
              You have items waiting in your cart. Complete your purchase now and enjoy:
            </p>

            {/* Benefits */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 mb-6 text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Shipping offers on eligible orders</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Easy returns per our return policy</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Secure payment & fast delivery</span>
                </div>
              </div>
            </div>

            {/* Special Offer Badge */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-4 py-2 rounded-lg mb-6 inline-block">
              <p className="text-sm font-bold">🎉 Limited Time: Extra 10% OFF!</p>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCheckout}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 rounded-xl font-semibold hover:from-orange-600 hover:to-orange-700 transition shadow-lg hover:shadow-xl"
              >
                Complete My Purchase
              </button>
              <button
                onClick={handleContinueShopping}
                className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-200 transition"
              >
                Continue Shopping
              </button>
              <button
                onClick={handleClose}
                className="text-slate-400 text-sm hover:text-slate-600 transition"
              >
                Maybe later
              </button>
              <button
                onClick={handleDontShowAgain}
                className="text-slate-400 text-xs hover:text-slate-600 transition mt-2"
              >
                Don't show this popup again
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default ExitIntentPopup
