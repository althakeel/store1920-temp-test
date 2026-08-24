"use client"

import { usePathname } from "next/navigation"

import { HomeIcon, LayoutListIcon, SquarePenIcon, SquarePlusIcon, StarIcon, FolderIcon, TicketIcon, TruckIcon, RefreshCw, Users as UsersIcon, MessageSquare, Sparkles, BellIcon, MailIcon, Image as ImageIcon, ShoppingCart, Wallet, BarChart3, Target, Gift, Palette, CircleDashed, PackagePlus, Package, Activity, Layers, LineChart, Warehouse, MousePointerClick, ShieldAlert, Zap, Trash2, Smartphone, FileText, CalendarClock, MessageCircle } from "lucide-react"

import StoreNavLink from "@/components/store/StoreNavLink"

import { canAccessDashboardArea, getPermissionIdForHref } from "@/lib/storeDashboardPermissions"
import { useStoreOrderNotifications } from "./StoreOrderNotificationProvider"



const StoreSidebar = ({ storeInfo, isOwner = false, permissions = {} }) => {

    const pathname = usePathname()
    const { unreadCount, canViewOrders, overduePickupCount } = useStoreOrderNotifications()



    const canAccessHref = (href) => {

        const permissionId = getPermissionIdForHref(href);

        return canAccessDashboardArea(permissions, permissionId, { isOwner });

    };



    const sidebarLinks = [

        { name: 'Dashboard', href: '/store', icon: HomeIcon },

        { name: 'Categories', href: '/store/categories', icon: FolderIcon },

        { name: 'Add Product', href: '/store/add-product', icon: SquarePlusIcon },

        { name: 'Manage Product', href: '/store/manage-product', icon: SquarePenIcon },

        { name: 'Inventory', href: '/store/inventory', icon: Warehouse },

        { name: 'Database Import', href: '/store/settings/database-import', icon: RefreshCw },

        { name: 'Customize', href: '/store/customize', icon: Palette },

        { name: 'WhatsApp Widget', href: '/store/customize/whatsapp-widget', icon: MessageCircle },

        { name: 'Mobile Features', href: '/store/mobile-features', icon: Smartphone },

        { name: 'Blogs', href: '/store/blogs', icon: FileText },

        { name: 'Menu Management', href: '/store/menu-management', icon: LayoutListIcon },

        { name: 'Promotional Offers', href: '/store/personalized-offers', icon: Gift },

        { name: 'Media', href: '/store/media', icon: ImageIcon },

        { name: 'Abandoned Checkout', href: '/store/abandoned-checkout', icon: ShoppingCart },

        { name: 'Coupons', href: '/store/coupons', icon: TicketIcon },

        { name: 'Giveaways', href: '/store/giveaways', icon: PackagePlus },

        { name: 'Spin Wheel', href: '/store/spin-wheel', icon: CircleDashed },

        { name: 'Shipping', href: '/store/shipping', icon: TruckIcon },

        { name: 'Payment Security', href: '/store/payment-security', icon: ShieldAlert },

        { name: 'Customers', href: '/store/customers', icon: UsersIcon },

        { name: 'Customer Tracking', href: '/store/customer-tracking', icon: Activity },

        { name: 'Marketing Analytics', href: '/store/marketing-analytics', icon: LineChart },

        { name: 'Heatmap', href: '/store/heatmap', icon: MousePointerClick },

        { name: 'Cohort Tracking', href: '/store/cohorts', icon: UsersIcon },

        { name: 'Churn Scores', href: '/store/churn-scores', icon: ShieldAlert },

        { name: 'RFM Scores', href: '/store/rfm-scores', icon: BarChart3 },

        { name: 'Behavioral Triggers', href: '/store/behavioral-triggers', icon: Zap },

        { name: 'Marketing Stack', href: '/store/marketing-stack', icon: Layers },

        { name: 'Orders', href: '/store/orders', icon: LayoutListIcon },

        { name: 'Pickup list', href: '/store/todays-pickup', icon: CalendarClock },

        { name: 'Orders by Product', href: '/store/orders-by-product', icon: Package },

        { name: 'Trash', href: '/store/trash', icon: Trash2 },

        { name: 'Balance', href: '/store/balance', icon: Wallet },

        { name: 'Sales Report', href: '/store/sales-report', icon: BarChart3 },

        { name: 'Marketing Expenses', href: '/store/marketing-expenses', icon: Target },

        { name: 'Returns & Replacements', href: '/store/return-requests', icon: RefreshCw },

        { name: 'Reviews', href: '/store/reviews', icon: StarIcon },

        { name: 'Support Tickets', href: '/store/tickets', icon: MessageSquare },

        { name: 'Contact Us Messages', href: '/store#contact-messages', icon: StarIcon },

        { name: 'Product Notifications', href: '/store/product-notifications', icon: BellIcon },

        { name: 'Promotional Emails', href: '/store/promotional-emails', icon: MailIcon },

        { name: 'Ad Tracking', href: '/store/ads-tracking', icon: BarChart3 },

    ]



    const sidebarSections = [

        {

            name: 'Core',

            links: [

                '/store',

                '/store/categories',

                '/store/add-product',

                '/store/manage-product',

                '/store/settings/database-import',

            ]

        },

        {

            name: 'Storefront',

            links: [

                '/store/customize',

                '/store/customize/whatsapp-widget',

                '/store/mobile-features',

                '/store/blogs',

                '/store/menu-management',

                '/store/media',

            ]

        },

        {

            name: 'Marketing',

            links: [

                '/store/personalized-offers',

                '/store/coupons',

                '/store/giveaways',

                '/store/spin-wheel',

                '/store/promotional-emails',

                '/store/customer-tracking',

                '/store/marketing-analytics',

                '/store/heatmap',

                '/store/cohorts',

                '/store/churn-scores',

                '/store/rfm-scores',

                '/store/behavioral-triggers',

                '/store/marketing-stack',

                '/store/ads-tracking',

                '/store/marketing-expenses',

            ]

        },

        {

            name: 'Sales & Operations',

            links: [

                '/store/orders',

                '/store/todays-pickup',

                '/store/orders-by-product',

                '/store/trash',

                '/store/abandoned-checkout',

                '/store/shipping',

                '/store/payment-security',

                '/store/return-requests',

                '/store/balance',

                '/store/sales-report',

            ]

        },

        {

            name: 'Warehouse',

            links: [

                '/store/inventory',

            ]

        },

        {

            name: 'Customers & Support',

            links: [

                '/store/customers',

                '/store/reviews',

                '/store/tickets',

                '/store/product-notifications',

                '/store#contact-messages',

            ]

        },

    ]



    const linkByHref = sidebarLinks.reduce((acc, link) => {

        acc[link.href] = link;

        return acc;

    }, {});



    const resolveActive = (href) => {

        if (href.includes('#')) {

            return pathname === href.split('#')[0];

        }

        return pathname === href;

    }



    const getSectionIcon = (sectionName) => {

        switch (sectionName) {

            case 'Core':

                return HomeIcon;

            case 'Storefront':

                return Sparkles;

            case 'Marketing':

                return Gift;

            case 'Sales & Operations':

                return LayoutListIcon;

            case 'Warehouse':

                return Warehouse;

            case 'Customers & Support':

                return UsersIcon;

            default:

                return LayoutListIcon;

        }

    }



    const getSectionTheme = (sectionName) => {

        switch (sectionName) {

            case 'Core':

                return {

                    headerText: 'text-sky-700',

                    headerIconBg: 'bg-sky-100',

                    headerIconText: 'text-sky-700',

                    activeLink: 'bg-sky-50 text-sky-700 border border-sky-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-sky-100',

                    activeIconText: 'text-sky-700',

                    hoverLink: 'hover:bg-sky-50/60 hover:text-sky-700',

                    hoverIconBg: 'group-hover:bg-sky-100',

                    hoverIconText: 'group-hover:text-sky-700',

                    dot: 'bg-sky-600'

                }

            case 'Storefront':

                return {

                    headerText: 'text-emerald-700',

                    headerIconBg: 'bg-emerald-100',

                    headerIconText: 'text-emerald-700',

                    activeLink: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-emerald-100',

                    activeIconText: 'text-emerald-700',

                    hoverLink: 'hover:bg-emerald-50/60 hover:text-emerald-700',

                    hoverIconBg: 'group-hover:bg-emerald-100',

                    hoverIconText: 'group-hover:text-emerald-700',

                    dot: 'bg-emerald-600'

                }

            case 'Marketing':

                return {

                    headerText: 'text-violet-700',

                    headerIconBg: 'bg-violet-100',

                    headerIconText: 'text-violet-700',

                    activeLink: 'bg-violet-50 text-violet-700 border border-violet-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-violet-100',

                    activeIconText: 'text-violet-700',

                    hoverLink: 'hover:bg-violet-50/60 hover:text-violet-700',

                    hoverIconBg: 'group-hover:bg-violet-100',

                    hoverIconText: 'group-hover:text-violet-700',

                    dot: 'bg-violet-600'

                }

            case 'Sales & Operations':

                return {

                    headerText: 'text-amber-700',

                    headerIconBg: 'bg-amber-100',

                    headerIconText: 'text-amber-700',

                    activeLink: 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-amber-100',

                    activeIconText: 'text-amber-700',

                    hoverLink: 'hover:bg-amber-50/60 hover:text-amber-700',

                    hoverIconBg: 'group-hover:bg-amber-100',

                    hoverIconText: 'group-hover:text-amber-700',

                    dot: 'bg-amber-600'

                }

            case 'Warehouse':

                return {

                    headerText: 'text-indigo-700',

                    headerIconBg: 'bg-indigo-100',

                    headerIconText: 'text-indigo-700',

                    activeLink: 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-indigo-100',

                    activeIconText: 'text-indigo-700',

                    hoverLink: 'hover:bg-indigo-50/60 hover:text-indigo-700',

                    hoverIconBg: 'group-hover:bg-indigo-100',

                    hoverIconText: 'group-hover:text-indigo-700',

                    dot: 'bg-indigo-600'

                }

            case 'Customers & Support':

                return {

                    headerText: 'text-rose-700',

                    headerIconBg: 'bg-rose-100',

                    headerIconText: 'text-rose-700',

                    activeLink: 'bg-rose-50 text-rose-700 border border-rose-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-rose-100',

                    activeIconText: 'text-rose-700',

                    hoverLink: 'hover:bg-rose-50/60 hover:text-rose-700',

                    hoverIconBg: 'group-hover:bg-rose-100',

                    hoverIconText: 'group-hover:text-rose-700',

                    dot: 'bg-rose-600'

                }

            default:

                return {

                    headerText: 'text-slate-600',

                    headerIconBg: 'bg-slate-100',

                    headerIconText: 'text-slate-700',

                    activeLink: 'bg-slate-100 text-slate-800 border border-slate-200 shadow-sm font-semibold',

                    activeIconBg: 'bg-slate-200',

                    activeIconText: 'text-slate-800',

                    hoverLink: 'hover:bg-slate-100 hover:text-slate-700',

                    hoverIconBg: 'group-hover:bg-slate-200',

                    hoverIconText: 'group-hover:text-slate-700',

                    dot: 'bg-slate-600'

                }

        }

    }



    return (

        <aside className="sticky top-0 flex h-full w-[60px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 shadow-sm md:w-[68px] lg:w-[236px]">

                <div className="scrollbar-hide flex-1 overflow-y-auto px-1.5 py-2 lg:px-2">

                    {sidebarSections.map((section) => {

                        const SectionIcon = getSectionIcon(section.name)

                        const theme = getSectionTheme(section.name)

                        const visibleLinks = section.links.filter((href) => linkByHref[href] && canAccessHref(href))



                        if (visibleLinks.length === 0) return null



                        return (

                            <div key={section.name} className="mt-2 first:mt-0 lg:mt-3">

                                <div className={`hidden items-center gap-1.5 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide lg:flex ${theme.headerText}`}>

                                    <span className={`rounded-md p-0.5 ${theme.headerIconBg}`}>

                                        <SectionIcon size={11} className={theme.headerIconText} />

                                    </span>

                                    <span>{section.name}</span>

                                </div>



                                <div className="space-y-0.5 border-t border-slate-200/80 pt-1.5 first:border-t-0 first:pt-0 lg:border-t-0 lg:pt-0">

                                    {visibleLinks.map((href) => {

                                            const link = linkByHref[href]

                                            if (!link) return null



                                            const Icon = link.icon

                                            const isActive = resolveActive(link.href)



                                            return (

                                                <StoreNavLink

                                                    key={`${section.name}-${link.href}`}

                                                    href={link.href}

                                                    title={link.name}

                                                    aria-label={link.name}

                                                    className={`group flex items-center justify-center gap-2 rounded-lg px-1 py-2 transition-all duration-200 lg:justify-start lg:px-2.5 lg:py-1.5 ${

                                                        isActive

                                                            ? theme.activeLink

                                                            : `text-slate-700 ${theme.hoverLink}`

                                                    }`}

                                                >

                                                    <div className={`relative rounded-md p-1.5 transition-colors lg:p-1 ${

                                                        isActive 

                                                            ? theme.activeIconBg

                                                            : `bg-slate-100 ${theme.hoverIconBg}`

                                                    }`}>

                                                        <Icon size={18} className={`lg:h-[15px] lg:w-[15px] ${isActive ? theme.activeIconText : `text-slate-600 ${theme.hoverIconText}`}`} />

                                                        {link.href === '/store/orders' && canViewOrders && unreadCount > 0 ? (
                                                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-600 lg:hidden" />
                                                        ) : null}
                                                        {link.href === '/store/todays-pickup' && overduePickupCount > 0 ? (
                                                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 lg:hidden" />
                                                        ) : null}

                                                    </div>

                                                    <span className="hidden flex-1 leading-tight lg:inline text-[13px]">{link.name}</span>

                                                    {link.href === '/store/orders' && canViewOrders && unreadCount > 0 ? (
                                                        <span className="hidden rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white lg:inline">
                                                            {unreadCount > 9 ? '9+' : unreadCount}
                                                        </span>
                                                    ) : null}
                                                    {link.href === '/store/todays-pickup' && overduePickupCount > 0 ? (
                                                        <span className="hidden rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white lg:inline">
                                                            {overduePickupCount > 9 ? '9+' : overduePickupCount}
                                                        </span>
                                                    ) : null}

                                                    {isActive && (

                                                        <div className={`hidden h-1.5 w-1.5 rounded-full lg:block ${theme.dot}`}></div>

                                                    )}

                                                </StoreNavLink>

                                            )

                                        })}

                                </div>

                            </div>

                        )

                    })}

                </div>



                {canAccessHref('/store/settings') && (

                    <div className="border-t border-slate-200 bg-slate-50/50 px-1.5 py-2 lg:px-2">

                        <StoreNavLink

                            href="/store/settings"

                            title="Settings"

                            aria-label="Settings"

                            className="group flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-700 to-slate-600 px-2 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:from-slate-600 hover:to-slate-500 lg:px-3 lg:py-2"

                        >

                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />

                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />

                            </svg>

                            <span className="hidden lg:inline">Settings</span>

                        </StoreNavLink>

                    </div>

                )}

        </aside>

    )

}



export default StoreSidebar

