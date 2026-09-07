'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import shareIcon from '@/assets/icons/share/share.png'
import shareWhatsAppIcon from '@/assets/icons/share/whatsapp.svg'
import shareFacebookIcon from '@/assets/icons/share/facebook.svg'
import shareEmailIcon from '@/assets/icons/emails.png'
import shareCopyIcon from '@/assets/icons/share/copy.svg'
import shareMoreIcon from '@/assets/icons/share/more.svg'
import shareCheckIcon from '@/assets/icons/share/check.svg'
import { cleanDisplayText } from '@/lib/displayText'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import { trackWhatsAppClick } from '@/lib/ga4Ecommerce'

const PLACEHOLDER_IMAGE = 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'

function ShareOptionButton({ label, onClick, children, tileClass = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-1 flex-col items-center gap-2.5"
    >
      <span
        className={`flex h-[60px] w-[60px] items-center justify-center rounded-[20px] shadow-[0_5px_14px_rgba(15,23,42,0.13)] transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_18px_rgba(15,23,42,0.16)] group-active:scale-95 ${tileClass}`}
      >
        {children}
      </span>
      <span className="w-full truncate text-center text-[13px] font-medium text-slate-600">{label}</span>
    </button>
  )
}

function OverlayShareGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-900"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98" />
      <path d="M15.41 6.51l-6.82 3.98" />
    </svg>
  )
}
function ShareBrandIcon({ src, alt = '', className = 'h-7 w-7 object-contain' }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={28}
      height={28}
      className={className}
      aria-hidden={!alt}
    />
  )
}

export default function ProductShareButton({
  productName = '',
  productId = '',
  productImage = '',
  productBrand = '',
  productPrice = '',
  className = '',
  size = 'md',
  variant = 'default',
}) {
  const { t } = useStorefrontI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const displayName = useMemo(
    () => cleanDisplayText(productName || t('common.untitledProduct')),
    [productName, t],
  )
  const displayBrand = useMemo(() => cleanDisplayText(productBrand), [productBrand])

  const closeMenu = () => {
    setOpen(false)
    setCopied(false)
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = displayName ? `Check out ${displayName}` : 'Check out this product'

  const handleShare = (platform) => {
    const url = window.location.href
    const shareUrls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    }

    if (shareUrls[platform]) {
      if (platform === 'whatsapp') {
        trackWhatsAppClick({
          linkUrl: shareUrls.whatsapp,
          itemId: productId,
          itemName: displayName,
        })
      }
      window.open(shareUrls[platform], '_blank', 'width=600,height=400')
      closeMenu()
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        closeMenu()
      }, 1400)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleMoreShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: displayName,
          text: shareText,
          url: shareUrl,
        })
        closeMenu()
      } catch {
        // User cancelled or share failed.
      }
      return
    }

    copyToClipboard()
  }

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const sizeStyles = variant === 'overlay'
    ? { button: 'h-[26px] w-[26px] rounded-full bg-white p-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.12)]' }
    : size === 'sm'
      ? { button: 'h-7 w-7', image: 'h-6 w-6', width: 24, height: 24 }
      : { button: 'h-10 w-10', image: 'h-10 w-10', width: 40, height: 40 }

  const buttonHoverClass = variant === 'overlay' ? 'hover:bg-white active:scale-95' : 'hover:opacity-90'
  const previewImage = productImage || PLACEHOLDER_IMAGE

  const shareSheet = open && portalReady ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center lg:items-center lg:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={closeMenu}
        aria-label={t('bnpl.modal.close')}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('product.shareWithFriend')}
        className="product-share-sheet relative z-10 w-full max-w-[min(100vw,560px)] overflow-hidden bg-white max-lg:rounded-t-[20px] max-lg:pb-[env(safe-area-inset-bottom)] lg:rounded-2xl lg:shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200 max-lg:block lg:hidden" aria-hidden="true" />

        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold text-slate-900">{t('product.shareWithFriend')}</h2>
            <p className="mt-1 text-[14px] text-slate-500">{t('product.shareSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('bnpl.modal.close')}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Image
                src={previewImage}
                alt=""
                fill
                sizes="80px"
                className="object-contain p-1.5"
                onError={(event) => { event.currentTarget.src = PLACEHOLDER_IMAGE }}
              />
            </div>
            <div className="min-w-0 flex-1">
              {displayBrand ? (
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-blue-600">{displayBrand}</p>
              ) : null}
              <p className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-slate-900">
                {displayName}
              </p>
              {productPrice ? (
                <p className="mt-2 text-[22px] font-semibold leading-none text-[#E52721]">{productPrice}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-7 pt-1">
          <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {t('product.shareVia')}
          </p>
          <div className="mx-auto flex max-w-[480px] items-start justify-between gap-1 sm:gap-2">
            <ShareOptionButton
              label={t('product.shareWhatsApp')}
              onClick={() => handleShare('whatsapp')}
              tileClass="bg-[#25D366]"
            >
              <ShareBrandIcon src={shareWhatsAppIcon} className="h-8 w-8 object-contain" />
            </ShareOptionButton>

            <ShareOptionButton
              label={t('product.shareFacebook')}
              onClick={() => handleShare('facebook')}
              tileClass="bg-[#1877F2]"
            >
              <ShareBrandIcon src={shareFacebookIcon} className="h-8 w-8 object-contain" />
            </ShareOptionButton>

            <ShareOptionButton
              label={t('product.shareGmail')}
              onClick={() => {
                window.open(`mailto:?subject=${encodeURIComponent(displayName)}&body=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank')
                closeMenu()
              }}
              tileClass="bg-white"
            >
              <ShareBrandIcon src={shareEmailIcon} className="h-10 w-10 object-contain" />
            </ShareOptionButton>

            <ShareOptionButton
              label={copied ? t('common.copied') : t('product.shareCopy')}
              onClick={copyToClipboard}
              tileClass={copied ? 'bg-emerald-500' : 'bg-[#E8EEF5]'}
            >
              {copied ? (
                <ShareBrandIcon src={shareCheckIcon} className="h-7 w-7 object-contain brightness-0 invert" />
              ) : (
                <ShareBrandIcon src={shareCopyIcon} className="h-7 w-7 object-contain opacity-80" />
              )}
            </ShareOptionButton>

            <ShareOptionButton
              label={t('product.shareMore')}
              onClick={handleMoreShare}
              tileClass="bg-[#E8EEF5]"
            >
              <ShareBrandIcon src={shareMoreIcon} className="h-7 w-7 object-contain opacity-80" />
            </ShareOptionButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div className={`relative shrink-0 ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center justify-center transition ${buttonHoverClass} ${sizeStyles.button}`}
          aria-label={t('product.shareTo')}
        >
          {variant === 'overlay' ? (
            <OverlayShareGlyph />
          ) : (
            <Image src={shareIcon} alt="" width={sizeStyles.width} height={sizeStyles.height} className={`${sizeStyles.image} object-contain`} />
          )}
        </button>
      </div>
      {shareSheet}
      <style jsx global>{`
        @keyframes product-share-sheet-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes product-share-sheet-fade {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .product-share-sheet {
          animation: product-share-sheet-up 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (min-width: 1024px) {
          .product-share-sheet {
            animation: product-share-sheet-fade 0.26s cubic-bezier(0.22, 1, 0.36, 1);
          }
        }
      `}</style>
    </>
  )
}
