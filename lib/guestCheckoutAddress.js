const GUEST_CHECKOUT_STORAGE_KEY = 'store1920_guest_checkout';
const GUEST_CONTACT_STORAGE_KEY = 'store1920_guest_contact';

function emptyState() {
  return { addresses: [], selectedId: '', draft: null };
}

function cleanText(value) {
  return String(value || '').trim();
}

export function createGuestAddressId() {
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeGuestAddress(address = {}, fallbackId = '') {
  const id = String(address._id || address.id || fallbackId || createGuestAddressId());
  return {
    _id: id,
    id,
    name: cleanText(address.name),
    email: cleanText(address.email),
    phone: String(address.phone || '').replace(/\D/g, ''),
    phoneCode: cleanText(address.phoneCode) || '+971',
    alternatePhone: String(address.alternatePhone || '').replace(/\D/g, ''),
    alternatePhoneCode: cleanText(address.alternatePhoneCode || address.phoneCode) || '+971',
    street: cleanText(address.street || address.address),
    city: cleanText(address.city || address.district || address.state),
    state: cleanText(address.state),
    district: cleanText(address.district),
    country: cleanText(address.country) || 'United Arab Emirates',
    zip: cleanText(address.zip || address.pincode),
    pincode: cleanText(address.pincode || address.zip),
  };
}

export function formToGuestDraft(form = {}) {
  return {
    name: cleanText(form.name),
    email: cleanText(form.email),
    phone: String(form.phone || '').replace(/\D/g, ''),
    phoneCode: cleanText(form.phoneCode) || '+971',
    alternatePhone: String(form.alternatePhone || '').replace(/\D/g, ''),
    alternatePhoneCode: cleanText(form.alternatePhoneCode || form.phoneCode) || '+971',
    street: cleanText(form.street),
    city: cleanText(form.city || form.district || form.state),
    state: cleanText(form.state),
    district: cleanText(form.district),
    country: cleanText(form.country) || 'United Arab Emirates',
    zip: cleanText(form.pincode || form.zip),
    pincode: cleanText(form.pincode || form.zip),
  };
}

export function isCompleteGuestDraft(draft = {}) {
  const data = formToGuestDraft(draft);
  if (!data.name || !data.email || !data.phone || !data.street || !data.state || !data.country) return false;
  const country = data.country.toLowerCase();
  if (country === 'united arab emirates' || country === 'india') {
    return Boolean(data.district);
  }
  return true;
}

function syncGuestContact(draft) {
  if (typeof window === 'undefined' || !draft) return;
  try {
    window.localStorage.setItem(GUEST_CONTACT_STORAGE_KEY, JSON.stringify({
      name: draft.name || null,
      email: draft.email || null,
      phone: draft.phone || null,
      phoneCode: draft.phoneCode || '+971',
    }));
  } catch {
    // Ignore storage write failures.
  }
}

export function readGuestCheckoutState() {
  if (typeof window === 'undefined') return emptyState();

  try {
    const raw = window.localStorage.getItem(GUEST_CHECKOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const addresses = Array.isArray(parsed?.addresses)
        ? parsed.addresses.map((address) => normalizeGuestAddress(address))
        : [];
      const draft = parsed?.draft ? formToGuestDraft(parsed.draft) : null;
      const selectedId = String(parsed?.selectedId || addresses[0]?._id || '');
      return { addresses, selectedId, draft };
    }
  } catch {
    // Fall through to the older contact-only key.
  }

  try {
    const contact = JSON.parse(window.localStorage.getItem(GUEST_CONTACT_STORAGE_KEY) || 'null');
    if (contact && typeof contact === 'object') {
      return {
        ...emptyState(),
        draft: formToGuestDraft(contact),
      };
    }
  } catch {
    // Ignore storage read failures.
  }

  return emptyState();
}

export function writeGuestCheckoutState({ addresses = [], selectedId = '', draft = null } = {}) {
  if (typeof window === 'undefined') return;

  const normalizedAddresses = addresses.map((address) => normalizeGuestAddress(address));
  const nextDraft = draft ? formToGuestDraft(draft) : (normalizedAddresses[0] || null);
  const next = {
    addresses: normalizedAddresses,
    selectedId: String(selectedId || normalizedAddresses[0]?._id || ''),
    draft: nextDraft,
  };

  try {
    window.localStorage.setItem(GUEST_CHECKOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures.
  }

  syncGuestContact(nextDraft);
}

export function upsertGuestAddress(addresses = [], address = {}) {
  const nextAddress = normalizeGuestAddress(address, address._id || address.id);
  const index = addresses.findIndex((item) => String(item._id) === String(nextAddress._id));
  if (index >= 0) {
    const next = addresses.slice();
    next[index] = nextAddress;
    return { addresses: next, address: nextAddress };
  }
  return { addresses: [...addresses, nextAddress], address: nextAddress };
}

export function removeGuestAddress(addresses = [], addressId) {
  return addresses.filter((item) => String(item._id) !== String(addressId));
}
