export const STOREFRONT_LANGUAGE_KEY = 'storefrontLanguage';
export const STOREFRONT_LANGUAGE_USER_CHOSEN_KEY = 'storefrontLanguageUserChosen';
export const STOREFRONT_LANGUAGE_COOKIE = 'storefrontLanguage';
export const STOREFRONT_LANGUAGE_EVENT = 'storefront-language-change';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const ARABIC_LANGUAGE_PATTERN = /(^|,|;)\s*ar(?:-|;|,|$)/i;
const BROWSER_ARABIC_PATTERN = /^ar(?:-|$)/i;

export function normalizeStorefrontLanguage(language) {
  return language === 'ar' ? 'ar' : 'en';
}

export function detectLanguageFromAcceptLanguage(acceptLanguage = '') {
  return ARABIC_LANGUAGE_PATTERN.test(String(acceptLanguage || '')) ? 'ar' : 'en';
}

export function browserPrefersArabic() {
  if (typeof window === 'undefined') return false;

  const browserLanguages = Array.isArray(window.navigator?.languages) && window.navigator.languages.length > 0
    ? window.navigator.languages
    : [window.navigator?.language || ''];

  return browserLanguages.some((entry) => BROWSER_ARABIC_PATTERN.test(String(entry || '')));
}

export function userExplicitlyChoseStorefrontLanguage() {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(STOREFRONT_LANGUAGE_USER_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

function readCookieLanguage() {
  if (typeof document === 'undefined') return null;

  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${STOREFRONT_LANGUAGE_COOKIE}=([^;]+)`));
  const cookieValue = cookieMatch?.[1];
  return cookieValue === 'ar' || cookieValue === 'en' ? cookieValue : null;
}

function readStoredLanguage() {
  if (typeof window === 'undefined') return null;

  try {
    const savedLanguage = window.localStorage.getItem(STOREFRONT_LANGUAGE_KEY);
    return savedLanguage === 'ar' || savedLanguage === 'en' ? savedLanguage : null;
  } catch {
    return null;
  }
}

export function resolveStorefrontLanguage(request) {
  const cookieValue = request?.cookies?.get?.(STOREFRONT_LANGUAGE_COOKIE)?.value;
  if (cookieValue === 'ar' || cookieValue === 'en') {
    return cookieValue;
  }

  const acceptLanguage = request?.headers?.get?.('accept-language') || '';
  return detectLanguageFromAcceptLanguage(acceptLanguage);
}

export function localizeField(record, fieldName, language = 'en') {
  if (!record) return '';

  const arabicFieldName = `${fieldName}Ar`;
  if (language === 'ar' && hasText(record[arabicFieldName])) {
    return record[arabicFieldName];
  }

  return record[fieldName] ?? '';
}

export function localizeRecord(record, language = 'en', fields = []) {
  if (!record || language !== 'ar') return record;

  const localizedRecord = { ...record };
  for (const fieldName of fields) {
    const arabicFieldName = `${fieldName}Ar`;
    if (hasText(record[arabicFieldName])) {
      localizedRecord[fieldName] = record[arabicFieldName];
    }
  }

  return localizedRecord;
}

export function buildStorefrontLanguageCookie(language) {
  const safeLanguage = normalizeStorefrontLanguage(language);
  return `${STOREFRONT_LANGUAGE_COOKIE}=${safeLanguage}; path=/; max-age=31536000; SameSite=Lax`;
}

export function readPersistedStorefrontLanguage(fallback = 'en') {
  if (typeof window === 'undefined') {
    return normalizeStorefrontLanguage(fallback);
  }

  const cookieLanguage = readCookieLanguage();
  const storedLanguage = readStoredLanguage();

  // Cookie/localStorage always win. Browser Arabic is only a first-visit default.
  // Previously an Arabic browser ignored a saved English cookie unless the user
  // had clicked the switcher, so EN/AR could snap back or stay mixed.
  if (cookieLanguage) return cookieLanguage;
  if (storedLanguage) return storedLanguage;
  if (browserPrefersArabic()) return 'ar';

  return normalizeStorefrontLanguage(fallback);
}

export function persistStorefrontLanguage(language, { userChosen = false, dispatchEvent = true } = {}) {
  if (typeof window === 'undefined') return normalizeStorefrontLanguage(language);

  const safeLanguage = normalizeStorefrontLanguage(language);
  const isArabic = safeLanguage === 'ar';

  try {
    window.localStorage.setItem(STOREFRONT_LANGUAGE_KEY, safeLanguage);
    if (userChosen) {
      window.localStorage.setItem(STOREFRONT_LANGUAGE_USER_CHOSEN_KEY, '1');
    }
  } catch {
    // Ignore storage write failures.
  }

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', isArabic ? 'ar' : 'en');
    document.documentElement.setAttribute('dir', isArabic ? 'rtl' : 'ltr');
    document.cookie = buildStorefrontLanguageCookie(safeLanguage);
  }

  if (dispatchEvent) {
    window.dispatchEvent(new CustomEvent(STOREFRONT_LANGUAGE_EVENT, {
      detail: { language: safeLanguage },
    }));
  }

  return safeLanguage;
}

export function getStorefrontLanguageInitScript() {
  return `(function(){try{var LANG_KEY='${STOREFRONT_LANGUAGE_KEY}';var COOKIE_NAME='${STOREFRONT_LANGUAGE_COOKIE}';var match=document.cookie.match(new RegExp('(?:^|; )'+COOKIE_NAME+'=([^;]+)'));var saved=localStorage.getItem(LANG_KEY);var language='en';if(match&&(match[1]==='ar'||match[1]==='en')){language=match[1];}else if(saved==='ar'||saved==='en'){language=saved;}else{var langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']);if(langs.some(function(l){return /^ar(?:-|$)/i.test(String(l||''));})){language='ar';}}var isArabic=language==='ar';document.documentElement.setAttribute('lang',isArabic?'ar':'en');document.documentElement.setAttribute('dir',isArabic?'rtl':'ltr');localStorage.setItem(LANG_KEY,language);document.cookie=COOKIE_NAME+'='+language+'; path=/; max-age=31536000; SameSite=Lax';}catch(e){}})();`;
}
