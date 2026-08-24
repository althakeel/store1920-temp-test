'use client'

import { ArrowRightIcon } from 'lucide-react'
import Image from 'next/image'
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toPublicCategoryPath } from '@/lib/categorySlug'

// Local fallback images
import Mainslider1 from '../assets/herobanner/BannerA5.webp'
import Mainslider2 from '../assets/herobanner/BannerA4.webp'
import MainSlider3 from '../assets/herobanner/BannerA6.webp'
import SubBanner1 from '../assets/herobanner/BannerB3.webp'
import SubBanner2 from '../assets/herobanner/Banner B 2.webp'

/* ---------------------------------------------------
   Helper: Validate image URLs (prevents Next.js crash)
----------------------------------------------------*/
function isValidImage(src) {
  if (!src || typeof src !== "string") return false

  // Allow /public images
  if (src.startsWith("/")) return true

  try {
    new URL(src)
    return true
  } catch {
    return false
  }
}

const Hero = () => {
  const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED'

  // === Default Slides ===
  const slides = [
    {
      color: '',
      tagColor: '',
      tagBg: 'bg-green-300',
      textColor: '',
      image: Mainslider1?.src || Mainslider1,
      title: "",
      price: 4.9,
      buttonText: '',
      buttonLink: '#',
    },
    {
      color: 'from-blue-200 to-blue-300',
      tagColor: 'bg-blue-600',
      tagBg: 'bg-blue-300',
      textColor: 'text-blue-600',
      image: Mainslider2?.src || Mainslider2,
      title: '',
      price: 9.9,
      buttonText: '',
      buttonLink: '#',
    },
    {
      color: 'from-orange-200 to-orange-300',
      tagColor: 'bg-orange-600',
      tagBg: 'bg-orange-300',
      textColor: 'text-orange-600',
      image: MainSlider3?.src || MainSlider3,
      title: '',
      price: 14.9,
      buttonText: '',
      buttonLink: '#',
    },
  ]

  const [currentSlide, setCurrentSlide] = useState(0)
  const [fade, setFade] = useState(true)
  const [isCompact, setIsCompact] = useState(false)

  // Admin API Data
  const [adminSlides, setAdminSlides] = useState(null)
  const [mainSel, setMainSel] = useState(null)

  const [right1Sel, setRight1Sel] = useState(null)
  const [right2Sel, setRight2Sel] = useState(null)

  const [right1Slides, setRight1Slides] = useState([])
  const [right2Slides, setRight2Slides] = useState([])

  const [right1Index, setRight1Index] = useState(0)
  const [right2Index, setRight2Index] = useState(0)

  /* ---------------------------------------------------
     Load admin-configured content
  ----------------------------------------------------*/
  useEffect(() => {
    const load = async () => {
      try {
        const [resMain, resR1, resR2] = await Promise.all([
          fetch('/api/home-selection?section=home_hero', { cache: 'no-store' }),
          fetch('/api/home-selection?section=home_hero_right_1', { cache: 'no-store' }),
          fetch('/api/home-selection?section=home_hero_right_2', { cache: 'no-store' }),
        ])

        // Main hero
        if (resMain.ok) {
          const data = await resMain.json()
          const selection = data.selection

          if (selection?.slides?.length > 0) {
            setMainSel(selection)

            const themes = [
              { color: 'from-green-200 to-green-300', tagColor: 'bg-green-600', tagBg: 'bg-green-300', textColor: 'text-green-600' },
              { color: 'from-blue-200 to-blue-300', tagColor: 'bg-blue-600', tagBg: 'bg-blue-300', textColor: 'text-blue-600' },
              { color: 'from-orange-200 to-orange-300', tagColor: 'bg-orange-600', tagBg: 'bg-orange-300', textColor: 'text-orange-600' },
            ]

            const defaultTitles = [
              "Gadgets you'll love. Prices you'll trust.",
              'Upgrade your tech. Save more today.',
              'Style meets power. Get it now!',
            ]

            const defaultPrices = [4.9, 9.9, 14.9]

            const mapped = selection.slides.map((img, i) => {
              const t = themes[i % themes.length]
              return {
                ...t,
                image: img,
                title: selection.title || defaultTitles[i % defaultTitles.length],
                price: defaultPrices[i % defaultPrices.length],
                buttonText: selection.bannerCtaText || 'Shop Now',
              }
            })

            setAdminSlides(mapped)
          }
        }

        // Right banners
        const dataR1 = resR1.ok ? await resR1.json() : null
        const dataR2 = resR2.ok ? await resR2.json() : null

        if (dataR1?.selection?.slides?.length > 0) {
          setRight1Sel(dataR1.selection)
          setRight1Slides(dataR1.selection.slides)
        }

        if (dataR2?.selection?.slides?.length > 0) {
          setRight2Sel(dataR2.selection)
          setRight2Slides(dataR2.selection.slides)
        }

      } catch (err) {
        console.error('Failed to load home selections:', err)
      }
    }

    load()
  }, [])

  /* ---------------------------------------------------
     Hero Slider Rotation
  ----------------------------------------------------*/
  const dataSlides = React.useMemo(() => slides, [])

  useEffect(() => {
    const intervalMs = isCompact ? 3000 : 5000

    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % dataSlides.length)
        setFade(true)
      }, 600)
    }, intervalMs)

    return () => clearInterval(interval)
  }, [dataSlides.length, isCompact])

  /* ---------------------------------------------------
     Detect compact screens
  ----------------------------------------------------*/
  useEffect(() => {
    const onResize = () => {
      setIsCompact(window.innerWidth <= 1024)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* ---------------------------------------------------
     Rotate Right Banners
  ----------------------------------------------------*/
  useEffect(() => {
    if (right1Slides.length > 1) {
      const i = setInterval(() => {
        setRight1Index((v) => (v + 1) % right1Slides.length)
      }, 4000)
      return () => clearInterval(i)
    }
  }, [right1Slides])

  useEffect(() => {
    if (right2Slides.length > 1) {
      const i = setInterval(() => {
        setRight2Index((v) => (v + 1) % right2Slides.length)
      }, 4200)
      return () => clearInterval(i)
    }
  }, [right2Slides])

  const slide = dataSlides[currentSlide]

  const buttonHref = adminSlides
    ? (mainSel?.bannerCtaLink || toPublicCategoryPath(mainSel?.title || ''))
    : (slide.buttonLink || '/products')

  /* ---------------------------------------------------
     RENDER
  ----------------------------------------------------*/
  return (
    <div className="mx-0 sm:mx-6">
      <div className="flex max-xl:flex-col gap-6 max-w-[1250px] mx-auto mt-0 sm:mt-8 mb-6 sm:mb-10">
        {/* MAIN HERO BANNER - Responsive, image only, no border */}
        <Link
          href={buttonHref}
          className="relative flex-1 rounded-none sm:rounded-3xl min-h-[180px] xs:min-h-[220px] sm:min-h-[280px] md:min-h-[320px] lg:min-h-[380px] xl:min-h-100 overflow-hidden block bg-gray-100"
        >
          <Image
            src={
              isValidImage(slide?.image)
                ? slide.image
                : Mainslider1
            }
            alt="Hero Banner"
            fill
            priority
            sizes="(max-width: 640px) 100vw, (min-width: 1024px) 66vw, 100vw"
            className={`transition-opacity duration-700 ${fade ? 'opacity-100' : 'opacity-0'} object-cover`}
            style={{objectPosition: 'center'}}
          />
        </Link>
        {/* RIGHT SIDE BANNERS: Hide on mobile and tablet, show only on xl */}
        <div className="hidden xl:flex flex-col gap-5 w-full xl:max-w-sm text-sm text-slate-600">
          {/* BOX 1 */}
          <Link
            href={right1Sel?.bannerCtaLink || toPublicCategoryPath(right1Sel?.title || '')}
            className="relative flex-1 w-full rounded-3xl p-6 px-8 group overflow-hidden min-h-36"
          >
            <Image
              src={
                isValidImage(right1Slides[right1Index])
                  ? right1Slides[right1Index]
                  : SubBanner1
              }
              alt="Right Banner 1"
              fill
              sizes="360px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-black/5 to-transparent" />
          </Link>
          {/* BOX 2 */}
          <Link
            href={right2Sel?.bannerCtaLink || toPublicCategoryPath(right2Sel?.title || '')}
            className="relative flex-1 w-full rounded-3xl p-6 px-8 group overflow-hidden min-h-36"
          >
            <Image
              src={
                isValidImage(right2Slides[right2Index])
                  ? right2Slides[right2Index]
                  : SubBanner2
              }
              alt="Right Banner 2"
              fill
              sizes="360px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-black/5 to-transparent" />
          </Link>
        </div>
      </div>
      {/* CATEGORIES SECTION (disabled) */}
      <div className="hidden sm:block">
        {/* <CategoriesMarquee /> */}
      </div>
    </div>
  )
}

export default Hero
