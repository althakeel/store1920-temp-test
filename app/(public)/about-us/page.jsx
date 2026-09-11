'use client';

import Link from 'next/link';
import Image from '@/components/SafeNextImage';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_SUPPORT_EMAIL,
} from '@/lib/storeContact';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_TRADE_LICENSE_NO,
} from '@/lib/businessIdentity';
import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';

const PAGE_COPY = {
  en: {
    brand: 'Store1920',
    headline: 'Smart living.\nSmarter prices.',
    support:
      'Store1920 is a UAE online retailer offering electronics, home, and lifestyle essentials at competitive prices with fast delivery on eligible items.',
    ctaShop: 'Shop now',
    ctaBusiness: 'Business information',
    whoEyebrow: 'Who we are',
    whoTitle: 'Built in the UAE for everyday shoppers',
    whoLead:
      'Store1920 is your go-to online destination in the UAE for quality electronics, gadgets, and home essentials — all at prices that make sense.',
    whoP1: `Store1920 is owned and operated by ${STORE1920_LEGAL_NAME} (${STORE1920_LEGAL_NAME_AR}), a UAE Limited Liability Company licensed by the Department of Economic Development (License No. ${STORE1920_TRADE_LICENSE_NO}).`,
    whoP2:
      'We were founded on a simple belief: everyone deserves great products without overpaying. Whether you are upgrading your setup, finding a gift, or buying something that just works — we handpick it, price it fairly, and deliver it to your door.',
    whoP3Prefix: 'Full trade license and company details are on our',
    whoP3Link: 'Business Information',
    whoP3Suffix: `page, including our Dubai registered office, Sharjah fulfilment and returns address, phone ${STORE1920_CUSTOMER_SUPPORT_PHONE}, and email ${STORE1920_SUPPORT_EMAIL}.`,
    offerEyebrow: 'What we offer',
    offerTitle: 'Two clear collections. No clutter.',
    offerElectronicsTitle: 'Electronics & gadgets',
    offerElectronicsText:
      'Smart devices, personal tech, and tools that make daily life more efficient — selected for quality and value.',
    offerHomeTitle: 'Home living',
    offerHomeText:
      'Practical, well-designed essentials that turn any space into a comfortable, functional home.',
    offerFoot:
      'Every item is chosen for relevance to life in the UAE. No filler — just products worth buying.',
    whyEyebrow: 'Why shop with us',
    whyTitle: 'Honest shopping, from cart to doorstep',
    reasons: [
      {
        title: 'Honest pricing',
        text: 'Transparent, competitive prices for residents, expats, and families across the UAE.',
      },
      {
        title: 'Fast UAE delivery',
        text: 'Quick shipping across all Emirates, with Cash on Delivery so you pay when it arrives.',
      },
      {
        title: 'Curated quality',
        text: 'We do not list everything. We stock what we believe in — and what customers reorder.',
      },
      {
        title: 'Eligible returns',
        text: '7-day returns on eligible unused items. Free return shipping for wrong, damaged, defective or not-as-described items. Change-of-mind return shipping is paid by you at the disclosed cost. Support is available in Arabic and English.',
      },
    ],
    closeTitle: 'Shop smart. Live better.',
    closeText:
      'Join thousands of UAE shoppers who trust Store1920 for electronics and home needs — great products, fair prices, delivered to your door.',
    closeCta: 'Browse the store',
  },
  ar: {
    brand: 'Store1920',
    headline: 'حياة أذكى.\nبأسعار أوضح.',
    support:
      'Store1920 متجر تجزئة إلكتروني في الإمارات يقدّم الإلكترونيات ومستلزمات المنزل ونمط الحياة بأسعار تنافسية مع توصيل سريع للمنتجات المؤهلة.',
    ctaShop: 'تسوق الآن',
    ctaBusiness: 'معلومات الأعمال',
    whoEyebrow: 'من نحن',
    whoTitle: 'متجر إماراتي لصاحب التسوق اليومي',
    whoLead:
      'Store1920 وجهتك في الإمارات للإلكترونيات والأجهزة ومستلزمات المنزل بجودة موثوقة وأسعار منطقية.',
    whoP1: `Store1920 مملوك ويُدار من قبل ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME})، وهي شركة ذات مسؤولية محدودة مرخصة من دائرة التنمية الاقتصادية (رقم الرخصة ${STORE1920_TRADE_LICENSE_NO}).`,
    whoP2:
      'تأسسنا على قناعة بسيطة: يستحق الجميع منتجات جيدة دون دفع مبالغ زائدة. سواء كنت تحدّث أجهزتك أو تبحث عن هدية أو عن منتج يعمل كما يجب — نختاره بعناية ونسعّره بعدل ونوصله إلى بابك.',
    whoP3Prefix: 'تفاصيل الرخصة والشركة كاملة على صفحة',
    whoP3Link: 'معلومات الأعمال',
    whoP3Suffix: `، وتشمل المكتب المسجّل في دبي، وعنوان التجهيز والإرجاع في الشارقة، والهاتف ${STORE1920_CUSTOMER_SUPPORT_PHONE}، والبريد ${STORE1920_SUPPORT_EMAIL}.`,
    offerEyebrow: 'ماذا نقدّم',
    offerTitle: 'مجموعتان واضحتان. بلا فوضى.',
    offerElectronicsTitle: 'إلكترونيات وأجهزة',
    offerElectronicsText:
      'أجهزة ذكية وتقنية شخصية وأدوات تسهّل يومك — مختارة للجودة والقيمة.',
    offerHomeTitle: 'مستلزمات المنزل',
    offerHomeText:
      'منتجات عملية بتصميم جيد تحوّل أي مساحة إلى منزل مريح وعملي.',
    offerFoot:
      'كل منتج يُختار ليلائم الحياة في الإمارات. بلا حشو — فقط ما يستحق الشراء.',
    whyEyebrow: 'لماذا تتسوق معنا',
    whyTitle: 'تسوق صادق من السلة إلى باب المنزل',
    reasons: [
      {
        title: 'أسعار شفافة',
        text: 'أسعار واضحة وتنافسية للمقيمين والزائرين والعائلات في كل الإمارات.',
      },
      {
        title: 'توصيل سريع داخل الإمارات',
        text: 'شحن سريع لكل الإمارات، مع الدفع عند الاستلام إن رغبت.',
      },
      {
        title: 'جودة مختارة',
        text: 'لا نعرض كل شيء. نختار ما نثق به — وما يعود إليه عملاؤنا.',
      },
      {
        title: 'إرجاع وفق السياسة',
        text: 'إرجاع خلال 7 أيام للمنتجات غير المستخدمة المؤهلة. شحن إرجاع مجاني للمنتج الخاطئ أو التالف أو المعيب أو غير المطابق للوصف. شحن إرجاع تغيير الرأي يدفعه العميل بالتكلفة المُفصح عنها. الدعم متاح بالعربية والإنجليزية.',
      },
    ],
    closeTitle: 'تسوق بذكاء. عش أفضل.',
    closeText:
      'انضم إلى آلاف المتسوقين في الإمارات الذين يثقون بـ Store1920 للإلكترونيات والمنزل — منتجات جيدة، أسعار عادلة، وتوصيل إلى بابك.',
    closeCta: 'تصفح المتجر',
  },
};

export default function AboutUsPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? PAGE_COPY.ar : PAGE_COPY.en;

  return (
    <div
      dir={isArabic ? 'rtl' : 'ltr'}
      className="about-us-page w-full bg-[#f7f6f3] text-[#171717]"
    >
      <section className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
              <div className="mb-6 flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111111]">
                  <Image
                    src={STORE1920_LOGO_PATH}
                    alt="Store1920"
                    width={96}
                    height={32}
                    className="h-6 w-auto object-contain brightness-0 invert"
                    priority
                  />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {copy.brand}
                </span>
              </div>
              <h1 className="whitespace-pre-line text-4xl font-extrabold leading-[1.05] tracking-tight text-[#111111] sm:text-5xl lg:text-6xl">
                <bdi>{copy.headline}</bdi>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {copy.support}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl bg-[#E52721] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#c41f1a]"
                >
                  {copy.ctaShop}
                </Link>
                <Link
                  href="/business-information"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  {copy.ctaBusiness}
                </Link>
              </div>
            </div>
            <div className="relative min-h-[220px] bg-[#111111] px-6 py-10 text-white sm:px-10 lg:min-h-full lg:py-14">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(160deg, #1a1a1a 0%, #111111 48%, #3b0d0c 100%)',
                }}
              />
              <div className="relative flex h-full flex-col justify-end">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                  UAE
                </p>
                <p className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">
                  {copy.whoTitle}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                  {copy.whoLead}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E52721]">{copy.whoEyebrow}</p>
        <div className="mt-4 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#111111] sm:text-4xl">
            {copy.whoTitle}
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-slate-600">
            <p>{copy.whoP1}</p>
            <p>{copy.whoP2}</p>
            <p>
              {copy.whoP3Prefix}{' '}
              <Link
                href="/business-information"
                className="font-semibold text-[#E52721] underline-offset-4 hover:underline"
              >
                {copy.whoP3Link}
              </Link>{' '}
              {copy.whoP3Suffix}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E52721]">{copy.offerEyebrow}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#111111] sm:text-4xl">
          {copy.offerTitle}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#111111]">{copy.offerElectronicsTitle}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{copy.offerElectronicsText}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#111111]">{copy.offerHomeTitle}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{copy.offerHomeText}</p>
          </article>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-500">{copy.offerFoot}</p>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:pb-16 sm:py-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E52721]">{copy.whyEyebrow}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#111111] sm:text-4xl">
          {copy.whyTitle}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {copy.reasons.map((reason, index) => (
            <li key={reason.title} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <span className="text-xs font-semibold tracking-widest text-[#E52721]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-lg font-bold text-[#111111]">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{reason.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#111111] sm:text-4xl">
              {copy.closeTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{copy.closeText}</p>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#111111] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#E52721]"
          >
            {copy.closeCta}
          </Link>
        </div>
      </section>
    </div>
  );
}
