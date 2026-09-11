'use client';

import Link from 'next/link';
import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import {
  STORE1920_SUPPORT_EMAIL,
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_TRADE_LICENSE_NO,
  STORE1920_COMMERCIAL_REGISTER_NO,
  STORE1920_DCCI_MEMBERSHIP_NO,
  STORE1920_BUSINESS_HOURS_EN,
  STORE1920_BUSINESS_HOURS_AR,
  getRegisteredOfficeSingleLine,
  getFulfilmentAddressSingleLine,
} from '@/lib/businessIdentity';

const phoneDisplay = formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE);
const registeredOfficeLine = getRegisteredOfficeSingleLine();
const fulfilmentLine = getFulfilmentAddressSingleLine();

const PAGE_COPY = {
  en: {
    title: 'Business Information',
    intro:
      'Store1920.com is owned and operated by ALTHAKEEL GENERAL TRADING L.L.C, a UAE-licensed company. This page provides our legal business identity, registered office, fulfilment/returns address and customer-support details.',
    identityTitle: 'Business identity',
    identityText:
      `The online store Store1920 is owned and operated by ${STORE1920_LEGAL_NAME}, a Limited Liability Company licensed by the Department of Economic Development in the United Arab Emirates.`,
    licenseTitle: 'Trade license details',
    fields: [
      { label: 'Company Name', value: STORE1920_LEGAL_NAME },
      { label: 'Company Name (Arabic)', value: STORE1920_LEGAL_NAME_AR },
      { label: 'Brand / Store Name', value: 'Store1920' },
      { label: 'Legal Type', value: 'Limited Liability Company (LLC)' },
      { label: 'License No.', value: STORE1920_TRADE_LICENSE_NO },
      { label: 'Main License No.', value: STORE1920_TRADE_LICENSE_NO },
      { label: 'Commercial Register No.', value: STORE1920_COMMERCIAL_REGISTER_NO },
      { label: 'DCCI Membership No.', value: STORE1920_DCCI_MEMBERSHIP_NO },
      { label: 'License Category / Issuing Authority', value: 'Department of Economic Development (Dep. of Economic Development)' },
      { label: 'Issue Date', value: '21/06/2010' },
      { label: 'Expiry Date', value: '20/06/2027' },
      { label: 'Registered office', value: registeredOfficeLine },
      { label: 'Fulfilment and returns', value: fulfilmentLine },
      { label: 'Customer Support Phone', value: phoneDisplay },
      { label: 'Customer Support Email', value: STORE1920_SUPPORT_EMAIL },
      { label: 'Business Hours', value: STORE1920_BUSINESS_HOURS_EN },
    ],
    modelTitle: 'Business model',
    modelText:
      'We sell consumer products online through Store1920.com and deliver to customers across the UAE. Prices shown on product pages match checkout. Policies and contact details are published clearly before purchase.',
    policiesTitle: 'Policies & customer support',
    policiesIntro: 'Please review our store policies and contact details:',
    policyLinks: [
      { text: 'Terms and Conditions', path: '/terms-and-conditions' },
      { text: 'Terms of Sale', path: '/terms-of-sale' },
      { text: 'Shipping Policy', path: '/shipping-policy' },
      { text: 'Return Policy', path: '/return-policy' },
      { text: 'Privacy Policy', path: '/privacy-policy' },
      { text: 'Contact Us', path: '/contact-us' },
      { text: 'About Us', path: '/about-us' },
    ],
    contactTitle: 'Contact',
    contactLead: 'For business verification or customer support:',
  },
  ar: {
    title: 'معلومات الأعمال',
    intro:
      'Store1920.com مملوك ويُدار من قبل الثقيل للتجارة العامة ش.ذ.م.م، وهي شركة مرخصة في دولة الإمارات. تعرض هذه الصفحة الهوية القانونية للعمل، والمكتب المسجّل، وعنوان التجهيز والإرجاع، وبيانات دعم العملاء.',
    identityTitle: 'هوية النشاط التجاري',
    identityText:
      `المتجر الإلكتروني Store1920 مملوك ويُدار من قبل ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME})، وهي شركة ذات مسؤولية محدودة مرخصة من دائرة التنمية الاقتصادية في دولة الإمارات العربية المتحدة.`,
    licenseTitle: 'تفاصيل الرخصة التجارية',
    fields: [
      { label: 'اسم الشركة', value: STORE1920_LEGAL_NAME },
      { label: 'اسم الشركة (عربي)', value: STORE1920_LEGAL_NAME_AR },
      { label: 'اسم العلامة / المتجر', value: 'Store1920' },
      { label: 'الشكل القانوني', value: 'ذات مسؤولية محدودة (ش.ذ.م.م)' },
      { label: 'رقم الرخصة', value: STORE1920_TRADE_LICENSE_NO },
      { label: 'رقم الرخصة الأم', value: STORE1920_TRADE_LICENSE_NO },
      { label: 'رقم السجل التجاري', value: STORE1920_COMMERCIAL_REGISTER_NO },
      { label: 'عضوية الغرفة (DCCI)', value: STORE1920_DCCI_MEMBERSHIP_NO },
      { label: 'فئة الرخصة / جهة الإصدار', value: 'دائرة التنمية الاقتصادية' },
      { label: 'تاريخ الإصدار', value: '21/06/2010' },
      { label: 'تاريخ الانتهاء', value: '20/06/2027' },
      { label: 'المكتب المسجّل', value: registeredOfficeLine },
      { label: 'التجهيز والإرجاع', value: fulfilmentLine },
      { label: 'هاتف دعم العملاء', value: phoneDisplay },
      { label: 'البريد الإلكتروني', value: STORE1920_SUPPORT_EMAIL },
      { label: 'ساعات العمل', value: STORE1920_BUSINESS_HOURS_AR },
    ],
    modelTitle: 'نموذج العمل',
    modelText:
      'نبيع منتجات استهلاكية عبر الإنترنت من خلال Store1920.com ونقوم بالتوصيل داخل دولة الإمارات. الأسعار الظاهرة في صفحات المنتجات تطابق الدفع عند إتمام الطلب. السياسات وبيانات التواصل منشورة بوضوح قبل الشراء.',
    policiesTitle: 'السياسات ودعم العملاء',
    policiesIntro: 'يرجى الاطلاع على سياسات المتجر وبيانات التواصل:',
    policyLinks: [
      { text: 'الشروط والأحكام', path: '/terms-and-conditions' },
      { text: 'شروط البيع', path: '/terms-of-sale' },
      { text: 'سياسة الشحن', path: '/shipping-policy' },
      { text: 'سياسة الإرجاع', path: '/return-policy' },
      { text: 'سياسة الخصوصية', path: '/privacy-policy' },
      { text: 'اتصل بنا', path: '/contact-us' },
      { text: 'من نحن', path: '/about-us' },
    ],
    contactTitle: 'التواصل',
    contactLead: 'للتحقق من بيانات الشركة أو لدعم العملاء:',
  },
};

export default function BusinessInformationPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? PAGE_COPY.ar : PAGE_COPY.en;

  return (
    <PolicyPageLayout dir={isArabic ? 'rtl' : undefined}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{copy.title}</h1>
      <p className="text-gray-600 mb-8">{copy.intro}</p>

      <div className="space-y-6 border border-gray-200 rounded-xl p-6">
        <section>
          <h2 className="font-semibold text-gray-900 mb-2">{copy.identityTitle}</h2>
          <p className="text-gray-700">{copy.identityText}</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-3">{copy.licenseTitle}</h2>
          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
            {copy.fields.map((field) => (
              <div
                key={field.label}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4 bg-white even:bg-slate-50/70"
              >
                <dt className="text-sm font-medium text-gray-500">{field.label}</dt>
                <dd
                  className="text-sm font-semibold text-gray-900"
                  dir={/[\u0600-\u06FF]/.test(field.value) ? 'rtl' : undefined}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">{copy.modelTitle}</h2>
          <p className="text-gray-700">{copy.modelText}</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">{copy.policiesTitle}</h2>
          <p className="text-gray-700 mb-3">{copy.policiesIntro}</p>
          <ul className="list-disc ps-5 space-y-1 text-gray-700">
            {copy.policyLinks.map((link) => (
              <li key={link.path}>
                <Link href={link.path} className="text-[#E52721] font-medium hover:underline">
                  {link.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">{copy.contactTitle}</h2>
          <p className="text-gray-700 mb-2">{copy.contactLead}</p>
          <ul className="space-y-1 text-gray-700">
            <li>
              <strong>{isArabic ? 'الهاتف:' : 'Phone:'}</strong>{' '}
              <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-[#E52721] font-medium hover:underline">
                {phoneDisplay}
              </a>
            </li>
            <li>
              <strong>{isArabic ? 'البريد:' : 'Email:'}</strong>{' '}
              <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="text-[#E52721] font-medium hover:underline">
                {STORE1920_SUPPORT_EMAIL}
              </a>
            </li>
            <li>
              <strong>{isArabic ? 'المكتب المسجّل:' : 'Registered office:'}</strong> {registeredOfficeLine}
            </li>
            <li>
              <strong>{isArabic ? 'التجهيز والإرجاع:' : 'Fulfilment and returns:'}</strong> {fulfilmentLine}
            </li>
          </ul>
        </section>
      </div>
    </PolicyPageLayout>
  );
}
