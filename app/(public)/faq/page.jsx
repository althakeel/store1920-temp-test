'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

const FAQ_COPY = {
  en: {
    title: 'Frequently Asked Questions',
    intro: 'Answers to common questions about shopping on Store1920.com.',
    items: [
      {
        q: 'What is Store1920?',
        a: 'Store1920 is a UAE online retail store. ALTHAKEEL GENERAL TRADING L.L.C purchases products from manufacturers and suppliers and sells them directly to customers through Store1920.com. We are the seller of record for your order and your first point of contact for delivery, returns, refunds and warranty support.',
      },
      {
        q: 'How do I track my order?',
        a: 'Go to My Orders from your profile menu. You can view real-time updates for each order placed on Store1920.com.',
      },
      {
        q: 'What is the return and replacement policy?',
        a: 'Change-of-mind returns are available within 7 days of delivery on eligible unused items. Store1920 pays return shipping for wrong, damaged, defective or not-as-described items. Change-of-mind return shipping is paid by you at the cost disclosed when the return is arranged. For a Store1920 error we replace the same SKU when stock exists; otherwise we refund. Change of mind is a refund, then you can place a new order. Commercial return rules do not reduce mandatory rights under UAE law. See /return-policy.',
      },
      {
        q: 'How do I contact support?',
        a: 'Visit the Support page to find contact options. You can raise a ticket or email us at support@Store1920.com.',
      },
    ],
  },
  ar: {
    title: 'الأسئلة الشائعة',
    intro: 'إجابات عن الأسئلة الشائعة حول التسوق في Store1920.com.',
    items: [
      {
        q: 'ما هو Store1920؟',
        a: 'Store1920 متجر تجزئة إلكتروني في الإمارات. تشتري الثقيل للتجارة العامة ش.ذ.م.م المنتجات من المصنّعين والمورّدين وتبيعها مباشرة للعملاء عبر Store1920.com. نحن البائع المسؤول عن طلبك وجهتك الأولى للتواصل بشأن التوصيل والإرجاع والاسترداد ودعم الضمان.',
      },
      {
        q: 'كيف أتتبع طلبي؟',
        a: 'اذهب إلى طلباتي من قائمة حسابك. يمكنك متابعة التحديثات لكل طلب قُدّم على Store1920.com.',
      },
      {
        q: 'ما سياسة الإرجاع والاستبدال؟',
        a: 'إرجاع تغيير الرأي متاح خلال 7 أيام من التسليم للمنتجات غير المستخدمة المؤهلة. تتحمل Store1920 شحن الإرجاع للمنتج الخاطئ أو التالف أو المعيب أو غير المطابق للوصف. شحن إرجاع تغيير الرأي يدفعه العميل بالتكلفة المُفصح عنها عند ترتيب الإرجاع. في خطأ Store1920 نستبدل نفس المنتج إن وُجد في المخزون، وإلا نعيد المبلغ. تغيير الرأي يكون باسترداد ثم طلب جديد. القواعد التجارية لا تنتقص من الحقوق الإلزامية بموجب قانون الإمارات. راجع /return-policy.',
      },
      {
        q: 'كيف أتواصل مع الدعم؟',
        a: 'زر صفحة الدعم لخيارات التواصل. يمكنك فتح تذكرة أو مراسلتنا على support@Store1920.com.',
      },
    ],
  },
};

export default function FAQPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? FAQ_COPY.ar : FAQ_COPY.en;

  return (
    <PolicyPageLayout dir={isArabic ? 'rtl' : undefined}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{copy.title}</h1>
      <p className="text-gray-600 mb-8">{copy.intro}</p>

      <div className="space-y-4">
        {copy.items.map((item) => (
          <details key={item.q} className="group border border-gray-200 rounded-xl p-4 open:shadow-md">
            <summary className="font-medium text-gray-900 cursor-pointer list-none flex items-center justify-between">
              {item.q}
              <span className="text-gray-400 group-open:rotate-180 transition">▾</span>
            </summary>
            <p className="text-gray-700 mt-2 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </PolicyPageLayout>
  );
}
