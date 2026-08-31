import dbConnect from '@/lib/mongodb';
import NavbarMenuSettings from '@/models/NavbarMenuSettings';
import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebase-admin';

const MAX_ITEMS = 20;

function toFiniteNumber(value) {
  if (value == null) return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const fromString = Number(value.toString());
    if (Number.isFinite(fromString)) return fromString;
  }
  const parsedInt = Number.parseInt(String(value), 10);
  if (Number.isFinite(parsedInt)) return parsedInt;
  const parsedFloat = Number.parseFloat(String(value));
  if (Number.isFinite(parsedFloat)) return parsedFloat;
  return null;
}

function pickFooterBranding(settings = {}, navbarLogoUrl = '') {
  const sameAsNavbar = settings?.footerLogoSameAsNavbar !== false;
  const customFooterUrl = String(settings?.footerLogoUrl || '').trim();
  return {
    footerLogoSameAsNavbar: sameAsNavbar,
    footerLogoUrl: customFooterUrl,
    footerLogoWidth: toFiniteNumber(settings?.footerLogoWidth) ?? 160,
    footerLogoHeight: toFiniteNumber(settings?.footerLogoHeight) ?? 40,
    // Resolved URL the storefront should render.
    resolvedFooterLogoUrl: sameAsNavbar
      ? String(navbarLogoUrl || '').trim()
      : (customFooterUrl || String(navbarLogoUrl || '').trim()),
  };
}

function parseAuthHeader(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const parts = auth.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

export async function GET(req) {
  try {
    await dbConnect();

    const token = parseAuthHeader(req);
    if (token) {
      try {
        const decoded = await getAuth().verifyIdToken(token);
        console.log('[API GET /store/navbar-menu] Authenticated user:', decoded.uid);
        const settingsDocs = await NavbarMenuSettings.find({ storeId: decoded.uid })
          .sort({ updatedAt: -1, _id: -1 })
          .lean();

        console.log('[API GET /store/navbar-menu] Found docs:', settingsDocs.length);
        if (settingsDocs.length > 0) {
          console.log('[API GET /store/navbar-menu] All docs found:', settingsDocs.map(doc => ({
            _id: doc._id.toString().slice(-8),
            storeId: doc.storeId,
            logoUrl: doc?.logoUrl ? '(has URL)' : '(empty)',
            logoUrl_value: doc?.logoUrl || '(null/empty)'
          })));
          console.log('[API GET /store/navbar-menu] First doc details:', {
            _id: settingsDocs[0]._id,
            storeId: settingsDocs[0].storeId,
            enabled: settingsDocs[0].enabled,
            logoUrl: settingsDocs[0]?.logoUrl || '(empty)',
            logoWidth: settingsDocs[0]?.logoWidth,
            logoHeight: settingsDocs[0]?.logoHeight,
            backgroundColor: settingsDocs[0]?.backgroundColor
          });
        } else {
          console.log('[API GET /store/navbar-menu] NO DOCUMENTS FOUND for storeId:', decoded.uid);
        }

        const settings = settingsDocs[0] || null;
        let resolvedWidth = toFiniteNumber(settings?.logoWidth);
        let resolvedHeight = toFiniteNumber(settings?.logoHeight);
        let resolvedLogoUrl = String(settings?.logoUrl || '').trim();

        // Prefer any sibling doc for this seller that already has a logo / dimensions.
        if ((!resolvedLogoUrl || resolvedWidth == null || resolvedHeight == null) && settingsDocs.length > 1) {
          const fallbackDoc = settingsDocs.find((doc) => {
            const hasLogo = String(doc?.logoUrl || '').trim();
            const w = toFiniteNumber(doc?.logoWidth);
            const h = toFiniteNumber(doc?.logoHeight);
            if (!resolvedLogoUrl && hasLogo) return true;
            if ((resolvedWidth == null || resolvedHeight == null) && w != null && h != null) return true;
            return false;
          });

          if (fallbackDoc) {
            if (!resolvedLogoUrl) resolvedLogoUrl = String(fallbackDoc.logoUrl || '').trim();
            if (resolvedWidth == null) resolvedWidth = toFiniteNumber(fallbackDoc.logoWidth);
            if (resolvedHeight == null) resolvedHeight = toFiniteNumber(fallbackDoc.logoHeight);
          }
        }

        // Also check store ObjectId docs (legacy saves used Store._id instead of Firebase uid).
        if (!resolvedLogoUrl) {
          try {
            const authSeller = (await import('@/middlewares/authSeller')).default;
            const storeObjectId = await authSeller(decoded.uid);
            if (storeObjectId && String(storeObjectId) !== String(decoded.uid)) {
              const storeDoc = await NavbarMenuSettings.findOne({ storeId: String(storeObjectId) })
                .sort({ updatedAt: -1, _id: -1 })
                .lean();
              if (storeDoc?.logoUrl) {
                resolvedLogoUrl = String(storeDoc.logoUrl).trim();
                if (resolvedWidth == null) resolvedWidth = toFiniteNumber(storeDoc.logoWidth);
                if (resolvedHeight == null) resolvedHeight = toFiniteNumber(storeDoc.logoHeight);
              }
            }
          } catch {
            // Ignore seller lookup failures; fall through with whatever we have.
          }
        }

        const response = {
          enabled: settings?.enabled ?? true,
          logoUrl: resolvedLogoUrl,
          logoWidth: resolvedWidth ?? 120,
          logoHeight: resolvedHeight ?? 40,
          backgroundColor: settings?.backgroundColor || '#8f3404',
          items: settings?.items || [],
          ...pickFooterBranding(settings, resolvedLogoUrl),
        };

        console.log('[API GET /store/navbar-menu] Sending response:', {
          logoUrl: response.logoUrl || '(empty)',
          logoWidth: response.logoWidth,
          logoHeight: response.logoHeight
        });

        return NextResponse.json(response, { status: 200, headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        console.warn('[API GET /store/navbar-menu] token verify failed:', error?.message || error);
        return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    console.log('[API GET /store/navbar-menu] No auth token - fetching public settings');
    // Prefer an enabled doc that still has a logo so a newer empty save cannot blank live.
    let settings = await NavbarMenuSettings.findOne({
      enabled: true,
      logoUrl: { $exists: true, $nin: [null, ''] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!settings) {
      settings = await NavbarMenuSettings.findOne({
        enabled: true,
      })
        .sort({ updatedAt: -1 })
        .lean();
    }

    let resolvedWidth = toFiniteNumber(settings?.logoWidth);
    let resolvedHeight = toFiniteNumber(settings?.logoHeight);

    if ((resolvedWidth == null || resolvedHeight == null) && settings?.storeId) {
      const fallbackDoc = await NavbarMenuSettings.findOne({
        storeId: settings.storeId,
        logoWidth: { $exists: true },
        logoHeight: { $exists: true },
      })
        .sort({ updatedAt: -1, _id: -1 })
        .lean();
      resolvedWidth = toFiniteNumber(fallbackDoc?.logoWidth) ?? resolvedWidth;
      resolvedHeight = toFiniteNumber(fallbackDoc?.logoHeight) ?? resolvedHeight;
    }

    return NextResponse.json(
      {
        enabled: settings?.enabled ?? false,
        logoUrl: settings?.logoUrl || '',
        logoWidth: resolvedWidth ?? 120,
        logoHeight: resolvedHeight ?? 40,
        backgroundColor: settings?.backgroundColor || '#8f3404',
        items: settings?.items || [],
        ...pickFooterBranding(settings, settings?.logoUrl || ''),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      }
    );
  } catch (error) {
    console.error('[API GET /store/navbar-menu] error:', error);
    return NextResponse.json(
      {
        enabled: false,
        logoUrl: '',
        logoWidth: 120,
        logoHeight: 40,
        backgroundColor: '#8f3404',
        items: [],
        footerLogoSameAsNavbar: true,
        footerLogoUrl: '',
        footerLogoWidth: 160,
        footerLogoHeight: 40,
        resolvedFooterLogoUrl: '',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req) {
  try {
    const token = parseAuthHeader(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const userId = decoded.uid;

    await dbConnect();

    const body = await req.json();
    const {
      enabled = true,
      items = [],
      logoUrl = '',
      logoWidth,
      logoHeight,
      backgroundColor = '#8f3404',
      clearLogo = false,
      removeLogo = false,
    } = body || {};

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items format' }, { status: 400 });
    }

    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Maximum ${MAX_ITEMS} items allowed` }, { status: 400 });
    }

    const sanitizedItems = items.map((item, index) => {
      const label = (item?.label || '').trim();
      const url = (item?.url || '').trim();
      const categoryId = (item?.categoryId || '').trim();

      if (!label) {
        throw new Error(`Item ${index + 1}: Label is required`);
      }
      if (!url) {
        throw new Error(`Item ${index + 1}: URL is required`);
      }

      return { label, url, categoryId: categoryId || null };
    });

    const parsedLogoWidth = Number.parseInt(String(logoWidth), 10);
    const parsedLogoHeight = Number.parseInt(String(logoHeight), 10);

    if (!Number.isFinite(parsedLogoWidth) || !Number.isFinite(parsedLogoHeight)) {
      return NextResponse.json({ error: 'logoWidth and logoHeight must be valid numbers' }, { status: 400 });
    }

    const nextLogoWidth = Math.max(20, Math.min(400, parsedLogoWidth));
    const nextLogoHeight = Math.max(10, Math.min(200, parsedLogoHeight));
    const nextBackgroundColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(backgroundColor || '').trim())
      ? String(backgroundColor).trim()
      : '#8f3404';

    const existing = await NavbarMenuSettings.findOne({ storeId: userId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    // Also check legacy store ObjectId docs so we don't lose a logo saved under Store._id.
    let existingLogoUrl = String(existing?.logoUrl || '').trim();
    if (!existingLogoUrl) {
      try {
        const authSeller = (await import('@/middlewares/authSeller')).default;
        const storeObjectId = await authSeller(userId);
        if (storeObjectId && String(storeObjectId) !== String(userId)) {
          const legacy = await NavbarMenuSettings.findOne({ storeId: String(storeObjectId) })
            .sort({ updatedAt: -1, _id: -1 })
            .lean();
          existingLogoUrl = String(legacy?.logoUrl || '').trim();
        }
      } catch {
        // ignore
      }
    }

    const incomingLogoUrl = String(logoUrl || '').trim();
    const shouldClearLogo = Boolean(clearLogo || removeLogo);
    // Never wipe a saved logo just because the dashboard form loaded empty and user hit Save.
    const nextLogoUrl = shouldClearLogo
      ? ''
      : (incomingLogoUrl || existingLogoUrl);

    console.log('[API /store/navbar-menu POST] Saving:', {
      userId,
      logoUrl: nextLogoUrl || '(empty)',
      preservedExisting: !incomingLogoUrl && !shouldClearLogo && Boolean(existingLogoUrl),
      logoWidth: nextLogoWidth,
      logoHeight: nextLogoHeight,
    });

    await NavbarMenuSettings.findOneAndUpdate(
      { storeId: userId },
      {
        $set: {
          storeId: userId,
          enabled: !!enabled,
          logoUrl: nextLogoUrl,
          logoWidth: nextLogoWidth,
          logoHeight: nextLogoHeight,
          backgroundColor: nextBackgroundColor,
          items: sanitizedItems,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    // Backfill duplicate/legacy docs for this store so reads cannot pick stale docs.
    await NavbarMenuSettings.updateMany(
      { storeId: userId },
      {
        $set: {
          logoUrl: nextLogoUrl,
          logoWidth: nextLogoWidth,
          logoHeight: nextLogoHeight,
          backgroundColor: nextBackgroundColor,
        },
      }
    );

    let settings = await NavbarMenuSettings.findOne({ storeId: userId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();
    
    console.log('[API /store/navbar-menu POST] DB Settings after save:', {
      logoUrl: settings?.logoUrl || '(empty)',
      logoWidth: settings?.logoWidth,
      logoHeight: settings?.logoHeight
    });

    // Self-heal legacy/malformed docs that may miss explicit dimensions.
    const afterSaveWidth = toFiniteNumber(settings?.logoWidth);
    const afterSaveHeight = toFiniteNumber(settings?.logoHeight);
    if (afterSaveWidth == null || afterSaveHeight == null) {
      await NavbarMenuSettings.updateMany(
        { storeId: userId },
        {
          $set: {
            logoWidth: nextLogoWidth,
            logoHeight: nextLogoHeight,
          },
        }
      );
      settings = await NavbarMenuSettings.findOne({ storeId: userId })
        .sort({ updatedAt: -1, _id: -1 })
        .lean();
    }

    if (!settings) {
      return NextResponse.json({ error: 'Saved settings could not be reloaded' }, { status: 500 });
    }

    let finalSavedWidth = toFiniteNumber(settings?.logoWidth);
    let finalSavedHeight = toFiniteNumber(settings?.logoHeight);
    if (finalSavedWidth == null || finalSavedHeight == null) {
      await NavbarMenuSettings.updateMany(
        { storeId: userId },
        {
          $set: {
            logoWidth: nextLogoWidth,
            logoHeight: nextLogoHeight,
          },
        }
      );
      finalSavedWidth = nextLogoWidth;
      finalSavedHeight = nextLogoHeight;
    }

    return NextResponse.json(
      {
        message: 'Navbar menu updated',
        data: {
          enabled: settings.enabled,
          logoUrl: settings.logoUrl,
          logoWidth: finalSavedWidth,
          logoHeight: finalSavedHeight,
          backgroundColor: settings.backgroundColor,
          items: settings.items,
        },
        meta: {
          storeId: settings.storeId,
          updatedAt: settings.updatedAt,
          receivedLogoWidth: parsedLogoWidth,
          receivedLogoHeight: parsedLogoHeight,
          savedLogoWidth: finalSavedWidth,
          savedLogoHeight: finalSavedHeight,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API /store/navbar-menu POST] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save menu' }, { status: 500 });
  }
}
