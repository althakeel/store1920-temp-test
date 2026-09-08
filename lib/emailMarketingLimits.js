/** Max emails in one HTTP send request (test / leftover direct send). */
export const EMAIL_MARKETING_MAX_PER_REQUEST = 5;

/** Hard cap per promotional / marketing campaign send. */
export const EMAIL_MARKETING_MAX_RECIPIENTS = Math.min(
  100000,
  Math.max(
    1,
    Number(process.env.EMAIL_MARKETING_MAX_RECIPIENTS || 10000) || 10000,
  ),
);

export function normalizeMarketingRecipientEmails(emails = []) {
  return Array.from(
    new Set(
      (Array.isArray(emails) ? emails : [])
        .map((email) => String(email || '').trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  );
}

/**
 * @returns {{ ok: true, count: number, max: number } | { ok: false, error: string, count: number, max: number }}
 */
export function assertMarketingRecipientCount(count, {
  max = EMAIL_MARKETING_MAX_RECIPIENTS,
} = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const limit = Math.max(1, Number(max) || EMAIL_MARKETING_MAX_RECIPIENTS);
  if (n > limit) {
    return {
      ok: false,
      error: `Too many recipients (${n.toLocaleString()}). Maximum allowed is ${limit.toLocaleString()} emails per send. Narrow the audience and try again.`,
      count: n,
      max: limit,
    };
  }
  return { ok: true, count: n, max: limit };
}

/**
 * @returns {{ ok: true, emails: string[] } | { ok: false, error: string, count: number, max: number }}
 */
export function assertMarketingRecipientLimit(emails = [], {
  max = EMAIL_MARKETING_MAX_RECIPIENTS,
} = {}) {
  const unique = normalizeMarketingRecipientEmails(emails);
  const countCheck = assertMarketingRecipientCount(unique.length, { max });
  if (!countCheck.ok) {
    return {
      ok: false,
      error: countCheck.error,
      count: countCheck.count,
      max: countCheck.max,
    };
  }
  return { ok: true, emails: unique, count: unique.length, max: countCheck.max };
}
