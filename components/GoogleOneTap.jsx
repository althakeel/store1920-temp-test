'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { auth, waitForAuthReady } from '@/lib/firebase';
import { signInWithGoogleIdToken } from '@/lib/firebaseAuthActions';
import { linkGuestOrdersForCurrentUser } from '@/lib/linkGuestOrdersClient';
import { GOOGLE_ONE_TAP_DISMISS_KEY, reportLoginResult, setMfaVerified } from '@/lib/authClient';
import { pushGtmEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents';

const GSI_SCRIPT_ID = 'google-gsi-client';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** One prompt attempt per browser tab (avoids Strict Mode remount AbortErrors). */
let oneTapPromptedThisTab = false;
let gsiConsolePatched = false;

function shouldHideOnPath(pathname = '') {
  return pathname.startsWith('/store')
    || pathname.startsWith('/admin')
    || pathname.startsWith('/checkout')
    || pathname.startsWith('/api');
}

function wasRecentlyDismissed() {
  if (typeof window === 'undefined') return true;
  try {
    const at = Number(window.localStorage.getItem(GOOGLE_ONE_TAP_DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(GOOGLE_ONE_TAP_DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Next.js error overlay treats GSI FedCM console.error as app failures — mute only that noise. */
function silenceGsiFedCmNoiseLogs() {
  if (typeof window === 'undefined' || gsiConsolePatched) return;
  gsiConsolePatched = true;

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    const text = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const isGsiLogger = text.includes('GSI_LOGGER') || text.includes('[GSI_LOGGER]');
    const isFedCmNoise = (
      text.includes('FedCM get() rejects with AbortError')
      || text.includes('FedCM get() rejects with NetworkError')
      || text.includes('Error retrieving a token')
      || text.includes('signal is aborted without reason')
      || text.includes('FedCM was disabled')
      || text.includes('NetworkError: Error retrieving a token')
    );

    if (isGsiLogger && isFedCmNoise) {
      return;
    }

    originalError(...args);
  };
}

function loadGsiScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.getElementById(GSI_SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GSI load failed')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GSI load failed'));
    document.head.appendChild(script);
  });
}

/**
 * Google One Tap ("Continue as …") on the public storefront.
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth Web client ID from Firebase Google provider).
 */
export default function GoogleOneTap() {
  const pathname = usePathname();
  const clientId = String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

  useEffect(() => {
    if (!clientId) return undefined;
    if (shouldHideOnPath(pathname || '')) return undefined;
    if (wasRecentlyDismissed()) return undefined;
    if (oneTapPromptedThisTab) return undefined;
    if (typeof window === 'undefined') return undefined;

    silenceGsiFedCmNoiseLogs();

    let cancelled = false;

    const run = async () => {
      await waitForAuthReady();
      if (cancelled || auth.currentUser) return;

      try {
        await loadGsiScript();
      } catch {
        return;
      }
      if (cancelled || !window.google?.accounts?.id) return;
      if (oneTapPromptedThisTab) return;
      oneTapPromptedThisTab = true;

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          itp_support: true,
          // Prefer classic One Tap. Chrome may still try FedCM; FedCM noise is silenced above.
          use_fedcm_for_prompt: false,
          callback: async (response) => {
            const idToken = String(response?.credential || '').trim();
            if (!idToken) return;

            try {
              const result = await signInWithGoogleIdToken(idToken);
              const user = result?.user;
              if (!user) return;

              const isNewUser = user.metadata?.creationTime === user.metadata?.lastSignInTime;
              const token = await user.getIdToken();

              setMfaVerified(true);
              await reportLoginResult({
                email: user.email,
                success: true,
                idToken: token,
              }).catch(() => ({}));

              await linkGuestOrdersForCurrentUser(user, token).catch(() => null);

              if (isNewUser) {
                pushGtmEvent(
                  GTM_EVENTS.SIGN_UP,
                  { method: 'google_one_tap' },
                  gtmDedupeKey(GTM_EVENTS.SIGN_UP, user.uid),
                );
              } else {
                pushGtmEvent(
                  GTM_EVENTS.LOGIN,
                  { method: 'google_one_tap' },
                  gtmDedupeKey(GTM_EVENTS.LOGIN, user.uid),
                );
              }
            } catch (error) {
              console.warn('[GoogleOneTap] sign-in failed:', error?.message || error);
            }
          },
        });

        window.google.accounts.id.prompt((notification) => {
          if (!notification) return;
          try {
            if (notification.isDismissedMoment?.()) {
              markDismissed();
            }
            // Skipped / not displayed (FedCM network, cooldown, etc.) — not an app error.
            if (notification.isSkippedMoment?.() || notification.isNotDisplayed?.()) {
              return;
            }
          } catch {
            // Older GSI notification shapes
          }
        });
      } catch (error) {
        // FedCM/Network failures should not surface as Next.js overlay errors.
        console.warn('[GoogleOneTap] prompt unavailable:', error?.message || error);
      }
    };

    const timer = window.setTimeout(() => {
      void run();
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // Never call google.accounts.id.cancel() — it triggers GSI FedCM AbortError overlays.
    };
  }, [clientId, pathname]);

  return null;
}
