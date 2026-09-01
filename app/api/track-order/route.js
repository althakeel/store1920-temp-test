import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { fetchNormalizedC3XTracking, trackByReference, normalizeC3XShipment, trackPickup } from '@/lib/c3xpress'
import { isWaslahConfigured } from '@/lib/waslah'
import { fetchNormalizedWaslahTracking } from '@/lib/waslahTracking'
import {
  parseTrackingIdentifiers,
  findOrderByTrackingIdentifier,
  findOrdersByContact,
  enrichOrderWithLiveTracking,
} from '@/lib/orderTrackingLookup'

const asOrderShape = (normalized, awb = '') => {
  if (!normalized) return null;
  return {
    courier: normalized.courier,
    trackingId: normalized.trackingId || awb,
    trackingUrl: normalized.trackingUrl,
    c3x: normalized.c3x,
    waslah: normalized.waslah,
    delhivery: normalized.delhivery,
    status: normalized.waslah?.appStatus || normalized.c3x?.appStatus || normalized.delhivery?.current_status || 'PROCESSING',
    orderItems: [],
    total: 0
  };
};

const normalizeC3XPickup = (data, bookingNo = '') => {
  if (!data) return null;
  const bookingEntry = Array.isArray(data.BookingTrackList) && data.BookingTrackList[0]
    ? data.BookingTrackList[0]
    : null;
  const pickupNo =
    data.PickupRequestNo ||
    data.BookingNo ||
    data.PickupNo ||
    bookingEntry?.PickupRequestNo ||
    bookingEntry?.BookingNo ||
    bookingEntry?.PickupNo ||
    bookingNo;
  if (!pickupNo) return null;

  const rawEvents = [
    data.PickupTrackingDetails,
    data.PickupTrackList,
    data.BookingTrackList,
    data.TrackingLogDetails,
    data.Events,
  ].find(Array.isArray) || [];

  const events = rawEvents.map((entry) => ({
    time: [entry.ActivityDate || entry.Date || entry.CreatedDate || entry.BookingDate, entry.ActivityTime || entry.Time]
      .filter(Boolean)
      .join(' ')
      .trim(),
    status: entry.Status || entry.Activity || entry.Event || entry.BookingStatus || 'Pickup update',
    location: entry.Location || entry.City || entry.Origin || '',
    remarks: entry.Remarks || entry.Description || entry.Message || entry.Remark || '',
  }));

  return {
    courier: 'C3Xpress',
    trackingId: String(pickupNo),
    trackingUrl: `https://c3xpress.com/tracking?awb=${encodeURIComponent(String(pickupNo))}`,
    c3x: {
      bookingNo: String(pickupNo),
      appStatus: events.length ? 'PICKUP_REQUESTED' : 'ORDER_PLACED',
      events,
      pickup: data,
    },
  };
};

const lookupC3XByIdentifier = async (identifier) => {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const byAwb = await fetchNormalizedC3XTracking(value).catch(() => null);
  if (byAwb) return byAwb;

  const referenceRaw = await trackByReference(value).catch(() => null);
  const byReference = referenceRaw ? normalizeC3XShipment(referenceRaw, value) : null;
  if (byReference) return byReference;

  const pickupRaw = await trackPickup(value).catch(() => null);
  return pickupRaw ? normalizeC3XPickup(pickupRaw, value) : null;
};

const lookupWaslahByAwb = async (awb) => {
  const value = String(awb || '').trim();
  if (!value || !isWaslahConfigured()) return null;
  return fetchNormalizedWaslahTracking(value).catch(() => null);
};

export async function GET(req) {
  try {
    await connectDB()

    const { searchParams } = new URL(req.url)
    const { phone, email, identifier } = parseTrackingIdentifiers({
      phone: searchParams.get('phone'),
      email: searchParams.get('email'),
      awb: searchParams.get('awb'),
      orderId: searchParams.get('orderId'),
    })
    const carrier = (searchParams.get('carrier') || '').toLowerCase()

    if (!phone && !email && !identifier) {
      return NextResponse.json(
        { success: false, message: 'Mobile number, email, AWB, reference number, or booking number is required' },
        { status: 400 }
      )
    }

    if (carrier === 'c3xpress' && identifier) {
      try {
        const normalized = await lookupC3XByIdentifier(identifier)
        if (!normalized) {
          return NextResponse.json({ success: false, message: 'Shipment not found on C3Xpress' }, { status: 404 })
        }
        return NextResponse.json({ success: true, order: asOrderShape(normalized, identifier) })
      } catch (e) {
        const msg = (e?.message || '').includes('not configured')
          ? 'C3Xpress not configured.'
          : `C3Xpress tracking failed: ${e?.message || 'Unknown error'}`
        return NextResponse.json({ success: false, message: msg }, { status: 503 })
      }
    }

    if ((carrier === 'waslah' || carrier === 'emx') && identifier) {
      try {
        const normalized = await lookupWaslahByAwb(identifier)
        if (!normalized) {
          return NextResponse.json({ success: false, message: 'Shipment not found on EMX / Waslah' }, { status: 404 })
        }
        return NextResponse.json({ success: true, order: asOrderShape(normalized, identifier) })
      } catch (e) {
        const msg = (e?.message || '').includes('not configured')
          ? 'EMX tracking is not configured on this store.'
          : `EMX tracking failed: ${e?.message || 'Unknown error'}`
        return NextResponse.json({ success: false, message: msg }, { status: 503 })
      }
    }

    let order = null
    let relatedOrders = []

    if (identifier) {
      order = await findOrderByTrackingIdentifier(identifier)
    }

    if (!order && (phone || email)) {
      relatedOrders = await findOrdersByContact({ phone, email, limit: 10 })
      order = relatedOrders[0] || null
    }

    if (!order) {
      if (identifier) {
        try {
          const waslahNormalized = await lookupWaslahByAwb(identifier)
          const waslahSynthetic = asOrderShape(waslahNormalized, identifier)
          if (waslahSynthetic?.waslah?.events?.length) {
            return NextResponse.json({ success: true, order: waslahSynthetic })
          }
        } catch (e) {
          console.error('Waslah fallback failed:', e?.message || e)
        }

        try {
          const normalized = await lookupC3XByIdentifier(identifier)
          const synthetic = asOrderShape(normalized, identifier)
          if (synthetic) {
            return NextResponse.json({ success: true, order: synthetic })
          }
        } catch (e) {
          console.error('C3Xpress fallback failed:', e?.message || e)
        }

        if (isWaslahConfigured()) {
          try {
            const waslahNormalized = await lookupWaslahByAwb(identifier)
            const waslahSynthetic = asOrderShape(waslahNormalized, identifier)
            if (waslahSynthetic) {
              return NextResponse.json({ success: true, order: waslahSynthetic })
            }
          } catch (e) {
            console.error('Waslah AWB fallback failed:', e?.message || e)
          }
        }
      }

      return NextResponse.json(
        { success: false, message: 'Order not found with the provided mobile number, email, or tracking reference' },
        { status: 404 }
      )
    }

    const enrichedOrder = await enrichOrderWithLiveTracking(order, {
      lookupIdentifier: identifier,
    })

    return NextResponse.json({
      success: true,
      order: enrichedOrder,
      ...(relatedOrders.length > 1
        ? {
            relatedOrders: relatedOrders.slice(1).map((entry) => ({
              _id: entry._id,
              shortOrderNumber: entry.shortOrderNumber,
              status: entry.status,
              createdAt: entry.createdAt,
              trackingId: entry.trackingId,
              total: entry.total,
            })),
            message: `Showing your most recent order. ${relatedOrders.length - 1} more order(s) found for this contact.`,
          }
        : {}),
    })
  } catch (error) {
    console.error('Track order error:', error && error.stack ? error.stack : error)
    return NextResponse.json(
      { success: false, message: 'Failed to track order', error: error?.message || error },
      { status: 500 }
    )
  }
}
