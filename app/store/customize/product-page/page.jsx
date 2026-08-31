'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/useAuth'

const DEFAULT_BADGES = [
  { label: 'Price Lower Than Usual', backgroundColor: '#007600', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Hot Deal', backgroundColor: '#cc0c39', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Best Seller', backgroundColor: '#c45500', textColor: '#ffffff', borderRadius: 0 },
  { label: 'New Arrival', backgroundColor: '#0066c0', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Limited Stock', backgroundColor: '#b12704', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Free Shipping', backgroundColor: '#007185', textColor: '#ffffff', borderRadius: 0 }
]

const DEFAULT_FORM = {
  returnsText: 'Easy Returns',
  vatText: 'All prices include VAT.',
  deliveryPrefix: 'Estimated delivery',
  deliverySuffix: '— timelines are estimates.',
  cutoffHour: 23,
  cutoffMinute: 0,
  deliveryMinDays: 2,
  deliveryMaxDays: 3,
  badgeSettings: {
    badges: DEFAULT_BADGES
  }
}

export default function ProductPageCustomizePage() {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)

  const updateBadge = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      badgeSettings: {
        badges: (prev.badgeSettings?.badges || []).map((badge, badgeIndex) => (
          badgeIndex === index ? { ...badge, [key]: value } : badge
        ))
      }
    }))
  }

  const addBadge = () => {
    setForm((prev) => ({
      ...prev,
      badgeSettings: {
        badges: [
          ...(prev.badgeSettings?.badges || []),
          { label: '', backgroundColor: '#565959', textColor: '#ffffff', borderRadius: 0 }
        ]
      }
    }))
  }

  const removeBadge = (index) => {
    setForm((prev) => ({
      ...prev,
      badgeSettings: {
        badges: (prev.badgeSettings?.badges || []).filter((_, badgeIndex) => badgeIndex !== index)
      }
    }))
  }

  const cutoffHour24 = Number(form.cutoffHour) || 0
  const cutoffHour12 = cutoffHour24 % 12 === 0 ? 12 : cutoffHour24 % 12
  const cutoffMinute = Number(form.cutoffMinute) || 0
  const cutoffPeriod = cutoffHour24 >= 12 ? 'PM' : 'AM'
  const minuteOptions = ['00', '15', '30', '45']

  const updateCutoffTime = (nextHour12, nextMinute, nextPeriod) => {
    const safeHour12 = Number(nextHour12) || 12
    const safeMinute = Number(nextMinute) || 0
    const safePeriod = nextPeriod === 'PM' ? 'PM' : 'AM'

    let nextHour24 = safeHour12 % 12
    if (safePeriod === 'PM') nextHour24 += 12

    setForm((prev) => ({
      ...prev,
      cutoffHour: nextHour24,
      cutoffMinute: safeMinute
    }))
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await axios.get('/api/store/appearance/sections', {
        headers: { Authorization: `Bearer ${token}` }
      })

      setForm({
        ...DEFAULT_FORM,
        ...(res.data?.productPageInfo || {}),
        badgeSettings: {
          badges: Array.isArray(res.data?.productPageInfo?.badgeSettings?.badges) && res.data.productPageInfo.badgeSettings.badges.length
            ? res.data.productPageInfo.badgeSettings.badges
            : DEFAULT_BADGES
        }
      })
    } catch (error) {
      toast.error('Failed to load product page settings')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const save = async () => {
    try {
      setSaving(true)
      const token = await getToken()

      const payload = {
        productPageInfo: {
          ...form,
          deliveryMinDays: Math.max(0, Number(form.deliveryMinDays) || 0),
          deliveryMaxDays: Math.max(0, Number(form.deliveryMaxDays) || 0),
          cutoffHour: Math.max(0, Math.min(23, Number(form.cutoffHour) || 0)),
          cutoffMinute: Math.max(0, Math.min(59, Number(form.cutoffMinute) || 0)),
          badgeSettings: {
            badges: (form.badgeSettings?.badges || [])
              .map((badge) => ({
                label: String(badge?.label || '').trim(),
                backgroundColor: String(badge?.backgroundColor || '').trim(),
                textColor: String(badge?.textColor || '').trim(),
                borderRadius: Math.max(0, Math.min(24, Number(badge?.borderRadius) || 0))
              }))
              .filter((badge) => badge.label)
          }
        }
      }

      await axios.post('/api/store/appearance/sections', payload, {
        headers: { Authorization: `Bearer ${token}` }
      })

      toast.success('Badges saved')
    } catch (error) {
      toast.error('Failed to save badges')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Badges</h1>
        <p className="text-sm text-slate-600 mt-1">Update buy-box delivery and returns texts dynamically.</p>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Returns & VAT</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Returns text</span>
            <input className="w-full border rounded-lg px-3 py-2" value={form.returnsText} onChange={(e) => setForm((prev) => ({ ...prev, returnsText: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">VAT text</span>
            <input className="w-full border rounded-lg px-3 py-2" value={form.vatText} onChange={(e) => setForm((prev) => ({ ...prev, vatText: e.target.value }))} />
          </label>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Standard Delivery</h2>
        <p className="text-sm text-slate-500">
          Set one daily cutoff time. Before that time, customers see the remaining order time. After it passes, the countdown automatically shifts to the next day at the same time.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Delivery prefix</span>
            <input className="w-full border rounded-lg px-3 py-2" value={form.deliveryPrefix} onChange={(e) => setForm((prev) => ({ ...prev, deliveryPrefix: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Delivery suffix</span>
            <input className="w-full border rounded-lg px-3 py-2" value={form.deliverySuffix} onChange={(e) => setForm((prev) => ({ ...prev, deliverySuffix: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Minimum delivery days</span>
            <input type="number" min="0" max="30" className="w-full border rounded-lg px-3 py-2" value={form.deliveryMinDays} onChange={(e) => setForm((prev) => ({ ...prev, deliveryMinDays: e.target.value }))} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Maximum delivery days</span>
            <input type="number" min="0" max="45" className="w-full border rounded-lg px-3 py-2" value={form.deliveryMaxDays} onChange={(e) => setForm((prev) => ({ ...prev, deliveryMaxDays: e.target.value }))} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Daily cutoff time</span>
            <div className="grid grid-cols-3 gap-3">
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={String(cutoffHour12)}
                onChange={(e) => updateCutoffTime(e.target.value, cutoffMinute, cutoffPeriod)}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={String(cutoffMinute).padStart(2, '0')}
                onChange={(e) => updateCutoffTime(cutoffHour12, e.target.value, cutoffPeriod)}
              >
                {minuteOptions.map((minute) => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={cutoffPeriod}
                onChange={(e) => updateCutoffTime(cutoffHour12, cutoffMinute, e.target.value)}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
            <p className="text-xs text-slate-500">Choose the daily cutoff time customers must order before.</p>
          </label>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Product Badges</h2>
            <p className="text-sm text-slate-500 mt-1">Control the badge options used on product pages and in the product editor.</p>
          </div>
          <button
            type="button"
            onClick={addBadge}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} />
            Add Badge
          </button>
        </div>

        <div className="space-y-4">
          {(form.badgeSettings?.badges || []).map((badge, index) => (
            <div key={`badge-${index}`} className="rounded-xl border border-slate-200 p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_140px_140px_120px_auto] md:items-end">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Badge label</span>
                  <input
                    className="w-full border rounded-lg px-3 py-2"
                    value={badge.label || ''}
                    onChange={(e) => updateBadge(index, 'label', e.target.value.slice(0, 40))}
                    placeholder="e.g. Limited time deal"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Background</span>
                  <input
                    type="color"
                    className="h-11 w-full border rounded-lg px-2 py-1 bg-white"
                    value={badge.backgroundColor || '#565959'}
                    onChange={(e) => updateBadge(index, 'backgroundColor', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Text color</span>
                  <input
                    type="color"
                    className="h-11 w-full border rounded-lg px-2 py-1 bg-white"
                    value={badge.textColor || '#ffffff'}
                    onChange={(e) => updateBadge(index, 'textColor', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Radius</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    className="w-full border rounded-lg px-3 py-2"
                    value={badge.borderRadius ?? 0}
                    onChange={(e) => updateBadge(index, 'borderRadius', e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeBadge(index)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>

              <div className="mt-3">
                <span
                  className="inline-flex items-center px-2.5 py-[3px] text-[12px] font-bold"
                  style={{
                    backgroundColor: badge.backgroundColor || '#565959',
                    color: badge.textColor || '#ffffff',
                    borderRadius: `${Math.max(0, Math.min(24, Number(badge.borderRadius) || 0))}px`
                  }}
                >
                  {badge.label || 'Badge preview'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        Save Badges
      </button>
    </div>
  )
}
