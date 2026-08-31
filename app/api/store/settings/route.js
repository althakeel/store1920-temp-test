import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NavbarMenuSettings from '@/models/NavbarMenuSettings';
import { getAuth } from '@/lib/firebase-admin';
import { deleteCacheKey } from '@/lib/cache';

const DEFAULT_SETTINGS = {
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

let inMemorySettings = {
  public: { ...DEFAULT_SETTINGS },
  byStore: {},
};

const boolOrDefault = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

const normalizeVisibility = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    store: boolOrDefault(input.store, true),
    orders: boolOrDefault(input.orders, true),
    wishlist: boolOrDefault(input.wishlist, true),
    cart: boolOrDefault(input.cart, true),
  };
};

const normalizeHexColor = (value, fallback) => {
  const candidate = String(value || '').trim();
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(candidate)) {
    return candidate;
  }
  return fallback;
};

const normalizeMenuStyle = (value, currentStyle = DEFAULT_SETTINGS.navMenuStyle) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    barBackgroundColor: normalizeHexColor(source.barBackgroundColor, currentStyle.barBackgroundColor),
    barTextColor: normalizeHexColor(source.barTextColor, currentStyle.barTextColor),
    barHoverBackgroundColor: normalizeHexColor(source.barHoverBackgroundColor, currentStyle.barHoverBackgroundColor),
    dropdownBackgroundColor: normalizeHexColor(source.dropdownBackgroundColor, currentStyle.dropdownBackgroundColor),
    dropdownTextColor: normalizeHexColor(source.dropdownTextColor, currentStyle.dropdownTextColor),
    dropdownMutedTextColor: normalizeHexColor(source.dropdownMutedTextColor, currentStyle.dropdownMutedTextColor),
    dropdownBorderColor: normalizeHexColor(source.dropdownBorderColor, currentStyle.dropdownBorderColor),
    showcaseFlyoutBackgroundColor: normalizeHexColor(source.showcaseFlyoutBackgroundColor, currentStyle.showcaseFlyoutBackgroundColor),
    showcaseFlyoutTitleColor: normalizeHexColor(source.showcaseFlyoutTitleColor, currentStyle.showcaseFlyoutTitleColor),
    showcaseFlyoutLinkColor: normalizeHexColor(source.showcaseFlyoutLinkColor, currentStyle.showcaseFlyoutLinkColor),
    showcaseFlyoutHoverColor: normalizeHexColor(source.showcaseFlyoutHoverColor, currentStyle.showcaseFlyoutHoverColor),
    showcaseFlyoutBorderColor: normalizeHexColor(source.showcaseFlyoutBorderColor, currentStyle.showcaseFlyoutBorderColor),
  };
};

const normalizeMegaMenu = (megaMenu) => {
  const source = megaMenu && typeof megaMenu === 'object' ? megaMenu : {};
  const numericColumns = Number(source.linkColumns);
  const linkColumns = [1, 2, 3].includes(numericColumns) ? numericColumns : 1;

  const links = Array.isArray(source.links)
    ? source.links
        .map((entry) => ({
          name: String(entry?.name || '').trim(),
          link: String(entry?.link || '').trim(),
        }))
        .filter((entry) => entry.name || entry.link)
    : [];

  const images = Array.isArray(source.images)
    ? source.images
        .map((entry) => ({
          url: String(entry?.url || '').trim(),
          label: String(entry?.label || '').trim(),
          link: String(entry?.link || '').trim(),
        }))
        .filter((entry) => entry.url)
    : [];

  return {
    linkColumns,
    links,
    images,
  };
};

const normalizeMenuItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const name = String(item?.name || '').trim();
      const link = String(item?.link || '').trim() || '#';
      const icon = String(item?.icon || '').trim();
      const categoryId = String(item?.categoryId || '').trim();
      const hasDropdown = Boolean(item?.hasDropdown);
      const megaMenu = normalizeMegaMenu(item?.megaMenu);

      return {
        name,
        link,
        icon,
        hasDropdown,
        categoryId,
        megaMenu,
      };
    })
    .filter((item) => item.name);
};

const mapLegacyItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      name: String(item?.label || '').trim(),
      link: String(item?.url || '').trim() || '#',
      icon: '',
      hasDropdown: false,
      categoryId: String(item?.categoryId || '').trim(),
      megaMenu: { linkColumns: 1, links: [], images: [] },
    }))
    .filter((item) => item.name);
};

const mergeWithDefaults = (raw) => {
  // Respect an explicitly saved empty menu. Only fall back to legacy `items`
  // when `navMenuItems` was never stored on the document.
  const hasExplicitNavMenuItems = Array.isArray(raw?.navMenuItems);
  const navMenuItems = hasExplicitNavMenuItems
    ? normalizeMenuItems(raw.navMenuItems)
    : mapLegacyItems(raw?.items);

  return {
    navMenuEnabled: boolOrDefault(raw?.navMenuEnabled, boolOrDefault(raw?.enabled, DEFAULT_SETTINGS.navMenuEnabled)),
    navMenuUseParentCategories: boolOrDefault(raw?.navMenuUseParentCategories, DEFAULT_SETTINGS.navMenuUseParentCategories),
    navActionsVisibility: normalizeVisibility(raw?.navActionsVisibility),
    navMenuStyle: normalizeMenuStyle(raw?.navMenuStyle, DEFAULT_SETTINGS.navMenuStyle),
    navMenuItems,
  };
};

const parseAuthHeader = (request) => {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
};

const getUserIdFromRequest = async (request) => {
  const token = parseAuthHeader(request);
  if (!token) return null;
  const decoded = await getAuth().verifyIdToken(token);
  return decoded?.uid || null;
};

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request).catch(() => null);
    await dbConnect();

    if (userId) {
      const doc = await NavbarMenuSettings.findOne({ storeId: userId }).lean();
      const merged = mergeWithDefaults(doc || {});
      return NextResponse.json(merged, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    const latest = await NavbarMenuSettings.findOne({}).sort({ updatedAt: -1, _id: -1 }).lean();
    const merged = mergeWithDefaults(latest || inMemorySettings.public);
    return NextResponse.json(merged, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[API /store/settings GET] fallback to in-memory:', error?.message || error);

    try {
      const userId = await getUserIdFromRequest(request).catch(() => null);
      if (userId && inMemorySettings.byStore[userId]) {
        return NextResponse.json(inMemorySettings.byStore[userId], { status: 200, headers: { 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json(inMemorySettings.public, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(DEFAULT_SETTINGS, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
  }
}

export async function PUT(request) {
  let parsedBody = {};
  try {
    parsedBody = await request.json();
  } catch {
    parsedBody = {};
  }

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const incoming = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};

    await dbConnect();
    const existing = await NavbarMenuSettings.findOne({ storeId: userId }).lean();
    const current = mergeWithDefaults(existing || {});

    const next = {
      navMenuEnabled: incoming.navMenuEnabled == null ? current.navMenuEnabled : boolOrDefault(incoming.navMenuEnabled, current.navMenuEnabled),
      navMenuUseParentCategories: incoming.navMenuUseParentCategories == null
        ? current.navMenuUseParentCategories
        : boolOrDefault(incoming.navMenuUseParentCategories, current.navMenuUseParentCategories),
      navActionsVisibility: incoming.navActionsVisibility == null
        ? current.navActionsVisibility
        : {
            ...current.navActionsVisibility,
            ...normalizeVisibility(incoming.navActionsVisibility),
          },
      navMenuStyle: incoming.navMenuStyle == null
        ? current.navMenuStyle
        : normalizeMenuStyle(incoming.navMenuStyle, current.navMenuStyle),
      navMenuItems: incoming.navMenuItems == null ? current.navMenuItems : normalizeMenuItems(incoming.navMenuItems),
    };

    const legacyItems = next.navMenuItems.map((item) => ({
      label: item.name,
      url: item.link || '#',
      categoryId: item.categoryId || '',
    }));

    await NavbarMenuSettings.findOneAndUpdate(
      { storeId: userId },
      {
        $set: {
          storeId: userId,
          navMenuEnabled: next.navMenuEnabled,
          navMenuUseParentCategories: next.navMenuUseParentCategories,
          navActionsVisibility: next.navActionsVisibility,
          navMenuStyle: next.navMenuStyle,
          navMenuItems: next.navMenuItems,
          enabled: next.navMenuEnabled,
          items: legacyItems,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    inMemorySettings = {
      ...inMemorySettings,
      public: next,
      byStore: {
        ...inMemorySettings.byStore,
        [userId]: next,
      },
    };

    deleteCacheKey('server:homepage:v3');

    return NextResponse.json({ success: true, ...next }, { status: 200 });
  } catch (error) {
    console.error('[API /store/settings PUT] db unavailable, saving in memory:', error?.message || error);

    try {
      const userId = await getUserIdFromRequest(request);
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const incoming = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
      const current = inMemorySettings.byStore[userId] || inMemorySettings.public || DEFAULT_SETTINGS;

      const next = {
        navMenuEnabled: incoming.navMenuEnabled == null ? current.navMenuEnabled : boolOrDefault(incoming.navMenuEnabled, current.navMenuEnabled),
        navMenuUseParentCategories: incoming.navMenuUseParentCategories == null
          ? current.navMenuUseParentCategories
          : boolOrDefault(incoming.navMenuUseParentCategories, current.navMenuUseParentCategories),
        navActionsVisibility: incoming.navActionsVisibility == null
          ? normalizeVisibility(current.navActionsVisibility)
          : {
              ...normalizeVisibility(current.navActionsVisibility),
              ...normalizeVisibility(incoming.navActionsVisibility),
            },
        navMenuStyle: incoming.navMenuStyle == null
          ? normalizeMenuStyle(current.navMenuStyle, DEFAULT_SETTINGS.navMenuStyle)
          : normalizeMenuStyle(incoming.navMenuStyle, normalizeMenuStyle(current.navMenuStyle, DEFAULT_SETTINGS.navMenuStyle)),
        navMenuItems: incoming.navMenuItems == null ? normalizeMenuItems(current.navMenuItems) : normalizeMenuItems(incoming.navMenuItems),
      };

      inMemorySettings = {
        ...inMemorySettings,
        public: next,
        byStore: {
          ...inMemorySettings.byStore,
          [userId]: next,
        },
      };

      return NextResponse.json({ success: true, ...next, source: 'memory' }, { status: 200 });
    } catch (innerError) {
      return NextResponse.json({ error: innerError?.message || 'Failed to update settings' }, { status: 500 });
    }
  }
}
