'use client'

import { useEffect, useState } from 'react'
import { useHorizontalCarouselDrag } from '@/lib/useHorizontalCarouselDrag'
import { auth, waitForAuthReady } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Loading from '@/components/Loading'
import Link from 'next/link'
import axios from 'axios'
import toast from 'react-hot-toast'
import DashboardSidebar from '@/components/DashboardSidebar'
import { downloadInvoice } from '@/lib/generateInvoice'
import DeliveryReviewModal from '@/components/DeliveryReviewModal'
import ReviewForm from '@/components/ReviewForm'
import { GUEST_ORDERS_LINKED_EVENT, linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient'
import { getDisplayOrderNumber, getPublicTrackingDisplayId } from '@/lib/orderDisplay'

export default function DashboardOrdersPage() {
  const [user, setUser] = useState(undefined)
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const {
    scrollRef: tabsScrollRef,
    isDragging: isTabsDragging,
    handlePointerDown: handleTabsPointerDown,
    handleCardClick: handleTabsDragClick,
    shouldSuppressClick: shouldSuppressTabsClick,
  } = useHorizontalCarouselDrag({
    enableSnap: false,
    enableMomentum: true,
    enableTouchDrag: true,
  })
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [returnType, setReturnType] = useState('RETURN')
  const [returnReason, setReturnReason] = useState('')
  const [returnDescription, setReturnDescription] = useState('')
  const [submittingReturn, setSubmittingReturn] = useState(false)
  const [returnFiles, setReturnFiles] = useState([])
  const [uploadError, setUploadError] = useState('')
  const [refreshingTracking, setRefreshingTracking] = useState(false)
  const [cancellingOrderId, setCancellingOrderId] = useState(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [creatingTicketForOrderId, setCreatingTicketForOrderId] = useState(null)
  const [activeReviewKey, setActiveReviewKey] = useState(null)
  const [showDeliveryReviewModal, setShowDeliveryReviewModal] = useState(false)
  const [selectedOrderForReview, setSelectedOrderForReview] = useState(null)
  const [submittingDeliveryReview, setSubmittingDeliveryReview] = useState(false)

  const orderStatuses = [
    { value: 'ALL', label: 'All Orders', icon: '📦' },
    { value: 'CONFIRMED', label: 'Processing', icon: '⏳' },
    { value: 'SHIPPED', label: 'Shipped', icon: '🚚' },
    { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: '📍' },
    { value: 'DELIVERED', label: 'Delivered', icon: '✅' },
    { value: 'RETURN_REQUESTED', label: 'Return Requested', icon: '↩️' },
    { value: 'RETURNED', label: 'Returned', icon: '↩️✓' },
    { value: 'CANCELLED', label: 'Cancelled', icon: '❌' }
  ]

  // Helper function to compute correct payment status
  const getPaymentStatus = (order) => {
    const paymentMethod = String(order?.paymentMethod || '').toLowerCase();
    const status = String(order?.status || '').toUpperCase();
    const paymentStatus = String(order?.paymentStatus || '').toLowerCase();

    if (paymentMethod === 'cod') {
      if (status === 'DELIVERED') return true;
      if (order?.delhivery?.payment?.is_cod_recovered) return true;
      return !!order?.isPaid;
    }

    if (status === 'PAYMENT_FAILED') return false;
    if (['failed', 'payment_failed', 'refunded', 'unpaid'].includes(paymentStatus)) return false;

    // Razorpay/card/online orders should be considered paid unless explicitly failed
    if (paymentMethod) return true;

    return !!order?.isPaid;
  }

  const canCancelOrder = (order) => {
    const status = String(order?.status || '').toUpperCase()
    const trackingStatus = String(order?.delhivery?.current_status || '').toUpperCase()

    const blockedKeywords = ['SHIPPED', 'TRANSIT', 'IN TRANSIT', 'OUT_FOR_DELIVERY', 'OUT FOR DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED']
    const hasBlockedTrackingStatus = blockedKeywords.some((k) => trackingStatus.includes(k))

    if (hasBlockedTrackingStatus) return false

    return ['ORDER_PLACED', 'CONFIRMED', 'PROCESSING', 'PICKUP_REQUESTED', 'WAITING_FOR_PICKUP'].includes(status)
  }

  const openCancelOrderModal = (order, e) => {
    e?.stopPropagation?.()
    if (!canCancelOrder(order)) {
      toast.error('This order cannot be cancelled now')
      return
    }
    setCancelOrderTarget(order)
    setCancelReason('')
    setCancelNote('')
    setShowCancelModal(true)
  }

  const closeCancelOrderModal = () => {
    if (cancellingOrderId) return
    setShowCancelModal(false)
    setCancelOrderTarget(null)
    setCancelReason('')
    setCancelNote('')
  }

  const handleCancelOrder = async () => {
    const order = cancelOrderTarget
    const orderId = order?._id || order?.id
    if (!orderId) return
    if (!canCancelOrder(order)) {
      toast.error('This order cannot be cancelled now')
      return
    }

    if (!cancelReason) {
      toast.error('Please select a cancellation reason')
      return
    }

    const fullCancelReason = cancelNote?.trim()
      ? `${cancelReason}: ${cancelNote.trim()}`
      : cancelReason

    try {
      setCancellingOrderId(orderId)
      const token = await auth.currentUser.getIdToken(true)
      await axios.post('/api/orders/cancel', {
        orderId,
        reason: fullCancelReason,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const refreshed = await axios.get('/api/orders', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const refreshedList = Array.isArray(refreshed?.data?.orders)
        ? refreshed.data.orders
        : (Array.isArray(refreshed?.data) ? refreshed.data : [])
      setOrders(refreshedList)

      toast.success('Order cancelled successfully')
      closeCancelOrderModal()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to cancel order')
    } finally {
      setCancellingOrderId(null)
    }
  }

  const handleCreateSupportTicket = async (order, item = null, e = null) => {
    e?.stopPropagation?.()
    try {
      const orderId = order?._id || order?.id
      if (!orderId) return
      setCreatingTicketForOrderId(orderId)

      const token = await auth.currentUser.getIdToken(true)
      const itemName = item?.name || item?.productId?.name || 'Order item'
      const orderNo = getDisplayOrderNumber(order) || 'Pending'

      const { data } = await axios.post('/api/tickets', {
        subject: `Order Support - #${orderNo}`,
        category: 'Order Issue',
        priority: 'normal',
        orderId,
        description: `Need support for order #${orderNo}${item ? `\nProduct: ${itemName}` : ''}.`,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      toast.success('Support ticket created')
      const ticketId = data?.ticket?._id
      if (ticketId) {
        window.location.href = `/dashboard/tickets/${ticketId}`
      } else {
        window.location.href = '/dashboard/tickets'
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create support ticket')
    } finally {
      setCreatingTicketForOrderId(null)
    }
  }

  const filteredOrders = selectedStatus === 'ALL' ? orders : orders.filter(order => order.status === selectedStatus)

  const checkScrollPosition = () => {
    const container = tabsScrollRef.current
    if (container) {
      setShowLeftArrow(container.scrollLeft > 0)
      setShowRightArrow(container.scrollLeft < container.scrollWidth - container.clientWidth - 1)
    }
  }

  const scrollTabs = (direction) => {
    const container = tabsScrollRef.current
    if (container) {
      const scrollAmount = 200
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
      setTimeout(checkScrollPosition, 300)
    }
  }

  useEffect(() => {
    checkScrollPosition()
    const container = tabsScrollRef.current
    if (container) {
      container.addEventListener('scroll', checkScrollPosition)
      window.addEventListener('resize', checkScrollPosition)
      const onWheel = (event) => {
        if (container.scrollWidth <= container.clientWidth) return
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
        event.preventDefault()
        container.scrollLeft += event.deltaY
      }
      container.addEventListener('wheel', onWheel, { passive: false })
      return () => {
        container.removeEventListener('scroll', checkScrollPosition)
        container.removeEventListener('wheel', onWheel)
        window.removeEventListener('resize', checkScrollPosition)
      }
    }
  }, [orders])

  useEffect(() => {
    let cancelled = false
    let unsub = () => {}
    ;(async () => {
      await waitForAuthReady()
      if (cancelled) return
      setUser(auth.currentUser ?? null)
      unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null))
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  useEffect(() => {
    if (user !== null) return undefined
    window.dispatchEvent(new CustomEvent('openSignInModal', { detail: { mode: 'login' } }))
    return undefined
  }, [user])

  useEffect(() => {
    const loadOrders = async () => {
      if (!user) return
      try {
        setLoadingOrders(true)
        const token = await auth.currentUser.getIdToken(true)
        await linkGuestOrdersForCurrentUser(auth.currentUser, token)
        const { data } = await axios.get('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
        })
        let list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : [])
        
        // Fetch latest Delhivery tracking status for orders with trackingId
        list = await Promise.all(list.map(async (order) => {
          let updatedOrder = { ...order };
          
          if (order.trackingId) {
            try {
              const trackingResponse = await axios.get(`/api/track-order?awb=${order.trackingId}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (trackingResponse.data.success && trackingResponse.data.order) {
                updatedOrder = {
                  ...updatedOrder,
                  delhivery: trackingResponse.data.order.delhivery,
                  status: trackingResponse.data.order.status || updatedOrder.status,
                  trackingUrl: trackingResponse.data.order.trackingUrl || updatedOrder.trackingUrl
                };
              }
            } catch (error) {
              console.error(`Failed to fetch tracking for ${order.trackingId}:`, error);
            }
          }
          
          const paymentMethod = String(updatedOrder?.paymentMethod || '').toLowerCase();
          const status = String(updatedOrder?.status || '').toUpperCase();
          const paymentStatus = String(updatedOrder?.paymentStatus || '').toLowerCase();

          if (paymentMethod === 'cod') {
            if (status === 'DELIVERED' || updatedOrder?.delhivery?.payment?.is_cod_recovered) {
              updatedOrder.isPaid = true;
            }
          } else if (!['failed', 'payment_failed', 'refunded', 'unpaid'].includes(paymentStatus) && status !== 'PAYMENT_FAILED') {
            updatedOrder.isPaid = true;
          }
          
          return updatedOrder;
        }));
        
        setOrders(list)
      } catch (err) {
        console.error('[DASHBOARD ORDERS] Fetch error:', err?.response?.data || err.message)
        toast.error(err?.response?.data?.error || 'Failed to load orders')
      } finally {
        setLoadingOrders(false)
      }
    }
    loadOrders()
  }, [user])

  useEffect(() => {
    const handleGuestOrdersLinked = () => {
      if (!auth.currentUser) return
      setLoadingOrders(true)
      auth.currentUser.getIdToken(true).then(async (token) => {
        await linkGuestOrdersForCurrentUser(auth.currentUser, token)
        const { data } = await axios.get('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : [])
        setOrders(list)
        setLoadingOrders(false)
      }).catch(() => setLoadingOrders(false))
    }

    window.addEventListener(GUEST_ORDERS_LINKED_EVENT, handleGuestOrdersLinked)
    return () => window.removeEventListener(GUEST_ORDERS_LINKED_EVENT, handleGuestOrdersLinked)
  }, [])

  // Auto-refresh tracking data every 30 seconds for expanded order
  useEffect(() => {
    if (!expandedOrder) return;

    const expandedOrderData = orders.find(o => (o._id || o.id) === expandedOrder);
    if (!expandedOrderData?.trackingId) return;

    const fetchTrackingData = async () => {
      try {
        setRefreshingTracking(true);
        const response = await axios.get(`/api/track-order?awb=${expandedOrderData.trackingId}`);
        if (response.data.success && response.data.order) {
          // Update the specific order with fresh tracking data
          setOrders(prevOrders => 
            prevOrders.map(order => {
              if ((order._id || order.id) === expandedOrder) {
                let updatedOrder = {
                  ...order,
                  delhivery: response.data.order.delhivery,
                  status: response.data.order.status || order.status,
                  trackingUrl: response.data.order.trackingUrl || order.trackingUrl
                };
                const paymentMethod = String(updatedOrder?.paymentMethod || '').toLowerCase();
                const status = String(updatedOrder?.status || '').toUpperCase();
                const paymentStatus = String(updatedOrder?.paymentStatus || '').toLowerCase();

                if (paymentMethod === 'cod') {
                  if (status === 'DELIVERED' || updatedOrder?.delhivery?.payment?.is_cod_recovered) {
                    updatedOrder.isPaid = true;
                  }
                } else if (!['failed', 'payment_failed', 'refunded', 'unpaid'].includes(paymentStatus) && status !== 'PAYMENT_FAILED') {
                  updatedOrder.isPaid = true;
                }
                return updatedOrder;
              }
              return order;
            })
          );
        }
      } catch (error) {
        console.error('Auto-refresh tracking error:', error);
      } finally {
        setRefreshingTracking(false);
      }
    };

    // Fetch immediately when expanded
    fetchTrackingData();

    // Set up 30-second interval
    const interval = setInterval(fetchTrackingData, 30000);

    // Cleanup interval when order is collapsed or component unmounts
    return () => clearInterval(interval);
  }, [expandedOrder, orders.find(o => (o._id || o.id) === expandedOrder)?.trackingId]);

  const handleReturnRequest = async () => {
    if (!returnReason.trim()) {
      toast.error('Please select a reason')
      return
    }
    try {
      setSubmittingReturn(true)
      const token = await auth.currentUser.getIdToken(true)
      
      // Upload files if any
      let uploadedUrls = []
      if (returnFiles.length > 0) {
        const formData = new FormData()
        returnFiles.forEach(file => {
          formData.append('files', file)
        })
        
        const uploadRes = await axios.post('/api/upload', formData, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        })
        uploadedUrls = uploadRes.data.urls || []
      }
      
      await axios.post('/api/orders/return-request', {
        orderId: selectedOrder._id,
        itemIndex: 0,
        reason: returnReason,
        type: returnType,
        description: returnDescription,
        images: uploadedUrls
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      toast.success(`${returnType === 'RETURN' ? 'Return' : 'Replacement'} request submitted successfully!`)
      setShowReturnModal(false)
      setReturnReason('')
      setReturnDescription('')
      setReturnType('RETURN')
      setReturnFiles([])
      setUploadError('')
      // Reload orders
      const { data } = await axios.get('/api/orders', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : [])
      setOrders(list)
    } catch (err) {
      console.error('Return request error:', err)
      toast.error(err?.response?.data?.error || 'Failed to submit request')
    } finally {
      setSubmittingReturn(false)
    }
  }

  const handleDeliveryReviewSubmit = async (reviewData) => {
    try {
      setSubmittingDeliveryReview(true)
      const token = await auth.currentUser.getIdToken(true)
      
      await axios.post('/api/orders/delivery-review', {
        orderId: reviewData.orderId,
        rating: reviewData.rating,
        reviewText: reviewData.reviewText,
        images: reviewData.images,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      toast.success('Delivery review submitted successfully! Thank you for your feedback.')
      setShowDeliveryReviewModal(false)
      setSelectedOrderForReview(null)
      
      // Reload orders
      const { data } = await axios.get('/api/orders', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const list = Array.isArray(data?.orders) ? data.orders : (Array.isArray(data) ? data : [])
      setOrders(list)
    } catch (err) {
      console.error('Delivery review error:', err)
      toast.error(err?.response?.data?.error || 'Failed to submit delivery review')
    } finally {
      setSubmittingDeliveryReview(false)
    }
  }

  if (user === undefined) return <Loading />

  if (user === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-800 mb-3">Dashboard / Orders</h1>
        <p className="text-slate-600 mb-6">Please sign in to view your orders.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('openSignInModal', { detail: { mode: 'login' } }))}
          className="inline-block px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
        >
          Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-6">
        <DashboardSidebar />

        <main className="md:col-span-3">
          <h1 className="text-2xl font-semibold text-slate-800 mb-6">My Orders</h1>
          
          {/* Status Filter Tabs */}
          <div className="mb-6 relative">
            <style>{`
              .tabs-wrapper {
                display: block !important;
                width: 100% !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                padding-bottom: 10px !important;
                border-bottom: 1px solid #e2e8f0 !important;
                -webkit-overflow-scrolling: touch !important;
                cursor: grab;
              }
              .tabs-wrapper.is-dragging {
                cursor: grabbing;
                scroll-behavior: auto !important;
              }
              .tabs-wrapper::-webkit-scrollbar {
                height: 0px !important;
                display: none !important;
              }
              .tabs-wrapper::-webkit-scrollbar-track {
                background: transparent !important;
              }
              .tabs-wrapper::-webkit-scrollbar-thumb {
                background: transparent !important;
              }
              .tabs-wrapper {
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
              }
              .tabs-inner {
                display: inline-flex !important;
                gap: 0.5rem !important;
                white-space: nowrap !important;
                min-width: max-content !important;
              }
              .scroll-arrow {
                position: absolute;
                top: 10px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: all 0.2s;
              }
              .scroll-arrow:hover {
                background: #f1f5f9;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border-color: #cbd5e1;
              }
              .scroll-arrow-left {
                left: -16px;
              }
              .scroll-arrow-right {
                right: -16px;
              }
            `}</style>
            
            {/* Left Arrow */}
            {showLeftArrow && (
              <button 
                onClick={() => scrollTabs('left')}
                className="scroll-arrow scroll-arrow-left hidden md:flex"
                aria-label="Scroll left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            {/* Right Arrow */}
            {showRightArrow && (
              <button 
                onClick={() => scrollTabs('right')}
                className="scroll-arrow scroll-arrow-right hidden md:flex"
                aria-label="Scroll right"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}

            <div
              ref={tabsScrollRef}
              data-carousel-allow-drag
              className={`tabs-wrapper ${isTabsDragging ? 'is-dragging' : ''}`}
              onPointerDown={handleTabsPointerDown}
            >
              <div className="tabs-inner">
                {orderStatuses.map((status) => (
                  <button
                    key={status.value}
                    onClick={(event) => {
                      if (shouldSuppressTabsClick()) {
                        handleTabsDragClick(event)
                        return
                      }
                      setSelectedStatus(status.value)
                    }}
                    className={`px-4 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition flex items-center gap-2 flex-shrink-0 ${
                      selectedStatus === status.value
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <span>{status.icon}</span>
                    <span>{status.label}</span>
                    {status.value !== 'ALL' && (
                      <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                        selectedStatus === status.value ? 'bg-blue-800' : 'bg-slate-200'
                      }`}>
                        {orders.filter(o => o.status === status.value).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {loadingOrders ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 flex items-center justify-center min-h-[220px]">
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm">Loading orders...</p>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <p className="text-slate-600">No orders found.</p>
              <Link href="/shop" className="inline-block mt-3 px-4 py-2 bg-slate-800 text-white rounded-lg">Shop Now</Link>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
              <p className="text-slate-600">No orders with status: <strong>{orderStatuses.find(s => s.value === selectedStatus)?.label}</strong></p>
              <button
                onClick={() => setSelectedStatus('ALL')}
                className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                View All Orders
              </button>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
              {filteredOrders.map((order) => {
                const orderId = order._id || order.id
                const isExpanded = expandedOrder === orderId
                const orderItems = order.orderItems || []
                const totalItems = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
                
                return (
                  <div 
                    key={orderId} 
                    className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setExpandedOrder(isExpanded ? null : orderId)}
                  >
                    {/* Order Header */}
                    <div className="px-6 py-4 border-b border-slate-200">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div className="flex flex-wrap items-center gap-4">
                          <div>
                            <p className="text-xs text-slate-500">Order No</p>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-800">{getDisplayOrderNumber(order) || 'Pending'}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const orderNo = getDisplayOrderNumber(order)
                                  if (!orderNo) {
                                    toast.error('Order number not available yet')
                                    return
                                  }
                                  navigator.clipboard.writeText(orderNo)
                                  toast.success('Order number copied!')
                                }}
                                className="p-1 hover:bg-slate-100 rounded transition"
                                title="Copy order number"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Date</p>
                            <p className="text-sm text-slate-700">{new Date(order.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Items</p>
                            <p className="text-sm font-semibold text-slate-800">{totalItems}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Total</p>
                            <p className="text-sm font-semibold text-slate-800">AED{(order.total || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Status</p>
                            <span
                              className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                                order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                order.status === 'OUT_FOR_DELIVERY' ? 'bg-teal-100 text-teal-700' :
                                order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-700' :
                                order.status === 'WAREHOUSE_RECEIVED' ? 'bg-indigo-100 text-indigo-700' :
                                order.status === 'PICKED_UP' ? 'bg-purple-100 text-purple-700' :
                                order.status === 'PICKUP_REQUESTED' ? 'bg-yellow-100 text-yellow-700' :
                                order.status === 'WAITING_FOR_PICKUP' ? 'bg-yellow-50 text-yellow-700' :
                                order.status === 'CONFIRMED' ? 'bg-orange-100 text-orange-700' :
                                order.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' :
                                order.status === 'RETURN_REQUESTED' ? 'bg-pink-100 text-pink-700' :
                                order.status === 'RETURNED' ? 'bg-pink-200 text-pink-800' :
                                order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {order.status || 'ORDER_PLACED'}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Payment</p>
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getPaymentStatus(order) ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {getPaymentStatus(order) ? '✓ Paid' : 'Pending'}
                            </span>
                          </div>
                          {order.deliveryReviews && order.deliveryReviews.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500">Review</p>
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">
                                <span>⭐</span>
                                <span>{order.deliveryReviews.length} {order.deliveryReviews.length === 1 ? 'Review' : 'Reviews'}</span>
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          {order.trackingUrl && (
                            <a
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Track Order
                            </a>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedOrder(isExpanded ? null : orderId)
                            }}
                            className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            {isExpanded ? 'Hide Details' : 'View Details'}
                          </button>
                        </div>
                      </div>

                      {/* Product Preview Thumbnails */}
                      {orderItems.length > 0 && (
                        <div className="flex gap-3 items-center">
                          <p className="text-xs text-slate-500 font-medium">Products:</p>
                          <div className="flex gap-2 flex-wrap">
                            {orderItems.slice(0, 4).map((item, idx) => {
                              const product = (item.productId && typeof item.productId === 'object') ? item.productId : (item.product || {})
                              const fallbackItem = Array.isArray(order.items) ? (order.items[idx] || {}) : {}
                              const productName = product?.name || item?.name || fallbackItem?.name || 'Product'
                              const productImage = product?.images?.[0] || item?.image || fallbackItem?.image || fallbackItem?.images?.[0] || ''
                              return (
                                <div key={idx} className="relative">
                                  <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                    {productImage ? (
                                      <img src={productImage} alt={productName} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No image</div>
                                    )}
                                  </div>
                                  {item.quantity > 1 && (
                                    <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                                      {item.quantity}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                            {orderItems.length > 4 && (
                              <div className="w-16 h-16 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
                                +{orderItems.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Order Details (Expandable) */}
                    {isExpanded && (
                      <div className="p-6 space-y-6">
                        {/* Return Request Status Display */}
                        {order.returns && order.returns.length > 0 && (
                          <div className="space-y-3">
                            {order.returns.map((returnReq, idx) => (
                              <div key={idx} className={`border-2 rounded-xl p-4 ${
                                returnReq.status === 'REQUESTED' ? 'bg-yellow-50 border-yellow-300' :
                                returnReq.status === 'APPROVED' ? 'bg-green-50 border-green-300' :
                                returnReq.status === 'REJECTED' ? 'bg-red-50 border-red-300' :
                                'bg-slate-50 border-slate-300'
                              }`}>
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6"/>
                                      </svg>
                                      {returnReq.type === 'RETURN' ? 'Return' : 'Replacement'} Request
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-1">{new Date(returnReq.requestedAt).toLocaleString()}</p>
                                  </div>
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    returnReq.status === 'REQUESTED' ? 'bg-yellow-200 text-yellow-800' :
                                    returnReq.status === 'APPROVED' ? 'bg-green-200 text-green-800' :
                                    returnReq.status === 'REJECTED' ? 'bg-red-200 text-red-800' :
                                    'bg-slate-200 text-slate-800'
                                  }`}>
                                    {returnReq.status}
                                  </span>
                                </div>
                                
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <p className="text-slate-600 font-medium">Reason:</p>
                                    <p className="text-slate-900">{returnReq.reason}</p>
                                  </div>
                                  
                                  {returnReq.description && (
                                    <div>
                                      <p className="text-slate-600 font-medium">Details:</p>
                                      <p className="text-slate-900">{returnReq.description}</p>
                                    </div>
                                  )}

                                  {returnReq.status === 'REJECTED' && returnReq.rejectionReason && (
                                    <div className="mt-3 bg-red-100 border border-red-300 rounded-lg p-3">
                                      <p className="text-red-800 font-semibold mb-1 flex items-center gap-2">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <circle cx="12" cy="12" r="10"/>
                                          <line x1="12" y1="8" x2="12" y2="12"/>
                                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                                        </svg>
                                        Rejection Reason:
                                      </p>
                                      <p className="text-red-900 text-sm">{returnReq.rejectionReason}</p>
                                      
                                      <div className="flex gap-2 mt-3">
                                        <a
                                          href="/dashboard/tickets"
                                          className="flex-1 px-3 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition text-xs font-medium flex items-center justify-center gap-1.5"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                            <line x1="12" y1="18" x2="12" y2="12"/>
                                            <line x1="9" y1="15" x2="15" y2="15"/>
                                          </svg>
                                          Submit Ticket
                                        </a>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedOrder(order);
                                            setShowReturnModal(true);
                                          }}
                                          className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-xs font-medium"
                                        >
                                          Submit New Request
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {returnReq.status === 'APPROVED' && (
                                    <div className="mt-2 bg-green-100 border border-green-300 rounded-lg p-3">
                                      <p className="text-green-800 font-medium text-sm">✓ Your request has been approved! We'll contact you shortly with next steps.</p>
                                    </div>
                                  )}

                                  {returnReq.status === 'REQUESTED' && (
                                    <div className="mt-2 bg-yellow-100 border border-yellow-300 rounded-lg p-3">
                                      <p className="text-yellow-800 font-medium text-sm">⏳ Your request is under review. We'll update you soon.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Return/Replacement Button */}
                        {(order.status === 'DELIVERED' || order.status === 'OUT_FOR_DELIVERY') && !order.returns?.some(r => r.status === 'REQUESTED' || r.status === 'APPROVED') && (
                          <div className="flex gap-3 justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedOrderForReview(order)
                                setShowDeliveryReviewModal(true)
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                              </svg>
                              Write Delivery Review
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedOrder(order)
                                setShowReturnModal(true)
                              }}
                              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center gap-2"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6"/>
                              </svg>
                              Return/Replace Item
                            </button>
                          </div>
                        )}

                        {canCancelOrder(order) && (
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => openCancelOrderModal(order, e)}
                              disabled={cancellingOrderId === orderId}
                              className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${cancellingOrderId === orderId ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50'}`}
                            >
                              {cancellingOrderId === orderId ? 'Cancelling...' : 'Cancel This Order'}
                            </button>
                          </div>
                        )}
                        
                        {/* Payment & Summary - Moved to top */}
                        <div className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-lg p-5">
                          <h3 className="text-sm font-semibold text-slate-800 mb-4">Payment Summary</h3>
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Subtotal:</span>
                              <span className="font-medium text-slate-800">AED{((order.total || 0) - (order.shippingFee || 0)).toFixed(2)}</span>
                            </div>
                            {order.shippingFee > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Shipping:</span>
                                <span className="font-medium text-slate-800">AED{(order.shippingFee || 0).toFixed(2)}</span>
                              </div>
                            )}
                            {order.isCouponUsed && (
                              <div className="flex justify-between text-sm">
                                <span className="text-green-600">Discount Applied:</span>
                                <span className="font-medium text-green-600">-AED{(order.coupon?.discount || 0).toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-slate-800 pt-3 border-t border-slate-300">
                              <span>Total Amount:</span>
                              <span className="text-lg">AED{(order.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-300">
                              <p className="text-xs text-slate-600 mb-3">Payment Method & Status</p>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                                  <div>
                                    <p className="text-xs text-slate-500 mb-1">Payment Method</p>
                                    <p className="text-sm font-semibold text-slate-800">
                                      {order.paymentMethod === 'cod' || order.paymentMethod === 'COD' ? '💵 Cash on Delivery' : order.paymentMethod || 'Not specified'}
                                    </p>
                                  </div>
                                  <span className={`inline-block px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap ${
                                    getPaymentStatus(order) ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {getPaymentStatus(order) ? '✓ PAID' : '⏳ PENDING'}
                                  </span>
                                </div>
                                
                                {/* COD Status Details */}
                                {(order.paymentMethod === 'cod' || order.paymentMethod === 'COD') && (
                                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <p className="text-xs text-amber-700 font-medium">
                                      {getPaymentStatus(order) ? '✓ Payment collected from customer' : '⏳ Awaiting payment at delivery'}
                                    </p>
                                    {!getPaymentStatus(order) && (
                                      <p className="text-xs text-amber-600 mt-1">
                                        Rider will collect AED{(order.total || 0).toFixed(2)} during delivery
                                      </p>
                                    )}
                                  </div>
                                )}
                                
                                {/* Delhivery Payment Collection Status */}
                                {order.delhivery?.payment?.is_cod_recovered && (
                                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                    <p className="text-xs text-green-700 font-medium">✓ Payment Confirmed by Delhivery</p>
                                    {order.delhivery.payment.cod_amount > 0 && (
                                      <p className="text-xs text-green-600 mt-1">
                                        Collected: AED{order.delhivery.payment.cod_amount}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Delivered order actions */}
                        {order.status === 'DELIVERED' && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                downloadInvoice(order)
                              }}
                              className="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium"
                            >
                              Download Invoice
                            </button>
                            <button
                              onClick={(e) => handleCreateSupportTicket(order, null, e)}
                              disabled={creatingTicketForOrderId === orderId}
                              className={`px-4 py-2 rounded-lg border text-sm font-medium ${creatingTicketForOrderId === orderId ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                            >
                              {creatingTicketForOrderId === orderId ? 'Creating Ticket...' : 'Ticket Support'}
                            </button>
                            <Link
                              href="/dashboard/tickets"
                              onClick={(e) => e.stopPropagation()}
                              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
                            >
                              Ticket Details
                            </Link>
                          </div>
                        )}

                        {/* Products */}
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-3">Order Items ({totalItems})</h3>
                          <div className="space-y-3">
                            {orderItems.map((item, idx) => {
                              const product = (item.productId && typeof item.productId === 'object') ? item.productId : (item.product || {})
                              const fallbackItem = Array.isArray(order.items) ? (order.items[idx] || {}) : {}
                              const productName = product?.name || item?.name || fallbackItem?.name || 'Product'
                              const productImage = product?.images?.[0] || item?.image || fallbackItem?.image || fallbackItem?.images?.[0] || ''
                              const productSku = product?.sku || item?.sku || fallbackItem?.sku || ''
                              return (
                                <div key={idx} className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0">
                                  <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                                    {productImage ? (
                                      <img src={productImage} alt={productName} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400">No image</div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-slate-800 text-sm mb-1">{productName}</h4>
                                    {productSku && <p className="text-xs text-slate-500 mb-2">SKU: {productSku}</p>}
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <p className="text-xs text-slate-500">Quantity</p>
                                        <p className="font-medium text-slate-800">{item.quantity}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Unit Price</p>
                                        <p className="font-medium text-slate-800">AED{(item.price || 0).toFixed(2)}</p>
                                      </div>
                                    </div>

                                    {order.status === 'DELIVERED' && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const reviewKey = `${orderId}-${idx}`
                                            setActiveReviewKey((prev) => prev === reviewKey ? null : reviewKey)
                                          }}
                                          className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                        >
                                          {activeReviewKey === `${orderId}-${idx}` ? 'Hide Review Form' : 'Write Review'}
                                        </button>
                                        <button
                                          onClick={(e) => handleCreateSupportTicket(order, item, e)}
                                          disabled={creatingTicketForOrderId === orderId}
                                          className={`px-3 py-1.5 text-xs rounded-lg border ${creatingTicketForOrderId === orderId ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                                        >
                                          Ticket Support
                                        </button>
                                      </div>
                                    )}

                                    {order.status === 'DELIVERED' && activeReviewKey === `${orderId}-${idx}` && (
                                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                                        <ReviewForm
                                          productId={typeof item?.productId === 'object' ? item?.productId?._id : item?.productId}
                                          onReviewAdded={() => {
                                            setActiveReviewKey(null)
                                            toast.success('Thanks for your review!')
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-slate-500 mb-1">Line Total</p>
                                    <p className="font-bold text-slate-800 text-lg">AED{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Live Delivery Tracking */}
                        {(getPublicTrackingDisplayId(order) || order.trackingId || order.trackingUrl || order.courier || order.delhivery || order.waslah) && (
                          <div className="bg-gradient-to-br from-slate-50 to-blue-50 border-2 border-blue-200 rounded-xl p-6 space-y-5">
                            {/* Header */}
<div className="flex items-center gap-3 pb-4 border-b-2 border-blue-200">
                                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Live Delivery Tracking</h3>
                            </div>

                            {/* Current Location - Prominent Green Box */}
                            {order.delhivery?.current_status_location && (
                              <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl p-5 shadow-lg">
                                <div className="flex items-start gap-3">
                                  <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                  </svg>
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold opacity-90 mb-1">📍 Current Location</p>
                                    <p className="text-lg font-bold">{order.delhivery.current_status_location}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Status Section */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                              <p className="text-xs font-semibold text-slate-500 mb-2">Status</p>
                              <p className="text-2xl font-bold text-blue-600">
                                {order.delhivery?.current_status || order.status || 'Processing'}
                              </p>
                              {order.delhivery?.current_status && order.delhivery.current_status_remarks && (
                                <p className="text-sm text-slate-600 mt-2 italic">{order.delhivery.current_status_remarks}</p>
                              )}
                            </div>

                            {/* Expected Delivery Section */}
                            {order.delhivery?.expected_delivery_date && (
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                <p className="text-xs font-semibold text-slate-500 mb-2">Expected Delivery</p>
                                <p className="text-xl font-bold text-purple-600">
                                  {new Date(order.delhivery.expected_delivery_date).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            )}

                            {/* Tracking Details */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                              <div className="space-y-3 text-sm">
                                {order.courier && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-600 font-medium">Courier</span>
                                    <span className="font-semibold text-slate-800 capitalize">{order.courier}</span>
                                  </div>
                                )}
                                {getPublicTrackingDisplayId(order) ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-600 font-medium">Tracking number</span>
                                    <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded">{getPublicTrackingDisplayId(order)}</span>
                                  </div>
                                ) : null}
                              </div>
                              
                              {order.trackingUrl && (
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                  <a 
                                    href={order.trackingUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="w-full inline-block text-center px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
                                  >
                                    ⚡ Track Your Order
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Tracking History Timeline */}
                            {order.delhivery?.events && order.delhivery.events.length > 0 && (
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                                  </svg>
                                  <p className="text-sm font-bold text-slate-800">Tracking History</p>
                                </div>
                                <div className="relative">
                                  <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-400 to-slate-200"></div>
                                  <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                                    {order.delhivery.events.map((event, idx) => (
                                      <div key={idx} className="relative pl-8 group">
                                        <div className={`absolute left-0 top-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                                          idx === 0 ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-white border-2 border-blue-400'
                                        }`}>
                                          {idx === 0 && (
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                                            </svg>
                                          )}
                                        </div>
                                        <div className={`bg-slate-50 rounded-lg p-3 border transition-all ${
                                          idx === 0 ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-blue-200 hover:shadow-sm'
                                        }`}>
                                          <div className="flex items-start justify-between gap-3 mb-1">
                                            <p className={`font-semibold text-sm ${idx === 0 ? 'text-blue-700' : 'text-slate-800'}`}>
                                              📍 {event.status || 'Update'}
                                            </p>
                                            <span className="text-xs text-slate-500 whitespace-nowrap">
                                              {new Date(event.time).toLocaleString('en-IN', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                              })}
                                            </span>
                                          </div>
                                          {event.location && (
                                            <p className="text-sm text-slate-600 mt-1">
                                              <span className="font-medium">Location:</span> {event.location}
                                            </p>
                                          )}
                                          {event.remarks && (
                                            <p className="text-xs text-slate-500 mt-1.5 italic bg-white px-2 py-1 rounded">
                                              💬 {event.remarks}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {!order.delhivery?.events && !order.delhivery?.current_status_location && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                                <p className="text-sm text-yellow-800">
                                  ⏳ Tracking information will be available once your order is shipped by the courier
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Shipping Address */}
                        {(order.shippingAddress || order.addressId) && (
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800 mb-3">Shipping Address</h3>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600 space-y-1">
                              {order.shippingAddress ? (
                                <>
                                  <p className="font-bold text-slate-800">{order.shippingAddress.name}</p>
                                  <p>{order.shippingAddress.street}</p>
                                  <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                                  <p>{order.shippingAddress.country}</p>
                                  {order.shippingAddress.phone && <p className="font-medium text-slate-800 mt-2">📞 {order.shippingAddress.phone}</p>}
                                </>
                              ) : order.addressId && (
                                <p>Address ID: {order.addressId.toString()}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Return/Replacement Modal */}
          {showReturnModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowReturnModal(false)}>
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-slate-800">Return/Replacement Request</h2>
                  <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-600">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Type Selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Request Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="RETURN"
                          checked={returnType === 'RETURN'}
                          onChange={(e) => setReturnType(e.target.value)}
                          className="mr-2"
                        />
                        <span>Return</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="REPLACEMENT"
                          checked={returnType === 'REPLACEMENT'}
                          onChange={(e) => setReturnType(e.target.value)}
                          className="mr-2"
                        />
                        <span>Replacement</span>
                      </label>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Reason *</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select a reason</option>
                      <option value="Defective Product">Defective Product</option>
                      <option value="Wrong Item Received">Wrong Item Received</option>
                      <option value="Product Not As Described">Product Not As Described</option>
                      <option value="Damaged During Shipping">Damaged During Shipping</option>
                      <option value="Changed Mind">Changed Mind</option>
                      <option value="Quality Issues">Quality Issues</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Additional Details</label>
                    <textarea
                      value={returnDescription}
                      onChange={(e) => setReturnDescription(e.target.value)}
                      placeholder="Please provide more details about your request..."
                      rows="4"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Upload Images/Videos (Optional)</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-blue-400 transition">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        onChange={(e) => {
                          const files = Array.from(e.target.files)
                          setUploadError('')
                          
                          // Validate files
                          const validFiles = []
                          for (const file of files) {
                            if (file.type.startsWith('video/') && file.size > 5 * 1024 * 1024) {
                              setUploadError('Video files must be less than 5MB')
                              continue
                            }
                            if (file.type.startsWith('image/') && file.size > 10 * 1024 * 1024) {
                              setUploadError('Image files must be less than 10MB')
                              continue
                            }
                            validFiles.push(file)
                          }
                          
                          setReturnFiles(prev => [...prev, ...validFiles])
                        }}
                        className="w-full text-sm text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100 file:cursor-pointer"
                      />
                      <p className="text-xs text-slate-500 mt-2">Images (max 10MB) or Videos (max 5MB)</p>
                      {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                    </div>
                    
                    {/* Preview uploaded files */}
                    {returnFiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {returnFiles.map((file, idx) => (
                          <div key={idx} className="relative group">
                            {file.type.startsWith('image/') ? (
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`Upload ${idx + 1}`}
                                className="w-20 h-20 object-cover rounded-lg border-2 border-slate-200"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-slate-100 rounded-lg border-2 border-slate-200 flex items-center justify-center">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                                </svg>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setReturnFiles(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            >
                              ×
                            </button>
                            <p className="text-xs text-slate-600 mt-1 truncate w-20">{file.name}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowReturnModal(false)}
                      className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                      disabled={submittingReturn}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReturnRequest}
                      disabled={submittingReturn}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingReturn ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Order Modal */}
          {showCancelModal && cancelOrderTarget && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeCancelOrderModal}>
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-slate-800">Cancel Order</h2>
                  <button onClick={closeCancelOrderModal} className="text-slate-400 hover:text-slate-600" disabled={!!cancellingOrderId}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                <div className="mb-4 text-sm text-slate-600">
                  You are cancelling order <span className="font-semibold text-slate-800">#{getDisplayOrderNumber(cancelOrderTarget) || 'Pending'}</span>.
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Reason *</label>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-3"
                  >
                    <option value="">Select cancellation reason</option>
                    <option value="Ordered by mistake">Ordered by mistake</option>
                    <option value="Found a better price">Found a better price</option>
                    <option value="Need to change address">Need to change address</option>
                    <option value="Need to change quantity">Need to change quantity</option>
                    <option value="Delivery is taking too long">Delivery is taking too long</option>
                    <option value="Other">Other</option>
                  </select>

                  <label className="block text-sm font-medium text-slate-700 mb-2">Additional note (optional)</label>
                  <textarea
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    placeholder="Add more details"
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeCancelOrderModal}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                    disabled={!!cancellingOrderId}
                  >
                    Keep Order
                  </button>
                  <button
                    onClick={handleCancelOrder}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!!cancellingOrderId}
                  >
                    {cancellingOrderId ? 'Cancelling...' : 'Confirm Cancel'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Review Modal */}
          <DeliveryReviewModal
            isOpen={showDeliveryReviewModal}
            onClose={() => {
              setShowDeliveryReviewModal(false)
              setSelectedOrderForReview(null)
            }}
            order={selectedOrderForReview}
            onSubmit={handleDeliveryReviewSubmit}
            isSubmitting={submittingDeliveryReview}
          />
        </main>
      </div>
    )
}