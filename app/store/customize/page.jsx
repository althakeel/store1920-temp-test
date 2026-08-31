'use client'

import Link from 'next/link'
import ExploreInterestsCustomizeCard from '@/components/store/ExploreInterestsCustomizeCard'
import {
  ArrowRight,
  LayoutTemplate,
  Palette,
  PanelsTopLeft,
  Menu,
  Rows3,
  Images,
  Sparkles,
  Grid2x2,
  Package,
  Shapes,
  Compass,
  Search,
  Truck,
  MessageCircle,
} from 'lucide-react'

const designPages = [
  {
    title: 'Section 1 - home page',
    description: 'Control homepage product blocks and design settings in one place.',
    href: '/store/home-preferences',
    icon: Sparkles,
  },
  {
    title: 'Banner section - Home',
    description: 'Referral rewards, showcase 4-grid banners, and Banner 2 slider — all in one place.',
    href: '/store/preferences',
    icon: LayoutTemplate,
  },
  {
    title: 'Appearance',
    description: 'Toggle storefront sections and update display behavior.',
    href: '/store/storefront/appearance',
    icon: Palette,
  },
  {
    title: 'Navbar Design',
    description: 'Manage navbar links, upload a logo, and change the navbar background color.',
    href: '/store/navbar-menu',
    icon: PanelsTopLeft,
  },
  {
    title: 'Navbar Menu',
    description: 'Configure navbar layout, sticky behavior, and menu visibility settings.',
    href: '/store/storefront/navbar-menu',
    icon: Menu,
  },
  {
    title: 'Home Categories',
    description: 'Design and configure category blocks shown on the homepage.',
    href: '/store/storefront/home-menu-categories',
    icon: Grid2x2,
  },
  {
    title: 'Carousel Settings',
    description: 'Adjust the homepage carousel display and slider behavior.',
    href: '/store/storefront/carousel-slider',
    icon: Images,
  },
  {
    title: 'Sitemap Categories',
    description: 'Edit the storefront sitemap category section layout.',
    href: '/store/storefront/sitemap-categories',
    icon: Shapes,
  },
  {
    title: 'SEO Meta Tags',
    description: 'Select a page and set meta title, description, and keywords.',
    href: '/store/storefront/seo',
    icon: Search,
  },
  {
    title: 'Badges',
    description: 'Edit product badges plus delivery, returns, VAT, and rush-delivery texts for the product page.',
    href: '/store/customize/product-page',
    icon: Truck,
  },
  {
    title: 'WhatsApp Product Widget',
    description: 'Set the WhatsApp number and choose which product pages show a chat button.',
    href: '/store/customize/whatsapp-widget',
    icon: MessageCircle,
  },
  {
    title: 'Fast Delivery Page',
    description: 'Customize the header color, title, and empty state for the fast delivery products page.',
    href: '/store/customize/fast-delivery',
    icon: Truck,
  },
]

const selectionPages = [
  {
    title: 'Recommended Products',
    description: 'Manually choose which products show in the Recommended tab under Explore your interests.',
    href: '/store/explore-interests',
    icon: Compass,
  },
  {
    title: 'Featured Sections',
    description: 'Select featured collections and section content.',
    href: '/store/category-slider',
    icon: Rows3,
  },
  {
    title: 'Featured Products',
    description: 'Edit the Top Picks section title and choose products manually, by category, or by tags.',
    href: '/store/featured-products',
    icon: Package,
  },
  {
    title: 'Top Deals',
    description: 'Edit the Top Deals title and configure its source rules from the home sections editor.',
    href: '/store/customize/top-deals',
    icon: Sparkles,
  },
]

function Section({ title, description, items }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 sm:h-11 sm:w-11">
                  <Icon size={20} />
                </div>
                <ArrowRight
                  size={18}
                  className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-700"
                />
              </div>

              <h3 className="mt-3 text-sm font-semibold text-slate-900 sm:text-base">{item.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">{item.description}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default function CustomizePage() {
  return (
    <div className="-mx-3 -mt-3 min-h-full w-full max-w-full overflow-x-hidden bg-white pb-12 sm:-mx-4 sm:-mt-4 lg:-mx-5 lg:-mt-5">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          <Palette size={14} />
          Customize
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl lg:text-4xl">Store Design Hub</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-emerald-50 sm:text-base">
          Open any design or selection page from here to customize the look of your storefront and choose the products, categories, and sections shown to customers.
        </p>
      </div>

      <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 lg:px-8 lg:py-8">
        <ExploreInterestsCustomizeCard />

        <Section
          title="Design Pages"
          description="These pages control the appearance, layout, and section behavior of your storefront."
          items={designPages}
        />

        <Section
          title="Selection Pages"
          description="These pages let you choose the products, categories, and content used in the storefront sections."
          items={selectionPages}
        />
      </div>
    </div>
  )
}
