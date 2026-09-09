import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';

/**
 * Warehouse app auth:
 * 1) Scanner key: header `x-warehouse-key` + env WAREHOUSE_SCANNER_API_KEY / WAREHOUSE_STORE_ID
 * 2) Seller Firebase token: Authorization Bearer (same as /store dashboard)
 */
export async function getWarehouseApiContext(request) {
  const configuredKey = String(process.env.WAREHOUSE_SCANNER_API_KEY || '').trim();
  const envStoreId = String(process.env.WAREHOUSE_STORE_ID || '').trim();
  const providedKey = String(request.headers.get('x-warehouse-key') || '').trim();

  if (configuredKey && envStoreId && providedKey && providedKey === configuredKey) {
    return {
      storeId: envStoreId,
      authType: 'warehouse_key',
      actor: {
        uid: 'warehouse-app',
        name: 'Warehouse app',
        email: '',
      },
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
    const storeId = await authSeller(decodedToken.uid, decodedToken.email);
    if (!storeId) return null;
    return {
      storeId: String(storeId),
      authType: 'seller',
      actor: {
        uid: decodedToken.uid,
        name: decodedToken.name || decodedToken.email || 'Store staff',
        email: decodedToken.email || '',
      },
      decodedToken,
    };
  } catch {
    return null;
  }
}
