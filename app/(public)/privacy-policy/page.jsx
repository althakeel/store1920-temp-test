'use client';

import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import PolicyContactBlock from '@/components/PolicyContactBlock';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';
import { STORE1920_LEGAL_NAME } from '@/lib/businessIdentity';

export default function PrivacyPolicyPage() {
  const { isArabic } = useStorefrontI18n();

  if (isArabic) {
    return (
      <PolicyPageLayout dir="rtl">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">سياسة الخصوصية</h1>
          <p className="text-xs text-gray-500 mb-4">آخر تحديث: 8 سبتمبر 2026</p>
          <p className="text-gray-600 mb-8">
            توضح سياسة الخصوصية هذه كيف يقوم Store1920.com، المملوك ويُدار من قبل <strong>{STORE1920_LEGAL_NAME}</strong>، بجمع واستخدام وحفظ وحماية معلوماتك الشخصية عند استخدام الموقع والخدمات.
          </p>

          <div className="space-y-6 border border-gray-200 rounded-xl p-6">
            <section>
              <h2 className="font-semibold text-gray-900 mb-2">1. المعلومات التي نجمعها</h2>
              <p className="text-gray-700">
                نجمع المعلومات التي تقدمها أثناء التسجيل والشراء مثل الاسم ورقم الهاتف والبريد الإلكتروني وعنوان التوصيل، بالإضافة إلى بيانات
                تقنية مثل عنوان IP ونوع الجهاز والمتصفح وبيانات الاستخدام.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">2. استخدام المعلومات</h2>
              <p className="text-gray-700">
                نستخدم معلوماتك لمعالجة الطلبات، وتقديم الدعم، وتحسين تجربة الاستخدام، ومنع الاحتيال، والالتزام بالمتطلبات القانونية.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">3. مشاركة المعلومات</h2>
              <p className="text-gray-700">
                قد نشارك البيانات مع شركاء موثوقين مثل مزودي الدفع وشركات الشحن وأدوات التحليلات لأغراض تشغيلية وقانونية فقط. نحن لا نبيع
                بياناتك الشخصية.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4. ملفات تعريف الارتباط</h2>
              <p className="text-gray-700">
                نستخدم ملفات تعريف الارتباط لتحسين أداء الموقع وتذكر تفضيلاتك وتحليل الزيارات. يمكنك تعطيلها من إعدادات المتصفح مع احتمال
                تأثر بعض الوظائف.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">4أ. الإعلانات والتخصيص</h2>
              <p className="text-gray-700 mb-2">
                قد نستخدم نحن وشركاؤنا الإعلانيون (مثل خدمات Google Ads / Google Merchant Center وMeta وأدوات التحليلات)
                ملفات تعريف الارتباط والبكسل لتقياس أداء الحملات وعرض إعلانات ذات صلة، بما في ذلك الإعلانات المخصصة.
              </p>
              <p className="text-gray-700">
                يمكنك إدارة تفضيلات ملفات تعريف الارتباط من المتصفح واستخدام خيارات إلغاء الاشتراك المتاحة. حيثما تنطبق قوانين حماية البيانات
                (بما في ذلك قانون حماية البيانات الشخصية في الإمارات ومبادئ GDPR/CCPA للزوار الدوليين عند الاقتضاء)، نعالج البيانات بشكل قانوني
                ونحترم طلبات الوصول والتصحيح والحذف عبر {STORE1920_SUPPORT_EMAIL}.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">5. أمان البيانات</h2>
              <p className="text-gray-700">
                نطبق إجراءات أمنية مناسبة مثل الاتصالات المشفرة وضوابط الوصول لحماية بياناتك. ورغم ذلك، لا توجد وسيلة نقل عبر الإنترنت
                مضمونة بنسبة 100%.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">6. حقوقك</h2>
              <p className="text-gray-700">
                يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها وفق الأنظمة المطبقة عبر التواصل معنا على support@Store1920.com.
              </p>
            </section>

            <section>
              <h2 className="font-semibold text-gray-900 mb-2">7. تحديثات السياسة</h2>
              <p className="text-gray-700">
                قد نقوم بتحديث سياسة الخصوصية من وقت لآخر، وسيتم نشر النسخة المحدثة على هذه الصفحة.
              </p>
            </section>

            <PolicyContactBlock isArabic />
          </div>
      </PolicyPageLayout>
    );
  }

  return (
    <PolicyPageLayout>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-xs text-gray-500 mb-4">Last updated: 8 September 2026</p>
        <p className="text-gray-600 mb-8">
          This Privacy Policy explains how <strong>Store1920.com</strong>, owned
          and operated by <strong>{STORE1920_LEGAL_NAME}</strong>, collects, uses, stores, and
          protects your personal information when you use our website and
          services.
        </p>

        <div className="space-y-6 border border-gray-200 rounded-xl p-6">

          {/* 1 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              1. Information We Collect
            </h2>
            <p className="text-gray-700">
              We collect personal information you provide, such as your name,
              mobile number, email address, and delivery address. We also collect
              technical information including IP address, device type, browser
              details, and usage analytics. Payment details are securely handled
              by authorized third-party payment processors, and we do not store
              sensitive payment information on our servers.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              2. How We Use Your Information
            </h2>
            <p className="text-gray-700">
              Your information is used to process orders, authenticate users,
              send OTPs, provide customer support, personalize your experience,
              improve our platform, prevent fraud, and comply with legal or
              regulatory requirements.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              3. Sharing of Information
            </h2>
            <p className="text-gray-700">
              We share personal data only with trusted third-party service
              providers such as payment gateways, logistics partners, analytics
              services, and customer support tools, strictly for operational and
              legal purposes. We do not sell, rent, or trade your personal
              information.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              4. Cookies & Tracking Technologies
            </h2>
            <p className="text-gray-700">
              Cookies and similar technologies help us improve site
              functionality, remember user preferences, analyze traffic, and
              enhance overall user experience. You may disable cookies through
              your browser settings, but certain features of the website may not
              function properly.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              4A. Advertising & Personalization
            </h2>
            <p className="text-gray-700 mb-2">
              We and our advertising partners (such as Google Ads / Google Merchant
              Center related services, Meta, and analytics providers) may use cookies,
              pixels, and similar technologies to measure campaign performance and
              show relevant ads. This may include personalized advertising based on
              your interactions with our store.
            </p>
            <p className="text-gray-700">
              You can manage cookie preferences in your browser and use available
              industry opt-outs for personalized ads. Where required by applicable
              privacy laws (including UAE Personal Data Protection Law and, where
              relevant, GDPR/CCPA principles for international visitors), we process
              personal data lawfully, keep it secure, and honor access, correction,
              and deletion requests sent to {STORE1920_SUPPORT_EMAIL}.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              5. Data Security
            </h2>
            <p className="text-gray-700">
              We use industry-standard security measures including encrypted
              connections, secure servers, and access controls to protect your
              data. However, no method of transmission over the internet is
              completely secure.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              6. Your Rights
            </h2>
            <p className="text-gray-700">
              Subject to applicable laws, you may request access to, correction
              of, or deletion of your personal information. To make such a
              request, please contact us at{' '}
              <strong>support@Store1920.com</strong>.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              7. Data Retention
            </h2>
            <p className="text-gray-700">
              We retain your personal data only for as long as necessary to
              fulfill the purposes outlined in this policy, comply with legal
              obligations, resolve disputes, or enforce agreements.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              8. Children’s Privacy
            </h2>
            <p className="text-gray-700">
              Our services are not intended for individuals under the age of 18.
              We do not knowingly collect personal information from minors. If
              such data is identified, it will be deleted promptly.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              9. International Data Transfers
            </h2>
            <p className="text-gray-700">
              Some service providers may be located outside the UAE. In
              such cases, we ensure appropriate safeguards are in place to
              protect your data in accordance with applicable laws.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              10. Third-Party Links & Services
            </h2>
            <p className="text-gray-700">
              Our website may contain links to third-party websites or services.
              We are not responsible for their privacy practices and encourage
              you to review their policies before sharing any personal data.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">
              11. Changes to This Policy
            </h2>
            <p className="text-gray-700">
              Store1920 reserves the right to update this Privacy Policy at any time.
              Any changes will be posted on this page along with an updated
              &ldquo;Last Updated&rdquo; date.
            </p>
          </section>

          <PolicyContactBlock />
        </div>
    </PolicyPageLayout>
  );
}
