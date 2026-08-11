import { auth } from '@/lib/firebase';
import {
  consumeGoogleRedirectResult,
  getAuthErrorMessage,
  signInWithGooglePopup,
  signInWithGoogleRedirect,
} from '@/lib/firebaseAuthActions';

export async function verifyStoreSellerAccess(user) {
  const token = await user.getIdToken();
  const response = await fetch('/api/store/is-seller', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 503 || data?.reason === 'database-unavailable' || data?.reason === 'server-error') {
      throw new Error('Store access check failed temporarily. Please try again.');
    }
    throw new Error(data?.message || 'Store access check failed. Please try again.');
  }

  if (data.isSeller) {
    return data;
  }

  const temporaryDenial = ['missing-auth-header', 'invalid-token', 'database-unavailable', 'server-error']
    .includes(String(data?.reason || ''));
  if (temporaryDenial) {
    throw new Error('Store access check failed temporarily. Please try again.');
  }

  await auth.signOut();
  throw new Error('You do not have seller access');
}

export async function completeStoreGooglePopupSignIn({ router, onSuccess }) {
  const userCredential = await signInWithGooglePopup();
  await verifyStoreSellerAccess(userCredential.user);
  onSuccess?.();
  router.push('/store');
}

export async function completeStoreGoogleRedirectSignIn({ router, onSuccess }) {
  const result = await consumeGoogleRedirectResult();
  if (!result?.user) return false;

  await verifyStoreSellerAccess(result.user);
  onSuccess?.();
  router.push('/store');
  return true;
}

/** Store dashboard uses redirect (not popup) — works when pop-ups are blocked. */
export async function startStoreGoogleSignIn({ router, onSuccess, onError, preferPopup = false }) {
  if (!preferPopup) {
    try {
      await signInWithGoogleRedirect();
      return;
    } catch (error) {
      onError?.(getAuthErrorMessage(error, 'Sign in failed'));
      throw error;
    }
  }

  try {
    await completeStoreGooglePopupSignIn({ router, onSuccess });
  } catch (error) {
    const code = error?.code || '';
    const message = String(error?.message || '').toLowerCase();
    const shouldRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/timeout' ||
      message.includes('timed out');

    if (shouldRedirect) {
      await signInWithGoogleRedirect();
      return;
    }

    onError?.(getAuthErrorMessage(error, 'Sign in failed'));
    throw error;
  }
}
