'use client';

import { useMemo } from 'react';
import { Heart, Search, ShoppingCart, Package, User } from 'lucide-react';
import ShipXpressBadge from '@/components/ShipXpressBadge';
import { buildParentCategoryNavMenuItems } from '@/lib/categoryNavigation';
import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';

const DEFAULT_BG = '#9f4b1d';

export default function NavbarPreview({
  backgroundColor = DEFAULT_BG,
  logoUrl = '',
  logoWidth = 50,
  logoHeight = 50,
  navMenuEnabled = true,
  navMenuItems = [],
  navMenuUseParentCategories = false,
  categoryOptions = [],
  navActionsVisibility = { orders: true, wishlist: true, cart: true },
  userName = 'store1920',
  searchPlaceholder = 'Search products...',
}) {
  const bg = backgroundColor || DEFAULT_BG;
  const menuItems = useMemo(() => {
    const items = navMenuUseParentCategories
      ? buildParentCategoryNavMenuItems(categoryOptions)
      : (navMenuItems || []);
    return items.filter((item) => String(item?.name || '').trim());
  }, [navMenuUseParentCategories, categoryOptions, navMenuItems]);
  const logoW = Math.min(Number(logoWidth) || 50, 250);
  const logoH = Math.min(Number(logoHeight) || 50, 50);
  // Match live Navbar: empty/custom-missing → default Store1920 logo (never blank "Logo" text).
  const resolvedLogoUrl = String(logoUrl || '').trim() || STORE1920_LOGO_PATH;

  const renderPreviewAction = (Icon, label, badge) => (
    <span className="inline-flex items-center gap-2 px-1 py-1.5">
      <span className="relative inline-flex shrink-0 items-center justify-center">
        <Icon size={20} strokeWidth={1.5} />
        {badge ? (
          <span className="absolute -right-2.5 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[13px] font-normal leading-none">{label}</span>
    </span>
  );

  return (
    <div className="w-full overflow-visible rounded-xl border border-slate-200/80 shadow-sm">
      <div className="text-white" style={{ backgroundColor: bg }}>
        {/* Main navbar row — matches desktop Navbar.jsx */}
        <div className="mx-auto w-full max-w-[1400px] overflow-visible px-4 sm:px-6">
          <div className="flex items-center gap-3 overflow-visible py-2.5 sm:gap-4">
            <div className="flex shrink-0 items-center">
              <img
                src={resolvedLogoUrl}
                alt="Store logo"
                style={{
                  width: logoW,
                  height: logoH,
                  maxHeight: '50px',
                  maxWidth: '250px',
                  objectFit: 'contain',
                }}
              />
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 sm:flex">
              <ShipXpressBadge interactive={false} />

              <div className="min-w-0 flex-1 max-w-[590px]">
                <div
                  className="flex h-11 w-full items-center overflow-hidden rounded-2xl border px-3 shadow-sm"
                  style={{
                    borderColor: 'rgba(255,255,255,0.92)',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <span className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-xl px-2 text-[13px] font-medium text-slate-700">
                    Categories
                    <span className="text-[11px] text-slate-400">▾</span>
                  </span>
                  <span className="mx-3 h-5 w-px shrink-0 bg-slate-200" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-slate-400">
                    {searchPlaceholder}
                  </span>
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ color: bg }}
                  >
                    <Search size={15} />
                  </span>
                </div>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-5 text-[12px]">
              <span className="mx-1 hidden h-7 w-px bg-white/25 sm:block" aria-hidden="true" />

              <div className="inline-flex items-center gap-2.5 px-1 py-1">
                <User size={20} strokeWidth={1.85} />
                <span className="hidden flex-col leading-[1.15] sm:flex">
                  <span className="text-[13px] font-bold leading-none">Sign In / Register</span>
                  <span className="mt-1 text-[10px] font-normal leading-none text-white/85">Orders &amp; Account</span>
                </span>
              </div>

              {navActionsVisibility.orders !== false ? renderPreviewAction(Package, 'Orders') : null}
              {navActionsVisibility.wishlist !== false ? renderPreviewAction(Heart, 'Wishlist', '1') : null}
              {navActionsVisibility.cart !== false ? renderPreviewAction(ShoppingCart, 'Cart', '2') : null}
            </div>
          </div>

          {/* Mobile-style search fallback on very narrow admin sidebars */}
          <div className="pb-2.5 sm:hidden">
            <div
              className="flex h-9 w-full items-center overflow-hidden rounded-2xl border px-3"
              style={{
                borderColor: 'rgba(255,255,255,0.92)',
                backgroundColor: '#ffffff',
              }}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-400">{searchPlaceholder}</span>
              <Search size={14} className="shrink-0 text-slate-500" />
            </div>
          </div>
        </div>

        {/* Menu bar row — matches NavbarMenuBar */}
        {navMenuEnabled && menuItems.length > 0 ? (
          <div
            className="border-t"
            style={{
              borderColor: 'rgba(255,255,255,0.14)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div className="mx-auto w-full max-w-[1400px] overflow-x-auto px-4 py-2 scrollbar-hide sm:px-6">
              <div className="flex items-center whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-white/90">
                {menuItems.map((item, index) => (
                  <span key={`${item.name}-${index}`} className="inline-flex items-center">
                    {index > 0 ? <span className="px-2 text-xs opacity-40 select-none">|</span> : null}
                    <span className="px-2 py-1.5">{item.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : navMenuEnabled ? (
          <div
            className="border-t px-4 py-2 text-xs text-white/60 sm:px-6"
            style={{ borderColor: 'rgba(255,255,255,0.14)' }}
          >
            Add menu items to show navigation links
          </div>
        ) : (
          <div
            className="border-t px-4 py-2 text-xs text-white/60 sm:px-6"
            style={{ borderColor: 'rgba(255,255,255,0.14)' }}
          >
            Desktop menu disabled
          </div>
        )}
      </div>
    </div>
  );
}
