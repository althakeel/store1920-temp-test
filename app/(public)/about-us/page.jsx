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
      'UAE-based shopping for electronics, gadgets, and home essentials — chosen carefully and priced for everyday life.',
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
    whoP3Suffix: `page, including our Sharjah fulfilment address, phone ${STORE1920_CUSTOMER_SUPPORT_PHONE}, and email ${STORE1920_SUPPORT_EMAIL}.`,
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
        title: 'Customer first',
        text: 'Easy returns and support in Arabic and English. Your satisfaction is the priority.',
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
      'متجر إلكتروني في الإمارات للإلكترونيات والأجهزة ومستلزمات المنزل — منتجات مختارة بعناية وبأسعار تناسب الحياة اليومية.',
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
    whoP3Suffix: `، وتشمل عنوان المستودع في الشارقة، والهاتف ${STORE1920_CUSTOMER_SUPPORT_PHONE}، والبريد ${STORE1920_SUPPORT_EMAIL}.`,
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
        title: 'العميل أولاً',
        text: 'إرجاع سهل ودعم بالعربية والإنجليزية. رضاك هو الأولوية.',
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
      className="about-us-page w-full overflow-x-clip bg-[#f3eee6] text-[#1a1c1e]"
      style={{ fontFamily: 'Poppins, Montserrat, sans-serif' }}
    >
      <style jsx>{`
        .about-us-page {
          --ink: #1a1c1e;
          --sand: #f3eee6;
          --clay: #d8cfc2;
          --accent: #e52721;
          --accent-deep: #b81d18;
          --mist: rgba(255, 255, 255, 0.08);
        }

        @keyframes aboutRise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes aboutDrift {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(12px, -18px, 0);
          }
        }

        @keyframes aboutLine {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .about-rise {
          animation: aboutRise 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .about-rise-delay-1 {
          animation-delay: 0.12s;
        }

        .about-rise-delay-2 {
          animation-delay: 0.24s;
        }

        .about-rise-delay-3 {
          animation-delay: 0.36s;
        }

        .about-drift {
          animation: aboutDrift 14s ease-in-out infinite alternate;
        }

        .about-line {
          transform-origin: ${isArabic ? 'right' : 'left'} center;
          animation: aboutLine 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
        }

        @media (prefers-reduced-motion: reduce) {
          .about-rise,
          .about-drift,
          .about-line {
            animation: none !important;
          }
        }
      `}</style>

      {/* Hero — one composition, brand first, full-bleed */}
      <section className="relative isolate min-h-[min(92vh,860px)] overflow-hidden bg-[#141618] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% 20%, rgba(229,39,33,0.28), transparent 55%), radial-gradient(ellipse 70% 50% at 10% 80%, rgba(216,207,194,0.16), transparent 50%), linear-gradient(165deg, #101214 0%, #1c1f24 48%, #2a211f 100%)',
          }}
        />
        <div
          aria-hidden
          className="about-drift pointer-events-none absolute -end-24 -top-24 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(229,39,33,0.45), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
          }}
        />

        <div className="relative z-10 mx-auto flex min-h-[min(92vh,860px)] w-full max-w-[1450px] flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:pb-24">
          <div className="about-rise max-w-3xl">
            <div className="mb-6 flex items-center gap-3">
              <Image
                src={STORE1920_LOGO_PATH}
                alt="Store1920"
                width={160}
                height={48}
                className="h-10 w-auto object-contain brightness-0 invert sm:h-12"
                priority
              />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/55">
              {copy.brand}
            </p>
            <h1 className="mt-4 whitespace-pre-line text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-7xl">
              {copy.headline}
            </h1>
            <div className="about-line mt-6 h-[3px] w-24 bg-[#E52721]" />
          </div>

          <p className="about-rise about-rise-delay-1 mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            {copy.support}
          </p>

          <div className="about-rise about-rise-delay-2 mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-[#E52721] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#C41F1A]"
            >
              {copy.ctaShop}
            </Link>
            <Link
              href="/business-information"
              className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/45 hover:bg-white/10"
            >
              {copy.ctaBusiness}
            </Link>
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section className="mx-auto w-full max-w-[1450px] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E52721]">
              {copy.whoEyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#1a1c1e] sm:text-4xl">
              {copy.whoTitle}
            </h2>
          </div>
          <div className="space-y-5 text-base leading-relaxed text-[#3d4148] sm:text-lg">
            <p className="text-lg font-medium text-[#1a1c1e] sm:text-xl">{copy.whoLead}</p>
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

      {/* What we offer */}
      <section className="border-y border-[#d8cfc2]/80 bg-[#ebe4da]">
        <div className="mx-auto w-full max-w-[1450px] px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E52721]">
            {copy.offerEyebrow}
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#1a1c1e] sm:text-4xl">
            {copy.offerTitle}
          </h2>

          <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-14">
            <div className="border-s-2 border-[#E52721] ps-5">
              <h3 className="text-xl font-bold text-[#1a1c1e]">{copy.offerElectronicsTitle}</h3>
              <p className="mt-3 text-base leading-relaxed text-[#3d4148]">
                {copy.offerElectronicsText}
              </p>
            </div>
            <div className="border-s-2 border-[#1a1c1e]/25 ps-5">
              <h3 className="text-xl font-bold text-[#1a1c1e]">{copy.offerHomeTitle}</h3>
              <p className="mt-3 text-base leading-relaxed text-[#3d4148]">
                {copy.offerHomeText}
              </p>
            </div>
          </div>

          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-[#5a5f68] sm:text-base">
            {copy.offerFoot}
          </p>
        </div>
      </section>

      {/* Why shop */}
      <section className="mx-auto w-full max-w-[1450px] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E52721]">
          {copy.whyEyebrow}
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#1a1c1e] sm:text-4xl">
          {copy.whyTitle}
        </h2>

        <ol className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {copy.reasons.map((reason, index) => (
            <li key={reason.title} className="relative">
              <span className="block font-mono text-sm font-semibold tracking-widest text-[#E52721]/80">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-xl font-bold text-[#1a1c1e]">{reason.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#3d4148]">{reason.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden bg-[#141618] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(229,39,33,0.22), transparent 55%), linear-gradient(120deg, #141618, #1f1716)',
          }}
        />
        <div className="relative mx-auto flex w-full max-w-[1450px] flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              {copy.closeTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              {copy.closeText}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#141618] transition hover:bg-[#f3eee6]"
          >
            {copy.closeCta}
          </Link>
        </div>
      </section>
    </div>
  );
}
