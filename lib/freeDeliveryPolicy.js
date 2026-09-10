export const FREE_DELIVERY_THRESHOLD_AED = 100;

export const FREE_DELIVERY_STATEMENT = {
  en: 'Free standard delivery applies to orders with a qualifying merchandise total of AED 100 or more. Any exclusions, express-delivery charges, remote-area charges or Cash on Delivery fees will be displayed at checkout before the customer places the order.',
  ar: 'التوصيل العادي مجاني للطلبات التي يبلغ مجموع بضاعتها المؤهلة 100 درهم أو أكثر. تظهر أي استثناءات أو رسوم توصيل سريع أو رسوم مناطق نائية أو رسوم الدفع عند الاستلام عند الدفع قبل أن يقدّم العميل الطلب.',
};

export function getFreeDeliveryStatement(isArabic = false) {
  return isArabic ? FREE_DELIVERY_STATEMENT.ar : FREE_DELIVERY_STATEMENT.en;
}
