'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import PolicyContactBlock from '@/components/PolicyContactBlock';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { STORE1920_LEGAL_NAME, STORE1920_LEGAL_NAME_AR } from '@/lib/businessIdentity';
import {
  STORE1920_SUPPORT_EMAIL,
} from '@/lib/storeContact';

const TRADING_AS = `${STORE1920_LEGAL_NAME}, trading as Store1920`;

const PAGE_COPY = {
  en: {
    title: 'Warranty Policy',
    intro:
      `Warranty support for products sold on Store1920.com starts with ${TRADING_AS}. Contact Store1920 first. Do not open a claim with an unidentified third-party seller.`,
    lastUpdated: 'Last updated: 8 September 2026',
    sections: [
      {
        title: '1. Who you contact',
        paragraphs: [
          'Email support@Store1920.com or call our customer support number with your order ID, the product SKU or product page link, the serial number if the item has one, and a short description of the fault (photos or video help).',
          'We review the claim, confirm coverage for that SKU, and either resolve it ourselves or take it to the manufacturer’s authorised service process. You should not be asked to find a separate seller on your own.',
        ],
      },
      {
        title: '2. Per-SKU warranty on the product page',
        paragraphs: [
          'Warranty is published per product (SKU) on that product’s page — for example a stated period, what is covered, or “manufacturer warranty” with the brand’s term.',
          'The warranty that applies to your item is the warranty shown on the product page at the time you ordered, together with this policy. If a product page does not show a warranty period, Store1920 does not promise a fixed period for that SKU. Your statutory rights under UAE law still apply.',
        ],
      },
      {
        title: '3. Manufacturer cover',
        paragraphs: [
          'Many SKUs also include a manufacturer warranty. Store1920 remains your first contact. We help you raise and progress that claim and stay responsible for our quality and statutory obligations as the retailer who sold you the goods.',
        ],
      },
      {
        title: '4. Typical exclusions',
        paragraphs: [
          'Unless the product page or the brand’s warranty says otherwise, manufacturer cover usually excludes accidental damage, misuse, unauthorized repairs, and normal wear. Those brand terms cannot remove rights that UAE law does not allow to be excluded.',
        ],
      },
      {
        title: '5. Returns versus warranty',
        paragraphs: [
          'Damage, defects, wrong items, or incomplete orders found on delivery are handled first under the Return, Refund, Replacement & Cancellation Policy. Warranty support is for faults that appear later and are covered for that SKU.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الضمان',
    intro:
      `دعم الضمان للمنتجات المباعة على Store1920.com يبدأ مع ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME}). تواصل مع Store1920 أولًا. لا تفتح مطالبة مع بائع غير محدد من طرف ثالث.`,
    lastUpdated: 'آخر تحديث: 8 سبتمبر 2026',
    sections: [
      {
        title: '1. جهة التواصل',
        paragraphs: [
          `راسل ${STORE1920_SUPPORT_EMAIL} أو اتصل برقم الدعم مع رقم الطلب ورمز المنتج (SKU) أو رابط صفحة المنتج والرقم التسلسلي إن وُجد ووصفًا مختصرًا للعطل (الصور أو الفيديو تساعد).`,
          'نراجع المطالبة ونؤكد التغطية لذلك المنتج، ثم نعالجها أو نرفعها إلى مسار الخدمة المعتمد للشركة المصنعة. لا يُطلب منك البحث عن بائع منفصل بنفسك.',
        ],
      },
      {
        title: '2. ضمان كل منتج على صفحته',
        paragraphs: [
          'يُنشر الضمان لكل منتج (SKU) على صفحة ذلك المنتج — مثل المدة أو نطاق التغطية أو «ضمان الشركة المصنعة» مع مدة العلامة.',
          'الضمان الذي يسري على منتجك هو الضمان الظاهر على صفحة المنتج وقت الطلب، مع هذه السياسة. إذا لم تظهر مدة ضمان على الصفحة، لا تعد Store1920 بمدة ثابتة لذلك المنتج. تبقى حقوقك النظامية بموجب قوانين دولة الإمارات.',
        ],
      },
      {
        title: '3. ضمان الشركة المصنعة',
        paragraphs: [
          'تشمل منتجات كثيرة ضمان الشركة المصنعة أيضًا. تبقى Store1920 جهة التواصل الأولى. نساعدك في رفع المطالبة ومتابعتها، ونبقى مسؤولين عن التزامات الجودة والحقوق النظامية بصفتنا بائع التجزئة الذي باعك المنتج.',
        ],
      },
      {
        title: '4. الاستثناءات المعتادة',
        paragraphs: [
          'ما لم تنص صفحة المنتج أو ضمان العلامة على خلاف ذلك، يستثني ضمان الشركة المصنعة عادةً التلف العرضي وسوء الاستخدام والإصلاح غير المصرّح به والبلى الطبيعي. ولا تسقط تلك الشروط أي حق لا يجوز استبعاده بموجب قوانين دولة الإمارات.',
        ],
      },
      {
        title: '5. الإرجاع والضمان',
        paragraphs: [
          'التلف أو العيب أو المنتج الخاطئ أو الطلب الناقص عند التسليم يُعالج أولًا وفق سياسة الإرجاع والاسترداد والاستبدال والإلغاء. دعم الضمان للأعطال التي تظهر لاحقًا وتكون مشمولة لذلك المنتج.',
        ],
      },
    ],
  },
};

export default function WarrantyPolicyPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? PAGE_COPY.ar : PAGE_COPY.en;

  return (
    <PolicyPageLayout dir={isArabic ? 'rtl' : undefined}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{copy.title}</h1>
      <p className="text-gray-600 mb-2">{copy.intro}</p>
      <p className="text-xs text-gray-500 mb-8">{copy.lastUpdated}</p>

      <div className="space-y-6 border border-gray-200 rounded-xl p-6">
        {copy.sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-semibold text-gray-900 mb-2">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-gray-700 mt-2 first:mt-0">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <div className="mt-6 border border-gray-200 rounded-xl p-6">
        <PolicyContactBlock isArabic={isArabic} />
      </div>
    </PolicyPageLayout>
  );
}
