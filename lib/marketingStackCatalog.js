export const MARKETING_STACK_SECTIONS = [
  {
    id: 'analytics',
    label: 'Analytics & Tracking',
    color: '#E1F5EE',
    borderColor: '#1D9E75',
    textColor: '#0F6E56',
    iconBg: '#9FE1CB',
    items: [
      { id: 'page-event-tracker', name: 'Page view & event tracker', desc: 'Track every page, click, add-to-cart, checkout step. Custom JS event layer firing to your DB.', tag: 'must', status: 'live', href: '/store/customer-tracking' },
      { id: 'session-utm', name: 'Session & UTM capture', desc: 'Capture UTM params, referrer, device, browser on session start. Store with session_id.', tag: 'must', status: 'live', href: '/store/customer-tracking' },
      { id: 'conversion-funnel', name: 'Conversion funnel tracking', desc: 'Define funnel steps in admin. Track drop-off rates between each step.', tag: 'must', status: 'live', href: '/store/marketing-analytics' },
      { id: 'revenue-analytics', name: 'Revenue & order analytics', desc: 'GMV, AOV, orders over time. Filterable by channel, product, segment.', tag: 'must', status: 'partial', href: '/store/sales-report' },
      { id: 'custom-events', name: 'Custom event builder', desc: 'Admin UI to define custom events and their properties without a code deploy.', tag: 'nice', status: 'planned' },
      { id: 'heatmap', name: 'Heatmap data collection', desc: 'Record click coords per page. Replay or visualize density without third-party tools.', tag: 'adv', status: 'live', href: '/store/heatmap' },
    ],
  },
  {
    id: 'journey',
    label: 'Customer Journey Mapping',
    color: '#E6F1FB',
    borderColor: '#378ADD',
    textColor: '#185FA5',
    iconBg: '#B5D4F4',
    items: [
      { id: 'user-timeline', name: 'User timeline view', desc: 'Per-customer chronological log: sessions, views, purchases, emails, support tickets.', tag: 'must', status: 'live', href: '/store/customer-tracking' },
      { id: 'touchpoint-attribution', name: 'Touchpoint attribution', desc: 'First-touch, last-touch, and linear attribution models. Stored per order.', tag: 'must', status: 'partial', href: '/store/ads-tracking' },
      { id: 'cohort-tracking', name: 'Cohort tracking', desc: 'Group customers by acquisition date/channel. Track retention and LTV over time.', tag: 'must', status: 'live', href: '/store/cohorts' },
      { id: 'journey-path', name: 'Journey path analysis', desc: 'Most common page sequences before purchase. Stored as path arrays, queryable.', tag: 'nice', status: 'partial', href: '/store/customer-tracking' },
      { id: 'cross-device', name: 'Cross-device linking', desc: 'Link sessions across devices via email login. Unified customer profile.', tag: 'nice', status: 'partial', href: '/store/customers' },
      { id: 'churn-score', name: 'Predictive churn score', desc: 'ML model trained on your data. Score stored per customer, updated weekly.', tag: 'adv', status: 'live', href: '/store/churn-scores' },
    ],
  },
  {
    id: 'segmentation',
    label: 'Customer Data & Segmentation',
    color: '#FAEEDA',
    borderColor: '#BA7517',
    textColor: '#854F0B',
    iconBg: '#FAC775',
    items: [
      { id: 'customer-profile', name: 'Customer profile store', desc: 'Unified record: demographics, LTV, order count, last seen, segment tags.', tag: 'must', status: 'partial', href: '/store/customers' },
      { id: 'dynamic-segments', name: 'Dynamic segment builder', desc: 'Admin UI to build segments with AND/OR rules on any customer attribute or behavior.', tag: 'must', status: 'planned' },
      { id: 'rfm-scoring', name: 'RFM scoring', desc: 'Auto-calculate Recency, Frequency, Monetary score. Update daily via cron.', tag: 'nice', status: 'live', href: '/store/rfm-scores' },
      { id: 'tag-system', name: 'Tag & label system', desc: 'Manual or auto-applied tags (VIP, at-risk, returning). Used to filter campaigns.', tag: 'nice', status: 'planned' },
      { id: 'lookalike-export', name: 'Lookalike audience export', desc: 'Export segment as CSV or sync to ad platforms (Meta, Google) via API.', tag: 'adv', status: 'planned' },
      { id: 'survey-data', name: 'Customer survey data', desc: 'Store NPS, CSAT results on profile. Include in segmentation logic.', tag: 'nice', status: 'planned' },
    ],
  },
  {
    id: 'email',
    label: 'Email & CRM Automation',
    color: '#EEEDFE',
    borderColor: '#7F77DD',
    textColor: '#534AB7',
    iconBg: '#CECBF6',
    items: [
      { id: 'transactional-email', name: 'Transactional email engine', desc: 'Order confirm, shipping, password reset. Template system with variable injection.', tag: 'must', status: 'live', href: '/store/orders' },
      { id: 'abandoned-cart-flows', name: 'Abandoned cart flows', desc: 'Trigger email sequence when cart is idle 1h / 24h / 48h. Cancelable on purchase.', tag: 'must', status: 'partial', href: '/store/abandoned-checkout' },
      { id: 'behavioral-triggers', name: 'Behavioral trigger engine', desc: 'Fire emails/SMS on events: first purchase, 90-day no-order, birthday.', tag: 'nice', status: 'live', href: '/store/behavioral-triggers' },
      { id: 'email-preferences', name: 'Email preference center', desc: 'Subscriber manages opt-ins by category. Unsubscribe tokens, GDPR compliant.', tag: 'must', status: 'live', href: '/settings' },
      { id: 'campaign-manager', name: 'Campaign manager', desc: 'Build, schedule, and A/B test email campaigns. Audience = any saved segment.', tag: 'nice', status: 'partial', href: '/store/email-marketing' },
      { id: 'flow-builder', name: 'Flow builder (visual)', desc: 'Drag-and-drop multi-step automation builder. Branches on open/click/no action.', tag: 'adv', status: 'planned' },
    ],
  },
  {
    id: 'product-intel',
    label: 'Product & Merchandising Intelligence',
    color: '#FAECE7',
    borderColor: '#D85A30',
    textColor: '#993C1D',
    iconBg: '#F5C4B3',
    items: [
      { id: 'product-performance', name: 'Product performance dashboard', desc: 'Views, add-to-carts, purchases, revenue per SKU. Sortable, exportable.', tag: 'must', status: 'live', href: '/store/marketing-analytics' },
      { id: 'search-analytics', name: 'Search term analytics', desc: 'What users searched, results shown, click-through, and zero-result queries.', tag: 'must', status: 'live', href: '/store/marketing-analytics' },
      { id: 'recommendation-data', name: 'Recommendation engine data', desc: "Store co-purchase and co-view data. Power 'you may also like' blocks.", tag: 'nice', status: 'partial' },
      { id: 'ab-testing', name: 'A/B test framework', desc: 'Assign users to variants at session start. Track conversion per variant. Report winner.', tag: 'nice', status: 'planned' },
      { id: 'pricing-log', name: 'Dynamic pricing log', desc: 'Record price changes per SKU. Track impact on conversion before/after.', tag: 'adv', status: 'planned' },
      { id: 'inventory-alerts', name: 'Inventory alert triggers', desc: 'Auto-email to marketing when product hits low stock threshold. Pause related ads.', tag: 'nice', status: 'planned' },
    ],
  },
  {
    id: 'attribution',
    label: 'Ad & Channel Attribution',
    color: '#EAF3DE',
    borderColor: '#639922',
    textColor: '#3B6D11',
    iconBg: '#C0DD97',
    items: [
      { id: 'utm-store', name: 'UTM parameter store', desc: 'Persist all UTM fields on session and order. Never lose source data at checkout.', tag: 'must', status: 'live', href: '/store/ads-tracking' },
      { id: 'channel-revenue', name: 'Channel revenue report', desc: 'Revenue and orders grouped by source/medium/campaign. Date-filterable.', tag: 'must', status: 'partial', href: '/store/ads-tracking' },
      { id: 'ad-spend-import', name: 'Ad spend import', desc: 'Manual CSV or API pull from Meta/Google. Calculate ROAS per campaign.', tag: 'nice', status: 'partial', href: '/store/marketing-expenses' },
      { id: 'coupon-tracking', name: 'Coupon code tracking', desc: 'Map coupon codes to campaigns. Track redemptions, revenue attributed.', tag: 'must', status: 'partial', href: '/store/coupons' },
      { id: 'pixel-capi', name: 'Pixel event API (server-side)', desc: 'Send conversion events to Meta/Google CAPI from backend. More reliable than browser pixel.', tag: 'adv', status: 'partial' },
      { id: 'affiliate-tracking', name: 'Affiliate tracking', desc: 'Unique referral links per affiliate. Track clicks, orders, commissions.', tag: 'nice', status: 'partial', href: '/store/customers' },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting & Admin Backend',
    color: '#FBEAF0',
    borderColor: '#D4537E',
    textColor: '#993556',
    iconBg: '#F4C0D1',
    items: [
      { id: 'marketing-dashboard', name: 'Marketing dashboard', desc: 'Live KPI tiles: revenue, sessions, conversion rate, CAC, LTV. Configurable widgets.', tag: 'must', status: 'live', href: '/store/marketing-analytics' },
      { id: 'report-scheduler', name: 'Report scheduler', desc: 'Auto-email PDF/CSV reports daily or weekly to marketing stakeholders.', tag: 'nice', status: 'planned' },
      { id: 'data-export', name: 'Data export engine', desc: 'Any table or segment exportable as CSV with field selector. Respects GDPR flags.', tag: 'must', status: 'partial', href: '/store/sales-report' },
      { id: 'gdpr-consent', name: 'GDPR / consent manager', desc: 'Store consent per user per purpose. Honor deletion requests. Audit log.', tag: 'must', status: 'partial', href: '/privacy-policy' },
      { id: 'api-keys', name: 'API key manager', desc: 'Issue read-only API keys for analysts to query data. Rate-limited.', tag: 'nice', status: 'planned' },
      { id: 'webhooks', name: 'Webhook dispatcher', desc: 'Outbound webhooks on key events (order placed, segment entry). For BI tools.', tag: 'adv', status: 'planned' },
    ],
  },
];

export function getMarketingStackStats() {
  const items = MARKETING_STACK_SECTIONS.flatMap((section) => section.items);
  return {
    total: items.length,
    live: items.filter((item) => item.status === 'live').length,
    partial: items.filter((item) => item.status === 'partial').length,
    planned: items.filter((item) => item.status === 'planned').length,
  };
}

export const STATUS_LABELS = {
  live: { label: 'Live', className: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-800' },
  planned: { label: 'Planned', className: 'bg-slate-100 text-slate-600' },
};

export const TAG_LABELS = {
  must: { label: 'Must-have', className: 'bg-[#E1F5EE] text-[#0F6E56]' },
  nice: { label: 'Nice-to-have', className: 'bg-[#FAEEDA] text-[#854F0B]' },
  adv: { label: 'Advanced', className: 'bg-[#EEEDFE] text-[#534AB7]' },
};
