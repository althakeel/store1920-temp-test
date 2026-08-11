import { useCallback, useEffect, useState } from 'react';
import { auth, waitForAuthReady } from './firebase';

function waitForCurrentUser(timeoutMs = 2500) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user || null);
    };

    const unsubscribe = auth.onAuthStateChanged((user) => finish(user));
    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
  });
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // Wait for Firebase persistence before treating the user as logged out.
    const fallback = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 12000);

    (async () => {
      await waitForAuthReady();
      if (cancelled) return;

      unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
        clearTimeout(fallback);
        if (cancelled) return;
        setUser(firebaseUser);
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  const getToken = useCallback(async (forceRefresh = false) => {
    await waitForAuthReady();
    const currentUser = auth.currentUser || await waitForCurrentUser();
    if (!currentUser) {
      return null;
    }
    try {
      return await currentUser.getIdToken(forceRefresh);
    } catch (error) {
      console.error('[useAuth] Error getting token:', error);
      try {
        return await currentUser.getIdToken(true);
      } catch (retryError) {
        console.error('[useAuth] Error refreshing token:', retryError);
        return null;
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await waitForAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    try {
      await currentUser.reload();
    } catch (error) {
      console.warn('[useAuth] Failed to reload user profile:', error);
    }
    setUser(auth.currentUser);
    return auth.currentUser;
  }, []);

  return { user, loading, getToken, refreshUser };
}
