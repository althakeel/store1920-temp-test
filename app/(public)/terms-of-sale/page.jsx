'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import PolicyContactBlock from '@/components/PolicyContactBlock';
import { STORE1920_LEGAL_NAME } from '@/lib/businessIdentity';

const TRADING_AS = `${STORE1920_LEGAL_NAME}, trading as Store1920`;

export default function TermsOfSalePage() {
  const { isArabic } = useStorefrontI18n();

  if (isArabic) {
    return (
      <PolicyPageLayout dir="rtl">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">شروط البيع</h1>
          <p className="text-sm text-gray-500 mb-4">آخر تحديث: 8 سبتمبر 2026</p>
          <p className="text-gray-600 mb-8">
            توضح شروط البيع هذه البنود والأحكام المنظمة لعمليات بيع المنتجات عبر Store1920.com من قبل {TRADING_AS}. بإتمامك أي عملية شراء، فإنك توافق على الالتزام بهذه الشروط. لا يستبعد أي بند هنا ولا يقيّد أي حق لا يجوز استبعاده قانونًا بموجب قوانين دولة الإمارات، بما في ذلك حقوق الجودة والضمان الإلزامية.
          </p>

          <div className="space-y-6 border border-gray-200 rounded-xl p-6">
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">1. العرض والقبول</h2>
              <p className="text-gray-700">
                تعتبر المنتجات المعروضة عرضًا للبيع، ويُعد إتمام الطلب قبولًا منك بالشراء. يصبح الطلب مؤكدًا بعد إرسال إشعار التأكيد من طرفنا عبر البريد الإلكتروني أو الرسائل.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">2. معلومات المنتجات والتوفر</h2>
              <p className="text-gray-700 mb-3">
                نحرص على دقة وصف المنتجات والأسعار والتوفر. إذا اكتشفنا خطأً قبل تأكيد الطلب، يجوز لنا تصحيحه. بعد التأكيد، يسري السعر والمنتجات المتفق عليها، مع حفظ حقوقك النظامية بموجب قوانين دولة الإمارات.
              </p>
              <ul className="list-disc mr-6 mb-3 text-gray-700">
                <li>صور المنتجات لأغراض التوضيح وقد تختلف قليلًا عن المنتج الفعلي</li>
                <li>التوفر يخضع للتحديث اللحظي</li>
                <li>يجوز تحديث الوصف أو إيقاف منتج للطلبات المستقبلية؛ ولا يغيّر ذلك طلبًا مؤكدًا إلا وفق القانون</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">3. الأسعار والضرائب</h2>
              <p className="text-gray-700">
                جميع الأسعار المعروضة على Store1920.com بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة. السعر المعتمد هو السعر الظاهر عند تأكيد الطلب. تظهر رسوم الشحن قبل إتمام الدفع.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4. الدفع</h2>
              <p className="text-gray-700 mb-3">
                لطرق الدفع المسبق، يجب استلام المبلغ كاملًا قبل معالجة الطلب وشحنه. لطلبات الدفع عند الاستلام، يُحصَّل المبلغ عند التسليم.
              </p>
              <ul className="list-disc mr-6 text-gray-700">
                <li>نقبل بطاقات الدفع والطرق الإلكترونية المتاحة في صفحة الدفع، والدفع عند الاستلام حيثما يتوفر</li>
                <li>فشل عملية الدفع المسبق قد يؤدي إلى إلغاء الطلب تلقائيًا</li>
                <li>يبدأ استرداد المبالغ المعتمدة خلال 5 إلى 7 أيام عمل بعد الموافقة</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">5. الشحن والتسليم</h2>
              <p className="text-gray-700">
                أوقات التسليم تقديرية وقد تتأثر بعوامل تشغيلية أو لوجستية. تنتقل مسؤولية المنتج عند التسليم إلى العنوان المسجل في الطلب.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">6. الإلغاء</h2>
              <p className="text-gray-700 mb-3">
                يمكن طلب إلغاء الطلب في أي وقت قبل الشحن. بعد الشحن تسري سياسة الإرجاع والاسترداد والاستبدال والإلغاء.
              </p>
              <ul className="list-disc mr-6 text-gray-700">
                <li><strong>قبل الشحن:</strong> نلغي الطلب ونسترد المبالغ المدفوعة بالكامل</li>
                <li><strong>بعد الشحن:</strong> لم يعد الإلغاء متاحًا، وتسري سياسة الإرجاع</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">7. الإرجاع والاسترداد</h2>
              <p className="text-gray-700 mb-3">
                تتبع الإرجاعات سياسة الإرجاع والاسترداد والاستبدال والإلغاء. بإيجاز:
              </p>
              <ul className="list-disc mr-6 mb-3 text-gray-700">
                <li>تغيير الرأي: خلال 7 أيام من التسليم للمنتجات غير المستخدمة المؤهلة</li>
                <li>المنتج الخطأ أو التالف أو المعيب أو غير المطابق للوصف: لا يقيّده أجل تغيير الرأي البالغ 7 أيام، ولا تقلّل القواعد التجارية من الحقوق الإلزامية في دولة الإمارات</li>
                <li>يبدأ الاسترداد المعتمد خلال 5 إلى 7 أيام عمل بعد الموافقة، ويُعاد إلى وسيلة الدفع الأصلية. لا يُعاد المبلغ إلى بريد إلكتروني</li>
                <li>تتحمل Store1920 تكلفة شحن الإرجاع للمنتج الخطأ أو التالف أو المعيب أو غير المطابق للوصف</li>
                <li>لتغيير الرأي، يدفع العميل تكلفة شحن الإرجاع المعلنة عند ترتيب الإرجاع</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">8. الضمان ودعم ما بعد البيع</h2>
              <p className="text-gray-700 mb-3">
                تواصل مع Store1920 أولاً لدعم الضمان. نساعدك في فتح ومتابعة مطالبات ضمان الشركة المصنعة، ونبقى مسؤولين عن التزامات الجودة والحقوق النظامية بصفتنا البائع.
              </p>
              <ul className="list-disc mr-6 text-gray-700">
                <li>كثير من المنتجات يشمل ضمان الشركة المصنعة، ونرشدك خلال ذلك الإجراء</li>
                <li>راسل support@Store1920.com مع رقم الطلب وتفاصيل المشكلة لبدء المطالبة</li>
                <li>لا نقدّم ضمانًا ممتدًا إلا إذا ذُكر صراحة في صفحة المنتج</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">9. المنتجات المعيبة أو التالفة</h2>
              <ul className="list-disc mr-6 text-gray-700">
                <li>أبلغنا فور اكتشاف المشكلة مع رقم الطلب وصور أو فيديو</li>
                <li>تتبع هذه الحالات سياسة الإرجاع ولا يقطعها أجل تغيير الرأي البالغ 7 أيام</li>
                <li>نستبدل نفس المنتج عند توفر المخزون، وإلا نعيد المبلغ</li>
                <li>تتحمل Store1920 تكلفة شحن الإرجاع في هذه الحالات</li>
                <li>لا يقلل أي بند هنا من حقوق الجودة أو حقوق المستهلك الإلزامية بموجب قوانين دولة الإمارات</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">10. حدود المسؤولية</h2>
              <p className="text-gray-700">
                لا نتحمل المسؤولية عن الخسائر غير المباشرة أو التأخيرات الخارجة عن إرادتنا، ويكون الحد الأقصى للمسؤولية بقيمة الطلب المدفوع حيثما يسمح القانون. لا يستبعد أي بند ولا يقيّد أي حق لا يجوز استبعاده قانونًا بموجب قوانين دولة الإمارات العربية المتحدة، بما في ذلك حقوق الجودة والضمان الإلزامية.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">11. تسوية النزاعات والقانون الواجب التطبيق</h2>
              <p className="text-gray-700">
                تخضع هذه الشروط للقوانين المعمول بها في دولة الإمارات العربية المتحدة، وتكون المحاكم المختصة وفقًا للتشريعات السارية.
              </p>
            </section>

            <section className="border-t pt-4">
              <p className="text-gray-700 mb-2">للاستفسارات المتعلقة بشروط البيع، يرجى التواصل معنا عبر:</p>
              <PolicyContactBlock isArabic />
              <p className="text-xs text-gray-500 mt-4">
                <strong>آخر تحديث:</strong> 8 سبتمبر 2026
              </p>
            </section>
          </div>
      </PolicyPageLayout>
    );
  }

  return (
    <PolicyPageLayout>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Sale</h1>
        <p className="text-sm text-gray-500 mb-4">Last updated: 8 September 2026</p>
        <p className="text-gray-600 mb-8">
          These Terms of Sale outline the terms and conditions governing the sale of products on Store1920.com by {TRADING_AS}.
          By making a purchase, you agree to be bound by these terms. Nothing here excludes or limits rights that cannot lawfully be excluded under UAE law, including mandatory quality and warranty rights.
        </p>

        <div className="space-y-6 border border-gray-200 rounded-xl p-6">
          
          {/* 1 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">1. Offer & Acceptance</h2>
            <p className="text-gray-700 mb-3">
              All product listings on Store1920.com constitute an offer to sell. When you add a product to your cart and proceed to checkout, you are making an offer to purchase. Your offer is accepted when we confirm your order via email or SMS, at which point a binding contract is formed between you and {TRADING_AS}.
            </p>
            <p className="text-gray-700">
              We reserve the right to reject any order or require additional verification before acceptance without providing reason or liability.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">2. Product Information & Availability</h2>
            <p className="text-gray-700 mb-3">
              We take reasonable care to keep product descriptions, specifications, images, prices, and availability accurate. If we discover an error, we may correct it before we confirm your order. After confirmation, the confirmed products and price apply, subject to your statutory rights under UAE law.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Product images are indicative and may vary slightly from actual products</li>
              <li>Colors and specifications displayed may differ due to device settings or lighting</li>
              <li>Stock availability is subject to real-time changes</li>
              <li>We may discontinue a product or update a listing for future orders; that does not change a confirmed order except as required by law</li>
            </ul>
            <p className="text-gray-700">
              If a product becomes unavailable after order confirmation, we will notify you immediately and process a full refund without penalty.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">3. Pricing & Taxes</h2>
            <p className="text-gray-700 mb-3">
              All prices displayed on Store1920.com are in UAE Dirhams (AED) and include VAT.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Prices are subject to change without notice, though the confirmed-order price applies once we accept your order</li>
              <li>VAT is included in the catalogue and checkout prices shown to you</li>
              <li>Shipping charges are displayed before checkout confirmation</li>
              <li>Promotional offers and discounts are subject to specific terms and expiration dates</li>
              <li>If we discover a pricing error before confirmation, we may correct it. After confirmation, the confirmed price applies, subject to your statutory rights under UAE law</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">4. Payment Terms</h2>
            <p className="text-gray-700 mb-3">
              For prepaid methods, payment must be received in full before an order is processed and shipped. For Cash on Delivery (COD) orders, payment is collected on delivery.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>We accept credit/debit cards, Apple Pay, Tabby, Tamara, and cash on delivery (where available)</li>
              <li>Payment transactions are processed through PCI-DSS compliant payment gateways</li>
              <li>You are responsible for ensuring your payment information is accurate and authorized</li>
              <li>Failed prepaid payment attempts will result in order cancellation</li>
              <li>Approved refunds are initiated within 5–7 business days after approval and credited to the original payment method</li>
              <li>Cash on Delivery (COD) is subject to approval and availability in your area</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">5. Order Confirmation & Processing</h2>
            <p className="text-gray-700 mb-3">
              An order is deemed accepted and binding once we send you an order confirmation email/SMS containing:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Order number and date</li>
              <li>Products ordered with quantities and prices</li>
              <li>Delivery address and expected delivery timeline</li>
              <li>Total amount charged including taxes and shipping</li>
            </ul>
            <p className="text-gray-700">
              Order processing typically takes 1-2 business days. Orders placed after 6 PM or on weekends/holidays will be processed the next business day.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">6. Order Cancellation by Buyer</h2>
            <p className="text-gray-700 mb-3">
              You may request cancellation at any time before dispatch. After dispatch, our Return, Refund, Replacement & Cancellation Policy applies.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li><strong>Before dispatch:</strong> We cancel the order and issue a full refund of amounts paid</li>
              <li><strong>After dispatch:</strong> Cancellation is no longer available; the return policy applies</li>
              <li>Approved refunds are initiated within 5–7 business days after approval and credited to the original payment method</li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">7. Delivery & Risk of Loss</h2>
            <p className="text-gray-700 mb-3">
              <strong>Shipping & Delivery Terms:</strong>
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Delivery timelines are estimates only and not guaranteed</li>
              <li>Delivery may be affected by unforeseen circumstances including weather, logistics issues, or force majeure events</li>
              <li>Risk of loss, damage, or loss in transit transfers to you upon delivery to your address</li>
              <li>We recommend refusing delivery of visibly damaged packages and reporting immediately</li>
              <li>For rural/remote areas, additional shipping time may be required</li>
              <li>Customers must ensure someone is available to receive the package</li>
              <li>We are not responsible for delivery delays caused by incomplete/incorrect address information</li>
            </ul>
          </section>

          {/* 8 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">8. Returns & Refunds</h2>
            <p className="text-gray-700 mb-3">
              <strong>Return Eligibility:</strong>
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Change-of-mind returns: within 7 days of delivery for eligible unused items, per our Return Policy</li>
              <li>Wrong, damaged, defective, incomplete, or not-as-described items: follow the Return Policy; those cases are not limited by the 7-day change-of-mind window, and commercial rules do not reduce mandatory UAE rights</li>
              <li>Change-of-mind items must be unused and in original packaging</li>
              <li>Proof of purchase is required</li>
              <li>Category exclusions apply only to change of mind and never override statutory defect rights</li>
            </ul>
            <p className="text-gray-700 mb-3">
              <strong>Refund Processing:</strong>
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Approved refunds are initiated within 5–7 business days after approval</li>
              <li>Refunds are credited to the original payment method. We do not send refunds to a registered email address</li>
              <li>Store1920 pays return shipping for wrong, damaged, defective, or not-as-described items</li>
              <li>For change of mind, you pay the return-shipping cost disclosed when the return is arranged</li>
            </ul>
          </section>

          {/* 9 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">9. Product Warranties & Guarantees</h2>
            <p className="text-gray-700 mb-3">
              Contact Store1920 first for warranty support. We will help you raise and progress manufacturer warranty claims, and we remain responsible for our own quality and statutory obligations as the seller.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Many products also include a manufacturer warranty; we will guide you through that process</li>
              <li>Email support@Store1920.com with your order ID and issue details to start a claim</li>
              <li>We do not provide extended warranties unless explicitly mentioned on the product page</li>
              <li>Manufacturer warranty coverage generally excludes damage due to misuse, accidents, or normal wear, subject to the brand’s terms and your rights under UAE law</li>
            </ul>
          </section>

          {/* 10 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">10. Defective or Damaged Products</h2>
            <p className="text-gray-700 mb-3">
              If you receive a defective or damaged product:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Notify us as soon as you discover the issue, with your order ID and photos or video</li>
              <li>These cases follow the Return Policy and are not cut off by the 7-day change-of-mind window</li>
              <li>We replace the same SKU when that stock exists; otherwise we refund</li>
              <li>Store1920 pays return shipping for these cases</li>
              <li>Nothing here reduces mandatory quality or consumer rights under UAE law</li>
            </ul>
          </section>

          {/* 11 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">11. Buyer Obligations</h2>
            <p className="text-gray-700">
              By purchasing from Store1920.com, you agree to:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Provide accurate, current, and complete information during checkout</li>
              <li>Use the website only for lawful purposes</li>
              <li>Not engage in fraudulent, deceptive, or unauthorized transactions</li>
              <li>Accept responsibility for maintaining payment method security</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Report any unauthorized purchases or suspicious activity immediately</li>
            </ul>
          </section>

          {/* 12 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">12. Limitation of Liability</h2>
            <p className="text-gray-700 mb-3">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Store1920.com is not liable for indirect, incidental, special, or consequential damages</li>
              <li>Our total liability shall not exceed the order amount paid by you</li>
              <li>We are not responsible for delays, losses, or damages during shipping by logistics partners, except where we are legally required to remain responsible</li>
              <li>Nothing in these Terms of Sale excludes or limits rights that cannot lawfully be excluded under UAE law, including mandatory quality and consumer rights</li>
            </ul>
          </section>

          {/* 13 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">13. Force Majeure</h2>
            <p className="text-gray-700">
              Store1920.com is not liable for failures or delays in performance due to circumstances beyond our reasonable control, including but not limited to: natural disasters, wars, pandemics, government actions, strikes, or utility failures. During such events, we will make reasonable efforts to resume normal operations.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">14. Dispute Resolution & Jurisdiction</h2>
            <p className="text-gray-700 mb-3">
              <strong>Applicable Law:</strong> These Terms of Sale are governed by the laws of the United Arab Emirates.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>All disputes shall be subject to the exclusive jurisdiction of courts in the UAE</li>
              <li>We encourage resolving disputes through our customer support team first</li>
              <li>Unresolved complaints may be escalated to consumer dispute redressal mechanisms</li>
            </ul>
          </section>

          {/* 15 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">15. Fraudulent Transactions & Chargebacks</h2>
            <p className="text-gray-700 mb-3">
              We maintain strict anti-fraud policies:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Fraudulent orders will be immediately cancelled, and legal action may be pursued</li>
              <li>Credit card chargebacks result in order cancellation and potential account suspension</li>
              <li>If a chargeback is initiated, you waive your right to the product or any refund</li>
              <li>Repeated fraudulent activity will result in permanent account closure</li>
            </ul>
          </section>

          {/* 16 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">16. Amendment of Terms</h2>
            <p className="text-gray-700">
              Store1920.com reserves the right to modify these Terms of Sale at any time. Changes will be effective immediately upon posting to the website. We recommend reviewing this page regularly. Your continued use of the website following changes constitutes acceptance of the revised terms.
            </p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">17. Severability</h2>
            <p className="text-gray-700">
              If any provision of these Terms of Sale is found to be invalid or unenforceable by a court of competent jurisdiction, that provision shall be severed, and the remaining provisions shall remain in full effect.
            </p>
          </section>

          {/* 18 */}
          <section className="border-t pt-4">
            <p className="text-gray-700 mb-2">
              For questions, disputes, or complaints regarding these Terms of Sale, please contact us:
            </p>
            <PolicyContactBlock />
            <p className="text-xs text-gray-500 mt-4">
              <strong>Last Updated:</strong> 8 September 2026
            </p>
          </section>
        </div>
    </PolicyPageLayout>
  );
}
