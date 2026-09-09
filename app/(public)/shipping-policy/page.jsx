'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import PolicyContactBlock from '@/components/PolicyContactBlock';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_BUSINESS_HOURS_EN,
  STORE1920_BUSINESS_HOURS_AR,
} from '@/lib/businessIdentity';

const TRADING_AS = `${STORE1920_LEGAL_NAME}, trading as Store1920`;

const PAGE_COPY = {
  en: {
    title: 'Shipping & Delivery Policy',
    intro:
      `This is the single shipping and delivery policy for orders placed on Store1920.com by ${TRADING_AS}. It covers processing cut-offs, delivery estimates, fees, delivery attempts, and remote-area rules inside the United Arab Emirates.`,
    lastUpdated: 'Last updated: 8 September 2026',
    sections: [
      {
        title: '1. Where we deliver',
        paragraphs: [
          'We deliver across the United Arab Emirates only. International shipping is not available.',
        ],
      },
      {
        title: '2. Processing cut-off and business days',
        paragraphs: [
          `Our fulfilment hours are ${STORE1920_BUSINESS_HOURS_EN}. Business days are Sunday to Thursday, excluding UAE public holidays.`,
          'The daily order cut-off is 6:00 PM UAE time on a business day. Orders confirmed before the cut-off enter processing that business day. Orders confirmed after 6:00 PM, or on Friday, Saturday, or a public holiday, enter processing on the next business day.',
        ],
      },
      {
        title: '3. Processing time',
        paragraphs: [
          'Most in-stock orders are processed within 1–2 business days after they enter processing. Peak periods, promotions, or stock checks can add time. We will contact you if processing will be delayed.',
        ],
      },
      {
        title: '4. Delivery estimates after dispatch',
        paragraphs: [
          'These transit times start after the order is dispatched, not from the moment you place it. The estimate shown at checkout for the shipping method you select is the estimate that applies to that order.',
        ],
        bullets: [
          'Standard delivery: typically 2–5 business days after dispatch',
          'Express / next-day (Fast Delivery): eligible in-stock items ordered before 2:00 PM on a working day, where offered for your address. After 2:00 PM the order is processed on the following working day. Full rules are on the Fast Delivery page',
          'Remote or outlying areas: typically 1–3 extra business days after the standard or express estimate',
        ],
      },
      {
        title: '5. Shipping fees',
        paragraphs: [
          'All shipping fees that apply to your order are shown at checkout before you pay. Fees can include a standard or express charge, a Cash on Delivery fee, weight-based charges, and location charges.',
          'Free shipping applies only when checkout shows it — for example when an offer, product, or order total qualifies. If a fee is not shown at checkout, it is not added later except for a failed-delivery reattempt described below.',
        ],
      },
      {
        title: '6. Remote and outlying areas',
        paragraphs: [
          'Addresses outside main city coverage may take longer and may have a higher shipping fee or limited options (including COD or express). Any extra time or fee is shown at checkout when we can identify the area from your address. If a courier later classifies the address as remote after dispatch, we will contact you before charging any extra fee.',
        ],
      },
      {
        title: '7. Delivery attempts',
        paragraphs: [
          'The courier will attempt delivery up to two times. Please keep your phone available and make sure someone can receive the parcel.',
          'If both attempts fail because no one is available or the address or contact details are wrong, the parcel may be returned to our warehouse. A further delivery may require an extra fee, which we will confirm with you first. You may also arrange collection with support.',
        ],
      },
      {
        title: '8. Tracking',
        paragraphs: [
          'When the order is dispatched, we share tracking by SMS or email. You can also track the order from My Orders on Store1920.com.',
        ],
      },
      {
        title: '9. Address and contact details',
        paragraphs: [
          'You are responsible for an accurate delivery address and phone number at checkout. We are not responsible for failed delivery caused by incorrect details you provided.',
        ],
      },
      {
        title: '10. Damaged, missing, or incorrect items',
        paragraphs: [
          'If an item arrives damaged, defective, missing, or incorrect, follow the Return, Refund, Replacement & Cancellation Policy. Notify us through My Orders, the Return Request page, or customer support with your order ID and photos or video. Those cases are not limited by the 7-day commercial change-of-mind window.',
        ],
      },
      {
        title: '11. Restrictions and delays',
        paragraphs: [
          'Some products cannot be sent by certain couriers because of size, weight, or content. If we cannot deliver, we will contact you to arrange another option or a refund.',
          'Weather, courier disruption, regional restrictions, or other events outside our control can delay delivery. Checkout dates remain estimates, not guarantees.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الشحن والتوصيل',
    intro:
      `هذه هي سياسة الشحن والتوصيل الموحدة لطلبات Store1920.com من ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME}). تشمل حد القطع للمعالجة، ومدد التوصيل، والرسوم، ومحاولات التسليم، وقواعد المناطق النائية داخل دولة الإمارات العربية المتحدة.`,
    lastUpdated: 'آخر تحديث: 8 سبتمبر 2026',
    sections: [
      {
        title: '1. نطاق التوصيل',
        paragraphs: [
          'نوصل داخل دولة الإمارات العربية المتحدة فقط. الشحن الدولي غير متاح.',
        ],
      },
      {
        title: '2. حد القطع للمعالجة وأيام العمل',
        paragraphs: [
          `ساعات العمل لدينا: ${STORE1920_BUSINESS_HOURS_AR}. أيام العمل من الأحد إلى الخميس باستثناء العطل الرسمية في الدولة.`,
          'حد القطع اليومي هو الساعة 6:00 م بتوقيت الإمارات في يوم عمل. الطلبات المؤكدة قبل هذا الوقت تدخل المعالجة في يوم العمل نفسه. الطلبات بعد 6:00 م أو يوم الجمعة أو السبت أو في عطلة رسمية تدخل المعالجة في يوم العمل التالي.',
        ],
      },
      {
        title: '3. وقت المعالجة',
        paragraphs: [
          'تُعالج معظم الطلبات المتوفرة خلال 1 إلى 2 يوم عمل بعد دخولها المعالجة. قد يزيد الوقت في المواسم أو العروض أو عند التحقق من المخزون. سنتواصل معك إذا تأخرت المعالجة.',
        ],
      },
      {
        title: '4. مدد التوصيل بعد الشحن',
        paragraphs: [
          'تبدأ مدد النقل بعد شحن الطلب، وليس من لحظة تقديمه. التقدير الظاهر عند الدفع لطريقة الشحن التي تختارها هو التقدير المعتمد لذلك الطلب.',
        ],
        bullets: [
          'التوصيل العادي: عادة من 2 إلى 5 أيام عمل بعد الشحن',
          'التوصيل السريع / في اليوم التالي: للمنتجات المتوفرة المؤهلة إذا اكتمل الطلب قبل الساعة 2:00 م في يوم عمل، وحيث يتوفر لعنوانك. بعد 2:00 م يُعالج الطلب في يوم العمل التالي. التفاصيل الكاملة في صفحة التوصيل السريع',
          'المناطق النائية أو الخارجية: عادة من 1 إلى 3 أيام عمل إضافية بعد تقدير التوصيل العادي أو السريع',
        ],
      },
      {
        title: '5. رسوم الشحن',
        paragraphs: [
          'تظهر جميع رسوم الشحن المطبقة على طلبك عند الدفع قبل السداد. قد تشمل رسومًا عادية أو سريعة، ورسوم الدفع عند الاستلام، ورسومًا حسب الوزن أو الموقع.',
          'الشحن المجاني ينطبق فقط عندما يظهر ذلك عند الدفع — مثل عرض أو منتج أو حد أدنى لمجموع الطلب. لا تُضاف رسوم لاحقًا إذا لم تظهر عند الدفع، باستثناء إعادة محاولة التسليم بعد الفشل كما هو موضح أدناه.',
        ],
      },
      {
        title: '6. المناطق النائية والخارجية',
        paragraphs: [
          'العناوين خارج تغطية المدن الرئيسية قد تستغرق وقتًا أطول وقد تكون رسومها أعلى أو خياراتها محدودة (بما في ذلك الدفع عند الاستلام أو التوصيل السريع). يظهر أي وقت أو رسم إضافي عند الدفع عندما نتمكن من تحديد المنطقة من عنوانك. إذا صنّفت شركة الشحن العنوان لاحقًا كمنطقة نائية بعد الشحن، سنتواصل معك قبل فرض أي رسم إضافي.',
        ],
      },
      {
        title: '7. محاولات التسليم',
        paragraphs: [
          'تحاول شركة الشحن التسليم حتى مرتين. يُرجى إبقاء هاتفك متاحًا والتأكد من وجود من يستلم الطرد.',
          'إذا فشلت المحاولتان لعدم التوفر أو لخطأ في العنوان أو بيانات التواصل، قد يُعاد الطرد إلى مستودعنا. قد تتطلب إعادة التسليم رسمًا إضافيًا نؤكده معك أولًا. ويمكنك أيضًا ترتيب الاستلام عبر الدعم.',
        ],
      },
      {
        title: '8. التتبع',
        paragraphs: [
          'عند شحن الطلب نشارك التتبع عبر الرسائل أو البريد الإلكتروني. ويمكنك التتبع من قسم طلباتي على Store1920.com.',
        ],
      },
      {
        title: '9. العنوان وبيانات التواصل',
        paragraphs: [
          'أنت مسؤول عن إدخال عنوان التوصيل ورقم الهاتف بشكل صحيح عند الدفع. لا نتحمل مسؤولية فشل التسليم الناتج عن بيانات غير صحيحة قدّمتها.',
        ],
      },
      {
        title: '10. المنتجات التالفة أو الناقصة أو غير الصحيحة',
        paragraphs: [
          'إذا وصل المنتج تالفًا أو معيبًا أو ناقصًا أو خاطئًا، اتبع سياسة الإرجاع والاسترداد والاستبدال والإلغاء. أخطرنا عبر طلباتي أو صفحة طلب الإرجاع أو دعم العملاء مع رقم الطلب وصور أو فيديو. هذه الحالات ليست مقيدة بمهلة تغيير الرأي التجارية البالغة 7 أيام.',
        ],
      },
      {
        title: '11. القيود والتأخير',
        paragraphs: [
          'قد يتعذر شحن بعض المنتجات عبر شركات معينة بسبب الحجم أو الوزن أو المحتوى. إذا تعذر التوصيل سنتواصل لترتيب خيار آخر أو استرداد.',
          'قد يتأخر التسليم بسبب الطقس أو تعطل شركة الشحن أو قيود إقليمية أو ظروف خارجة عن إرادتنا. تواريخ الدفع تبقى تقديرية وليست مضمونة.',
        ],
      },
    ],
  },
};

export default function ShippingPolicyPage() {
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
              {section.bullets?.length ? (
                <ul className="list-disc ml-6 text-gray-700 mt-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <div className="mt-6 border border-gray-200 rounded-xl p-6">
          <PolicyContactBlock isArabic={isArabic} />
        </div>
    </PolicyPageLayout>
  );
}
