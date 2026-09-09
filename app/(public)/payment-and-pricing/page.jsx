'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import PolicyContactBlock from '@/components/PolicyContactBlock';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { STORE1920_LEGAL_NAME, STORE1920_LEGAL_NAME_AR } from '@/lib/businessIdentity';

const TRADING_AS = `${STORE1920_LEGAL_NAME}, trading as Store1920`;

const PAGE_COPY = {
  en: {
    title: 'Payment & Pricing Policy',
    intro:
      `This policy explains how ${TRADING_AS} prices products and accepts payment on Store1920.com in the UAE, including live buy-now-pay-later methods. Refunds follow one process, set out below and in our Return Policy.`,
    lastUpdated: 'Last updated: 8 September 2026',
    sections: [
      {
        title: '1. Accepted payment methods',
        paragraphs: [
          'The methods offered at checkout are the live methods for that order. A method may be hidden if it is unavailable for your address, order total, or product mix.',
        ],
        bullets: [
          'Credit and debit cards (Visa, Mastercard, and other cards accepted by our hosted checkout), including Apple Pay where your device supports it',
          'Tabby — pay in 12 interest-free monthly installments where offered',
          'Tamara — pay in 4 interest-free installments where offered',
          'Cash on Delivery (COD) where offered for your address',
          'Store1920 wallet credit, when enabled on your signed-in account',
        ],
      },
      {
        title: '2. Tabby conditions',
        paragraphs: [
          'Tabby is a third-party buy-now-pay-later provider. Selecting Tabby at checkout opens Tabby’s hosted payment flow.',
        ],
        bullets: [
          'Available to customers aged 18 or over who are citizens or residents of the UAE (Tabby may also serve other countries; we only deliver inside the UAE)',
          'You pay in 12 interest-free monthly installments if Tabby approves the application',
          'Approval, limits, and identity checks are decided by Tabby, not by Store1920',
          'Tabby may decline an application; you can then choose another method shown at checkout',
          'An order-total limit may apply; if your total exceeds it, Tabby will not appear or cannot be selected',
          'By using Tabby you accept Tabby’s own terms and privacy notice',
        ],
      },
      {
        title: '3. Tamara conditions',
        paragraphs: [
          'Tamara is a third-party buy-now-pay-later provider. Selecting Tamara at checkout opens Tamara’s hosted payment flow.',
        ],
        bullets: [
          'You must be over 18 years of age',
          'You pay in 4 interest-free installments if Tamara approves the application',
          'Opening a Tamara account requires personal information such as your name, address, email, phone number, and age',
          'Approval, limits, and identity checks are decided by Tamara, not by Store1920',
          'Tamara may decline an application; you can then choose another method shown at checkout',
          'An order-total limit may apply; if your total exceeds it, Tamara will not appear or cannot be selected',
          'By using Tamara you accept Tamara’s own terms and privacy notice',
        ],
      },
      {
        title: '4. Pricing and VAT',
        paragraphs: [
          'All catalogue and checkout prices are in UAE Dirhams (AED) and include VAT.',
          'The price that applies is the price confirmed with your order. Shipping and any COD fee are shown before you pay. Promotional prices last only for the stated offer period.',
        ],
      },
      {
        title: '5. Payment security',
        paragraphs: [
          'Card and BNPL payments run on hosted, PCI-aligned gateways. We do not store full card numbers or CVV on our servers. Some orders may need extra verification (such as 3-D Secure or a provider check). If verification fails, the order is cancelled and any captured amount follows the refund process below.',
        ],
      },
      {
        title: '6. One refund process',
        paragraphs: [
          'All approved refunds — cancelled orders, eligible returns, billing corrections, and failed or declined payments that were captured — follow this single process:',
        ],
        bullets: [
          'We approve the refund under this policy and the Return, Refund, Replacement & Cancellation Policy',
          'We initiate the refund within 5–7 business days after approval',
          'The refund goes back through the original payment method',
          'Card and Apple Pay: credited to the same card; your bank may take extra time to show it after we initiate',
          'Wallet: credited to your Store1920 wallet',
          'COD: paid by bank transfer after we verify the account details you provide',
          'Tabby or Tamara: we instruct the provider to reverse or reduce the payment; they adjust your installment plan under their terms',
        ],
      },
      {
        title: '7. Billing questions',
        paragraphs: [
          'If you see an incorrect or duplicate charge, email support@Store1920.com with your order ID, payment reference, and details. After we confirm the issue, any refund uses the process in section 6.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الدفع والتسعير',
    intro:
      `توضح هذه السياسة كيف يسعّر ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME}) المنتجات ويقبل الدفع على Store1920.com في الإمارات، بما في ذلك طرق اشترِ الآن وادفع لاحقًا المتاحة. الاسترداد يتبع عملية واحدة موضحة أدناه وفي سياسة الإرجاع.`,
    lastUpdated: 'آخر تحديث: 8 سبتمبر 2026',
    sections: [
      {
        title: '1. طرق الدفع المقبولة',
        paragraphs: [
          'الطرق الظاهرة عند الدفع هي الطرق المتاحة لذلك الطلب. قد تُخفى طريقة إذا لم تتوفر لعنوانك أو لمجموع الطلب أو لنوع المنتجات.',
        ],
        bullets: [
          'بطاقات الائتمان والخصم (فيزا وماستركارد والبطاقات التي يقبلها الدفع المستضاف)، بما في ذلك Apple Pay إذا كان جهازك يدعمها',
          'تابي — الدفع على 12 قسطًا شهريًا بدون فوائد حيث تتوفر',
          'تمارا — الدفع على 4 أقساط بدون فوائد حيث تتوفر',
          'الدفع عند الاستلام حيث يتوفر لعنوانك',
          'رصيد محفظة Store1920 عند تفعيله لحسابك المسجّل',
        ],
      },
      {
        title: '2. شروط تابي',
        paragraphs: [
          'تابي مزود خارجي لخدمة اشترِ الآن وادفع لاحقًا. اختيار تابي يفتح صفحة الدفع الخاصة بها.',
        ],
        bullets: [
          'متاحة لمن بلغ 18 عامًا من مواطني أو مقيمي الإمارات (قد تخدم تابي دولًا أخرى؛ نحن نوصل داخل الإمارات فقط)',
          'الدفع على 12 قسطًا شهريًا بدون فوائد إذا وافقت تابي',
          'الموافقة والحدود والتحقق من الهوية تقررها تابي وليس Store1920',
          'قد ترفض تابي الطلب؛ يمكنك اختيار طريقة أخرى ظاهرة عند الدفع',
          'قد يُطبق حد لمجموع الطلب؛ إذا تجاوزته لن تظهر تابي أو لن يمكن اختيارها',
          'باستخدام تابي فإنك تقبل شروطها وإشعار الخصوصية الخاص بها',
        ],
      },
      {
        title: '3. شروط تمارا',
        paragraphs: [
          'تمارا مزود خارجي لخدمة اشترِ الآن وادفع لاحقًا. اختيار تمارا يفتح صفحة الدفع الخاصة بها.',
        ],
        bullets: [
          'يجب أن يتجاوز عمرك 18 عامًا',
          'الدفع على 4 أقساط بدون فوائد إذا وافقت تمارا',
          'يتطلب فتح حساب تمارا معلومات شخصية مثل الاسم والعنوان والبريد والهاتف والعمر',
          'الموافقة والحدود والتحقق من الهوية تقررها تمارا وليس Store1920',
          'قد ترفض تمارا الطلب؛ يمكنك اختيار طريقة أخرى ظاهرة عند الدفع',
          'قد يُطبق حد لمجموع الطلب؛ إذا تجاوزته لن تظهر تمارا أو لن يمكن اختيارها',
          'باستخدام تمارا فإنك تقبل شروطها وإشعار الخصوصية الخاص بها',
        ],
      },
      {
        title: '4. الأسعار وضريبة القيمة المضافة',
        paragraphs: [
          'جميع أسعار الكتالوج والدفع بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة.',
          'السعر المعتمد هو السعر المؤكد مع طلبك. تظهر رسوم الشحن وأي رسم للدفع عند الاستلام قبل السداد. أسعار العروض تسري خلال فترة العرض فقط.',
        ],
      },
      {
        title: '5. أمان الدفع',
        paragraphs: [
          'مدفوعات البطاقات وخدمات اشترِ الآن وادفع لاحقًا تتم عبر بوابات مستضافة متوافقة مع معايير الحماية. لا نخزّن رقم البطاقة الكامل أو رمز CVV على خوادمنا. قد يحتاج بعض الطلبات إلى تحقق إضافي. إذا فشل التحقق يُلغى الطلب ويتبع أي مبلغ محصّل عملية الاسترداد أدناه.',
        ],
      },
      {
        title: '6. عملية استرداد واحدة',
        paragraphs: [
          'جميع عمليات الاسترداد المعتمدة — إلغاء الطلبات، والإرجاع المؤهل، وتصحيح الفوترة، والمدفوعات الفاشلة أو المرفوضة التي حُصّلت — تتبع هذه العملية الواحدة:',
        ],
        bullets: [
          'نوافق على الاسترداد وفق هذه السياسة وسياسة الإرجاع والاسترداد والاستبدال والإلغاء',
          'نبدأ الاسترداد خلال 5 إلى 7 أيام عمل بعد الموافقة',
          'يُعاد المبلغ عبر وسيلة الدفع الأصلية',
          'البطاقة وApple Pay: إلى البطاقة نفسها؛ قد يتأخر ظهوره لدى البنك بعد بدء التحويل',
          'المحفظة: إلى محفظة Store1920',
          'الدفع عند الاستلام: تحويل بنكي بعد التحقق من بيانات الحساب التي تقدّمها',
          'تابي أو تمارا: نطلب من المزود عكس الدفع أو تخفيضه؛ ويعدّل خطة الأقساط وفق شروطه',
        ],
      },
      {
        title: '7. استفسارات الفوترة',
        paragraphs: [
          'إذا رأيت رسمًا غير صحيح أو مكررًا، راسل support@Store1920.com مع رقم الطلب ومرجع الدفع والتفاصيل. بعد التأكيد، أي استرداد يتبع العملية في القسم 6.',
        ],
      },
    ],
  },
};

export default function PaymentAndPricingPolicyPage() {
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
              <ul className="list-disc ml-6 text-gray-700 mt-2 space-y-1">
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
