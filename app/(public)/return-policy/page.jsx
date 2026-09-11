'use client';

import Link from 'next/link';
import PolicyPageLayout from '@/components/PolicyPageLayout';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import PolicyContactBlock from '@/components/PolicyContactBlock';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_LEGAL_NAME_AR,
  STORE1920_BUSINESS_HOURS_EN,
  STORE1920_BUSINESS_HOURS_AR,
  getRegisteredOfficeSingleLine,
  getFulfilmentAddressSingleLine,
} from '@/lib/businessIdentity';

const RETURNS_ADDRESS = getFulfilmentAddressSingleLine();
const REGISTERED_OFFICE = getRegisteredOfficeSingleLine();
const PHONE_DISPLAY = formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE);

const EMAIL_SPLIT_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const EMAIL_MATCH_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_SPLIT_PATTERN = /(\b8007861920\b|\b800 786 1920\b)/g;

function PolicyText({ children, className = 'text-gray-700 mt-2 first:mt-0' }) {
  const Tag = className.includes('inline') ? 'span' : 'p';
  if (typeof children !== 'string') {
    return <Tag className={className}>{children}</Tag>;
  }

  const withPhoneParts = children.split(PHONE_SPLIT_PATTERN);

  return (
    <Tag className={className}>
      {withPhoneParts.map((segment, segmentIndex) => {
        if (segment === STORE1920_CUSTOMER_SUPPORT_PHONE || segment === PHONE_DISPLAY) {
          return (
            <a
              key={`phone-${segmentIndex}`}
              href={STORE1920_CUSTOMER_SUPPORT_TEL}
              className="text-orange-600 underline"
            >
              {segment}
            </a>
          );
        }

        const parts = segment.split(EMAIL_SPLIT_PATTERN);
        return parts.map((part, index) => (
          EMAIL_MATCH_PATTERN.test(part) ? (
            <a key={`${part}-${segmentIndex}-${index}`} href={`mailto:${part}`} className="text-orange-600 underline">
              {part}
            </a>
          ) : (
            <span key={`${part}-${segmentIndex}-${index}`}>{part}</span>
          )
        ));
      })}
    </Tag>
  );
}

function buildPageCopy() {
  return {
  en: {
    title: 'Return, Refund, Replacement & Cancellation Policy',
    intro:
      `Store1920.com is owned and operated by ${STORE1920_LEGAL_NAME} (“Store1920”, “we”, “us”). Store1920 purchases products from manufacturers and suppliers and sells them directly to customers. We are your seller of record and first point of contact for returns, refunds, replacements and warranty support.`,
    lastUpdated: 'Last updated: 11 September 2026',
    sections: [
      {
        title: '1. Return request window',
        paragraphs: [
          'You may request a return within 7 calendar days after delivery for an eligible item. A request is made on time when it is submitted through My Orders, the Return Request page, or customer support within that period.',
          'This 7-day commercial return window does not reduce any rights or remedies that apply under UAE law for defective, damaged, incomplete, unsafe, incorrectly supplied, not-as-described or otherwise non-compliant goods, or under an applicable product warranty. Those rights include remedies under Federal Decree-Law No. 14 of 2023 on Trading by Modern Technological Means and Federal Law No. 15 of 2020 on Consumer Protection and its executive regulation.',
        ],
      },
      {
        title: '2. Reasons we accept returns',
        bullets: [
          'Store1920 error: the item is wrong, missing, damaged in transit, defective on arrival, incomplete, or materially different from its description.',
          'Change of mind: the eligible item is unused, unopened where a seal applies, unactivated, in resalable condition, and returned with original packaging, labels, accessories, manuals, gifts and proof of purchase.',
          'Delivery delay: where UAE law or the order terms provide a remedy because the delay makes the product no longer useful for its intended purpose.',
        ],
      },
      {
        title: '3. Items not eligible for change-of-mind return',
        bullets: [
          'Opened, activated, configured or used phones, tablets, laptops, wearables and similar personal electronics, unless a defect or other mandatory right applies.',
          'Hygiene, personal-care, beauty or intimate products after opening or where the hygiene seal is broken.',
          'Perishable goods and consumables with a short shelf life.',
          'Digital products, software, activation codes or media after access, activation or unsealing.',
          'Personalised, made-to-order or custom-configured products.',
          'Hazardous, flammable or restricted goods where safe return is not possible.',
          'Clearance items only where the product page clearly stated “final sale / not returnable for change of mind” before purchase.',
        ],
        paragraphsAfter: [
          'These exclusions do not apply where the item is defective, damaged, incomplete, wrong, not as described, unlawful or otherwise protected by mandatory UAE consumer rights. Order value alone does not remove return rights.',
        ],
      },
      {
        title: '4. Condition and evidence',
        paragraphs: [
          'Please keep the original packaging and provide your order number. For a damaged, wrong, incomplete or defective item, photos or a short video may help us assess the issue quickly. Evidence requests must be reasonable and will not be used to block a valid statutory claim.',
        ],
      },
      {
        title: '5. Return shipping and collection',
        paragraphs: [
          'If Store1920 confirms that the item is wrong, damaged, defective, incomplete or not as described, Store1920 will arrange collection or provide return instructions at no return-shipping cost to you. For an approved change-of-mind return, the customer pays the disclosed return-collection charge. The charge will be confirmed before collection and may be deducted from the refund with your agreement.',
          `Do not send products to a manufacturer, supplier or unlisted location. Returns must follow the instructions issued by Store1920. Return address: ${RETURNS_ADDRESS}.`,
        ],
      },
      {
        title: '6. Inspection and decision',
        paragraphs: [
          'We will inspect the returned item and notify you of approval, rejection or any reasonable deduction. Change-of-mind items may be rejected if used, activated, incomplete or not in resalable condition. Defective and statutory claims will be handled according to applicable UAE law and warranty terms.',
        ],
      },
      {
        title: '7. Remedies',
        paragraphs: [
          'For a valid Store1920-error, defect or non-conformity claim, we will provide the remedy required by applicable law, which may include repair, replacement or refund. If a replacement is approved but unavailable, we will issue a refund. For an approved change-of-mind return, we will issue a refund; customers may place a new order for a different item.',
        ],
      },
      {
        title: '8. Refund method and timing',
        bullets: [
          'Cards: refund initiated to the original card/payment method within 5–7 business days after approval.',
          'Tabby/Tamara: refund submitted through the original provider within 5–7 business days after approval; instalment adjustments follow the provider’s processing rules.',
          'Cash on Delivery: refund by verified UAE bank transfer within 5–7 business days after approval and receipt of complete bank details.',
          'Original delivery charges are refunded when the return is caused by Store1920’s error or where required by law. Change-of-mind delivery charges are not refundable.',
        ],
        paragraphsAfter: [
          'Your bank or payment provider may require additional time to display the refund after Store1920 initiates it. We will provide a refund reference on request.',
        ],
      },
      {
        title: '9. Cancellations',
        paragraphs: [
          'You may request cancellation any time before dispatch through My Orders or customer support. If the order has already been dispatched, cancellation may not be possible and this return policy will apply after delivery. Approved prepaid cancellations are refunded to the original payment method. Store1920 may cancel an order for stock, pricing, payment verification, safety or fraud-prevention reasons and will refund any captured payment.',
        ],
      },
      {
        title: '10. Warranty support',
        paragraphs: [
          'Warranty coverage varies by product and is shown on the product page or warranty document where applicable. Contact Store1920 first with the order number, serial number and issue details. We will coordinate the appropriate assessment, repair, replacement or other remedy with the manufacturer or supplier. Warranty exclusions may include misuse, accidental damage, unauthorised repairs and normal wear, subject to applicable law.',
        ],
      },
      {
        title: '11. How to contact us',
        bullets: [
          'Online: My Orders or Return Request page',
          `Email: ${STORE1920_SUPPORT_EMAIL}`,
          `Phone: ${PHONE_DISPLAY}`,
          `Business hours: ${STORE1920_BUSINESS_HOURS_EN}`,
          `Legal entity: ${STORE1920_LEGAL_NAME}`,
          `Registered office: ${REGISTERED_OFFICE}`,
          `Fulfilment and returns: ${RETURNS_ADDRESS}`,
        ],
        paragraphsAfter: [
          'Nothing in this policy excludes or limits rights that cannot lawfully be excluded or limited under applicable UAE law.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الإرجاع والاسترداد والاستبدال والإلغاء',
    intro:
      `Store1920.com مملوك ويُدار من قبل ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME}) («Store1920» أو «نحن»). تشتري Store1920 المنتجات من المصنّعين والمورّدين وتبيعها مباشرة للعملاء. نحن بائع السجل وجهة التواصل الأولى للإرجاع والاسترداد والاستبدال ودعم الضمان.`,
    lastUpdated: 'آخر تحديث: 11 سبتمبر 2026',
    sections: [
      {
        title: '1. مهلة طلب الإرجاع',
        paragraphs: [
          'يمكنك طلب إرجاع منتج مؤهل خلال 7 أيام تقويمية بعد التسليم. يُعد الطلب مقدَّمًا في الوقت إذا أُرسل عبر طلباتي أو صفحة طلب الإرجاع أو دعم العملاء خلال تلك المهلة.',
          'مهلة الإرجاع التجارية البالغة 7 أيام لا تنتقص من أي حق أو معالجة تسري بموجب قوانين دولة الإمارات للمنتجات المعيبة أو التالفة أو الناقصة أو غير الآمنة أو المورَّدة خطأً أو غير المطابقة للوصف أو غير المطابقة، أو بموجب ضمان المنتج الساري. تشمل تلك الحقوق سبل المعالجة بموجب المرسوم بقانون اتحادي رقم 14 لسنة 2023 بشأن التجارة من خلال الوسائل التكنولوجية الحديثة، والقانون الاتحادي رقم 15 لسنة 2020 في شأن حماية المستهلك ولائحته التنفيذية.',
        ],
      },
      {
        title: '2. أسباب قبول الإرجاع',
        bullets: [
          'خطأ Store1920: المنتج خاطئ أو ناقص أو تالف أثناء النقل أو معيب عند الوصول أو غير مكتمل أو يختلف جوهريًا عن وصفه.',
          'تغيير الرأي: المنتج المؤهل غير مستخدم، وغير مفتوح حيث يوجد ختم، وغير مفعّل، وقابل لإعادة البيع، ويُعاد مع العبوة الأصلية والملصقات والملحقات والكتيبات والهدايا وإثبات الشراء.',
          'تأخير التسليم: حيث يوفّر قانون الإمارات أو شروط الطلب معالجة لأن التأخير جعل المنتج غير مفيد للغرض المقصود منه.',
        ],
      },
      {
        title: '3. منتجات غير مؤهلة لإرجاع تغيير الرأي',
        bullets: [
          'الهواتف والأجهزة اللوحية والحواسيب المحمولة والأجهزة القابلة للارتداء والإلكترونيات الشخصية المماثلة إذا فُتحت أو فُعّلت أو أُعدّت أو استُخدمت، ما لم ينطبق عيب أو حق إلزامي آخر.',
          'منتجات النظافة والعناية الشخصية والتجميل أو المنتجات الحميمة بعد الفتح أو عند كسر ختم النظافة.',
          'السلع القابلة للتلف والمستهلكات ذات صلاحية قصيرة.',
          'المنتجات الرقمية أو البرمجيات أو رموز التفعيل أو الوسائط بعد الوصول إليها أو تفعيلها أو فضّ ختمها.',
          'المنتجات المخصصة أو المصنوعة حسب الطلب أو المعدّة تخصيصًا.',
          'السلع الخطرة أو القابلة للاشتعال أو المقيّدة عندما يتعذّر إرجاعها بأمان.',
          'منتجات التصفية فقط إذا ذكرت صفحة المنتج بوضوح قبل الشراء «بيع نهائي / غير قابل للإرجاع لتغيير الرأي».',
        ],
        paragraphsAfter: [
          'لا تسري هذه الاستثناءات إذا كان المنتج معيبًا أو تالفًا أو ناقصًا أو خاطئًا أو غير مطابق للوصف أو غير مشروع أو محميًا بحقوق المستهلك الإلزامية في دولة الإمارات. قيمة الطلب وحدها لا تسقط حق الإرجاع.',
        ],
      },
      {
        title: '4. الحالة والإثبات',
        paragraphs: [
          'يُرجى الاحتفاظ بالعبوة الأصلية وتقديم رقم الطلب. للمنتج التالف أو الخاطئ أو الناقص أو المعيب، تساعد الصور أو فيديو قصير على تقييم المشكلة بسرعة. طلبات الإثبات يجب أن تكون معقولة ولن تُستخدم لمنع مطالبة نظامية صحيحة.',
        ],
      },
      {
        title: '5. شحن الإرجاع والاستلام',
        paragraphs: [
          'إذا أكدت Store1920 أن المنتج خاطئ أو تالف أو معيب أو ناقص أو غير مطابق للوصف، ترتّب Store1920 الاستلام أو تقدّم تعليمات الإرجاع دون تكلفة شحن إرجاع عليك. لإرجاع تغيير الرأي المعتمد، يدفع العميل رسوم استلام الإرجاع المُفصح عنها. تُؤكَّد الرسوم قبل الاستلام وقد تُخصم من المبلغ المسترد بموافقتك.',
          `لا ترسل المنتجات إلى الشركة المصنعة أو المورّد أو إلى عنوان غير مدرج. يجب أن يتبع الإرجاع التعليمات الصادرة من Store1920. عنوان الإرجاع: ${RETURNS_ADDRESS}.`,
        ],
      },
      {
        title: '6. الفحص والقرار',
        paragraphs: [
          'نفحص المنتج المرتجع ونبلغك بالموافقة أو الرفض أو أي خصم معقول. قد يُرفض إرجاع تغيير الرأي إذا استُخدم المنتج أو فُعّل أو كان ناقصًا أو غير قابل لإعادة البيع. تُعالج المطالبات المتعلقة بالعيوب والحقوق النظامية وفق قوانين دولة الإمارات السارية وشروط الضمان.',
        ],
      },
      {
        title: '7. سبل المعالجة',
        paragraphs: [
          'لمطالبة صحيحة بسبب خطأ Store1920 أو عيب أو عدم مطابقة، نقدّم المعالجة التي يوجبها القانون الساري، وقد تشمل الإصلاح أو الاستبدال أو الاسترداد. إذا وُوفق على الاستبدال ولم يتوفر المخزون، نعيد المبلغ. لإرجاع تغيير الرأي المعتمد نعيد المبلغ؛ ويمكن للعميل إنشاء طلب جديد لمنتج آخر.',
        ],
      },
      {
        title: '8. طريقة الاسترداد ومواعيده',
        bullets: [
          'البطاقات: يبدأ الاسترداد إلى البطاقة أو وسيلة الدفع الأصلية خلال 5 إلى 7 أيام عمل بعد الموافقة.',
          'تابي/تمارا: يُقدَّم الاسترداد عبر المزود الأصلي خلال 5 إلى 7 أيام عمل بعد الموافقة؛ وتعديلات الأقساط تتبع قواعد معالجة المزود.',
          'الدفع عند الاستلام: استرداد بتحويل بنكي إماراتي موثّق خلال 5 إلى 7 أيام عمل بعد الموافقة واستلام بيانات الحساب كاملة.',
          'تُعاد رسوم التوصيل الأصلية إذا كان الإرجاع بسبب خطأ Store1920 أو حيث يوجب القانون ذلك. رسوم توصيل تغيير الرأي غير قابلة للاسترداد.',
        ],
        paragraphsAfter: [
          'قد يحتاج البنك أو مزود الدفع وقتًا إضافيًا لإظهار المبلغ بعد أن تبدأ Store1920 الاسترداد. نقدّم مرجع الاسترداد عند الطلب.',
        ],
      },
      {
        title: '9. الإلغاء',
        paragraphs: [
          'يمكنك طلب الإلغاء في أي وقت قبل الشحن عبر طلباتي أو دعم العملاء. إذا شُحن الطلب، قد لا يكون الإلغاء ممكنًا وتسري سياسة الإرجاع هذه بعد التسليم. تُعاد دفعات الإلغاء المسبق المعتمدة إلى وسيلة الدفع الأصلية. يجوز لـ Store1920 إلغاء طلب لأسباب تتعلق بالمخزون أو التسعير أو التحقق من الدفع أو السلامة أو منع الاحتيال، وتعيد أي مبلغ تم تحصيله.',
        ],
      },
      {
        title: '10. دعم الضمان',
        paragraphs: [
          'تغطية الضمان تختلف حسب المنتج وتظهر في صفحة المنتج أو وثيقة الضمان حيثما وُجدت. تواصل مع Store1920 أولًا مع رقم الطلب والرقم التسلسلي وتفاصيل المشكلة. ننسّق التقييم أو الإصلاح أو الاستبدال أو أي معالجة مناسبة مع الشركة المصنعة أو المورّد. قد يستثني الضمان سوء الاستخدام والتلف العرضي والإصلاح غير المصرّح به والبلى الطبيعي، مع مراعاة القانون الساري.',
        ],
      },
      {
        title: '11. كيفية التواصل معنا',
        bullets: [
          'عبر الموقع: طلباتي أو صفحة طلب الإرجاع',
          `البريد الإلكتروني: ${STORE1920_SUPPORT_EMAIL}`,
          `الهاتف: ${PHONE_DISPLAY}`,
          `ساعات العمل: ${STORE1920_BUSINESS_HOURS_AR}`,
          `الكيان القانوني: ${STORE1920_LEGAL_NAME_AR} (${STORE1920_LEGAL_NAME})`,
          `المكتب المسجّل: ${REGISTERED_OFFICE}`,
          `عنوان التجهيز والإرجاع: ${RETURNS_ADDRESS}`,
        ],
        paragraphsAfter: [
          'لا يستبعد أي بند في هذه السياسة ولا يقيّد أي حق لا يجوز استبعاده أو تقييده قانونًا بموجب قوانين دولة الإمارات السارية.',
        ],
      },
    ],
  },
  };
}

export default function ReturnPolicyPage() {
  const { isArabic } = useStorefrontI18n();
  const pageCopy = buildPageCopy();
  const copy = isArabic ? pageCopy.ar : pageCopy.en;

  return (
    <PolicyPageLayout dir={isArabic ? 'rtl' : undefined}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{copy.title}</h1>
      <p className="text-xs text-gray-500 mb-2">{copy.lastUpdated}</p>
      <p className="text-gray-600 mb-4">{copy.intro}</p>
      <div className="mb-8 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-gray-800">
        {isArabic ? (
          <>
            اطلب الإرجاع من الموقع مباشرة من{' '}
            <Link href="/orders" className="font-semibold text-orange-700 underline">طلباتي</Link>
            {' '}أو صفحة{' '}
            <Link href="/return-request" className="font-semibold text-orange-700 underline">طلب الإرجاع</Link>.
          </>
        ) : (
          <>
            Request a return on the website from{' '}
            <Link href="/orders" className="font-semibold text-orange-700 underline">My Orders</Link>
            {' '}or the{' '}
            <Link href="/return-request" className="font-semibold text-orange-700 underline">Return Request</Link>
            {' '}page.
          </>
        )}
      </div>

      <div className="space-y-6 border border-gray-200 rounded-xl p-6">
        {copy.sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-semibold text-gray-900 mb-2">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <PolicyText key={paragraph}>{paragraph}</PolicyText>
            ))}
            {section.bullets?.length ? (
              <ul className={`list-disc text-gray-700 mt-2 space-y-1 ${isArabic ? 'mr-6' : 'ml-6'}`}>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>
                    <PolicyText className="inline text-gray-700">{bullet}</PolicyText>
                  </li>
                ))}
              </ul>
            ) : null}
            {section.paragraphsAfter?.map((paragraph) => (
              <PolicyText key={paragraph}>{paragraph}</PolicyText>
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
