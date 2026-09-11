'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { formatStoreOrderDateTime } from '@/lib/orderDisplay'

function formatTrackingEventTime(value) {
  if (!value) return ''
  const formatted = formatStoreOrderDateTime(value, {
    timeZone: 'Asia/Dubai',
    relativeDay: true,
  })
  return formatted === '—' ? '' : formatted
}

export default function TrackingTimeline({
  events,
  type = 'delhivery',
  emptyLabel = 'No tracking events yet',
  updateLabel = 'Update',
  receivedByLabel = 'Received by',
}) {
  const [animatedEvents, setAnimatedEvents] = useState([])

  useEffect(() => {
    // Stagger animation for each event
    events.forEach((event, index) => {
      setTimeout(() => {
        setAnimatedEvents((prev) => [...prev, index])
      }, index * 200)
    })
  }, [events])

  const getStatusColor = (status) => {
    const statusLower = String(status || '').toLowerCase()
    if (statusLower.includes('delivered') || statusLower.includes('pod') || statusLower.includes('settled')) return 'green'
    if (statusLower.includes('out') || statusLower.includes('dispatch') || statusLower.includes('collection')) return 'blue'
    if (statusLower.includes('warehouse') || statusLower.includes('reached') || statusLower.includes('sorting') || statusLower.includes('in transit')) return 'indigo'
    if (statusLower.includes('picked') || statusLower.includes('pick')) return 'purple'
    if (statusLower.includes('confirm') || statusLower.includes('processing') || statusLower.includes('label') || statusLower.includes('new shipment') || statusLower.includes('on hold')) return 'yellow'
    if (statusLower.includes('cancel') || statusLower.includes('fail') || statusLower.includes('return') || statusLower.includes('exception') || statusLower.includes('lost') || statusLower.includes('damaged') || statusLower.includes('rto')) return 'red'
    return 'slate'
  }

  const colorMap = {
    green: 'bg-green-600 text-white',
    blue: 'bg-blue-600 text-white',
    indigo: 'bg-indigo-600 text-white',
    purple: 'bg-purple-600 text-white',
    yellow: 'bg-amber-500 text-white',
    red: 'bg-red-600 text-white',
    slate: 'bg-slate-500 text-white',
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Animated vertical line */}
      <div className="absolute bottom-3 left-4 top-3 w-px bg-slate-200" />

      <div className="space-y-3">
        {events.map((event, idx) => {
          const isAnimated = animatedEvents.includes(idx)
          const color = getStatusColor(event.status)
          const timestamp = formatTrackingEventTime(event.time || event.createdAt)
          const location = event.location || event.locationName || ''
          const remarks = event.remarks || event.description || ''
          const deliveredTo = event.deliveredTo || ''

          return (
            <div
              key={`${type}-${idx}-${event.time || ''}-${event.status || ''}`}
              className={`relative pl-11 transition-all duration-500 ${
                isAnimated ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
              }`}
            >
              {/* Status dot */}
              <div
                className={`absolute left-0 top-4 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white shadow-sm transition-all duration-300 ${colorMap[color]}`}
              >
                {idx === 0 ? (
                  <TrendingUp size={15} />
                ) : (
                  <CheckCircle size={15} />
                )}
              </div>

              {/* Event card */}
              <div
                className="rounded-lg border border-slate-200 bg-white p-4 transition-all duration-300 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h4 className="text-base font-semibold capitalize text-slate-900">
                    {String(event.status || '').replace(/_/g, ' ')}
                  </h4>
                  <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {timestamp || updateLabel}
                  </span>
                </div>

                {location ? (
                <p className="text-sm text-slate-700 mb-1 flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-slate-600 rounded-full" />
                  {location}
                </p>
                ) : null}

                {remarks && (
                  <p className="text-sm text-slate-600 mt-2 italic">"{remarks}"</p>
                )}

                {deliveredTo && (
                  <div className="mt-3 rounded border-l-2 border-green-500 bg-green-50 p-2">
                    <p className="text-xs font-medium text-slate-700">
                      ✓ {receivedByLabel}: <span className="text-green-700 font-bold">{deliveredTo}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
