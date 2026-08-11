export function parseAdminEmails(raw = '') {
  return String(raw || '')
    .replace(/['"]/g, '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails() {
  return parseAdminEmails(
    process.env.NEXT_PUBLIC_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '',
  );
}

export function isAdminEmail(email = '') {
  const current = String(email || '').trim().toLowerCase();
  return Boolean(current) && getAdminEmails().includes(current);
}
