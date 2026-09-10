'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import toast from 'react-hot-toast';
import PageSkeleton from '@/components/PageSkeleton';
import NavbarPreview from '@/components/store/NavbarPreview';
import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';
import {
  filterParentCategories,
  getCategoryDisplayName,
  resolveStoreNavMenuItems,
} from '@/lib/categoryNavigation';
import { toPublicCategoryPath } from '@/lib/categorySlug';
import {
  Eye,
  Loader2,
  Menu,
  Palette,
  Save,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Heart,
  Package,
  Trash2,
  X,
} from 'lucide-react';

const createMenuItem = () => ({
  name: '',
  link: '#',
  icon: '',
  hasDropdown: false,
  categoryId: '',
  megaMenu: {
    linkColumns: 1,
    links: [],
    images: [],
  },
});

const defaultSettings = {
  navMenuEnabled: true,
  navActionsVisibility: {
    store: true,
    orders: true,
    wishlist: true,
    cart: true,
  },
  navMenuStyle: {
    barBackgroundColor: '#ffffff',
    barTextColor: '#334155',
    barHoverBackgroundColor: '#f1f5f9',
    dropdownBackgroundColor: '#ffffff',
    dropdownTextColor: '#334155',
    dropdownMutedTextColor: '#64748b',
    dropdownBorderColor: '#e2e8f0',
    showcaseFlyoutBackgroundColor: '#ffffff',
    showcaseFlyoutTitleColor: '#0f172a',
    showcaseFlyoutLinkColor: '#1f2937',
    showcaseFlyoutHoverColor: '#f8fafc',
    showcaseFlyoutBorderColor: '#dbe3ee',
  },
  navMenuItems: [],
  navMenuUseParentCategories: false,
};

const defaultNavbarBranding = {
  logoUrl: '',
  logoWidth: 120,
  logoHeight: 40,
  backgroundColor: '#8f3404',
};

const defaultMenuItems = [
  {
    name: 'About Jomla',
    link: '/about-us',
    icon: '',
    hasDropdown: false,
    categoryId: '',
    megaMenu: {
      linkColumns: 1,
      links: [],
      images: [],
    },
  },
  {
    name: 'Track Order',
    link: '/track-order',
    icon: '',
    hasDropdown: false,
    categoryId: '',
    megaMenu: {
      linkColumns: 1,
      links: [],
      images: [],
    },
  },
  {
    name: 'Download Jomla App',
    link: '/support',
    icon: '',
    hasDropdown: false,
    categoryId: '',
    megaMenu: {
      linkColumns: 1,
      links: [],
      images: [],
    },
  },
  {
    name: 'Advanced Search',
    link: '/search-results',
    icon: '',
    hasDropdown: false,
    categoryId: '',
    megaMenu: {
      linkColumns: 1,
      links: [],
      images: [],
    },
  },
];

const EXISTING_PAGES = [
  '/',
  '/shop',
  '/categories',
  '/new-arrivals',
  '/best-sellers',
  '/offers',
  '/about-us',
  '/contact-us',
  '/faq',
  '/support',
  '/help',
  '/privacy-policy',
  '/terms-and-conditions',
  '/shipping-policy',
  '/return-policy',
  '/cookie-policy',
  '/warranty-policy',
];

const safeDecode = (value) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
};

const readLinkChoice = (link) => {
  const normalized = String(link || '').trim() || '#';
  if (normalized.startsWith('/category/')) {
    return { type: 'category', value: normalized.replace(/^\/category\//, '').trim() };
  }

  if (normalized.startsWith('/shop?')) {
    const query = normalized.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const category = params.get('category');
    if (category) {
      return { type: 'category', value: safeDecode(category) };
    }
  }

  if (normalized.startsWith('/product/')) {
    return { type: 'product', value: safeDecode(normalized.replace('/product/', '').trim()) };
  }

  if (normalized.startsWith('/products/')) {
    return { type: 'product', value: safeDecode(normalized.replace('/products/', '').trim()) };
  }

  if (EXISTING_PAGES.includes(normalized)) {
    return { type: 'page', value: normalized };
  }

  return { type: 'custom', value: normalized === '#' ? '' : normalized };
};

const createLinkFromChoice = (type, rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) return '#';

  if (type === 'category') {
    return toPublicCategoryPath(value);
  }

  if (type === 'product') {
    return `/product/${encodeURIComponent(value)}`;
  }

  if (type === 'page') {
    return value.startsWith('/') ? value : `/${value}`;
  }

  return value;
};

export default function MenuManagementPage() {
  const { user, getToken, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultSettings);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [nestedDrag, setNestedDrag] = useState(null);
  const [nestedDrop, setNestedDrop] = useState(null);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [activePanel, setActivePanel] = useState('settings');
  const [uploadingMegaImageKey, setUploadingMegaImageKey] = useState('');
  const [uploadingNavbarLogo, setUploadingNavbarLogo] = useState(false);
  const [pendingClearLogo, setPendingClearLogo] = useState(false);
  const [navbarBranding, setNavbarBranding] = useState(defaultNavbarBranding);
  const [legacyNavbarItems, setLegacyNavbarItems] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const closeConfirmDialog = () => setConfirmDialog(null);

  const loadSettings = async () => {
    try {
      const token = user ? await getToken() : null;
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const [settingsResponse, brandingResponse] = await Promise.all([
        fetch('/api/store/settings', {
          cache: 'no-store',
          headers: authHeaders,
        }),
        fetch('/api/store/navbar-menu', {
          cache: 'no-store',
          headers: authHeaders,
        }),
      ]);

      if (!settingsResponse.ok) {
        throw new Error('Failed to load settings');
      }

      const data = await settingsResponse.json();
      setForm({
        navMenuEnabled: Boolean(data?.navMenuEnabled),
        navActionsVisibility: {
          store: data?.navActionsVisibility?.store !== false,
          orders: data?.navActionsVisibility?.orders !== false,
          wishlist: data?.navActionsVisibility?.wishlist !== false,
          cart: data?.navActionsVisibility?.cart !== false,
        },
        navMenuStyle: {
          ...defaultSettings.navMenuStyle,
          ...(data?.navMenuStyle || {}),
        },
        // Respect an empty saved menu — never auto-restore hard-coded defaults after the user deleted items.
        navMenuItems: Array.isArray(data?.navMenuItems)
          ? data.navMenuItems
          : defaultMenuItems,
        navMenuUseParentCategories: Boolean(data?.navMenuUseParentCategories),
      });

      if (brandingResponse.ok) {
        const brandingData = await brandingResponse.json();
        setNavbarBranding({
          logoUrl: String(brandingData?.logoUrl || '').trim(),
          logoWidth: Number.isFinite(Number(brandingData?.logoWidth)) ? Number(brandingData.logoWidth) : defaultNavbarBranding.logoWidth,
          logoHeight: Number.isFinite(Number(brandingData?.logoHeight)) ? Number(brandingData.logoHeight) : defaultNavbarBranding.logoHeight,
          backgroundColor: String(brandingData?.backgroundColor || defaultNavbarBranding.backgroundColor),
        });
        setPendingClearLogo(false);
        setLegacyNavbarItems(Array.isArray(brandingData?.items) ? brandingData.items : []);
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to load menu settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    loadSettings();
  }, [authLoading, user?.uid]);

  useEffect(() => {
    let active = true;

    const loadLinkTargets = async () => {
      try {
        const [categoriesRes, productsRes] = await Promise.all([
          fetch('/api/categories', { cache: 'no-store' }),
          fetch('/api/products?limit=200', { cache: 'no-store' }),
        ]);

        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : { categories: [] };
        const productsData = productsRes.ok ? await productsRes.json() : { products: [] };

        if (!active) return;

        setCategoryOptions(Array.isArray(categoriesData?.categories) ? categoriesData.categories : []);
        setProductOptions(Array.isArray(productsData?.products) ? productsData.products : []);
      } catch {
        if (!active) return;
        setCategoryOptions([]);
        setProductOptions([]);
      }
    };

    loadLinkTargets();

    return () => {
      active = false;
    };
  }, []);

  const parentCategoryPreview = useMemo(
    () => filterParentCategories(categoryOptions),
    [categoryOptions],
  );

  const previewMenuItems = useMemo(() => {
    return resolveStoreNavMenuItems(
      {
        navMenuUseParentCategories: form.navMenuUseParentCategories,
        navMenuItems: form.navMenuItems,
      },
      categoryOptions,
    );
  }, [form.navMenuUseParentCategories, form.navMenuItems, categoryOptions]);

  const saveSettings = async (payload, successMessage = 'Navigation menu saved') => {
    const token = await getToken();
    const response = await fetch('/api/store/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to save settings');
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('navMenuUpdated'));
    }
    if (successMessage) {
      toast.success(successMessage);
    }
  };

  const saveNavbarBranding = async () => {
    const token = await getToken();
    const payload = {
      enabled: true,
      items: Array.isArray(legacyNavbarItems) ? legacyNavbarItems : [],
      logoUrl: String(navbarBranding.logoUrl || '').trim(),
      logoWidth: Math.max(20, Math.min(400, Number(navbarBranding.logoWidth) || defaultNavbarBranding.logoWidth)),
      logoHeight: Math.max(10, Math.min(200, Number(navbarBranding.logoHeight) || defaultNavbarBranding.logoHeight)),
      backgroundColor: String(navbarBranding.backgroundColor || defaultNavbarBranding.backgroundColor).trim(),
      clearLogo: pendingClearLogo,
    };

    const response = await fetch('/api/store/navbar-menu', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to save navbar branding');
    }

    if (Array.isArray(data?.data?.items)) {
      setLegacyNavbarItems(data.data.items);
    }

    const savedLogoUrl = String(data?.data?.logoUrl || payload.logoUrl || '').trim();
    setNavbarBranding((prev) => ({
      ...prev,
      logoUrl: pendingClearLogo ? '' : savedLogoUrl,
      logoWidth: data?.data?.logoWidth ?? prev.logoWidth,
      logoHeight: data?.data?.logoHeight ?? prev.logoHeight,
    }));
    setPendingClearLogo(false);

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('navbarAppearanceCache');
        const cached = raw ? JSON.parse(raw) : {};
        window.localStorage.setItem('navbarAppearanceCache', JSON.stringify({
          ...cached,
          logoUrl: pendingClearLogo ? '' : savedLogoUrl,
          logoWidth: payload.logoWidth,
          logoHeight: payload.logoHeight,
          backgroundColor: payload.backgroundColor,
        }));
      } catch {
        // Ignore storage write failures.
      }
      window.dispatchEvent(new CustomEvent('navbarAppearanceUpdated', {
        detail: {
          logoUrl: pendingClearLogo ? '' : savedLogoUrl,
          logoWidth: payload.logoWidth,
          logoHeight: payload.logoHeight,
          backgroundColor: payload.backgroundColor,
        },
      }));
    }
  };

  const uploadNavbarLogo = async (file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    try {
      setUploadingNavbarLogo(true);
      const token = await getToken();
      // Keep PNG/WebP transparency — JPEG would show black around the logo.
      const { compressImageForUpload } = await import('@/lib/compressImageForUpload');
      const prepared = await compressImageForUpload(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        maxBytes: 2 * 1024 * 1024,
        preserveTransparency: true,
      });
      const body = new FormData();
      body.append('image', prepared);
      body.append('type', 'navbar-logo');

      const uploadResponse = await fetch('/api/store/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.error || 'Failed to upload logo');
      }

      setNavbarBranding((prev) => ({ ...prev, logoUrl: uploadData.url }));
      setPendingClearLogo(false);
      toast.success('Logo uploaded. Click Save Settings to apply.');
    } catch (error) {
      toast.error(error?.message || 'Failed to upload logo');
    } finally {
      setUploadingNavbarLogo(false);
    }
  };

  const updateMenuItem = (index, updater) => {
    setForm((prev) => ({
      ...prev,
      navMenuItems: prev.navMenuItems.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    }));
  };

  const moveMenuItem = (fromIndex, toIndex) => {
    setForm((prev) => {
      const total = prev.navMenuItems.length;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= total ||
        toIndex >= total
      ) {
        return prev;
      }

      const nextItems = [...prev.navMenuItems];
      const [movedItem] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, movedItem);
      return { ...prev, navMenuItems: nextItems };
    });
  };

  const moveMenuItemByStep = (index, step) => {
    const target = index + step;
    moveMenuItem(index, target);
  };

  const updateItemLinkChoice = (menuIndex, type, value) => {
    updateMenuItem(menuIndex, (current) => ({
      ...current,
      link: createLinkFromChoice(type, value),
    }));
  };

  const updateMegaLinkChoice = (menuIndex, linkIndex, type, value) => {
    updateMenuItem(menuIndex, (current) => {
      const links = [...(current.megaMenu?.links || [])];
      links[linkIndex] = {
        ...(links[linkIndex] || {}),
        link: createLinkFromChoice(type, value),
      };
      return {
        ...current,
        megaMenu: {
          ...(current.megaMenu || {}),
          links,
        },
      };
    });
  };

  const moveMegaArrayItem = (menuIndex, key, fromIndex, toIndex) => {
    updateMenuItem(menuIndex, (current) => {
      const source = Array.isArray(current?.megaMenu?.[key]) ? current.megaMenu[key] : [];
      const total = source.length;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= total ||
        toIndex >= total
      ) {
        return current;
      }

      const next = [...source];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return {
        ...current,
        megaMenu: {
          ...(current.megaMenu || {}),
          [key]: next,
        },
      };
    });
  };

  const moveMegaArrayItemByStep = (menuIndex, key, index, step) => {
    moveMegaArrayItem(menuIndex, key, index, index + step);
  };

  const uploadIconAndPersist = async (menuIndex, file) => {
    if (!file) return;
    try {
      const token = await getToken();
      const body = new FormData();
      body.append('image', file);
      body.append('type', 'menu-icon');

      const uploadResponse = await fetch('/api/store/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.error || 'Failed to upload icon');
      }

      const updatedItems = form.navMenuItems.map((item, index) =>
        index === menuIndex ? { ...item, icon: uploadData.url } : item
      );

      setForm((prev) => ({ ...prev, navMenuItems: updatedItems }));
      await saveSettings({ navMenuItems: updatedItems }, 'Icon saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to upload icon');
    }
  };

  const uploadMegaImageAndPersist = async (menuIndex, imageIndex, file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    const uploadKey = `${menuIndex}-${imageIndex}`;
    setUploadingMegaImageKey(uploadKey);

    try {
      const token = await getToken();
      const body = new FormData();
      body.append('image', file);
      body.append('type', 'menu-mega-image');

      const uploadResponse = await fetch('/api/store/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.error || 'Failed to upload image');
      }

      let updatedItems = [];
      setForm((prev) => {
        updatedItems = prev.navMenuItems.map((item, idx) => {
          if (idx !== menuIndex) return item;
          const images = [...(item?.megaMenu?.images || [])];
          images[imageIndex] = {
            ...(images[imageIndex] || {}),
            url: uploadData.url,
          };
          return {
            ...item,
            megaMenu: {
              ...(item?.megaMenu || {}),
              images,
            },
          };
        });

        return { ...prev, navMenuItems: updatedItems };
      });

      await saveSettings({ navMenuItems: updatedItems }, 'Image uploaded');
    } catch (error) {
      toast.error(error?.message || 'Failed to upload image');
    } finally {
      setUploadingMegaImageKey('');
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <p className="text-sm">Please sign in to manage menu settings.</p>
          <Link href="/store/login" className="mt-4 inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            Go to Store Login
          </Link>
        </div>
      </div>
    );
  }

  const actionToggles = [
    { key: 'store', label: 'Store action', icon: Store },
    { key: 'orders', label: 'Orders action', icon: Package },
    { key: 'wishlist', label: 'Wishlist action', icon: Heart },
    { key: 'cart', label: 'Cart action', icon: ShoppingCart },
  ];

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const saveErrors = [];

      try {
        await saveNavbarBranding();
      } catch (error) {
        saveErrors.push(error?.message || 'Failed to save navbar branding');
      }

      try {
        await saveSettings({
          navMenuEnabled: form.navMenuEnabled,
          navActionsVisibility: form.navActionsVisibility,
        }, null);
      } catch (error) {
        saveErrors.push(error?.message || 'Failed to save settings');
      }

      if (saveErrors.length) {
        throw new Error(saveErrors[0]);
      }

      toast.success('Settings saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMenu = async () => {
    if (form.navMenuItems.length === 0) {
      setConfirmDialog({
        tone: 'warning',
        title: 'Save empty menu?',
        message: 'You removed all navigation items. The live navbar will show no manual items until you add some again.',
        confirmLabel: 'Save empty menu',
        onConfirm: async () => {
          setConfirmDialog(null);
          setSaving(true);
          try {
            await saveSettings({
              navMenuItems: form.navMenuItems,
              navMenuUseParentCategories: form.navMenuUseParentCategories,
            }, 'Menu saved');
          } catch (error) {
            toast.error(error?.message || 'Failed to save menu');
          } finally {
            setSaving(false);
          }
        },
      });
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        navMenuItems: form.navMenuItems,
        navMenuUseParentCategories: form.navMenuUseParentCategories,
      }, 'Menu saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  const removeMenuItem = (index) => {
    const itemName = String(form.navMenuItems[index]?.name || `Item ${index + 1}`).trim();
    setConfirmDialog({
      tone: 'danger',
      title: 'Remove menu item?',
      message: `“${itemName}” will be removed from this editor. Click Save menu afterward to apply on the live site.`,
      confirmLabel: 'Remove item',
      onConfirm: () => {
        setForm((prev) => ({
          ...prev,
          navMenuItems: prev.navMenuItems.filter((_, i) => i !== index),
        }));
        setConfirmDialog(null);
        toast.success('Item removed — click Save menu to apply');
      },
    });
  };

  return (
    <div className="-mx-3 -mt-3 min-h-full w-full max-w-full overflow-x-hidden bg-white pb-16 sm:-mx-4 sm:-mt-4 lg:-mx-5 lg:-mt-5">
      <div className="border-b border-slate-200 bg-white">
        <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <Sparkles size={14} />
              Navigation
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Menu Management
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Configure desktop navbar links, mega menus, logo, and icon visibility.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/store/storefront/navbar-menu"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Navbar layout
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={activePanel === 'settings' ? handleSaveSettings : handleSaveMenu}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {activePanel === 'settings' ? 'Save settings' : 'Save menu'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-4 pb-0 pt-3 sm:px-6 lg:px-8">
          {[
            { id: 'settings', label: 'Settings', icon: Settings2 },
            { id: 'menu', label: 'Menu items', icon: Menu },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activePanel === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePanel(tab.id)}
                className={`inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      {activePanel === 'settings' ? (
        <div className="space-y-5">
          <div className="overflow-visible rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
              <Eye size={14} />
              Navbar preview
            </div>
            <div className="overflow-visible p-4 sm:p-5">
              <NavbarPreview
                backgroundColor={navbarBranding.backgroundColor || defaultNavbarBranding.backgroundColor}
                logoUrl={navbarBranding.logoUrl}
                logoWidth={navbarBranding.logoWidth}
                logoHeight={navbarBranding.logoHeight}
                navMenuEnabled={form.navMenuEnabled}
                navMenuItems={previewMenuItems}
                navMenuUseParentCategories={form.navMenuUseParentCategories}
                categoryOptions={categoryOptions}
                navActionsVisibility={form.navActionsVisibility}
                userName={user?.displayName || user?.email?.split('@')[0] || 'store1920'}
                searchPlaceholder="Wireless Headphones"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Enable desktop menu</p>
                <p className="text-xs text-slate-500">Shown when enabled and menu has items.</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={form.navMenuEnabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, navMenuEnabled: e.target.checked }))}
                  className="peer sr-only"
                />
                <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Navbar actions</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {actionToggles.map(({ key, label, icon: Icon }) => {
                  const checked = form.navActionsVisibility[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          navActionsVisibility: {
                            ...prev.navActionsVisibility,
                            [key]: !checked,
                          },
                        }))
                      }
                      className={`rounded-xl border p-3 text-left transition ${
                        checked
                          ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={16} className={checked ? 'text-indigo-600' : 'text-slate-400'} />
                      <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Palette size={16} className="text-indigo-600" />
                <h2 className="text-sm font-semibold text-slate-900">Navbar branding</h2>
              </div>
              <p className="mb-4 text-xs text-slate-500">
                Upload a PNG or WebP with a transparent background. Transparent areas show the navbar color
                (not black). Avoid JPEG for logos — JPEG fills empty areas with black.
              </p>

              <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                <div
                  className="relative flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300 p-3"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <img
                    src={String(navbarBranding.logoUrl || '').trim() || STORE1920_LOGO_PATH}
                    alt="Navbar logo preview"
                    className="max-h-16 max-w-full object-contain"
                  />
                  {!String(navbarBranding.logoUrl || '').trim() ? (
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Default logo
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {String(navbarBranding.logoUrl || '').trim()
                      ? 'Custom logo is saved and used on the live site.'
                      : 'No custom logo uploaded yet. The live site uses the default Store1920 logo until you upload one.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {uploadingNavbarLogo ? 'Uploading...' : 'Upload logo'}
                      <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg,image/*"
                        className="hidden"
                        disabled={uploadingNavbarLogo}
                        onChange={(event) => uploadNavbarLogo(event.target.files?.[0])}
                      />
                    </label>
                    {navbarBranding.logoUrl || pendingClearLogo ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNavbarBranding((prev) => ({ ...prev, logoUrl: '' }));
                          setPendingClearLogo(true);
                        }}
                        className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Use default
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-600">Logo width</span>
                      <input
                        type="number"
                        min={20}
                        max={400}
                        value={navbarBranding.logoWidth}
                        onChange={(e) => setNavbarBranding((prev) => ({ ...prev, logoWidth: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-600">Logo height</span>
                      <input
                        type="number"
                        min={10}
                        max={200}
                        value={navbarBranding.logoHeight}
                        onChange={(e) => setNavbarBranding((prev) => ({ ...prev, logoHeight: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">Main navbar color</span>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5">
                      <input
                        type="color"
                        value={navbarBranding.backgroundColor}
                        onChange={(e) => setNavbarBranding((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={navbarBranding.backgroundColor}
                        onChange={(e) => setNavbarBranding((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                        className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none"
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePanel === 'menu' ? (
      <div className="space-y-5">
        <div className="overflow-visible rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
            <Eye size={14} />
            Navbar preview
          </div>
          <div className="overflow-visible p-4 sm:p-5">
            <NavbarPreview
              backgroundColor={navbarBranding.backgroundColor || defaultNavbarBranding.backgroundColor}
              logoUrl={navbarBranding.logoUrl}
              logoWidth={navbarBranding.logoWidth}
              logoHeight={navbarBranding.logoHeight}
              navMenuEnabled={form.navMenuEnabled}
              navMenuItems={previewMenuItems}
              navMenuUseParentCategories={form.navMenuUseParentCategories}
              categoryOptions={categoryOptions}
              navActionsVisibility={form.navActionsVisibility}
              userName={user?.displayName || user?.email?.split('@')[0] || 'store1920'}
              searchPlaceholder="Coffee Maker"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Use parent categories</p>
              <p className="text-xs text-slate-500">
                Automatically build the navbar from top-level store categories. Manual navigation items are hidden.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={form.navMenuUseParentCategories}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  navMenuUseParentCategories: e.target.checked,
                }))}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>

          {form.navMenuUseParentCategories ? (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                {parentCategoryPreview.length} parent categories with subcategories
              </p>
              <p className="mt-1 text-xs text-indigo-900/80">
                Only top-level categories that have child categories are shown in the navbar.
              </p>
              {parentCategoryPreview.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {parentCategoryPreview.map((category) => (
                    <span
                      key={category._id || category.slug || category.name}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100"
                    >
                      {getCategoryDisplayName(category)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-indigo-900">
                  No parent categories found. Add categories under Store → Categories first.
                </p>
              )}
            </div>
          ) : null}
        </div>

      {!form.navMenuUseParentCategories ? (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">Navigation items</p>
            <p className="text-xs text-slate-500">Plain links, Collections flyouts, or mega menus. Drag to reorder.</p>
          </div>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, navMenuItems: [...prev.navMenuItems, createMenuItem()] }))}
            className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            Add item
          </button>
        </div>

        <div className="p-4 sm:p-5">

        <div className="space-y-4">
          {form.navMenuItems.map((item, index) => (
            <div
              key={`item-${index}`}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  moveMenuItem(dragIndex, index);
                }
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={`rounded-xl border bg-slate-50/80 p-4 transition ${dropIndex === index ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    className="cursor-grab rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    Drag
                  </button>
                  <p className="text-sm font-semibold text-slate-800">Item {index + 1}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => removeMenuItem(index)}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <input
                  type="text"
                  value={item.name || ''}
                  onChange={(e) => updateMenuItem(index, (current) => ({ ...current, name: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Menu name (e.g., Gold, Collections)"
                />
                <select
                  value={readLinkChoice(item.link).type}
                  onChange={(e) => updateItemLinkChoice(index, e.target.value, readLinkChoice(item.link).value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="custom">Custom URL</option>
                  <option value="category">Category</option>
                  <option value="product">Product</option>
                  <option value="page">Existing page</option>
                </select>

                {readLinkChoice(item.link).type === 'category' ? (
                  <select
                    value={readLinkChoice(item.link).value}
                    onChange={(e) => updateItemLinkChoice(index, 'category', e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((category) => {
                      const value = category?.slug || category?._id || '';
                      return (
                        <option key={category?._id || category?.slug || category?.name} value={value}>
                          {category?.name || value}
                        </option>
                      );
                    })}
                  </select>
                ) : null}

                {readLinkChoice(item.link).type === 'product' ? (
                  <select
                    value={readLinkChoice(item.link).value}
                    onChange={(e) => updateItemLinkChoice(index, 'product', e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select product</option>
                    {productOptions.map((product) => {
                      const value = product?.slug || product?._id || '';
                      return (
                        <option key={product?._id || product?.slug || product?.name} value={value}>
                          {product?.name || value}
                        </option>
                      );
                    })}
                  </select>
                ) : null}

                {readLinkChoice(item.link).type === 'page' ? (
                  <select
                    value={readLinkChoice(item.link).value}
                    onChange={(e) => updateItemLinkChoice(index, 'page', e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select page</option>
                    {EXISTING_PAGES.map((pagePath) => (
                      <option key={pagePath} value={pagePath}>
                        {pagePath}
                      </option>
                    ))}
                  </select>
                ) : null}

                {readLinkChoice(item.link).type === 'custom' ? (
                  <input
                    type="text"
                    value={readLinkChoice(item.link).value}
                    onChange={(e) => updateItemLinkChoice(index, 'custom', e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="https://example.com or /custom-page"
                  />
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(item.hasDropdown)}
                    onChange={(e) => updateMenuItem(index, (current) => ({ ...current, hasDropdown: e.target.checked }))}
                  />
                  Has dropdown
                </label>
                <input
                  type="text"
                  value={item.categoryId || ''}
                  onChange={(e) => updateMenuItem(index, (current) => ({ ...current, categoryId: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional categoryId"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.icon || ''}
                    onChange={(e) => updateMenuItem(index, (current) => ({ ...current, icon: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Icon URL"
                  />
                  <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        uploadIconAndPersist(index, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mega Menu</p>
                    <p className="text-[11px] text-slate-500">Drag rows to reorder and set each link target type.</p>
                  </div>
                  <select
                    value={item?.megaMenu?.linkColumns || 1}
                    onChange={(e) =>
                      updateMenuItem(index, (current) => ({
                        ...current,
                        megaMenu: {
                          ...(current.megaMenu || {}),
                          linkColumns: Number(e.target.value),
                        },
                      }))
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                  >
                    <option value={1}>1 column</option>
                    <option value={2}>2 columns</option>
                    <option value={3}>3 columns</option>
                  </select>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">Links</p>
                    {(item?.megaMenu?.links || []).map((linkItem, linkIndex) => (
                      <div
                        key={`link-${linkIndex}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setNestedDrop({ menuIndex: index, key: 'links', itemIndex: linkIndex });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (
                            nestedDrag &&
                            nestedDrag.menuIndex === index &&
                            nestedDrag.key === 'links' &&
                            nestedDrag.itemIndex !== linkIndex
                          ) {
                            moveMegaArrayItem(index, 'links', nestedDrag.itemIndex, linkIndex);
                          }
                          setNestedDrag(null);
                          setNestedDrop(null);
                        }}
                        className={`grid gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,1.35fr)_auto] md:items-center ${
                          nestedDrop?.menuIndex === index &&
                          nestedDrop?.key === 'links' &&
                          nestedDrop?.itemIndex === linkIndex
                            ? 'bg-blue-50 ring-1 ring-blue-200'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={() => setNestedDrag({ menuIndex: index, key: 'links', itemIndex: linkIndex })}
                          onDragEnd={() => {
                            setNestedDrag(null);
                            setNestedDrop(null);
                          }}
                          className="cursor-grab rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 active:cursor-grabbing"
                          title="Drag to reorder links"
                        >
                          Drag
                        </button>
                        <input
                          value={linkItem.name || ''}
                          onChange={(e) =>
                            updateMenuItem(index, (current) => {
                              const links = [...(current.megaMenu?.links || [])];
                              links[linkIndex] = { ...links[linkIndex], name: e.target.value };
                              return { ...current, megaMenu: { ...(current.megaMenu || {}), links } };
                            })
                          }
                          className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder="Label"
                        />
                        <select
                          value={readLinkChoice(linkItem.link).type}
                          onChange={(e) => updateMegaLinkChoice(index, linkIndex, e.target.value, readLinkChoice(linkItem.link).value)}
                          className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                        >
                          <option value="custom">Custom</option>
                          <option value="category">Category</option>
                          <option value="product">Product</option>
                          <option value="page">Page</option>
                        </select>
                        {readLinkChoice(linkItem.link).type === 'custom' ? (
                          <input
                            value={readLinkChoice(linkItem.link).value}
                            onChange={(e) => updateMegaLinkChoice(index, linkIndex, 'custom', e.target.value)}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                            placeholder="https://example.com or /custom-page"
                          />
                        ) : null}
                        {readLinkChoice(linkItem.link).type === 'category' ? (
                          <select
                            value={readLinkChoice(linkItem.link).value}
                            onChange={(e) => updateMegaLinkChoice(index, linkIndex, 'category', e.target.value)}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                          >
                            <option value="">Select category</option>
                            {categoryOptions.map((category) => {
                              const value = category?.slug || category?._id || '';
                              return (
                                <option key={category?._id || category?.slug || category?.name} value={value}>
                                  {category?.name || value}
                                </option>
                              );
                            })}
                          </select>
                        ) : null}
                        {readLinkChoice(linkItem.link).type === 'product' ? (
                          <select
                            value={readLinkChoice(linkItem.link).value}
                            onChange={(e) => updateMegaLinkChoice(index, linkIndex, 'product', e.target.value)}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                          >
                            <option value="">Select product</option>
                            {productOptions.map((product) => {
                              const value = product?.slug || product?._id || '';
                              return (
                                <option key={product?._id || product?.slug || product?.name} value={value}>
                                  {product?.name || value}
                                </option>
                              );
                            })}
                          </select>
                        ) : null}
                        {readLinkChoice(linkItem.link).type === 'page' ? (
                          <select
                            value={readLinkChoice(linkItem.link).value}
                            onChange={(e) => updateMegaLinkChoice(index, linkIndex, 'page', e.target.value)}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                          >
                            <option value="">Select page</option>
                            {EXISTING_PAGES.map((pagePath) => (
                              <option key={pagePath} value={pagePath}>
                                {pagePath}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 md:justify-self-end"
                          onClick={() =>
                            updateMenuItem(index, (current) => ({
                              ...current,
                              megaMenu: {
                                ...(current.megaMenu || {}),
                                links: (current.megaMenu?.links || []).filter((_, idx) => idx !== linkIndex),
                              },
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() =>
                        updateMenuItem(index, (current) => ({
                          ...current,
                          megaMenu: {
                            ...(current.megaMenu || {}),
                            links: [...(current.megaMenu?.links || []), { name: '', link: '#' }],
                          },
                        }))
                      }
                    >
                      Add link
                    </button>
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">Featured images</p>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        onClick={() =>
                          updateMenuItem(index, (current) => ({
                            ...current,
                            megaMenu: {
                              ...(current.megaMenu || {}),
                              images: [...(current.megaMenu?.images || []), { url: '', label: '', link: '#' }],
                            },
                          }))
                        }
                      >
                        Add image
                      </button>
                    </div>
                    {(item?.megaMenu?.images || []).map((imageItem, imageIndex) => (
                      <div
                        key={`image-${imageIndex}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setNestedDrop({ menuIndex: index, key: 'images', itemIndex: imageIndex });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (
                            nestedDrag &&
                            nestedDrag.menuIndex === index &&
                            nestedDrag.key === 'images' &&
                            nestedDrag.itemIndex !== imageIndex
                          ) {
                            moveMegaArrayItem(index, 'images', nestedDrag.itemIndex, imageIndex);
                          }
                          setNestedDrag(null);
                          setNestedDrop(null);
                        }}
                        className={`rounded-lg border border-slate-200 bg-white p-2 ${
                          nestedDrop?.menuIndex === index &&
                          nestedDrop?.key === 'images' &&
                          nestedDrop?.itemIndex === imageIndex
                            ? 'bg-blue-50 ring-1 ring-blue-200'
                            : ''
                        }`}
                      >
                        <div className="grid gap-2 md:grid-cols-[auto_56px_minmax(0,1fr)_auto] md:items-center">
                          <button
                            type="button"
                            draggable
                            onDragStart={() => setNestedDrag({ menuIndex: index, key: 'images', itemIndex: imageIndex })}
                            onDragEnd={() => {
                              setNestedDrag(null);
                              setNestedDrop(null);
                            }}
                            className="cursor-grab rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 active:cursor-grabbing"
                            title="Drag to reorder images"
                          >
                            Drag
                          </button>

                          <div className="h-10 w-14 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                            {imageItem.url ? (
                              <img
                                src={imageItem.url}
                                alt={imageItem.label || 'Menu image preview'}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">No image</div>
                            )}
                          </div>

                          <div
                            className="flex min-w-0 items-center gap-2"
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const file = event.dataTransfer?.files?.[0];
                              if (file) {
                                uploadMegaImageAndPersist(index, imageIndex, file);
                              }
                            }}
                            title="Drop image file here to upload"
                          >
                            <input
                              value={imageItem.url || ''}
                              onChange={(e) =>
                                updateMenuItem(index, (current) => {
                                  const images = [...(current.megaMenu?.images || [])];
                                  images[imageIndex] = { ...images[imageIndex], url: e.target.value };
                                  return { ...current, megaMenu: { ...(current.megaMenu || {}), images } };
                                })
                              }
                              className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                              placeholder="Image URL"
                            />
                            <label
                              htmlFor={`mega-image-upload-${index}-${imageIndex}`}
                              className="shrink-0 cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {uploadingMegaImageKey === `${index}-${imageIndex}` ? 'Uploading...' : 'Upload'}
                            </label>
                            <input
                              id={`mega-image-upload-${index}-${imageIndex}`}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingMegaImageKey === `${index}-${imageIndex}`}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  uploadMegaImageAndPersist(index, imageIndex, file);
                                }
                                event.target.value = '';
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 md:justify-self-end"
                            onClick={() =>
                              updateMenuItem(index, (current) => ({
                                ...current,
                                megaMenu: {
                                  ...(current.megaMenu || {}),
                                  images: (current.megaMenu?.images || []).filter((_, idx) => idx !== imageIndex),
                                },
                              }))
                            }
                          >
                            Remove
                          </button>

                          <div className="md:col-start-3 md:grid md:grid-cols-2 md:gap-2">
                            <input
                              value={imageItem.label || ''}
                              onChange={(e) =>
                                updateMenuItem(index, (current) => {
                                  const images = [...(current.megaMenu?.images || [])];
                                  images[imageIndex] = { ...images[imageIndex], label: e.target.value };
                                  return { ...current, megaMenu: { ...(current.megaMenu || {}), images } };
                                })
                              }
                              className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                              placeholder="Label"
                            />

                            <input
                              value={imageItem.link || ''}
                              onChange={(e) =>
                                updateMenuItem(index, (current) => {
                                  const images = [...(current.megaMenu?.images || [])];
                                  images[imageIndex] = { ...images[imageIndex], link: e.target.value };
                                  return { ...current, megaMenu: { ...(current.megaMenu || {}), images } };
                                })
                              }
                              className="mt-2 w-full min-w-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs md:mt-0"
                              placeholder="/category/bridal"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
      ) : null}
      </div>
      ) : null}
      </div>

      {confirmDialog ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onClick={closeConfirmDialog}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-confirm-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  confirmDialog.tone === 'warning'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-rose-50 text-rose-600'
                }`}
              >
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="menu-confirm-title" className="text-base font-semibold text-slate-900">
                  {confirmDialog.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {confirmDialog.message}
                </p>
              </div>
              <button
                type="button"
                onClick={closeConfirmDialog}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={closeConfirmDialog}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm?.()}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  confirmDialog.tone === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {confirmDialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
