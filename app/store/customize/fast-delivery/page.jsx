'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Loader2, Plus, Save, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/useAuth'
import FastDeliveryPageHeader from '@/components/FastDeliveryPageHeader'
import { DEFAULT_FAST_DELIVERY_PAGE, normalizeFastDeliveryPage } from '@/lib/fastDeliveryPageSettings'

const createBannerSlide = (overrides = {}) => ({
  image: '',
  alt: '',
  link: '',
  ...overrides,
})

export default function FastDeliveryCustomizePage() {
  const { user, loading: authLoading, getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingIndex, setUploadingIndex] = useState(null)
  const [form, setForm] = useState(DEFAULT_FAST_DELIVERY_PAGE)

  const loadData = async () => {
    try {
      setLoading(true)
      const token = (await getToken()) || (await getToken(true))
      if (!token) {
        toast.error('Please sign in again to edit this page')
        return
      }
      const res = await axios.get('/api/store/appearance/sections', {
        headers: { Authorization: `Bearer ${token}` }
      })

      const normalized = normalizeFastDeliveryPage({
        ...DEFAULT_FAST_DELIVERY_PAGE,
        ...(res.data?.fastDeliveryPage || {}),
      })

      setForm({
        ...normalized,
        headerBannerSlides: normalized.headerBannerSlides.length
          ? normalized.headerBannerSlides
          : [createBannerSlide({ alt: 'Banner 1' })],
      })
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load fast delivery settings')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    loadData()
  }, [authLoading, user])

  const updateSlide = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      headerBannerSlides: prev.headerBannerSlides.map((slide, slideIndex) => (
        slideIndex === index ? { ...slide, [key]: value } : slide
      )),
    }))
  }

  const addSlide = () => {
    setForm((prev) => {
      if (prev.headerBannerSlides.length >= 8) return prev
      return {
        ...prev,
        headerBannerSlides: [
          ...prev.headerBannerSlides,
          createBannerSlide({ alt: `Banner ${prev.headerBannerSlides.length + 1}` }),
        ],
      }
    })
  }

  const removeSlide = (index) => {
    setForm((prev) => ({
      ...prev,
      headerBannerSlides: prev.headerBannerSlides.filter((_, slideIndex) => slideIndex !== index),
    }))
  }

  const uploadSlideImage = async (index, file) => {
    if (!file) return

    try {
      setUploadingIndex(index)
      const token = await getToken()
      const formData = new FormData()
      formData.append('image', file)
      formData.append('type', 'banner')

      const response = await axios.post('/api/store/upload-image', formData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      updateSlide(index, 'image', response.data?.url || '')
      toast.success(`Banner ${index + 1} uploaded`)
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Banner upload failed')
    } finally {
      setUploadingIndex(null)
    }
  }

  const save = async () => {
    try {
      setSaving(true)
      const token = (await getToken()) || (await getToken(true))
      if (!token) {
        toast.error('Please sign in again to save')
        return
      }
      const normalized = normalizeFastDeliveryPage(form)

      const { data } = await axios.post('/api/store/appearance/sections', {
        fastDeliveryPage: normalized,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const saved = normalizeFastDeliveryPage(data?.fastDeliveryPage || normalized)
      setForm({
        ...saved,
        headerBannerSlides: saved.headerBannerSlides.length
          ? saved.headerBannerSlides
          : [createBannerSlide({ alt: 'Banner 1' })],
      })
      toast.success('Fast delivery page settings saved')
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save fast delivery settings')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const previewSettings = useMemo(() => normalizeFastDeliveryPage(form), [form])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Fast Delivery Page Design</h1>
          <p className="text-sm text-slate-600 mt-1">Edit the title, subtitle, banners, and empty state. Click Save to update /fast-delivery.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || authLoading || !user}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Header Section</h2>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Header Title</span>
          <input
            type="text"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            value={form.headerTitle}
            onChange={(e) => setForm((prev) => ({ ...prev, headerTitle: e.target.value }))}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Header Subtitle</span>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 resize-none"
            rows="2"
            value={form.headerSubtitle}
            onChange={(e) => setForm((prev) => ({ ...prev, headerSubtitle: e.target.value }))}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Header Background Color</span>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              value={form.headerBgColor}
              onChange={(e) => setForm((prev) => ({ ...prev, headerBgColor: e.target.value }))}
            />
            <input
              type="text"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm"
              value={form.headerBgColor}
              onChange={(e) => setForm((prev) => ({ ...prev, headerBgColor: e.target.value }))}
            />
          </div>
          <span className="text-xs text-slate-500">Used behind the banner slider and when no banner image is uploaded.</span>
        </label>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Banner Slider</h2>
            <p className="text-sm text-slate-500">Upload multiple banner images. They rotate automatically on the fast delivery page.</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Enable slider</span>
            <input
              type="checkbox"
              checked={form.headerBannerSliderEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, headerBannerSliderEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        </div>

        <label className="space-y-1 block max-w-xs">
          <span className="text-sm font-medium text-slate-700">Slide interval (ms)</span>
          <input
            type="number"
            min="2000"
            max="15000"
            step="500"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            value={form.headerBannerSliderInterval}
            onChange={(e) => setForm((prev) => ({
              ...prev,
              headerBannerSliderInterval: Number(e.target.value) || DEFAULT_FAST_DELIVERY_PAGE.headerBannerSliderInterval,
            }))}
          />
        </label>

        <div className="space-y-4">
          {form.headerBannerSlides.map((slide, index) => (
            <div key={`slide-${index}`} className="rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-slate-900">Slide {index + 1}</h3>
                <button
                  type="button"
                  onClick={() => removeSlide(index)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Upload banner image</label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    {uploadingIndex === index ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploadingIndex === index ? 'Uploading...' : 'Choose image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadSlideImage(index, e.target.files?.[0])}
                    />
                  </label>

                  {slide.image ? (
                    <img
                      src={slide.image}
                      alt={slide.alt || `Banner ${index + 1}`}
                      className="h-36 w-full rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                      Upload a wide banner image
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-slate-700">Image URL (optional)</span>
                    <input
                      type="url"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-sm"
                      value={slide.image}
                      onChange={(e) => updateSlide(index, 'image', e.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-slate-700">Alt text</span>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-sm"
                      value={slide.alt}
                      onChange={(e) => updateSlide(index, 'alt', e.target.value)}
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-slate-700">Link (optional)</span>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-sm"
                      value={slide.link}
                      onChange={(e) => updateSlide(index, 'link', e.target.value)}
                      placeholder="/products or https://..."
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSlide}
          disabled={form.headerBannerSlides.length >= 8}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} />
          Add banner slide
        </button>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Empty State (No Products)</h2>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Empty State Title</span>
          <input
            type="text"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            value={form.emptyStateTitle}
            onChange={(e) => setForm((prev) => ({ ...prev, emptyStateTitle: e.target.value }))}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Empty State Message</span>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 resize-none"
            rows="2"
            value={form.emptyStateMessage}
            onChange={(e) => setForm((prev) => ({ ...prev, emptyStateMessage: e.target.value }))}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-slate-700">Empty State Background Color</span>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              value={form.emptyStateBgColor}
              onChange={(e) => setForm((prev) => ({ ...prev, emptyStateBgColor: e.target.value }))}
            />
            <input
              type="text"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm"
              value={form.emptyStateBgColor}
              onChange={(e) => setForm((prev) => ({ ...prev, emptyStateBgColor: e.target.value }))}
            />
          </div>
        </label>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <FastDeliveryPageHeader settings={previewSettings} />
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={loadData}
          disabled={loading || saving}
          className="px-6 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
