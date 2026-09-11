import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Store from "@/models/Store";
import { canAccessDashboardArea } from "@/lib/storeDashboardPermissions";
import { resolveDashboardAccess } from "@/lib/storeAccessControl";
import { getAuth } from "@/lib/firebase-admin";
import { uploadProfilePhoto } from "@/lib/profileImageStorage";
import { normalizeNewTagSettings } from "@/lib/newProductTag";
import { clearNewTagSettingsCache } from "@/lib/storeNewTagSettings";

export const runtime = "nodejs";

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

const asTrimmedString = (value) => String(value || '').trim();

async function saveUploadedProfileImage(userId, file) {
  if (!file || typeof file === 'string') {
    throw new Error('No image uploaded');
  }

  if (typeof file.size === 'number' && file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) {
    throw new Error('Uploaded image is empty');
  }

  const safeName = String(file.name || `profile_${Date.now()}.jpg`)
    .split(/[/\\]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  return uploadProfilePhoto({
    buffer,
    fileName: `${userId}_${Date.now()}_${safeName}`,
    contentType: file.type || 'image/jpeg',
  });
}

async function saveProfileImageFromBase64(userId, imageBase64 = '') {
  const value = String(imageBase64 || '').trim();
  if (!value.startsWith('data:image/')) {
    throw new Error('Invalid image data');
  }

  const [meta, data = ''] = value.split(',');
  if (!data) {
    throw new Error('Invalid image data');
  }

  const contentType = meta.match(/data:(.*?);/i)?.[1] || 'image/jpeg';
  const buffer = Buffer.from(data, 'base64');

  if (!buffer.length) {
    throw new Error('Uploaded image is empty');
  }

  if (buffer.length > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller');
  }

  return uploadProfilePhoto({
    buffer,
    fileName: `${userId}_${Date.now()}_profile.jpg`,
    contentType,
  });
}

function normalizeSmtpSection(raw = {}) {
  const portValue = Number(raw?.port);
  const port = Number.isFinite(portValue) && portValue > 0 ? portValue : 465;

  return {
    host: asTrimmedString(raw?.host),
    port,
    user: asTrimmedString(raw?.user),
    pass: asTrimmedString(raw?.pass),
    secure: raw?.secure !== undefined ? Boolean(raw.secure) : port === 465,
    fromEmail: asTrimmedString(raw?.fromEmail),
    fromName: asTrimmedString(raw?.fromName),
  };
}

function normalizeSmtpSettings(raw = {}) {
  const transactionalSource = raw?.transactional && typeof raw.transactional === 'object'
    ? raw.transactional
    : raw;
  const promotionalSource = raw?.promotional && typeof raw.promotional === 'object'
    ? raw.promotional
    : raw;

  return {
    transactional: normalizeSmtpSection(transactionalSource),
    promotional: normalizeSmtpSection(promotionalSource),
    updatedAt: new Date(),
  };
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    await dbConnect();

    const contentType = request.headers.get('content-type') || '';
    let body = {};
    let uploadedImageUrl = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') || formData.get('file');

      if (imageFile && typeof imageFile !== 'string') {
        uploadedImageUrl = await saveUploadedProfileImage(userId, imageFile);
      } else {
        return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
      }

      body = {
        name: formData.get('name') ?? undefined,
        email: formData.get('email') ?? undefined,
      };
    } else {
      body = await request.json();

      if (body?.imageBase64) {
        uploadedImageUrl = await saveProfileImageFromBase64(userId, body.imageBase64);
      }
    }

    const {
      name,
      image,
      email,
      storeName,
      storePhone,
      storeWebsite,
      storeAddress,
      storeCity,
      storeState,
      storeZip,
      storeDescription,
      businessType,
      emailNotifications,
      twoFactorEnabled,
      currencyPreference,
      smtpSettings,
      newTagSettings,
    } = body || {};

    const normalizedEmail = asTrimmedString(email).toLowerCase();
    if (normalizedEmail) {
      const existingByEmail = await User.findOne({ email: normalizedEmail }).lean();
      if (existingByEmail && String(existingByEmail._id) !== String(userId)) {
        return NextResponse.json(
          { error: `Email ${normalizedEmail} is already linked to another account.` },
          { status: 409 }
        );
      }
    }

    const normalizedImage = uploadedImageUrl || (image !== undefined ? asTrimmedString(image) : undefined);

    const userFields = {
      firebaseUid: userId,
      ...(name !== undefined ? { name: asTrimmedString(name) } : {}),
      ...(normalizedImage ? { image: normalizedImage } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(emailNotifications !== undefined ? { emailNotifications: Boolean(emailNotifications) } : {}),
      ...(twoFactorEnabled !== undefined ? { twoFactorEnabled: Boolean(twoFactorEnabled) } : {}),
    };

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      { $set: userFields, $setOnInsert: { _id: userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const access = await resolveDashboardAccess(userId, decodedToken);
    const storeId = access.storeId;

    if (storeId) {
      const hasStoreFieldUpdates = [
        storeName,
        storePhone,
        storeWebsite,
        storeAddress,
        storeCity,
        storeState,
        storeZip,
        storeDescription,
        businessType,
        currencyPreference,
        smtpSettings,
        newTagSettings,
      ].some((value) => value !== undefined);

      if (hasStoreFieldUpdates && !access.isOwner && !canAccessDashboardArea(access.permissions, 'settings', { isOwner: false })) {
        return NextResponse.json({ error: 'You do not have permission to update store settings' }, { status: 403 });
      }

      const updateStoreData = {};

      if (storeName !== undefined) updateStoreData.name = asTrimmedString(storeName);
      if (storePhone !== undefined) updateStoreData.contact = asTrimmedString(storePhone);
      if (storeWebsite !== undefined) updateStoreData.website = asTrimmedString(storeWebsite);
      if (storeAddress !== undefined) updateStoreData.address = asTrimmedString(storeAddress);
      if (storeCity !== undefined) updateStoreData.city = asTrimmedString(storeCity);
      if (storeState !== undefined) updateStoreData.state = asTrimmedString(storeState);
      if (storeZip !== undefined) updateStoreData.zip = asTrimmedString(storeZip);
      if (storeDescription !== undefined) updateStoreData.description = asTrimmedString(storeDescription);
      if (businessType !== undefined) updateStoreData.businessType = asTrimmedString(businessType);
      if (currencyPreference !== undefined) {
        updateStoreData.currencyPreference = asTrimmedString(currencyPreference) || 'AED';
      }

      if (smtpSettings && typeof smtpSettings === 'object') {
        updateStoreData.smtpSettings = normalizeSmtpSettings(smtpSettings);
      }

      if (newTagSettings && typeof newTagSettings === 'object') {
        updateStoreData.newTagSettings = normalizeNewTagSettings(newTagSettings);
      }

      if (Object.keys(updateStoreData).length > 0) {
        await Store.updateOne({ _id: storeId }, { $set: updateStoreData });
        if (updateStoreData.newTagSettings) {
          clearNewTagSettingsCache();
        }
      }
    }

    return NextResponse.json({
      message: 'Profile updated',
      profile: {
        name: updatedUser?.name || '',
        email: updatedUser?.email || decodedToken.email || '',
        image: updatedUser?.image || '',
        emailNotifications: updatedUser?.emailNotifications !== false,
        twoFactorEnabled: Boolean(updatedUser?.twoFactorEnabled),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    await dbConnect();

    const user = await User.findById(userId).lean();
    const access = await resolveDashboardAccess(userId, decodedToken);
    const store = access.store || null;

    return NextResponse.json({
      profile: {
        name: user?.name || '',
        email: user?.email || decodedToken.email || '',
        image: user?.image || '',
        emailNotifications: user?.emailNotifications !== false,
        twoFactorEnabled: Boolean(user?.twoFactorEnabled),
      },
      store: {
        storeName: store?.name || '',
        storePhone: store?.contact || '',
        storeWebsite: store?.website || '',
        storeAddress: store?.address || '',
        storeCity: store?.city || '',
        storeState: store?.state || '',
        storeZip: store?.zip || '',
        storeDescription: store?.description || '',
        businessType: store?.businessType || '',
        currencyPreference: store?.currencyPreference || 'AED',
        newTagSettings: normalizeNewTagSettings(store?.newTagSettings),
      },
      smtpSettings: {
        transactional: {
          host: store?.smtpSettings?.transactional?.host || store?.smtpSettings?.host || '',
          port: store?.smtpSettings?.transactional?.port || store?.smtpSettings?.port || 465,
          user: store?.smtpSettings?.transactional?.user || store?.smtpSettings?.user || '',
          pass: store?.smtpSettings?.transactional?.pass || store?.smtpSettings?.pass || '',
          secure:
            typeof store?.smtpSettings?.transactional?.secure === 'boolean'
              ? store.smtpSettings.transactional.secure
              : (typeof store?.smtpSettings?.secure === 'boolean' ? store.smtpSettings.secure : true),
          fromEmail: store?.smtpSettings?.transactional?.fromEmail || store?.smtpSettings?.fromEmail || '',
          fromName: store?.smtpSettings?.transactional?.fromName || store?.smtpSettings?.fromName || '',
        },
        promotional: {
          host: store?.smtpSettings?.promotional?.host || store?.smtpSettings?.host || '',
          port: store?.smtpSettings?.promotional?.port || store?.smtpSettings?.port || 465,
          user: store?.smtpSettings?.promotional?.user || store?.smtpSettings?.user || '',
          pass: store?.smtpSettings?.promotional?.pass || store?.smtpSettings?.pass || '',
          secure:
            typeof store?.smtpSettings?.promotional?.secure === 'boolean'
              ? store.smtpSettings.promotional.secure
              : (typeof store?.smtpSettings?.secure === 'boolean' ? store.smtpSettings.secure : true),
          fromEmail: store?.smtpSettings?.promotional?.fromEmail || store?.smtpSettings?.fromEmail || '',
          fromName: store?.smtpSettings?.promotional?.fromName || store?.smtpSettings?.fromName || '',
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
