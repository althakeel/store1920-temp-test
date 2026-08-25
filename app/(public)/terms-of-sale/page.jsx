'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
} from '@/lib/storeContact';

export default function TermsOfSalePage() {
  const { isArabic } = useStorefrontI18n();

  if (isArabic) {
    return (
      <PolicyPageLayout dir="rtl">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">شروط البيع</h1>
          <p className="text-gray-600 mb-8">
            توضح شروط البيع هذه البنود والأحكام المنظمة لعمليات بيع المنتجات عبر Store1920.com. بإتمامك أي عملية شراء، فإنك توافق على الالتزام بهذه الشروط.
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
                نبذل جهدًا لتقديم معلومات دقيقة حول المنتجات والأسعار والتوفر، وقد تحدث اختلافات بسيطة بسبب التحديثات أو ظروف التشغيل.
              </p>
              <ul className="list-disc mr-6 mb-3 text-gray-700">
                <li>صور المنتجات لأغراض التوضيح وقد تختلف قليلًا عن المنتج الفعلي</li>
                <li>التوفر يخضع للتحديث اللحظي</li>
                <li>يحق لنا تحديث الوصف أو إيقاف أي منتج دون إشعار مسبق</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">3. الأسعار والضرائب</h2>
              <p className="text-gray-700">
                قد تتغير الأسعار من وقت لآخر. السعر المعتمد هو السعر الظاهر عند تأكيد الطلب، وقد تُطبق رسوم أو ضرائب إضافية حسب الوجهة والأنظمة المعمول بها.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4. الدفع</h2>
              <p className="text-gray-700 mb-3">
                يجب إتمام الدفع بنجاح قبل معالجة الطلب، باستثناء الحالات التي نسمح فيها بطريقة دفع بديلة مثل الدفع عند الاستلام.
              </p>
              <ul className="list-disc mr-6 text-gray-700">
                <li>نقبل بطاقات الدفع والطرق الإلكترونية المتاحة في صفحة الدفع</li>
                <li>فشل عملية الدفع قد يؤدي إلى إلغاء الطلب تلقائيًا</li>
                <li>استرداد مبالغ الإلغاء يتم وفق المدد البنكية المعتمدة</li>
              </ul>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">5. الشحن والتسليم</h2>
              <p className="text-gray-700">
                أوقات التسليم تقديرية وقد تتأثر بعوامل تشغيلية أو لوجستية. تنتقل مسؤولية المنتج عند التسليم إلى العنوان المسجل في الطلب.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">6. الإلغاء والإرجاع</h2>
              <p className="text-gray-700">
                يمكن طلب الإلغاء قبل الشحن وفق سياسة المتجر، وبعد الشحن تطبق سياسة الإرجاع والاسترداد المعتمدة لكل فئة منتجات.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">7. حدود المسؤولية</h2>
              <p className="text-gray-700">
                لا نتحمل المسؤولية عن الخسائر غير المباشرة أو التأخيرات الخارجة عن إرادتنا، ويكون الحد الأقصى للمسؤولية بقيمة الطلب المدفوع حيثما يسمح القانون.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">8. تسوية النزاعات والقانون الواجب التطبيق</h2>
              <p className="text-gray-700">
                تخضع هذه الشروط للقوانين المعمول بها في دولة الإمارات العربية المتحدة، وتكون المحاكم المختصة وفقًا للتشريعات السارية.
              </p>
            </section>

            <section className="border-t pt-4">
              <h2 className="font-semibold text-gray-900 mb-2">معلومات التواصل</h2>
              <p className="text-gray-700 mb-2">للاستفسارات المتعلقة بشروط البيع، يرجى التواصل معنا عبر:</p>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-gray-700 mb-1"><strong>اسم النشاط:</strong> Store1920</p>
                <p className="text-gray-700 mb-1"><strong>الموقع:</strong> https://www.Store1920.com</p>
                <p className="text-gray-700 mb-1"><strong>البريد الإلكتروني:</strong> support@Store1920.com</p>
                <p className="text-gray-700">
                  <strong>الهاتف:</strong>{' '}
                  <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-orange-600 underline">
                    {STORE1920_CUSTOMER_SUPPORT_PHONE}
                  </a>
                </p>
              </div>
            </section>
          </div>
      </PolicyPageLayout>
    );
  }

  return (
    <PolicyPageLayout>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Sale</h1>
        <p className="text-gray-600 mb-8">
          These Terms of Sale outline the terms and conditions governing the sale of products on Store1920.com.
          By making a purchase, you agree to be bound by these terms.
        </p>

        <div className="space-y-6 border border-gray-200 rounded-xl p-6">
          
          {/* 1 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">1. Offer & Acceptance</h2>
            <p className="text-gray-700 mb-3">
              All product listings on Store1920.com constitute an offer to sell. When you add a product to your cart and proceed to checkout, you are making an offer to purchase. Your offer is accepted when we confirm your order via email or SMS, at which point a binding contract is formed between you and Store1920.com (operated by Store1920).
            </p>
            <p className="text-gray-700">
              We reserve the right to reject any order or require additional verification before acceptance without providing reason or liability.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">2. Product Information & Availability</h2>
            <p className="text-gray-700 mb-3">
              We strive to provide accurate product descriptions, specifications, images, prices, and availability information. However, we do not warrant that all information is entirely accurate, error-free, or up-to-date.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Product images are indicative and may vary slightly from actual products</li>
              <li>Colors and specifications displayed may differ due to device settings or lighting</li>
              <li>Stock availability is subject to real-time changes</li>
              <li>We reserve the right to discontinue products or update descriptions without notice</li>
            </ul>
            <p className="text-gray-700">
              If a product becomes unavailable after order confirmation, we will notify you immediately and process a full refund without penalty.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">3. Pricing & Taxes</h2>
            <p className="text-gray-700 mb-3">
              All prices displayed on Store1920.com are in UAE Dirhams (AED) unless otherwise specified.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Prices are subject to change without notice, though current prices apply to confirmed orders</li>
              <li>Prices may be inclusive or exclusive of VAT/applicable taxes as indicated</li>
              <li>Additional taxes, duties, or charges may apply depending on your location</li>
              <li>Shipping charges are displayed before checkout confirmation</li>
              <li>Promotional offers and discounts are subject to specific terms and expiration dates</li>
              <li>We reserve the right to correct pricing errors at any time</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">4. Payment Terms</h2>
            <p className="text-gray-700 mb-3">
              Payment must be received in full before an order is processed and shipped, unless otherwise agreed in writing.
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>We accept credit/debit cards, Apple Pay, Tabby, Tamara, and cash on delivery (where available)</li>
              <li>Payment transactions are processed through PCI-DSS compliant payment gateways</li>
              <li>You are responsible for ensuring your payment information is accurate and authorized</li>
              <li>Failed payment attempts will result in order cancellation</li>
              <li>Refunds for cancelled orders will be processed within 7-10 business days</li>
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
              Buyers may request cancellation under the following conditions:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li><strong>Before dispatch:</strong> Full refund of order amount (minus any applied discounts/cash-backs)</li>
              <li><strong>After dispatch:</strong> Order cannot be cancelled; return/refund policy applies</li>
              <li>Cancellation requests must be submitted within 24 hours of order confirmation</li>
              <li>Refunds will be credited to the original payment method within 5-7 business days</li>
              <li>In case of payment failure reconciliation, additional time may be required</li>
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
              <li>Eligible returns within 3 days of delivery for damaged or incomplete orders, per our Return Policy (returns are not free unless due to our error)</li>
              <li>Product must be unused, in original packaging, with all tags attached</li>
              <li>Proof of purchase (order confirmation email) must be provided</li>
              <li>Exceptions: Perishable goods, clearance items, custom orders, and some categories have restricted returns</li>
            </ul>
            <p className="text-gray-700 mb-3">
              <strong>Refund Processing:</strong>
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Once return is approved and received, refund is processed within 5-7 business days</li>
              <li>Refunds are credited to the original payment method</li>
              <li>Shipping charges are non-refundable unless return is due to our error</li>
              <li>Discounts and promotional credits usually cannot be refunded</li>
              <li>If payment method is unavailable, refund will be issued to registered email</li>
            </ul>
          </section>

          {/* 9 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">9. Product Warranties & Guarantees</h2>
            <p className="text-gray-700 mb-3">
              Many products include manufacturer warranties. Store1920.com acts as a facilitator only:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Manufacturer warranties are provided as-is without additional guarantees by Store1920.com</li>
              <li>Warranty claims should be directed to the manufacturer or seller</li>
              <li>We do not provide extended warranties unless explicitly mentioned</li>
              <li>Warranty coverage does not include damage due to misuse, accidents, or normal wear</li>
            </ul>
          </section>

          {/* 10 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">10. Defective or Damaged Products</h2>
            <p className="text-gray-700 mb-3">
              If you receive a defective or damaged product:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>Report within 48 hours of delivery with photographic evidence</li>
              <li>Provide order number and clear images showing the defect/damage</li>
              <li>We will offer a replacement or full refund at our discretion</li>
              <li>Shipping for replacement will be covered by Store1920.com</li>
              <li>Return shipping must use original/similar packaging condition</li>
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
              <li>We are not responsible for delays, losses, or damages during shipping by logistics partners</li>
              <li>We disclaim any warranty of merchantability or fitness for a particular purpose</li>
              <li>Products are sold "as-is" unless otherwise specified</li>
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
            <h2 className="font-semibold text-gray-900 mb-2">15. Third-Party Sellers & Marketplace</h2>
            <p className="text-gray-700 mb-3">
              Store1920.com operates as a marketplace platform where third-party sellers may list products:
            </p>
            <ul className="list-disc ml-6 mb-3 text-gray-700">
              <li>While we vet sellers, we do not guarantee seller credibility or product authenticity</li>
              <li>Seller-specific return/warranty policies are clearly disclosed during checkout</li>
              <li>Store1920.com acts as a facilitator and is not a party to seller-buyer disputes unless otherwise stated</li>
              <li>For issues with seller products, our customer support will assist in resolution</li>
            </ul>
          </section>

          {/* 16 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">16. Fraudulent Transactions & Chargebacks</h2>
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

          {/* 17 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">17. Amendment of Terms</h2>
            <p className="text-gray-700">
              Store1920.com reserves the right to modify these Terms of Sale at any time. Changes will be effective immediately upon posting to the website. We recommend reviewing this page regularly. Your continued use of the website following changes constitutes acceptance of the revised terms.
            </p>
          </section>

          {/* 18 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">18. Severability</h2>
            <p className="text-gray-700">
              If any provision of these Terms of Sale is found to be invalid or unenforceable by a court of competent jurisdiction, that provision shall be severed, and the remaining provisions shall remain in full effect.
            </p>
          </section>

          {/* 19 */}
          <section className="border-t pt-4">
            <h2 className="font-semibold text-gray-900 mb-2">Contact Information</h2>
            <p className="text-gray-700 mb-2">
              For questions, disputes, or complaints regarding these Terms of Sale, please contact us:
            </p>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-gray-700 mb-1"><strong>Business Name:</strong> Store1920</p>
              <p className="text-gray-700 mb-1"><strong>Website:</strong> https://www.Store1920.com</p>
              <p className="text-gray-700 mb-1"><strong>Email:</strong> support@Store1920.com</p>
              <p className="text-gray-700">
                <strong>Phone:</strong>{' '}
                <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-orange-600 underline">
                  {STORE1920_CUSTOMER_SUPPORT_PHONE}
                </a>
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              <strong>Last Updated:</strong> February 2026
            </p>
          </section>
        </div>
    </PolicyPageLayout>
  );
}
