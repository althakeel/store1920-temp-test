'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  buildWhatsAppProductChatUrl,
  shouldShowWhatsAppProductWidget,
} from '@/lib/whatsappProductWidget'
import { setTawkHiddenBy } from '@/lib/tawkVisibility'
import { trackWhatsAppClick } from '@/lib/ga4Ecommerce'

function WhatsAppGlyph({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.04 3C9.37 3 4 8.25 4 14.75c0 2.14.6 4.13 1.64 5.86L4 29l8.62-1.57A12.3 12.3 0 0 0 16.04 26.5C22.71 26.5 28 21.25 28 14.75S22.71 3 16.04 3zm0 21.4c-1.2 0-2.37-.28-3.43-.83l-.25-.13-5.12.93.98-4.9-.16-.26a9.7 9.7 0 0 1-1.56-5.46c0-5.4 4.5-9.79 10.05-9.79s10.04 4.39 10.04 9.79-4.5 9.79-10.05 9.79zm5.52-7.32c-.3-.15-1.78-.87-2.06-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.46-2.42-1.47-.9-.79-1.5-1.76-1.68-2.06-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.62-.93-2.22-.24-.57-.49-.5-.68-.5h-.58c-.2 0-.52.07-.79.37-.27.3-1.04 1-1.04 2.44s1.07 2.83 1.22 3.03c.15.2 2.1 3.16 5.09 4.43.71.3 1.27.48 1.7.62.72.23 1.37.2 1.88.12.57-.08 1.78-.72 2.03-1.41.25-.7.25-1.29.18-1.41-.07-.13-.27-.2-.57-.35z" />
    </svg>
  )
}

/**
 * Floating WhatsApp chat button on selected product pages only.
 */
export default function ProductWhatsAppWidget({
  productId,
  productName = '',
  productSku = '',
  productUrl = '',
  widget = null,
}) {
  const [pageUrl, setPageUrl] = useState(productUrl || '')
  const [imageFailed, setImageFailed] = useState(false)
  const buttonImageUrl = String(widget?.buttonImageUrl || '').trim()

  useEffect(() => {
    setImageFailed(false)
  }, [buttonImageUrl])

  useEffect(() => {
    if (productUrl) {
      setPageUrl(productUrl)
      return
    }
    if (typeof window !== 'undefined') {
      setPageUrl(window.location.href)
    }
  }, [productUrl])

  const href = useMemo(() => {
    if (!shouldShowWhatsAppProductWidget(widget, productId)) return null
    return buildWhatsAppProductChatUrl({
      phoneNumber: widget?.phoneNumber,
      messageTemplate: widget?.messageTemplate,
      productName,
      productUrl: pageUrl,
    })
  }, [pageUrl, productId, productName, widget])

  const hideTawk = widget?.hideTawkWhenVisible !== false

  useEffect(() => {
    setTawkHiddenBy('whatsapp-product', Boolean(href && hideTawk))
    return () => setTawkHiddenBy('whatsapp-product', false)
  }, [hideTawk, href])

  if (!href) return null

  const useCustomImage = Boolean(buttonImageUrl) && !imageFailed

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      onClick={() => trackWhatsAppClick({
        linkUrl: href,
        itemId: productSku || productId,
        itemName: productName,
      })}
      className={`fixed bottom-[5.75rem] end-4 z-[95] inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 lg:bottom-8 lg:end-8 ${
        useCustomImage
          ? 'bg-white shadow-slate-900/20'
          : 'bg-[#25D366] text-white shadow-emerald-900/25 hover:bg-[#1ebe57]'
      }`}
    >
      {useCustomImage ? (
        <Image
          src={buttonImageUrl}
          alt="WhatsApp"
          width={56}
          height={56}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
          unoptimized
        />
      ) : (
        <WhatsAppGlyph />
      )}
    </a>
  )
}
