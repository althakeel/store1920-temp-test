/**
 * Public business identity for storefront transparency & Google Merchant Center.
 * Keep these values identical in Merchant Center → Business information.
 *
 * Two addresses — never combine them:
 * - Registered office: Dubai, exactly as printed on the DED trade licence
 * - Fulfilment and returns: Sharjah warehouse
 */

import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';

export const STORE1920_LEGAL_NAME = 'ALTHAKEEL GENERAL TRADING L.L.C';
export const STORE1920_LEGAL_NAME_AR = 'الثقيل للتجارة العامة ش.ذ.م.م';
export const STORE1920_BRAND_DISPLAY = 'Store1920';

export const STORE1920_TRADE_LICENSE_NO = '641210';
export const STORE1920_COMMERCIAL_REGISTER_NO = '1994147';
export const STORE1920_DCCI_MEMBERSHIP_NO = '183989';

/**
 * Registered office street as printed on the DED Dubai trade licence.
 * Do not use the Sharjah warehouse here.
 */
export const STORE1920_REGISTERED_OFFICE_STREET = '';
export const STORE1920_REGISTERED_OFFICE_CITY = 'Dubai';
export const STORE1920_REGISTERED_OFFICE_REGION = 'Dubai';

/** Fulfilment and returns warehouse — not the registered office. */
export const STORE1920_BUSINESS_STREET =
  'Warehouse No. 1, 18 Maleha St, Industrial Area';
export const STORE1920_BUSINESS_CITY = 'Sharjah';
export const STORE1920_BUSINESS_REGION = 'Sharjah';
export const STORE1920_BUSINESS_COUNTRY = 'United Arab Emirates';
export const STORE1920_BUSINESS_COUNTRY_CODE = 'AE';

export const STORE1920_BUSINESS_HOURS_EN =
  'Sunday – Thursday, 9:00 AM – 6:00 PM (UAE time)';
export const STORE1920_BUSINESS_HOURS_AR =
  'الأحد – الخميس، 9:00 ص – 6:00 م (توقيت الإمارات)';

export const STORE1920_SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/thestore1920/',
  instagram: 'https://www.instagram.com/store1920.ae/',
  tiktok: 'https://www.tiktok.com/@thestore1920',
  pinterest: 'https://www.pinterest.com/thestore1920/',
  snapchat: 'https://www.snapchat.com/@store1920',
};

function joinAddressParts(parts) {
  return parts.filter(Boolean).join(', ');
}

export function getRegisteredOfficeLines() {
  return [
    STORE1920_REGISTERED_OFFICE_STREET,
    `${STORE1920_REGISTERED_OFFICE_CITY}, ${STORE1920_BUSINESS_COUNTRY}`,
  ].filter(Boolean);
}

export function getRegisteredOfficeSingleLine() {
  return joinAddressParts([
    STORE1920_REGISTERED_OFFICE_STREET,
    STORE1920_REGISTERED_OFFICE_CITY,
    STORE1920_BUSINESS_COUNTRY,
  ]);
}

/** Fulfilment / returns warehouse lines. */
export function getBusinessAddressLines() {
  return [
    STORE1920_BUSINESS_STREET,
    `${STORE1920_BUSINESS_CITY}, ${STORE1920_BUSINESS_COUNTRY}`,
  ];
}

export function getBusinessAddressSingleLine() {
  return `${STORE1920_BUSINESS_STREET}, ${STORE1920_BUSINESS_CITY}, ${STORE1920_BUSINESS_COUNTRY}`;
}

export const getFulfilmentAddressLines = getBusinessAddressLines;
export const getFulfilmentAddressSingleLine = getBusinessAddressSingleLine;

export function getPublicBusinessContact({ isArabic = false } = {}) {
  return {
    legalName: STORE1920_LEGAL_NAME,
    legalNameAr: STORE1920_LEGAL_NAME_AR,
    brandName: STORE1920_BRAND_DISPLAY,
    email: STORE1920_SUPPORT_EMAIL,
    phone: STORE1920_CUSTOMER_SUPPORT_PHONE,
    phoneDisplay: formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE),
    phoneTel: STORE1920_CUSTOMER_SUPPORT_TEL,
    registeredOfficeLines: getRegisteredOfficeLines(),
    registeredOfficeSingleLine: getRegisteredOfficeSingleLine(),
    addressLines: getBusinessAddressLines(),
    addressSingleLine: getBusinessAddressSingleLine(),
    fulfilmentAddressLines: getFulfilmentAddressLines(),
    fulfilmentAddressSingleLine: getFulfilmentAddressSingleLine(),
    hours: isArabic ? STORE1920_BUSINESS_HOURS_AR : STORE1920_BUSINESS_HOURS_EN,
    tradeLicenseNo: STORE1920_TRADE_LICENSE_NO,
  };
}
