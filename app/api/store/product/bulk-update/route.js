import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import Product from '@/models/Product'
import authSeller from '@/middlewares/authSeller'
import { getAuth } from '@/lib/firebase-admin'
import { getCurrentStock } from '@/lib/storeInventory'
import { recordInventoryHistory, resolveInventoryActor } from '@/lib/inventoryHistory'
import { resolveDashboardAccess } from '@/lib/storeAccessControl'
import { canChangeProductPricing } from '@/lib/productSaveGuards'

export const runtime = 'nodejs'

async function getSellerContextFromRequest(request) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const idToken = authHeader.replace('Bearer ', '')
  const decodedToken = await getAuth().verifyIdToken(idToken)
  const storeId = await authSeller(decodedToken.uid)
  if (!storeId) return null
  return { storeId, userId: decodedToken.uid, decodedToken }
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function applyBooleanDirective(updateData, fieldName, directive) {
  if (directive === 'enable') {
    updateData[fieldName] = true
  }
  if (directive === 'disable') {
    updateData[fieldName] = false
  }
}

export async function PATCH(request) {
  try {
    const sellerContext = await getSellerContextFromRequest(request)
    if (!sellerContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storeId, userId, decodedToken } = sellerContext
    const access = await resolveDashboardAccess(userId, decodedToken)
    const canChangePrice = canChangeProductPricing(access)

    const body = await request.json()
    const productIds = Array.isArray(body?.productIds)
      ? [...new Set(body.productIds.map((productId) => String(productId).trim()).filter(Boolean))]
      : []

    if (!productIds.length) {
      return NextResponse.json({ error: 'Select at least one product to edit.' }, { status: 400 })
    }

    const updateData = {}
    applyBooleanDirective(updateData, 'inStock', body?.inStock)
    applyBooleanDirective(updateData, 'fastDelivery', body?.fastDelivery)
    applyBooleanDirective(updateData, 'freeShippingEligible', body?.freeShippingEligible)
    applyBooleanDirective(updateData, 'published', body?.published)

    const stockQuantity = parseOptionalNumber(body?.stockQuantity)
    const price = parseOptionalNumber(body?.price)
    const aed = parseOptionalNumber(body?.AED)
    const brand = typeof body?.brand === 'string' ? body.brand.trim() : undefined

    if (stockQuantity !== undefined) {
      updateData.stockQuantity = stockQuantity
      updateData.stockUpdatedAt = new Date()
    }
    if (brand !== undefined && brand !== '') {
      updateData.brand = brand
    }
    if (price !== undefined || aed !== undefined) {
      if (!canChangePrice) {
        return NextResponse.json(
          { error: 'You do not have permission to change prices. Ask the store owner to enable Change product prices in Team Access.' },
          { status: 403 },
        )
      }
      if (price !== undefined) updateData.price = price
      if (aed !== undefined) updateData.AED = aed
    }

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: 'Choose at least one field to update.' }, { status: 400 })
    }

    await connectDB()

    const stockChangeRequested = stockQuantity !== undefined
    const productsBeforeUpdate = stockChangeRequested
      ? await Product.find({ _id: { $in: productIds }, storeId: String(storeId) })
        .select('_id name sku stockQuantity hasVariants variants')
        .lean()
      : []

    const result = await Product.updateMany(
      {
        _id: { $in: productIds },
        storeId: String(storeId),
      },
      { $set: updateData }
    )

    if (stockChangeRequested && productsBeforeUpdate.length) {
      const actor = await resolveInventoryActor(userId, decodedToken)
      await Promise.all(productsBeforeUpdate.map((product) => {
        const previousStock = getCurrentStock(product)
        const newStock = stockQuantity
        return recordInventoryHistory({
          ...actor,
          productId: String(product._id),
          productName: product.name || '',
          sku: product.sku || '',
          action: 'bulk_update',
          quantityDelta: newStock - previousStock,
          previousStock,
          newStock,
          source: 'bulk_update',
          details: `Bulk update for ${productIds.length} product(s)`,
        })
      }))
    }

    return NextResponse.json({
      success: true,
      matchedCount: Number(result?.matchedCount || 0),
      modifiedCount: Number(result?.modifiedCount || 0),
      message: `Updated ${Number(result?.modifiedCount || 0)} product(s) successfully.`,
    })
  } catch (error) {
    console.error('[store product bulk-update PATCH] error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to bulk update products' }, { status: 500 })
  }
}