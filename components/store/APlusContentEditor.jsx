'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadStoreImage } from '@/lib/uploadStoreImage'
import { getUploadErrorMessage } from '@/lib/compressImageForUpload'
import { normalizeAPlusImageList } from '@/lib/aPlusContent'

function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function APlusImageColumn({
  title,
  hint,
  images = [],
  onChange,
  getAuthTokenOrThrow,
  uploading,
  setUploading,
}) {
  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => String(file?.type || '').startsWith('image/'))
    if (!files.length) return
    if (!getAuthTokenOrThrow) {
      toast.error('Sign in again to upload images')
      return
    }

    setUploading(true)
    try {
      const token = await getAuthTokenOrThrow()
      const uploaded = []
      for (const file of files) {
        const data = await uploadStoreImage(file, { token })
        if (data?.url) uploaded.push(data.url)
      }
      if (uploaded.length) {
        onChange(normalizeAPlusImageList([...images, ...uploaded]))
        toast.success(uploaded.length === 1 ? 'A+ image uploaded' : `${uploaded.length} A+ images uploaded`)
      }
    } catch (error) {
      toast.error(getUploadErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
        </div>
        <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
          <ImagePlus className="h-3.5 w-3.5" />
          Upload
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={async (event) => {
              await handleUpload(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-500">
          No images yet. Upload one or more modules for this screen size.
        </div>
      ) : (
        <div className="space-y-3">
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={url} alt="" className="block h-auto max-h-64 w-full object-contain bg-slate-100" />
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1.5">
                <span className="text-[11px] font-medium text-slate-500">Module {index + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => onChange(moveItem(images, index, index - 1))}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    disabled={index === images.length - 1}
                    onClick={() => onChange(moveItem(images, index, index + 1))}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function APlusContentEditor({
  desktopImages = [],
  mobileImages = [],
  onDesktopChange,
  onMobileChange,
  getAuthTokenOrThrow,
}) {
  const [uploading, setUploading] = useState(false)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <APlusImageColumn
        title="Desktop A+ images"
        hint="Wide banners for laptop/desktop. Shown on large screens."
        images={normalizeAPlusImageList(desktopImages)}
        onChange={onDesktopChange}
        getAuthTokenOrThrow={getAuthTokenOrThrow}
        uploading={uploading}
        setUploading={setUploading}
      />
      <APlusImageColumn
        title="Mobile A+ images"
        hint="Taller/narrower images for phones and the app. Upload a different set from desktop."
        images={normalizeAPlusImageList(mobileImages)}
        onChange={onMobileChange}
        getAuthTokenOrThrow={getAuthTokenOrThrow}
        uploading={uploading}
        setUploading={setUploading}
      />
    </div>
  )
}
