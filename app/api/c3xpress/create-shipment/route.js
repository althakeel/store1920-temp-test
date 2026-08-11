import { NextResponse } from 'next/server'
import { createAirwaybill } from '@/lib/c3xpress'
import { getAuth } from '@/lib/firebase-admin'
import authSeller from '@/middlewares/authSeller'
import connectDB from '@/lib/mongodb'
import Order from '@/models/Order'

const DEFAULT_C3X_PRODUCT = String(process.env.C3X_PRODUCT || process.env.C3X_PRODUCT_TYPE || 'DOM').trim()
const DEFAULT_C3X_SERVICE_TYPE = String(process.env.C3X_SERVICE_TYPE || 'NOR').trim()

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildProductCandidates(primaryProduct) {
  const fromEnv = String(process.env.C3X_PRODUCT_FALLBACKS || '').split(',').map((v) => v.trim()).filter(Boolean)
  const candidates = [
    primaryProduct,
    ...fromEnv,
    'DOM',
    'XPS',
    'EXP',
    'ECO',
    'DOC',
    'INT',
    'INTL',
    'NONDOC',
    'B2C',
  ]
  return [...new Set(candidates.filter(Boolean))]
}

function buildShipmentDataFromOrder(order) {
  const shipping = order?.shippingAddress || {}
  const orderRef = String(order?.shortOrderNumber || order?._id || '').trim()
  const pieces = Math.max(1, toNumber(order?.orderItems?.length || 1, 1))
  const weight = Math.max(0.5, toNumber(order?.shipmentWeight, 1))
  const paymentMethod = String(order?.paymentMethod || '').toLowerCase()
  const isCod = paymentMethod === 'cod'

  // C3X field names can vary by account setup; this covers common keys from their docs.
  return {
    ShipperReference: orderRef,
    ReceiverReference: orderRef,
    Product: DEFAULT_C3X_PRODUCT,
    ProductType: DEFAULT_C3X_PRODUCT,
    ServiceType: DEFAULT_C3X_SERVICE_TYPE,
    NoOfPieces: pieces,
    Weight: weight,
    Dimensions: '30x20x15',
    CODAmount: isCod ? toNumber(order?.total, 0) : 0,
    Currency: 'AED',

    ConsigneeName: firstNonEmpty(shipping.name, order?.guestName, 'Customer'),
    ConsigneeAddress: firstNonEmpty(shipping.street, 'NA'),
    ConsigneeCity: firstNonEmpty(shipping.city, 'Dubai'),
    ConsigneeState: firstNonEmpty(shipping.state, shipping.city, 'Dubai'),
    ConsigneeCountry: firstNonEmpty(shipping.country, 'AE'),
    ConsigneePincode: firstNonEmpty(shipping.zip, shipping.pincode, '00000'),
    ConsigneePhone: firstNonEmpty(shipping.phone, order?.guestPhone, '0000000000'),
    ConsigneeEmail: firstNonEmpty(shipping.email, order?.guestEmail, 'na@example.com'),

    Description: `Order ${orderRef}`,
    Value: toNumber(order?.total, 0),
  }
}

async function getUserIdFromRequest(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.split(' ')[1])
    return decoded.uid || null
  } catch { return null }
}

/**
 * POST /api/c3xpress/create-shipment
 * Body: { orderId, shipmentData: AirwayBillData }
 * Creates an AWB and saves trackingId on the order.
 */
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sellerId = await authSeller(userId)
    if (!sellerId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const { orderId, shipmentData: inputShipmentData } = await request.json()

    let shipmentData = inputShipmentData
    let order = null

    await connectDB()

    if (orderId) {
      order = await Order.findOne({ _id: orderId, storeId: sellerId })
      if (!order) {
        return NextResponse.json({ error: 'Order not found for this store' }, { status: 404 })
      }

      const autoBuilt = buildShipmentDataFromOrder(order)
      // If caller passes shipmentData, treat it as field overrides (e.g., Product/ServiceType)
      shipmentData = shipmentData ? { ...autoBuilt, ...shipmentData } : autoBuilt
    }

    if (!shipmentData) {
      return NextResponse.json({ error: 'shipmentData is required (or provide orderId for auto-build)' }, { status: 400 })
    }

    let result
    try {
      result = await createAirwaybill(shipmentData)
    } catch (error) {
      const message = String(error?.message || '')
      const invalidProduct = /invalid\s*product\s*type/i.test(message) || /\(code\s*-2\)/i.test(message)

      // Retry with alternative product values for account-specific configs.
      if (invalidProduct) {
        const initialProduct = String(shipmentData?.Product || DEFAULT_C3X_PRODUCT).trim()
        const productCandidates = buildProductCandidates(initialProduct)
        let recovered = false

        for (const product of productCandidates) {
          if (String(product).toLowerCase() === String(initialProduct).toLowerCase()) continue
          try {
            const retryPayload = {
              ...shipmentData,
              Product: product,
              ProductType: product,
              ServiceType: shipmentData?.ServiceType || DEFAULT_C3X_SERVICE_TYPE,
            }
            result = await createAirwaybill(retryPayload)
            shipmentData = retryPayload
            recovered = true
            break
          } catch {
            // Continue trying next product candidate.
          }
        }

        if (!recovered) {
          return NextResponse.json(
            {
              error: 'C3Xpress rejected product type for this account. Set C3X_PRODUCT in .env to your allowed product (example: DOM/EXP) and retry.',
            },
            { status: 400 }
          )
        }
      } else {
        throw error
      }
    }

    const awbNumber = result.AirwayBillNumber

    // If an orderId was provided, persist the AWB on the order
    if (orderId && awbNumber) {
      const currentStatus = String(order?.status || '')
      const nextStatus = (currentStatus === 'ORDER_PLACED' || currentStatus === 'PROCESSING')
        ? 'SHIPPED'
        : currentStatus

      const updated = await Order.findByIdAndUpdate(orderId, {
        trackingId: awbNumber,
        courier: 'C3Xpress',
        trackingUrl: `https://c3xpress.com/tracking?awb=${encodeURIComponent(awbNumber)}`,
        ...(nextStatus ? { status: nextStatus } : {}),
      }, { new: true }).lean()

      if (nextStatus && nextStatus !== currentStatus) {
        try {
          const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify')
          await notifyCustomerOfOrderStatusChange(updated || order, nextStatus, {
            previousStatus: currentStatus,
            source: 'c3xpress_ship',
          })
        } catch (emailError) {
          console.error('[c3xpress] status email failed', emailError?.message || emailError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      airwayBillNumber: awbNumber,
      destinationCode: result.DestinationCode,
    })
  } catch (error) {
    const msg = error?.message || 'Failed to create shipment'
    return NextResponse.json({ error: msg }, { status: msg.includes('not configured') ? 503 : 500 })
  }
}
