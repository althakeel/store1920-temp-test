import { NextResponse } from 'next/server';
import authAdmin from '@/middlewares/authAdmin';
import { getAuth } from '@/lib/firebase-admin';
import { resolveDashboardAccess } from '@/lib/storeAccessControl';
import {
  ACTIVE_RECORD_FILTER,
  TRASHED_RECORD_FILTER,
} from '@/lib/storeTrashFilters';

export {
  ACTIVE_RECORD_FILTER,
  TRASHED_RECORD_FILTER,
} from '@/lib/storeTrashFilters';

export async function resolveStoreTrashActor(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const access = await resolveDashboardAccess(decodedToken.uid, decodedToken);
  if (!access.isSeller || !access.storeId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const isPlatformAdmin = Boolean(
    decodedToken.email && await authAdmin(decodedToken.uid, decodedToken.email),
  );

  return {
    storeId: String(access.storeId),
    userId: decodedToken.uid,
    userName: String(decodedToken.name || decodedToken.email || 'Store staff').trim(),
    isPlatformAdmin,
  };
}

export function buildTrashMeta(userId, userName) {
  return {
    deletedAt: new Date(),
    deletedBy: String(userId || '').trim() || null,
    deletedByName: String(userName || '').trim() || null,
  };
}

export function buildRestoreMeta() {
  return {
    deletedAt: null,
    deletedBy: null,
    deletedByName: null,
  };
}
