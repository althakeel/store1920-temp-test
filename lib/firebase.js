// lib/firebase.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";

// COMPAT IMPORT for OTP + Recaptcha
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { FIREBASE_AUTH_DOMAIN } from "./firebaseClientSetup";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missingFirebaseEnv = Object.entries({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
}).filter(([, value]) => !value);

if (missingFirebaseEnv.length) {
  throw new Error(
    `Missing Firebase client env vars: ${missingFirebaseEnv.map(([key]) => key).join(", ")}. `
    + 'On production hosting (AWS/Vercel), set all NEXT_PUBLIC_FIREBASE_* values before running npm run build.'
  );
}

// ------------------------------
// Initialize modular app
// ------------------------------
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Modular Auth
export const auth = getAuth(app);

let authReadyPromise = null;

/**
 * Wait until Firebase has restored the persisted user.
 * Do NOT call setPersistence here — Firebase signs the user out and back in
 * whenever persistence is re-applied, which looks like a logout on every refresh.
 */
export function waitForAuthReady() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }

  return authReadyPromise;
}

/** Call only when signing in, so the session survives browser restarts. */
export async function ensureLocalAuthPersistence() {
  if (typeof window === "undefined") return;
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("[firebase] Failed to set auth persistence:", error);
  }
}

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Facebook Auth Provider
export const facebookProvider = new FacebookAuthProvider();
facebookProvider.setCustomParameters({ display: "popup" });

// Apple Auth Provider (Sign in with Apple)
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// ------------------------------
// Initialize COMPAT Firebase (required for RecaptchaVerifier + OTP)
// ------------------------------
if (typeof window !== "undefined") {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  window.firebase = firebase;
}

export function getCompatAuth() {
  if (typeof window === "undefined") return null;
  return firebase.apps.length ? firebase.auth() : null;
}

// ------------------------------
// Recaptcha Verifier Helper
// ------------------------------
export const getRecaptchaVerifier = () => {
  if (typeof window === "undefined") return null;

  const compatAuth = getCompatAuth();
  if (!compatAuth) return null;

  return new compatAuth.RecaptchaVerifier(
    "recaptcha-container",
    { size: "invisible" },
    compatAuth
  );
};

export default app;
