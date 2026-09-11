"use client";

import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import { STORE1920_LEGAL_NAME } from '@/lib/businessIdentity';

const TRADING_AS = `${STORE1920_LEGAL_NAME}, trading as Store1920`;

export default function TermsAndConditions() {
  const { isArabic } = useStorefrontI18n();

  if (isArabic) {
    return (
      <PolicyPageLayout dir="rtl">
        <h1 className="text-3xl font-bold mb-3">الشروط والأحكام</h1>
          <p className="mb-3">
            يتم تشغيل هذا الموقع بواسطة <strong>{TRADING_AS}</strong>. باستخدامك للموقع أو إتمام أي طلب شراء، فإنك توافق على الشروط
            والأحكام الواردة في هذه الصفحة.
          </p>
          <p className="mb-3">
            Store1920 متجر تجزئة مباشر. المنتجات المعروضة على هذا الموقع تُباع من قبل {TRADING_AS}. لسنا سوقًا إلكترونيًا ولا نبيع نيابة عن بائعين من أطراف ثالثة.
          </p>
          <p className="mb-3">
            نحرص على دقة المعلومات المعروضة. إذا اكتشفنا خطأً قبل تأكيد الطلب، يجوز لنا تصحيحه. بعد تأكيد الطلب، يسري السعر والمنتجات المتفق عليها، مع حفظ حقوقك النظامية بموجب قوانين دولة الإمارات العربية المتحدة.
          </p>
          <p className="mb-8">
            لا يستبعد أي بند في هذه الشروط ولا يقيّد أي حق لا يجوز استبعاده قانونًا بموجب قوانين دولة الإمارات العربية المتحدة. يرجى قراءة هذه البنود بعناية قبل استخدام خدماتنا. إذا كنت لا توافق على أي جزء منها، يرجى عدم استخدام الموقع أو إتمام الطلب.
          </p>

          <div className="space-y-6 border border-gray-200 rounded-xl p-6">
            <section>
              <h2 className="text-xl font-semibold mb-2">1. قبول الشروط</h2>
              <p>
                باستخدام الموقع، تؤكد أنك تبلغ السن القانونية أو لديك موافقة ولي الأمر، وتتعهد باستخدام الخدمات بشكل قانوني فقط.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">2. استخدام الموقع</h2>
              <ul className="list-disc mr-6 space-y-1">
                <li>يُمنع استخدام الموقع لأي غرض غير قانوني أو احتيالي.</li>
                <li>يُمنع إرسال أي برمجيات ضارة أو محتوى مسيء.</li>
                <li>يحق لنا إيقاف الخدمة عند مخالفة الشروط.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">3. الأسعار والمنتجات</h2>
              <p>
                نحرص على دقة الأسعار وتفاصيل المنتجات. إذا ظهر خطأ قبل تأكيد الطلب، يجوز لنا تصحيحه. بعد التأكيد، يسري السعر المتفق عليه، مع حفظ حقوقك النظامية بموجب قوانين دولة الإمارات العربية المتحدة.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">4. الطلبات والدفع</h2>
              <p>
                يتم تأكيد الطلب بعد قبول الدفع أو تأكيد الطلب من طرفنا. قد نطلب تحققًا إضافيًا قبل قبول بعض الطلبات، ويحق لنا رفض أي طلب
                عند الضرورة.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">5. الشحن والتسليم</h2>
              <p>
                مواعيد التسليم تقديرية وقد تتأثر بعوامل تشغيلية أو لوجستية. تنتقل مسؤولية المنتج إليك بعد التسليم للعنوان المسجل في الطلب.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">6. الإرجاع والاسترداد</h2>
              <p>
                تتم عمليات الإرجاع والاسترداد والاستبدال والإلغاء وفق سياسة الإرجاع المعتمدة لدينا. لا تنتقص القواعد التجارية في تلك السياسة من الحقوق الإلزامية بموجب قوانين دولة الإمارات العربية المتحدة.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">7. الحساب والبيانات</h2>
              <p>
                أنت مسؤول عن صحة بياناتك أثناء الطلب. أي معلومات غير دقيقة قد تؤدي إلى تأخير الطلب أو إلغائه.
              </p>
              <p className="mt-2">
                يُقدَّم موقع Store1920 وصفحة الدفع عبر HTTPS (TLS). البيانات الشخصية التي ترسلها عبر الموقع — بما في ذلك الحساب والطلب والعنوان ونماذج الدعم — تُنقل عبر اتصالات مشفرة. مدفوعات البطاقات تُعالَج على صفحات مستضافة متوافقة مع PCI يديرها مزودو الدفع؛ ولا تجمع Store1920 أرقام البطاقات أو رمز CVV ولا تخزنها ولا تنقلها على خوادمنا. تحديثات الطلب عبر البريد أو الرسائل أو واتساب تسير عبر شبكات أولئك المزودين، ولا ندّعي أنها مشفرة من طرف إلى طرف. لا توجد وسيلة نقل أو تخزين إلكتروني آمنة بالكامل.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">8. الملكية الفكرية</h2>
              <p>
                جميع المحتويات في الموقع (النصوص، الصور، الشعارات، والتصميمات) محمية بحقوق الملكية الفكرية، ولا يجوز نسخها أو إعادة استخدامها
                دون إذن كتابي.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">9. حدود المسؤولية</h2>
              <p>
                لا نتحمل المسؤولية عن أي خسائر غير مباشرة أو تبعية ناتجة عن استخدام الموقع أو تأخر الخدمة، وذلك بالحد الأقصى المسموح به
                قانونًا. لا يستبعد أي بند في هذه الشروط ولا يقيّد أي حق لا يجوز استبعاده قانونًا بموجب قوانين دولة الإمارات العربية المتحدة.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">10. التعديلات على الشروط</h2>
              <p>
                نحتفظ بحق تحديث هذه الشروط في أي وقت. استمرارك في استخدام الموقع بعد نشر التحديثات يُعد موافقة على النسخة المحدثة.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-2">11. التواصل</h2>
              <p>
                لأي استفسار بخصوص الشروط والأحكام، يرجى التواصل عبر البريد الإلكتروني:
                <a href="mailto:support@Store1920.com" className="text-orange-600 underline mr-1">support@Store1920.com</a>
              </p>
              <p className="text-xs text-gray-500 mt-4">
                <strong>آخر تحديث:</strong> 11 سبتمبر 2026
              </p>
            </section>
          </div>
      </PolicyPageLayout>
    );
  }

  return (
    <PolicyPageLayout>
      <div className="text-gray-800">
        <h1 className="text-3xl font-bold mb-3">Terms & Conditions</h1>
        <p className="mb-3">
          This website is operated by <strong>{TRADING_AS}</strong>. Throughout the site, the terms “we”, “us” and “our” refer to
          {' '}<strong>{TRADING_AS}</strong>. By shopping through this website, you agree to our Terms & Conditions.
        </p>
        <p className="mb-3">
          {TRADING_AS} offers this website, including all products, tools, and services available from this site to you,
          conditioned upon your acceptance of all terms, conditions, policies, and notices stated here.
        </p>
        <p className="mb-3">
          By visiting our site and/or purchasing something from us, you engage in our “Service” and agree to be bound by these
          Terms of Service, including additional terms and policies referenced herein.
        </p>
        <p className="mb-3">
          Store1920 is a direct retailer. Products listed on this website are sold by {TRADING_AS}. We are not a marketplace and we do not sell products on behalf of third-party sellers.
        </p>
        <p className="mb-3">
          These Terms of Service apply to all users of the site, including browsers, customers, and users who submit content.
        </p>
        <p className="mb-3">
          Please read these Terms carefully before using our website. If you do not agree to all terms and conditions,
          you may not access the website or use any services.
        </p>
        <p className="mb-3">
          Nothing in these Terms excludes or limits rights that cannot lawfully be excluded under UAE law.
        </p>
        <p className="mb-8">
          Any new features or tools added to the current store shall also be subject to these Terms of Service.
          You can review the most current version at any time on this page.
        </p>

        <div className="space-y-6 border border-gray-200 rounded-xl p-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 1 – ONLINE STORE TERMS</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>By agreeing to these Terms, you confirm that you are the age of majority in your state/province, or you have consent to allow minor dependents to use this site.</li>
              <li>You may not use our products for illegal or unauthorized purposes, nor violate any laws in your jurisdiction (including copyright laws).</li>
              <li>You must not transmit worms, viruses, or destructive code.</li>
              <li>A breach or violation of these Terms may result in immediate termination of Services.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 2 – GENERAL CONDITIONS</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>We reserve the right to refuse service to anyone for any reason at any time.</li>
              <li>The Store1920 website and checkout are served over HTTPS (TLS). Personal data you submit on the site — including account, order, address and support forms — is transmitted over encrypted connections.</li>
              <li>Card payments are processed on hosted, PCI-compliant pages operated by our payment providers. Store1920 does not collect, store or transmit card numbers or CVV on our servers.</li>
              <li>Order updates sent by email, SMS or WhatsApp travel over those providers’ networks. We do not claim those third-party channels are encrypted end-to-end. No method of electronic transmission or storage is completely secure.</li>
              <li>You agree not to reproduce, duplicate, copy, sell, resell, or exploit any part of the Service without written permission.</li>
              <li>Headings are for convenience only and do not limit these Terms.</li>
              <li>We may contact customers via WhatsApp or phone for order processing, delivery updates, confirmations, and cancellations.</li>
              <li>Placing an order on Store1920.com means you agree to these Terms and Conditions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 3 – ACCURACY AND CORRECTION OF ERRORS</h2>
            <p>
              We take reasonable care to keep product information, prices, availability, and other site content accurate and current.
            </p>
            <p className="mt-2">
              If we discover an error, we may correct it before a binding contract is formed. Once we confirm your order, the confirmed price, products, and terms apply to that order.
            </p>
            <p className="mt-2">
              Correction of a listing error does not affect a confirmed order except where required by law, or where we notify you of an obvious error and you choose a refund or an alternative. Nothing in this section limits your statutory rights under UAE law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 4 – MODIFICATIONS TO THE SERVICE AND PRICES</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Listed prices may change before an order is confirmed. After we confirm your order, the confirmed price applies to that order.</li>
              <li>We may modify or discontinue the website or a service at any time. That does not change a confirmed order except as required by law or as set out in Section 3.</li>
              <li>We are not liable for modifications to unconfirmed listings, except where liability cannot lawfully be excluded under UAE law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 5 – PRODUCTS OR SERVICES (IF APPLICABLE)</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>Certain products/services may be available exclusively online and may have limited quantities.</li>
              <li>Returns or exchanges are subject to our Return Policy.</li>
              <li>We strive to display product colors and images accurately but cannot guarantee exact monitor display accuracy.</li>
              <li>We reserve the right to limit sales by person, region, or jurisdiction on a case-by-case basis.</li>
              <li>We may update product descriptions and listed prices before an order is confirmed. After confirmation, the confirmed description and price apply, subject to Section 3 and your statutory rights.</li>
              <li>We may discontinue a product at any time for future orders; offers are void where prohibited.</li>
              <li>We do not promise that the website will always be error-free. Goods sold to you remain subject to our Terms of Sale, Return Policy, and rights that cannot lawfully be excluded under UAE law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 6 – ACCURACY OF BILLING AND ACCOUNT INFORMATION</h2>
            <p>
              We reserve the right to refuse any order. We may limit or cancel quantities purchased per person, household, or order, including orders made under the same customer account, credit card, and/or billing/shipping address.
            </p>
            <p className="mt-2">
              If we change or cancel an order, we may notify you via the email and/or billing address/phone provided at order time.
            </p>
            <p className="mt-2">
              You agree to provide current, complete, and accurate purchase/account information, and to promptly update your account details.
            </p>
            <p className="mt-2">For more details, please review our Returns Policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 7 – OPTIONAL TOOLS</h2>
            <p>
              We may provide access to third-party tools over which we have no control or input. These tools are provided “as is” and “as available” without warranties or endorsements.
            </p>
            <p className="mt-2">
              Your use of optional tools is at your own risk. You should review and approve relevant third-party terms before use.
            </p>
            <p className="mt-2">
              Any future new features/services offered through the website will also be subject to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 8 – THIRD-PARTY LINKS</h2>
            <p>
              Certain content, products, and services may include third-party materials. Third-party links may direct you to websites not affiliated with us.
            </p>
            <p className="mt-2">
              We are not responsible for third-party content, accuracy, policies, products, or services, and are not liable for harm/damages from third-party transactions.
            </p>
            <p className="mt-2">
              Please review third-party policies before engaging in transactions. Third-party complaints should be directed to the relevant provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 9 – USER COMMENTS, FEEDBACK AND OTHER SUBMISSIONS</h2>
            <p>
              If you send us submissions (ideas, suggestions, proposals, plans, comments, etc.), you agree we may edit, copy, publish, distribute, translate, and otherwise use them in any medium without restriction.
            </p>
            <p className="mt-2">
              We are under no obligation to maintain comments in confidence, pay compensation, or respond to comments.
            </p>
            <p className="mt-2">
              We may monitor/edit/remove content we determine unlawful, offensive, threatening, defamatory, obscene, or violating intellectual property or these Terms.
            </p>
            <p className="mt-2">
              You are solely responsible for your comments and their accuracy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 10 – PERSONAL INFORMATION</h2>
            <p>Your submission of personal information through the store is governed by our Privacy Policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 11 – ERRORS, INACCURACIES AND OMISSIONS</h2>
            <p>
              Occasionally there may be typographical errors, inaccuracies, or omissions related to product descriptions, pricing, promotions, shipping charges, transit times, and availability.
            </p>
            <p className="mt-2">
              We may correct such errors and update information before an order is confirmed. After confirmation, the confirmed order stands, subject to your statutory rights and the obvious-error process in Section 3.
            </p>
            <p className="mt-2">
              We will not cancel a confirmed order solely to correct a listing error except as required by UAE law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 12 – PROHIBITED USES</h2>
            <p className="mb-2">You are prohibited from using the site or content:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>For unlawful purposes or soliciting unlawful acts</li>
              <li>To violate any laws, regulations, or ordinances</li>
              <li>To infringe our intellectual property or others’ rights</li>
              <li>To harass, abuse, insult, harm, defame, intimidate, or discriminate</li>
              <li>To submit false or misleading information</li>
              <li>To upload malicious code/viruses</li>
              <li>To collect or track personal information of others</li>
              <li>For spam/phishing/scraping/crawling or obscene/immoral purposes</li>
              <li>To interfere with or circumvent security features</li>
            </ul>
            <p className="mt-2">We reserve the right to terminate your use of the Service for violating prohibited uses.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 13 – DISCLAIMER OF WARRANTIES; LIMITATION OF LIABILITY</h2>
            <p>
              We do not guarantee uninterrupted, timely, secure, or error-free website service, nor that results obtained from using the website will always be accurate or reliable.
            </p>
            <p className="mt-2">
              The website is provided on an “as available” basis. Products sold to you are supplied by {TRADING_AS} as the retailer, subject to our Terms of Sale, Return Policy, and rights that cannot lawfully be excluded under UAE law.
            </p>
            <p className="mt-2">
              In no case shall {TRADING_AS}, its directors, officers, employees, affiliates, agents, contractors, interns, suppliers, service providers, or licensors be liable for indirect losses, including lost profits, revenue, data, or other consequential damages arising from use of the website, to the maximum extent permitted by law.
            </p>
            <p className="mt-2">
              Nothing in these Terms excludes or limits rights that cannot lawfully be excluded under UAE law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 14 – INDEMNIFICATION</h2>
            <p>
              You agree to indemnify, defend, and hold harmless {TRADING_AS} and its parent, subsidiaries, affiliates, partners, officers,
              directors, agents, contractors, licensors, service providers, subcontractors, suppliers, interns, and employees from any claim
              or demand (including reasonable legal fees) arising from your breach of these Terms, violation of law, or violation of third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 15 – SEVERABILITY</h2>
            <p>
              If any provision of these Terms is found unlawful, void, or unenforceable, that provision shall still be enforceable to the fullest extent permitted by law, and the unenforceable portion shall be deemed severed without affecting remaining provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 16 – TERMINATION</h2>
            <p>
              Obligations and liabilities incurred before termination survive termination for all purposes.
            </p>
            <p className="mt-2">
              These Terms remain effective unless terminated by you or us. You may terminate by notifying us you no longer wish to use our Services or by ceasing use of the site.
            </p>
            <p className="mt-2">
              If we suspect non-compliance, we may terminate this agreement at any time without notice and deny access to Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 17 – ENTIRE AGREEMENT</h2>
            <p>
              Failure by us to enforce any right/provision does not constitute waiver. These Terms and posted policies constitute the entire agreement between you and us and supersede prior agreements/communications.
            </p>
            <p className="mt-2">Any ambiguities in interpretation shall not be construed against the drafting party.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 18 – GOVERNING LAW</h2>
            <p>These Terms and any separate agreements are governed by and construed in accordance with the laws of the UAE. Nothing in these Terms excludes or limits rights that cannot lawfully be excluded under UAE law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 19 – CHANGES TO TERMS OF SERVICE</h2>
            <p>
              You can review the most current version of the Terms at this page. We may update, change, or replace any part at our sole discretion by posting updates to our website.
            </p>
            <p className="mt-2">
              It is your responsibility to check periodically. Continued use after changes are posted constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">SECTION 20 – CONTACT INFORMATION</h2>
            <p>
              Questions about the Terms of Service should be sent to <a href="mailto:support@Store1920.com" className="text-orange-600 underline">support@Store1920.com</a>.
            </p>
            <p className="text-xs text-gray-500 mt-4">
              <strong>Last Updated:</strong> 11 September 2026
            </p>
          </section>
        </div>
      </div>
    </PolicyPageLayout>
  );
}
