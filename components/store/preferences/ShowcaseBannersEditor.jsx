'use client'

import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import Image from 'next/image'
import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/useAuth'
import { createLargeBannerSlide, normalizeLargeBannerSliderItemsForEditor } from '@/lib/shopShowcaseLargeBanners'

const createBanner = (overrides = {}) => ({
  image: '',
  title: '',
  subtitle: '',
  buttonText: '',
  link: '',
  file: null,
  previewUrl: '',
  ...overrides,
})

const sanitizeImageUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const withoutPathTransform = raw.replace(/\/tr:[^/]+\//i, '/')
  try {
    const url = new URL(withoutPathTransform)
    if (url.searchParams.has('tr')) {
      url.searchParams.delete('tr')
    }
    return url.toString()
  } catch {
    return withoutPathTransform
  }
}

const DEFAULT_FORM = {
  mainBannerEnabled: true,
  topBannerImage: '',
  topBannerTitle: '',
  topBannerSubtitle: '',
  topBannerCtaText: '',
  topBannerTitleEnabled: true,
  topBannerSubtitleEnabled: true,
  topBannerCtaEnabled: true,
  topBannerCtaBgColor: '#ef2d2d',
  topBannerCtaTextColor: '#ffffff',
  topBannerLink: '/shop',
  topBannerSliderEnabled: true,
  topBannerSliderInterval: 4000,
  topBannerSliderItems: [createLargeBannerSlide({ alt: 'Top banner 1' })],
  bottomBannerImage: '',
  bottomBannerTitle: '',
  bottomBannerSubtitle: '',
  bottomBannerCtaText: '',
  bottomBannerTitleEnabled: true,
  bottomBannerSubtitleEnabled: true,
  bottomBannerCtaEnabled: true,
  bottomBannerCtaBgColor: '#ef2d2d',
  bottomBannerCtaTextColor: '#ffffff',
  bottomBannerLink: '/shop',
  bottomBannerSliderEnabled: true,
  bottomBannerSliderInterval: 4000,
  bottomBannerSliderItems: [createLargeBannerSlide({ alt: 'Bottom banner 1' })],
  productBanners: [
    createBanner(),
    createBanner(),
    createBanner(),
    createBanner(),
  ],
}

const PRODUCT_SLOT_LABELS = ['Card 1', 'Card 2', 'Card 3', 'Card 4']

function mapSliderItemsForEditor(showcase, itemsKey, legacyImageKey, legacyLinkKey, prefix, defaultAlt) {
  return normalizeLargeBannerSliderItemsForEditor(
    showcase?.[itemsKey],
    showcase?.[legacyImageKey],
    showcase?.[legacyLinkKey] || '/shop',
    prefix,
  ).map((slide) => ({ ...slide, file: null, image: sanitizeImageUrl(slide.image || '') }))
}

function mergeSavedSliderItems(localItems = [], serverItems = []) {
  if (!localItems.length) {
    return serverItems.map((slide) => ({
      ...slide,
      file: null,
      image: sanitizeImageUrl(slide.image || ''),
    }))
  }

  return localItems.map((localSlide, index) => {
    const serverSlide = serverItems.find((item) => item?.id && item.id === localSlide.id) || serverItems[index]
    const image = sanitizeImageUrl(serverSlide?.image || localSlide.image || '')

    return {
      ...localSlide,
      ...(serverSlide || {}),
      id: localSlide.id || serverSlide?.id,
      image,
      link: String(serverSlide?.link || localSlide.link || '/shop').trim(),
      alt: String(serverSlide?.alt || localSlide.alt || '').trim(),
      file: null,
    }
  })
}

function buildShowcaseFormState(showcase = {}, previousForm = null) {
  const savedBanners = Array.isArray(showcase?.productBanners) ? showcase.productBanners : []

  return {
    mainBannerEnabled: typeof showcase?.mainBannerEnabled === 'boolean'
      ? showcase.mainBannerEnabled
      : true,
    topBannerImage: sanitizeImageUrl(showcase?.topBannerImage || ''),
    topBannerTitle: showcase?.topBannerTitle || '',
    topBannerSubtitle: showcase?.topBannerSubtitle || '',
    topBannerCtaText: showcase?.topBannerCtaText || '',
    topBannerTitleEnabled: typeof showcase?.topBannerTitleEnabled === 'boolean'
      ? showcase.topBannerTitleEnabled
      : true,
    topBannerSubtitleEnabled: typeof showcase?.topBannerSubtitleEnabled === 'boolean'
      ? showcase.topBannerSubtitleEnabled
      : true,
    topBannerCtaEnabled: typeof showcase?.topBannerCtaEnabled === 'boolean'
      ? showcase.topBannerCtaEnabled
      : true,
    topBannerCtaBgColor: showcase?.topBannerCtaBgColor || '#ef2d2d',
    topBannerCtaTextColor: showcase?.topBannerCtaTextColor || '#ffffff',
    topBannerLink: showcase?.topBannerLink || '/shop',
    topBannerSliderEnabled: showcase?.topBannerSliderEnabled !== false,
    topBannerSliderInterval: Number(showcase?.topBannerSliderInterval) || 4000,
    topBannerSliderItems: (() => {
      const items = mapSliderItemsForEditor(showcase, 'topBannerSliderItems', 'topBannerImage', 'topBannerLink', 'top-large-banner', 'Top banner')
      const baseItems = items.length ? items : [createLargeBannerSlide({ alt: 'Top banner 1', file: null })]
      if (previousForm?.topBannerSliderItems?.length) {
        return mergeSavedSliderItems(previousForm.topBannerSliderItems, baseItems)
      }
      return baseItems
    })(),
    bottomBannerImage: sanitizeImageUrl(showcase?.bottomBannerImage || ''),
    bottomBannerTitle: showcase?.bottomBannerTitle || '',
    bottomBannerSubtitle: showcase?.bottomBannerSubtitle || '',
    bottomBannerCtaText: showcase?.bottomBannerCtaText || '',
    bottomBannerTitleEnabled: typeof showcase?.bottomBannerTitleEnabled === 'boolean'
      ? showcase.bottomBannerTitleEnabled
      : true,
    bottomBannerSubtitleEnabled: typeof showcase?.bottomBannerSubtitleEnabled === 'boolean'
      ? showcase.bottomBannerSubtitleEnabled
      : true,
    bottomBannerCtaEnabled: typeof showcase?.bottomBannerCtaEnabled === 'boolean'
      ? showcase.bottomBannerCtaEnabled
      : true,
    bottomBannerCtaBgColor: showcase?.bottomBannerCtaBgColor || '#ef2d2d',
    bottomBannerCtaTextColor: showcase?.bottomBannerCtaTextColor || '#ffffff',
    bottomBannerLink: showcase?.bottomBannerLink || '/shop',
    bottomBannerSliderEnabled: showcase?.bottomBannerSliderEnabled !== false,
    bottomBannerSliderInterval: Number(showcase?.bottomBannerSliderInterval) || 4000,
    bottomBannerSliderItems: (() => {
      const items = mapSliderItemsForEditor(showcase, 'bottomBannerSliderItems', 'bottomBannerImage', 'bottomBannerLink', 'bottom-large-banner', 'Bottom banner')
      const baseItems = items.length ? items : [createLargeBannerSlide({ alt: 'Bottom banner 1', file: null })]
      if (previousForm?.bottomBannerSliderItems?.length) {
        return mergeSavedSliderItems(previousForm.bottomBannerSliderItems, baseItems)
      }
      return baseItems
    })(),
    topBannerFile: null,
    bottomBannerFile: null,
    productBanners: (() => {
      const mapped = Array.from({ length: Math.max(1, Math.min(4, savedBanners.length || 1)) }, (_, index) => {
        const current = savedBanners[index] || {}
        const fallbackTitle = `Product Title ${index + 1}`
        const normalizedTitle = String(current.title || '').trim()
        const normalizedSubtitle = String(current.subtitle || '').trim()
        const normalizedButtonText = String(current.buttonText || '').trim()
        const normalizedLink = String(current.link || '').trim()

        return createBanner({
          image: sanitizeImageUrl(current.image || ''),
          title: normalizedTitle && normalizedTitle !== fallbackTitle ? normalizedTitle : '',
          subtitle: normalizedSubtitle && normalizedSubtitle !== 'Order now' ? normalizedSubtitle : '',
          buttonText: normalizedButtonText && normalizedButtonText !== 'Order now' ? normalizedButtonText : '',
          link: normalizedLink && normalizedLink !== '/shop' ? normalizedLink : '',
          file: null,
          previewUrl: sanitizeImageUrl(current.image || ''),
        })
      })

      if (previousForm?.productBanners?.length && previousForm.productBanners.length === mapped.length) {
        return previousForm.productBanners.map((localBanner, index) => {
          const serverBanner = mapped[index]
          const image = sanitizeImageUrl(serverBanner?.image || localBanner.image || localBanner.previewUrl || '')
          return {
            ...localBanner,
            ...serverBanner,
            image,
            previewUrl: localBanner.previewUrl || image,
            file: null,
          }
        })
      }

      return mapped
    })(),
  }
}

export default function ShowcaseBannersEditor({ embedded = false }) {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loadedShowcase, setLoadedShowcase] = useState({})
  const formRef = useRef(form)
  const loadedShowcaseRef = useRef(loadedShowcase)
  formRef.current = form
  loadedShowcaseRef.current = loadedShowcase

  const loadData = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await axios.get('/api/store/preferences/shop-showcase', {
        headers: { Authorization: `Bearer ${token}` }
      })

      setLoadedShowcase(res.data?.shopShowcase || {})
      setForm(buildShowcaseFormState(res.data?.shopShowcase || {}))
    } catch (error) {
      toast.error('Failed to load showcase banners')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const updateBanner = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      productBanners: prev.productBanners.map((banner, bannerIndex) => (
        bannerIndex === index ? { ...banner, [key]: value } : banner
      ))
    }))
  }

  const addProductBanner = () => {
    setForm((prev) => {
      if (prev.productBanners.length >= 4) return prev
      return {
        ...prev,
        productBanners: [...prev.productBanners, createBanner()],
      }
    })
  }

  const removeProductBanner = (index) => {
    setForm((prev) => {
      if (prev.productBanners.length <= 1) {
        return {
          ...prev,
          productBanners: [createBanner()],
        }
      }
      return {
        ...prev,
        productBanners: prev.productBanners.filter((_, bannerIndex) => bannerIndex !== index),
      }
    })
  }

  const moveProductBanner = (index, direction) => {
    setForm((prev) => {
      const items = [...prev.productBanners]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= items.length) return prev
      const [item] = items.splice(index, 1)
      items.splice(targetIndex, 0, item)
      return { ...prev, productBanners: items }
    })
  }

  const updateLargeBannerSlide = (itemsKey, index, key, value) => {
    setForm((prev) => ({
      ...prev,
      [itemsKey]: prev[itemsKey].map((slide, slideIndex) => (
        slideIndex === index ? { ...slide, [key]: value } : slide
      )),
    }))
  }

  const addLargeBannerSlide = (itemsKey, altPrefix) => {
    setForm((prev) => {
      if (prev[itemsKey].length >= 8) return prev
      return {
        ...prev,
        [itemsKey]: [
          ...prev[itemsKey],
          createLargeBannerSlide({ alt: `${altPrefix} ${prev[itemsKey].length + 1}`, file: null }),
        ],
      }
    })
  }

  const removeLargeBannerSlide = (itemsKey, index) => {
    setForm((prev) => ({
      ...prev,
      [itemsKey]: prev[itemsKey].filter((_, slideIndex) => slideIndex !== index),
    }))
  }

  const moveLargeBannerSlide = (itemsKey, index, direction) => {
    setForm((prev) => {
      const items = [...prev[itemsKey]]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= items.length) return prev
      const [item] = items.splice(index, 1)
      items.splice(targetIndex, 0, item)
      return { ...prev, [itemsKey]: items }
    })
  }

  const uploadLargeBannerSlide = async (itemsKey, index, file) => {
    if (!file) return
    try {
      const token = await getToken()
      const image = sanitizeImageUrl(await uploadImage(file, token))
      setForm((prev) => ({
        ...prev,
        [itemsKey]: prev[itemsKey].map((slide, slideIndex) => (
          slideIndex === index ? { ...slide, image, file: null } : slide
        )),
      }))
      toast.success('Banner slide uploaded')
    } catch (error) {
      toast.error('Failed to upload banner slide')
      console.error(error)
    }
  }

  const handleImageChange = (index, file) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setForm((prev) => ({
      ...prev,
      productBanners: prev.productBanners.map((banner, bannerIndex) => (
        bannerIndex === index ? { ...banner, file, previewUrl } : banner
      ))
    }))
  }

  const handleHeroImageChange = (field, file) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setForm((prev) => ({
      ...prev,
      [field]: previewUrl,
      [field === 'topBannerImage' ? 'topBannerFile' : 'bottomBannerFile']: file,
    }))
  }

  const uploadImage = async (file, token) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('uploadContext', 'showcase-banner')

    const response = await axios.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      }
    })

    return response.data.url
  }

  const save = async () => {
    try {
      setSaving(true)
      const token = await getToken()
      const currentForm = formRef.current

      const productBanners = []
      for (const banner of currentForm.productBanners) {
        let image = sanitizeImageUrl(banner.image || banner.previewUrl)
        if (banner.file) {
          image = sanitizeImageUrl(await uploadImage(banner.file, token))
        }
        if (!image) continue

        productBanners.push({
          image,
          title: String(banner.title || '').trim(),
          subtitle: String(banner.subtitle || '').trim(),
          buttonText: String(banner.buttonText || '').trim(),
          link: String(banner.link || '').trim()
        })
      }

      let topBannerImage = sanitizeImageUrl(currentForm.topBannerImage)
      let bottomBannerImage = sanitizeImageUrl(currentForm.bottomBannerImage)

      const topBannerSliderItems = []
      for (const slide of currentForm.topBannerSliderItems) {
        let image = sanitizeImageUrl(slide.image)
        if (slide.file) {
          image = sanitizeImageUrl(await uploadImage(slide.file, token))
        }
        topBannerSliderItems.push({
          id: slide.id,
          image,
          link: String(slide.link || currentForm.topBannerLink || '/shop').trim(),
          alt: String(slide.alt || '').trim(),
        })
      }

      const bottomBannerSliderItems = []
      for (const slide of currentForm.bottomBannerSliderItems) {
        let image = sanitizeImageUrl(slide.image)
        if (slide.file) {
          image = sanitizeImageUrl(await uploadImage(slide.file, token))
        }
        bottomBannerSliderItems.push({
          id: slide.id,
          image,
          link: String(slide.link || currentForm.bottomBannerLink || '/shop').trim(),
          alt: String(slide.alt || '').trim(),
        })
      }

      topBannerImage = topBannerSliderItems.find((slide) => slide.image)?.image || topBannerImage
      bottomBannerImage = bottomBannerSliderItems.find((slide) => slide.image)?.image || bottomBannerImage

      if (currentForm.topBannerFile) {
        topBannerImage = sanitizeImageUrl(await uploadImage(currentForm.topBannerFile, token))
      }

      if (currentForm.bottomBannerFile) {
        bottomBannerImage = sanitizeImageUrl(await uploadImage(currentForm.bottomBannerFile, token))
      }

      const latestResponse = await axios.get('/api/store/preferences/shop-showcase', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const latestShowcase = latestResponse.data?.shopShowcase || loadedShowcaseRef.current || {}

      const response = await axios.put('/api/store/preferences/shop-showcase', {
        ...latestShowcase,
        mainBannerEnabled: !!currentForm.mainBannerEnabled,
        productBanners,
        topBannerImage,
        topBannerTitle: String(currentForm.topBannerTitle || '').trim(),
        topBannerTitleEnabled: !!currentForm.topBannerTitleEnabled,
        topBannerSubtitle: String(currentForm.topBannerSubtitle || '').trim(),
        topBannerSubtitleEnabled: !!currentForm.topBannerSubtitleEnabled,
        topBannerCtaText: String(currentForm.topBannerCtaText || '').trim(),
        topBannerCtaEnabled: !!currentForm.topBannerCtaEnabled,
        topBannerCtaBgColor: String(currentForm.topBannerCtaBgColor || '').trim(),
        topBannerCtaTextColor: String(currentForm.topBannerCtaTextColor || '').trim(),
        topBannerLink: String(currentForm.topBannerLink || '/shop').trim(),
        topBannerSliderEnabled: !!currentForm.topBannerSliderEnabled,
        topBannerSliderInterval: Number(currentForm.topBannerSliderInterval) || 4000,
        topBannerSliderItems,
        bottomBannerImage,
        bottomBannerTitle: String(currentForm.bottomBannerTitle || '').trim(),
        bottomBannerTitleEnabled: !!currentForm.bottomBannerTitleEnabled,
        bottomBannerSubtitle: String(currentForm.bottomBannerSubtitle || '').trim(),
        bottomBannerSubtitleEnabled: !!currentForm.bottomBannerSubtitleEnabled,
        bottomBannerCtaText: String(currentForm.bottomBannerCtaText || '').trim(),
        bottomBannerCtaEnabled: !!currentForm.bottomBannerCtaEnabled,
        bottomBannerCtaBgColor: String(currentForm.bottomBannerCtaBgColor || '').trim(),
        bottomBannerCtaTextColor: String(currentForm.bottomBannerCtaTextColor || '').trim(),
        bottomBannerLink: String(currentForm.bottomBannerLink || '/shop').trim(),
        bottomBannerSliderEnabled: !!currentForm.bottomBannerSliderEnabled,
        bottomBannerSliderInterval: Number(currentForm.bottomBannerSliderInterval) || 4000,
        bottomBannerSliderItems,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const savedShowcase = response.data?.shopShowcase || {}
      setLoadedShowcase(savedShowcase)
      setForm(buildShowcaseFormState(savedShowcase, currentForm))
      toast.success('Showcase banners saved')
    } catch (error) {
      toast.error('Failed to save showcase banners')
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
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'}>
      <div className={embedded ? '' : 'mb-6'}>
        {!embedded && (
          <>
            <h1 className="text-3xl font-bold text-slate-900">Showcase 4-Grid Banners</h1>
            <p className="mt-2 text-sm text-slate-600">
              Upload images and edit the four product banners shown under the main showcase.
            </p>
          </>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Layout Upload Guide</h2>
          <p className="mt-1 text-xs text-slate-500">
            Upload each image in the matching field below. This preview mirrors the storefront layout.
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Left sidebar</div>
              <div className="mt-2 flex h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-xs font-medium text-slate-500">
                Category menu
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                  <div className="relative aspect-[3054/1080] w-full">
                    {form.topBannerSliderItems[0]?.image || form.topBannerImage ? (
                      <Image src={form.topBannerSliderItems[0]?.image || form.topBannerImage} alt="Top large banner preview" fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-300">Top Large Banner image</div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
                      Top Large Banner field
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                  <div className="relative aspect-[3054/370] w-full">
                    {form.bottomBannerSliderItems[0]?.image || form.bottomBannerImage ? (
                      <Image src={form.bottomBannerSliderItems[0]?.image || form.bottomBannerImage} alt="Bottom large banner preview" fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-300">Bottom Large Banner image</div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
                      Bottom Large Banner field
                    </span>
                  </div>
                </div>
              </div>

              <div className={`grid gap-2 ${(() => {
                const count = form.productBanners.filter((banner) => banner.previewUrl || banner.image).length || form.productBanners.length
                if (count <= 1) return 'grid-cols-1'
                if (count === 2) return 'grid-cols-2'
                if (count === 3) return 'grid-cols-3'
                return 'grid-cols-2 sm:grid-cols-4'
              })()}`}>
                {form.productBanners.map((banner, index) => (
                  <div key={`layout-slot-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                      <div className="relative aspect-[1225/639] w-full">
                        {banner.previewUrl ? (
                          <Image
                            src={banner.previewUrl}
                            alt={`${PRODUCT_SLOT_LABELS[index] || `Card ${index + 1}`} preview`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-300">
                            {PRODUCT_SLOT_LABELS[index] || `Card ${index + 1}`}
                          </div>
                        )}
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {PRODUCT_SLOT_LABELS[index] || `Card ${index + 1}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Main Banner Visibility</h2>
              <p className="text-xs text-slate-500">Enable or disable the big main banner on storefront.</p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.mainBannerEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, mainBannerEnabled: event.target.checked }))}
                className="sr-only peer"
              />
              <span className="h-6 w-11 rounded-full bg-slate-300 relative transition peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
              <span className="text-xs font-medium text-slate-700">
                {form.mainBannerEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Top Large Banner</h2>
            <p className="mb-3 text-xs font-medium text-slate-500">
              Layout slot: Row 1 right side · upload multiple images for a slider · Slide 1 plays first
            </p>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700">Enable banner slider</span>
              <input
                type="checkbox"
                checked={!!form.topBannerSliderEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, topBannerSliderEnabled: event.target.checked }))}
              />
            </div>

            <label className="mb-4 block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">Slide interval (ms)</span>
              <input
                type="number"
                min="2000"
                max="15000"
                step="500"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={form.topBannerSliderInterval}
                onChange={(event) => setForm((prev) => ({ ...prev, topBannerSliderInterval: Number(event.target.value) || 4000 }))}
              />
            </label>

            <div className="space-y-4">
              {form.topBannerSliderItems.map((slide, index) => (
                <div key={slide.id || `top-slide-${index}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">Slide {index + 1}</h3>
                      {index === 0 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          1st in slider
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {index + 1}{index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'} in slider
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveLargeBannerSlide('topBannerSliderItems', index, -1)}
                        disabled={index === 0}
                        title="Move up (earlier in slider)"
                        className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLargeBannerSlide('topBannerSliderItems', index, 1)}
                        disabled={index === form.topBannerSliderItems.length - 1}
                        title="Move down (later in slider)"
                        className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLargeBannerSlide('topBannerSliderItems', index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="relative mb-3 overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                    <div className="relative aspect-[3054/1080] w-full">
                      {slide.image ? (
                        <Image src={slide.image} alt={slide.alt || `Top slide ${index + 1}`} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">No image selected</div>
                      )}
                    </div>
                  </div>
                  <label className="mb-3 inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload size={16} />
                    Upload slide image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => uploadLargeBannerSlide('topBannerSliderItems', index, event.target.files?.[0] || null)}
                    />
                  </label>
                  <div className="grid gap-3">
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Image URL"
                      value={slide.image}
                      onChange={(event) => updateLargeBannerSlide('topBannerSliderItems', index, 'image', event.target.value)}
                    />
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Link (optional)"
                      value={slide.link}
                      onChange={(event) => updateLargeBannerSlide('topBannerSliderItems', index, 'link', event.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addLargeBannerSlide('topBannerSliderItems', 'Top banner')}
              disabled={form.topBannerSliderItems.length >= 8}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Add top banner slide
            </button>
            <p className="mt-2 text-xs text-slate-500">Recommended size: 3054 x 1080 px</p>

            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.topBannerTitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerTitle: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show title</span>
                <input
                  type="checkbox"
                  checked={!!form.topBannerTitleEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerTitleEnabled: event.target.checked }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Subtitle</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.topBannerSubtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerSubtitle: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show subtitle</span>
                <input
                  type="checkbox"
                  checked={!!form.topBannerSubtitleEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerSubtitleEnabled: event.target.checked }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Button text</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.topBannerCtaText}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerCtaText: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show button</span>
                <input
                  type="checkbox"
                  checked={!!form.topBannerCtaEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, topBannerCtaEnabled: event.target.checked }))}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Button BG</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-slate-300"
                    value={form.topBannerCtaBgColor}
                    onChange={(event) => setForm((prev) => ({ ...prev, topBannerCtaBgColor: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Button Text</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-slate-300"
                    value={form.topBannerCtaTextColor}
                    onChange={(event) => setForm((prev) => ({ ...prev, topBannerCtaTextColor: event.target.value }))}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Bottom Large Banner</h2>
            <p className="mb-3 text-xs font-medium text-slate-500">
              Layout slot: Row 2 right side · upload multiple images for a slider · Slide 1 plays first
            </p>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700">Enable banner slider</span>
              <input
                type="checkbox"
                checked={!!form.bottomBannerSliderEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerSliderEnabled: event.target.checked }))}
              />
            </div>

            <label className="mb-4 block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-slate-700">Slide interval (ms)</span>
              <input
                type="number"
                min="2000"
                max="15000"
                step="500"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={form.bottomBannerSliderInterval}
                onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerSliderInterval: Number(event.target.value) || 4000 }))}
              />
            </label>

            <div className="space-y-4">
              {form.bottomBannerSliderItems.map((slide, index) => (
                <div key={slide.id || `bottom-slide-${index}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">Slide {index + 1}</h3>
                      {index === 0 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          1st in slider
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {index + 1}{index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'} in slider
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveLargeBannerSlide('bottomBannerSliderItems', index, -1)}
                        disabled={index === 0}
                        title="Move up (earlier in slider)"
                        className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLargeBannerSlide('bottomBannerSliderItems', index, 1)}
                        disabled={index === form.bottomBannerSliderItems.length - 1}
                        title="Move down (later in slider)"
                        className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLargeBannerSlide('bottomBannerSliderItems', index)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="relative mb-3 overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                    <div className="relative aspect-[3054/370] w-full">
                      {slide.image ? (
                        <Image src={slide.image} alt={slide.alt || `Bottom slide ${index + 1}`} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">No image selected</div>
                      )}
                    </div>
                  </div>
                  <label className="mb-3 inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload size={16} />
                    Upload slide image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => uploadLargeBannerSlide('bottomBannerSliderItems', index, event.target.files?.[0] || null)}
                    />
                  </label>
                  <div className="grid gap-3">
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Image URL"
                      value={slide.image}
                      onChange={(event) => updateLargeBannerSlide('bottomBannerSliderItems', index, 'image', event.target.value)}
                    />
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Link (optional)"
                      value={slide.link}
                      onChange={(event) => updateLargeBannerSlide('bottomBannerSliderItems', index, 'link', event.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addLargeBannerSlide('bottomBannerSliderItems', 'Bottom banner')}
              disabled={form.bottomBannerSliderItems.length >= 8}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Add bottom banner slide
            </button>
            <p className="mt-2 text-xs text-slate-500">Recommended size: 3054 x 370 px</p>

            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.bottomBannerTitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerTitle: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show title</span>
                <input
                  type="checkbox"
                  checked={!!form.bottomBannerTitleEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerTitleEnabled: event.target.checked }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Subtitle</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.bottomBannerSubtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerSubtitle: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show subtitle</span>
                <input
                  type="checkbox"
                  checked={!!form.bottomBannerSubtitleEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerSubtitleEnabled: event.target.checked }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Button text</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.bottomBannerCtaText}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerCtaText: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">Show button</span>
                <input
                  type="checkbox"
                  checked={!!form.bottomBannerCtaEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerCtaEnabled: event.target.checked }))}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Button BG</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-slate-300"
                    value={form.bottomBannerCtaBgColor}
                    onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerCtaBgColor: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Button Text</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-slate-300"
                    value={form.bottomBannerCtaTextColor}
                    onChange={(event) => setForm((prev) => ({ ...prev, bottomBannerCtaTextColor: event.target.value }))}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Product banner cards</h2>
            <p className="text-xs text-slate-500">
              Up to 4 cards · remove empty slots · storefront auto-resizes to 1–4 columns
            </p>
          </div>
          <button
            type="button"
            onClick={addProductBanner}
            disabled={form.productBanners.length >= 4}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            Add banner card
          </button>
        </div>
        {form.productBanners.map((banner, index) => (
          <div key={`product-banner-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Banner {index + 1}</h2>
                <span className="text-xs font-medium text-slate-500">{PRODUCT_SLOT_LABELS[index] || `Card ${index + 1}`}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveProductBanner(index, -1)}
                  disabled={index === 0}
                  title="Move left (earlier)"
                  className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveProductBanner(index, 1)}
                  disabled={index === form.productBanners.length - 1}
                  title="Move right (later)"
                  className="inline-flex items-center rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeProductBanner(index)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs font-medium text-slate-500">Cards without an image are hidden on the storefront</p>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Banner image</span>
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <div className="relative aspect-[1225/639] w-full">
                    {banner.previewUrl ? (
                      <Image
                        src={banner.previewUrl}
                        alt={`Banner ${index + 1}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        No image selected
                      </div>
                    )}
                  </div>
                </div>
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload size={16} />
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleImageChange(index, event.target.files?.[0] || null)}
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Recommended size: 1225 x 639 px
                </p>
              </div>
            </label>

            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={banner.title}
                  onChange={(event) => updateBanner(index, 'title', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Subtitle</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={banner.subtitle}
                  onChange={(event) => updateBanner(index, 'subtitle', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Button text</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={banner.buttonText}
                  onChange={(event) => updateBanner(index, 'buttonText', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Link</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={banner.link}
                  onChange={(event) => updateBanner(index, 'link', event.target.value)}
                  placeholder="/shop"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Showcase Banners'}
        </button>
      </div>
    </div>
  )
}
