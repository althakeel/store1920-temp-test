const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_DAYS = 90;
const HIGH_VALUE_TOP_PERCENT = 0.2;

export const EMAIL_AUDIENCES = [
  {
    id: 'all',
    label: 'All ordered customers',
    description: 'Every customer with at least one order and a valid email',
  },
  {
    id: 'new',
    label: '1-time purchased',
    description: 'Customers who placed exactly one order',
  },
  {
    id: 'repeat',
    label: 'Repeat customers',
    description: 'Customers with two or more orders',
  },
  {
    id: 'high_value',
    label: 'High-value customers',
    description: 'Top 20% by lifetime spend',
  },
  {
    id: 'inactive_90',
    label: 'Abandoned (no purchase in 90 days)',
    description: 'Past buyers who have not ordered in the last 90 days',
  },
  {
    id: 'uae',
    label: 'UAE customers',
    description: 'Latest shipping country or phone is UAE',
  },
  {
    id: 'unsubscribed',
    label: 'Unsubscribed (promotional)',
    description: 'Opted out of promotional emails — never included in sends',
  },
];

const VALID_AUDIENCE_IDS = new Set(EMAIL_AUDIENCES.map((item) => item.id));

export function normalizeEmailAudience(value) {
  const id = String(value || 'all').trim().toLowerCase();
  return VALID_AUDIENCE_IDS.has(id) ? id : 'all';
}

export function getEmailAudienceMeta(audienceId) {
  const id = normalizeEmailAudience(audienceId);
  return EMAIL_AUDIENCES.find((item) => item.id === id) || EMAIL_AUDIENCES[0];
}

function hasUsableEmail(customer) {
  const email = String(customer?.email || '').trim().toLowerCase();
  if (!email || email === 'no email') return false;
  return email.includes('@');
}

export function isUaeCustomer(customer) {
  const country = String(
    customer?.latestCountry
    || customer?.country
    || customer?.shippingCountry
    || '',
  ).trim().toLowerCase();

  if (
    country === 'ae'
    || country === 'are'
    || country === 'uae'
    || country === 'u.a.e'
    || country === 'u.a.e.'
    || country === 'united arab emirates'
    || country.includes('emirates')
    || country.includes('الإمارات')
    || country.includes('امارات')
  ) {
    return true;
  }

  const phoneCode = String(
    customer?.latestPhoneCode
    || customer?.phoneCode
    || '',
  ).replace(/\s/g, '');

  return phoneCode === '+971' || phoneCode === '971' || phoneCode.startsWith('+971');
}

function daysSince(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const then = new Date(dateValue).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

function buildHighValueIdSet(customers) {
  const ranked = customers
    .filter((customer) => Number(customer.totalOrders || 0) > 0 && Number(customer.totalSpent || 0) > 0)
    .sort((left, right) => Number(right.totalSpent || 0) - Number(left.totalSpent || 0));

  if (!ranked.length) return new Set();

  const count = Math.max(1, Math.ceil(ranked.length * HIGH_VALUE_TOP_PERCENT));
  return new Set(ranked.slice(0, count).map((customer) => String(customer.id || customer._id)));
}

/**
 * Filter aggregated store customers into an email audience.
 * Only customers with a usable email are included.
 * "all" = everyone who has placed at least one order (and has email).
 */
export function filterCustomersByEmailAudience(customers = [], audienceId = 'all', { now = new Date() } = {}) {
  const audience = normalizeEmailAudience(audienceId);
  const withEmail = (Array.isArray(customers) ? customers : []).filter(hasUsableEmail);
  const ordered = withEmail.filter((customer) => Number(customer.totalOrders || 0) >= 1);
  const highValueIds = audience === 'high_value' ? buildHighValueIdSet(ordered) : null;

  return ordered.filter((customer) => {
    const totalOrders = Number(customer.totalOrders || 0);
    const customerId = String(customer.id || customer._id || '');
    const unsubscribed = customer.promotionalOptOut === true
      || customer.emailPreferences?.promotional === false;

    switch (audience) {
      case 'unsubscribed':
        return unsubscribed;
      case 'new':
        return !unsubscribed && totalOrders === 1;
      case 'repeat':
        return !unsubscribed && totalOrders >= 2;
      case 'high_value':
        return !unsubscribed && highValueIds.has(customerId);
      case 'inactive_90': {
        const days = daysSince(customer.lastOrderDate, now);
        return !unsubscribed && days != null && days >= INACTIVE_DAYS;
      }
      case 'uae':
        return !unsubscribed && isUaeCustomer(customer);
      case 'all':
      default:
        return !unsubscribed;
    }
  });
}

export function summarizeEmailAudiences(customers = [], { now = new Date() } = {}) {
  return EMAIL_AUDIENCES.map((audience) => ({
    ...audience,
    count: filterCustomersByEmailAudience(customers, audience.id, { now }).length,
  }));
}

export function toEmailAudienceRecipient(customer) {
  const promotionalOptOut = customer.promotionalOptOut === true
    || customer.emailPreferences?.promotional === false;
  return {
    id: String(customer.id || customer._id || customer.email),
    name: customer.name || 'Customer',
    email: String(customer.email || '').trim(),
    totalOrders: Number(customer.totalOrders || 0),
    totalSpent: Number(customer.totalSpent || 0),
    lastOrderDate: customer.lastOrderDate || null,
    country: customer.latestCountry || customer.country || '',
    promotionalOptOut,
  };
}
