import Store from '@/models/Store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeLeadEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeLeadPhone(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function normalizeLeadName(value) {
  return String(value || '').trim().slice(0, 120);
}

export function isValidLeadEmail(email) {
  return EMAIL_RE.test(email);
}

export function sanitizeLeadPayload(body = {}) {
  const email = normalizeLeadEmail(body.email);
  const phone = normalizeLeadPhone(body.phone);
  const name = normalizeLeadName(body.name);
  const source = String(body.source || 'welcome_offer').trim().slice(0, 64) || 'welcome_offer';
  const formStyle = String(body.formStyle || '').trim().slice(0, 64);
  const formType = String(body.formType || '').trim().slice(0, 64);
  const heading = String(body.heading || '').trim().slice(0, 200);
  const campaignId = String(body.campaignId || '').trim().slice(0, 120);
  const campaignName = String(body.campaignName || '').trim().slice(0, 200);

  return {
    email,
    phone,
    name,
    source,
    formStyle,
    formType,
    heading,
    campaignId,
    campaignName,
  };
}

export function validateLeadContact({ email, phone }) {
  if (!email && !phone) {
    return 'Email or phone is required.';
  }
  if (email && !isValidLeadEmail(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export async function resolvePublicStoreId() {
  let store = await Store.findOne({ isActive: true, status: 'approved' })
    .select('_id')
    .lean();

  if (!store) {
    store = await Store.findOne({ status: { $ne: 'rejected' } })
      .select('_id')
      .sort({ createdAt: 1 })
      .lean();
  }

  if (!store) {
    store = await Store.findOne().select('_id').sort({ createdAt: 1 }).lean();
  }

  return store?._id ? String(store._id) : null;
}

export function clientIpFromRequest(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || '';
}
