import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_TRADE_LICENSE_NO,
  STORE1920_COMMERCIAL_REGISTER_NO,
  STORE1920_DCCI_MEMBERSHIP_NO,
  STORE1920_REGISTERED_OFFICE_STREET,
  STORE1920_REGISTERED_OFFICE_CITY,
  STORE1920_REGISTERED_OFFICE_REGION,
  STORE1920_BUSINESS_STREET,
  STORE1920_BUSINESS_CITY,
  STORE1920_BUSINESS_COUNTRY_CODE,
  STORE1920_SOCIAL_LINKS,
  getRegisteredOfficeSingleLine,
  getFulfilmentAddressSingleLine,
} from '@/lib/businessIdentity';
import { STORE1920_BRAND_NAME, STORE1920_LOGO_URL } from '@/lib/brandLogo';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_SUPPORT_EMAIL,
} from '@/lib/storeContact';
import { SITE_URL } from '@/lib/sitemapData';

export function getOrganizationJsonLd() {
  const registeredOffice = {
    '@type': 'PostalAddress',
    ...(STORE1920_REGISTERED_OFFICE_STREET
      ? { streetAddress: STORE1920_REGISTERED_OFFICE_STREET }
      : {}),
    addressLocality: STORE1920_REGISTERED_OFFICE_CITY,
    addressRegion: STORE1920_REGISTERED_OFFICE_REGION,
    addressCountry: STORE1920_BUSINESS_COUNTRY_CODE,
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: STORE1920_BRAND_NAME,
    legalName: STORE1920_LEGAL_NAME,
    alternateName: [STORE1920_LEGAL_NAME_AR, 'ALTHAKEEL GENERAL TRADING LLC', 'Store1920'],
    url: SITE_URL,
    logo: STORE1920_LOGO_URL,
    description: 'Shop electronics, gadgets, and home essentials at fair prices in the UAE.',
    identifier: [
      {
        '@type': 'PropertyValue',
        name: 'UAE Trade License Number',
        value: STORE1920_TRADE_LICENSE_NO,
      },
      {
        '@type': 'PropertyValue',
        name: 'Commercial Register Number',
        value: STORE1920_COMMERCIAL_REGISTER_NO,
      },
      {
        '@type': 'PropertyValue',
        name: 'DCCI Membership Number',
        value: STORE1920_DCCI_MEMBERSHIP_NO,
      },
    ],
    address: registeredOffice,
    location: {
      '@type': 'Place',
      name: 'Fulfilment and returns',
      address: {
        '@type': 'PostalAddress',
        streetAddress: STORE1920_BUSINESS_STREET,
        addressLocality: STORE1920_BUSINESS_CITY,
        addressRegion: STORE1920_BUSINESS_CITY,
        addressCountry: STORE1920_BUSINESS_COUNTRY_CODE,
      },
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        areaServed: 'AE',
        availableLanguage: ['en', 'ar'],
        email: STORE1920_SUPPORT_EMAIL,
        telephone: `+971-${STORE1920_CUSTOMER_SUPPORT_PHONE}`,
      },
    ],
    sameAs: [
      STORE1920_SOCIAL_LINKS.instagram,
      STORE1920_SOCIAL_LINKS.facebook,
      STORE1920_SOCIAL_LINKS.tiktok,
      STORE1920_SOCIAL_LINKS.pinterest,
      STORE1920_SOCIAL_LINKS.snapchat,
      `${SITE_URL}/business-information`,
      `${SITE_URL}/about-us`,
      `${SITE_URL}/contact-us`,
    ],
    foundingLocation: {
      '@type': 'Place',
      name: getRegisteredOfficeSingleLine(),
    },
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Fulfilment and returns',
        value: getFulfilmentAddressSingleLine(),
      },
    ],
  };
}
