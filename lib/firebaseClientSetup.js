export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
export const FIREBASE_AUTH_DOMAIN =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : '');

export const REQUIRED_FIREBASE_AUTHORIZED_DOMAINS = [
  'localhost',
  'store1920.com',
  'www.store1920.com',
  `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  `${FIREBASE_PROJECT_ID}.web.app`,
].filter(Boolean);

export function getFirebaseClientDiagnostics() {
  const appUrl = String(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
  ).replace(/\/+$/, '');

  return {
    projectId: FIREBASE_PROJECT_ID,
    authDomain: FIREBASE_AUTH_DOMAIN,
    appUrl,
    requiredAuthorizedDomains: REQUIRED_FIREBASE_AUTHORIZED_DOMAINS,
    firebaseConsoleAuthSettingsUrl: FIREBASE_PROJECT_ID
      ? `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`
      : null,
  };
}
