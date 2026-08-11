'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  getStoredSessionId,
  setStoredSessionId,
  setMfaVerified,
} from '@/lib/authClient';
import { isAdminEmail } from '@/lib/adminEmails';
import { readSellerCache } from '@/lib/storeDashboardCache';

const HEARTBEAT_MS = 60_000;

function isDashboardPath(pathname = '') {
  return pathname.startsWith('/store') || pathname.startsWith('/admin');
}

function isStaffAccount(user) {
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  try {
    return Boolean(readSellerCache());
  } catch {
    return false;
  }
}

/**
 * Idle session timeout + session heartbeat (customer storefront only).
 * Store / admin dashboards keep Firebase persistence and are not force-signed-out.
 */
export default function AuthSessionGuard() {
  const pathname = usePathname();
  const idleTimer = useRef(null);
  const idleMsRef = useRef(30 * 60 * 1000);
  const skipForceSignOutRef = useRef(isDashboardPath(pathname));

  const clearSessionLocal = useCallback(() => {
    setStoredSessionId('');
    setMfaVerified(false);
  }, []);

  const forceSignOut = useCallback(async (reason) => {
    if (skipForceSignOutRef.current) return;
    if (isStaffAccount(auth.currentUser)) return;
    clearSessionLocal();
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined' && reason) {
      console.info('[AuthSessionGuard]', reason);
    }
  }, [clearSessionLocal]);

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!auth.currentUser) return;
    idleTimer.current = setTimeout(() => {
      void forceSignOut('Session timed out due to inactivity');
    }, idleMsRef.current);
  }, [forceSignOut]);

  useEffect(() => {
    skipForceSignOutRef.current = isDashboardPath(pathname);
    if (skipForceSignOutRef.current && idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    if (isDashboardPath(pathname)) {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      return undefined;
    }

    let heartbeat;
    let unsub = () => {};

    const onActivity = () => resetIdle();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        return;
      }

      if (isStaffAccount(user)) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        if (heartbeat) clearInterval(heartbeat);
        return;
      }

      try {
        const token = await user.getIdToken();
        const sessionId = getStoredSessionId();
        const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
        const res = await fetch(`/api/auth/sessions${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.idleMs) idleMsRef.current = data.idleMs;
        }
      } catch {
        // ignore
      }

      resetIdle();

      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(async () => {
        const current = auth.currentUser;
        if (!current) return;
        const sessionId = getStoredSessionId();
        if (!sessionId) return;
        try {
          const token = await current.getIdToken();
          const res = await fetch('/api/auth/sessions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
          });
          if (res.status === 401) {
            const data = await res.json().catch(() => ({}));
            if (data.expired) {
              await forceSignOut('Session revoked or expired');
            }
          }
        } catch {
          // ignore network blips
        }
      }, HEARTBEAT_MS);
    });

    return () => {
      unsub();
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [forceSignOut, pathname, resetIdle]);

  return null;
}
