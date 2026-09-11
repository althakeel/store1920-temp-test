import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_BRAND_DISPLAY,
  getRegisteredOfficeSingleLine,
  getFulfilmentAddressSingleLine,
  STORE1920_BUSINESS_HOURS_EN,
  STORE1920_BUSINESS_HOURS_AR,
} from '@/lib/businessIdentity';

const STORE1920_WEBSITE = 'https://www.store1920.com';

export default function PolicyContactBlock({ isArabic = false }) {
  const hours = isArabic ? STORE1920_BUSINESS_HOURS_AR : STORE1920_BUSINESS_HOURS_EN;
  const phoneDisplay = formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE);
  const registeredOffice = getRegisteredOfficeSingleLine();
  const fulfilmentAddress = getFulfilmentAddressSingleLine();

  if (isArabic) {
    return (
      <section className="border-t border-gray-200 pt-4">
        <h2 className="font-semibold text-gray-900 mb-2">معلومات التواصل</h2>
        <p className="text-gray-700 mb-1">
          <strong>اسم النشاط:</strong> {STORE1920_LEGAL_NAME}
        </p>
        <p className="text-gray-700 mb-1">
          <strong>الاسم التجاري:</strong> {STORE1920_BRAND_DISPLAY}
        </p>
        <p className="text-gray-700 mb-1">
          <strong>المكتب المسجّل:</strong> {registeredOffice}
        </p>
        <p className="text-gray-700 mb-1">
          <strong>التجهيز والإرجاع:</strong> {fulfilmentAddress}
        </p>
        <p className="text-gray-700 mb-1">
          <strong>الموقع:</strong>{' '}
          <a href={STORE1920_WEBSITE} className="text-orange-600 underline">
            {STORE1920_WEBSITE}
          </a>
        </p>
        <p className="text-gray-700 mb-1">
          <strong>البريد الإلكتروني:</strong>{' '}
          <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="text-orange-600 underline">
            {STORE1920_SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-gray-700 mb-1">
          <strong>دعم العملاء:</strong>{' '}
          <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-orange-600 underline">
            {phoneDisplay}
          </a>
        </p>
        <p className="text-gray-700">
          <strong>ساعات العمل:</strong> {hours}
        </p>
      </section>
    );
  }

  return (
    <section className="border-t border-gray-200 pt-4">
      <h2 className="font-semibold text-gray-900 mb-2">Contact Information</h2>
      <p className="text-gray-700 mb-1">
        <strong>Business Name:</strong> {STORE1920_LEGAL_NAME}
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Trading as:</strong> {STORE1920_BRAND_DISPLAY}
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Registered office:</strong> {registeredOffice}
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Fulfilment and returns:</strong> {fulfilmentAddress}
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Website:</strong>{' '}
        <a href={STORE1920_WEBSITE} className="text-orange-600 underline">
          {STORE1920_WEBSITE}
        </a>
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Email:</strong>{' '}
        <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="text-orange-600 underline">
          {STORE1920_SUPPORT_EMAIL}
        </a>
      </p>
      <p className="text-gray-700 mb-1">
        <strong>Customer Support:</strong>{' '}
        <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-orange-600 underline">
          {phoneDisplay}
        </a>
      </p>
      <p className="text-gray-700">
        <strong>Business hours:</strong> {hours}
      </p>
    </section>
  );
}
