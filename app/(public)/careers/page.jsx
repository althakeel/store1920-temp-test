'use client';

import Link from 'next/link';
import { Headphones, Package, ShoppingBag, Monitor, MapPin, Clock } from 'lucide-react';
import CareersForm from './CareersForm';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_BUSINESS_STREET,
  STORE1920_BUSINESS_CITY,
  STORE1920_BUSINESS_COUNTRY,
  STORE1920_BUSINESS_HOURS_EN,
  STORE1920_BUSINESS_HOURS_AR,
} from '@/lib/businessIdentity';

const PAGE_COPY = {
  en: {
    eyebrow: 'Careers',
    title: 'Work with Store1920',
    intro:
      'Store1920 is a UAE online retailer for electronics, home and lifestyle products. We are owned and operated by {legal}. If you want to help customers shop with clear prices and reliable delivery, we want to hear from you.',
    applyCta: 'Apply now',
    aboutCta: 'About us',
    whyTitle: 'Why people join us',
    reasons: [
      {
        title: 'UAE retail, real operations',
        text: 'You work on a live store that serves shoppers across all seven Emirates — from product pages to the warehouse in Sharjah.',
      },
      {
        title: 'Bilingual customer care',
        text: 'Arabic and English are part of daily work. We help residents, expats and families with orders, delivery and returns.',
      },
      {
        title: 'Clear, honest shopping',
        text: 'We keep pricing, shipping and return rules visible. The same standards apply inside the team.',
      },
      {
        title: 'Room to grow',
        text: 'A small, focused team means you see the full path: listing, checkout, fulfilment and after-sales.',
      },
    ],
    teamsTitle: 'Teams we hire into',
    teamsLead:
      'We do not always have an open vacancy. Send your details anyway if you match one of these areas. We keep strong applications on file.',
    teams: [
      {
        icon: Headphones,
        title: 'Customer support',
        text: 'Order questions, tracking, returns and replacements in Arabic and English. Calm, accurate written and phone help.',
      },
      {
        icon: Package,
        title: 'Fulfilment & warehouse',
        text: 'Pick, pack, stock checks and handover to couriers from our Sharjah warehouse. Care with products and delivery dates.',
      },
      {
        icon: ShoppingBag,
        title: 'Merchandising & catalog',
        text: 'Product information, images, pricing and category pages so shoppers can find the right item quickly.',
      },
      {
        icon: Monitor,
        title: 'Digital & store operations',
        text: 'Website, orders, payments and day-to-day store tools. You keep the customer journey working.',
      },
    ],
    processTitle: 'How we hire',
    steps: [
      { title: '1. Send your details', text: 'Use the form below. Tell us the role you want and why Store1920 is a fit.' },
      { title: '2. We review', text: 'We read applications against current and upcoming needs. This can take several working days.' },
      { title: '3. Conversation', text: 'If there is a match, we contact you by email or phone for a short call or interview.' },
      { title: '4. Next steps', text: 'We confirm role, location, hours and start date before any offer. Nothing is agreed until that is written.' },
    ],
    lookTitle: 'What we look for',
    lookItems: [
      'Clear communication in English, Arabic, or both',
      'Reliability and care with customer data and orders',
      'Comfort with online retail: products, delivery and payments',
      'Willingness to work Sunday–Thursday business hours when the role requires it',
      'UAE work authorisation for on-site warehouse or office roles',
    ],
    locationTitle: 'Location & hours',
    locationText:
      'Fulfilment is based at {street}, {city}, {country}. Some support and digital roles may be discussed as office or hybrid. Customer operations follow {hours}.',
    applyTitle: 'Send your application',
    applyLead:
      'There is no fee to apply. Do not send payment details. We will only contact you about your application.',
    contactLead: 'Questions about careers:',
    shopCta: 'Shop Store1920',
    businessCta: 'Business information',
  },
  ar: {
    eyebrow: 'الوظائف',
    title: 'اعمل مع Store1920',
    intro:
      'Store1920 متجر تجزئة إلكتروني في الإمارات للإلكترونيات والمنزل ونمط الحياة. المتجر مملوك ويُدار بواسطة {legal}. إذا كنت تريد مساعدة العملاء على التسوق بأسعار واضحة وتوصيل موثوق، نود أن نسمع منك.',
    applyCta: 'قدّم الآن',
    aboutCta: 'من نحن',
    whyTitle: 'لماذا ينضم إلينا الناس',
    reasons: [
      {
        title: 'تجزئة إماراتية وتشغيل حقيقي',
        text: 'تعمل على متجر حي يخدم المتسوقين في الإمارات السبع — من صفحات المنتجات إلى المستودع في الشارقة.',
      },
      {
        title: 'خدمة عملاء باللغتين',
        text: 'العربية والإنجليزية جزء من العمل اليومي. نساعد المقيمين والعائلات في الطلبات والتوصيل والإرجاع.',
      },
      {
        title: 'تسوق واضح وصادق',
        text: 'نبقي الأسعار والشحن وقواعد الإرجاع ظاهرة. المعايير نفسها تسري داخل الفريق.',
      },
      {
        title: 'مجال للنمو',
        text: 'فريق صغير ومركّز يعني أنك ترى المسار كاملًا: العرض والدفع والتجهيز وما بعد البيع.',
      },
    ],
    teamsTitle: 'الفرق التي نوظّف فيها',
    teamsLead:
      'قد لا تكون هناك وظيفة شاغرة الآن. أرسل بياناتك إن ناسبك أحد هذه المجالات. نحتفظ بالطلبات القوية في الملف.',
    teams: [
      {
        icon: Headphones,
        title: 'خدمة العملاء',
        text: 'أسئلة الطلبات والتتبع والإرجاع والاستبدال بالعربية والإنجليزية. مساعدة هادئة ودقيقة كتابيًا وهاتفيًا.',
      },
      {
        icon: Package,
        title: 'التجهيز والمستودع',
        text: 'الجمع والتعبئة وفحص المخزون والتسليم لشركات الشحن من مستودعنا في الشارقة.',
      },
      {
        icon: ShoppingBag,
        title: 'التصنيف والكتالوج',
        text: 'معلومات المنتجات والصور والأسعار وصفحات الفئات ليجد المتسوق المنتج بسرعة.',
      },
      {
        icon: Monitor,
        title: 'العمليات الرقمية والمتجر',
        text: 'الموقع والطلبات والمدفوعات وأدوات المتجر اليومية. تبقي رحلة العميل تعمل.',
      },
    ],
    processTitle: 'كيف نوظّف',
    steps: [
      { title: '1. أرسل بياناتك', text: 'استخدم النموذج أدناه. اذكر الدور الذي تريده ولماذا يناسبك Store1920.' },
      { title: '2. نراجع الطلب', text: 'نقرأ الطلبات مقابل الاحتياج الحالي والمقبل. قد يستغرق ذلك عدة أيام عمل.' },
      { title: '3. محادثة', text: 'إن وُجد توافق نتواصل معك بالبريد أو الهاتف لمكالمة أو مقابلة قصيرة.' },
      { title: '4. الخطوات التالية', text: 'نؤكد الدور والموقع وساعات العمل وتاريخ البدء قبل أي عرض. لا يُتفق على شيء قبل أن يُكتب.' },
    ],
    lookTitle: 'ماذا نبحث عنه',
    lookItems: [
      'تواصل واضح بالإنجليزية أو العربية أو كلتيهما',
      'الالتزام والحرص على بيانات العملاء والطلبات',
      'إلمام بتجارة التجزئة عبر الإنترنت: المنتجات والتوصيل والمدفوعات',
      'الاستعداد للعمل في ساعات الأحد–الخميس عندما يتطلب الدور ذلك',
      'تصريح عمل في الإمارات لأدوار المستودع أو المكتب',
    ],
    locationTitle: 'الموقع وساعات العمل',
    locationText:
      'التجهيز في {street}، {city}، {country}. قد تُناقش بعض أدوار الدعم والرقمنة كمكتب أو عمل هجين. عمليات العملاء تتبع {hours}.',
    applyTitle: 'أرسل طلبك',
    applyLead:
      'لا توجد رسوم للتقديم. لا ترسل بيانات دفع. سنتواصل معك فقط بشأن طلبك.',
    contactLead: 'أسئلة عن الوظائف:',
    shopCta: 'تسوق Store1920',
    businessCta: 'معلومات الأعمال',
  },
};

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export default function CareersPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? PAGE_COPY.ar : PAGE_COPY.en;
  const legal = isArabic ? STORE1920_LEGAL_NAME_AR : STORE1920_LEGAL_NAME;
  const hours = isArabic ? STORE1920_BUSINESS_HOURS_AR : STORE1920_BUSINESS_HOURS_EN;
  const phone = formatCustomerSupportPhoneDisplay();

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="w-full bg-[#f7f6f3] text-[#171717]">
      <section className="mx-auto w-full max-w-[1100px] px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E52721]">{copy.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-[#111111] sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {fill(copy.intro, { legal })}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#apply"
            className="inline-flex items-center justify-center rounded-xl bg-[#E52721] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#c41f1a]"
          >
            {copy.applyCta}
          </a>
          <Link
            href="/about-us"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            {copy.aboutCta}
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-[#111111] sm:text-3xl">{copy.whyTitle}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {copy.reasons.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-[#111111] sm:text-3xl">{copy.teamsTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{copy.teamsLead}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {copy.teams.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <Icon className="h-5 w-5 text-[#E52721]" />
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-[#111111] sm:text-3xl">{copy.processTitle}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {copy.steps.map((item) => (
            <li key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid w-full max-w-[1100px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-extrabold text-[#111111]">{copy.lookTitle}</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
            {copy.lookItems.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E52721]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-extrabold text-[#111111]">{copy.locationTitle}</h2>
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E52721]" />
            <span>
              {fill(copy.locationText, {
                street: STORE1920_BUSINESS_STREET,
                city: STORE1920_BUSINESS_CITY,
                country: STORE1920_BUSINESS_COUNTRY,
                hours,
              })}
            </span>
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Clock className="h-4 w-4 text-[#E52721]" />
            <span>{hours}</span>
          </p>
        </div>
      </section>

      <section id="apply" className="mx-auto w-full max-w-[1100px] px-4 py-8 pb-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#111111]">{copy.applyTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{copy.applyLead}</p>
            <p className="mt-6 text-sm text-slate-600">
              {copy.contactLead}{' '}
              <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="font-semibold text-[#E52721] hover:underline">
                {STORE1920_SUPPORT_EMAIL}
              </a>
              {' · '}
              <a href={`tel:${STORE1920_CUSTOMER_SUPPORT_PHONE}`} className="font-semibold text-slate-800 hover:underline">
                {phone}
              </a>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className="text-sm font-semibold text-[#E52721] hover:underline">
                {copy.shopCta}
              </Link>
              <Link href="/business-information" className="text-sm font-semibold text-slate-700 hover:underline">
                {copy.businessCta}
              </Link>
            </div>
          </div>
          <CareersForm isArabic={isArabic} />
        </div>
      </section>
    </div>
  );
}
