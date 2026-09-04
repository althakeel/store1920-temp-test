const DEFAULT_TZ = 'Asia/Dubai';
/** UAE has no DST — wall clock is always UTC+4. */
const DUBAI_UTC_OFFSET_HOURS = 4;

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Normalize "9:00", "09:00:00" → "09:00" */
export function normalizeDailyTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** datetime-local "YYYY-MM-DDTHH:mm" as Asia/Dubai wall time (not server UTC). */
export function parseDubaiDateTimeLocal(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/Z|[+-]\d{2}:\d{2}$/.test(raw)) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour - DUBAI_UTC_OFFSET_HOURS,
    minute,
    second,
    0,
  ));
}

export function formatDubaiDateTime(value) {
  const dated = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dated.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(dated);
}

export function uniqueDailyTimes(times = []) {
  return Array.from(
    new Set(
      (Array.isArray(times) ? times : [])
        .map(normalizeDailyTime)
        .filter(Boolean),
    ),
  ).sort();
}

export function getZonedParts(date = new Date(), timeZone = DEFAULT_TZ) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  // en-CA can yield hour "24" at midnight in some engines — normalize
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: Number(parts.minute),
    timeKey: `${pad2(hour)}:${pad2(Number(parts.minute))}`,
  };
}

export function buildSlotKey(dateKey, timeKey) {
  return `${dateKey}|${timeKey}`;
}

/**
 * Returns due slot keys for a campaign at `now` that have not been sent yet.
 * Daily: within a 5-minute window of each configured HH:mm (Dubai).
 * Once: each onceAtList datetime due (within past 5 minutes or overdue same day minute).
 */
export function getDueCampaignSlots(campaign, now = new Date(), { windowMinutes = 5 } = {}) {
  const timeZone = campaign.timezone || DEFAULT_TZ;
  const sent = new Set(campaign.sentSlots || []);
  const due = [];

  if (campaign.scheduleMode === 'daily') {
    const { dateKey, hour, minute, timeKey } = getZonedParts(now, timeZone);
    const nowMinutes = hour * 60 + minute;
    for (const time of uniqueDailyTimes(campaign.dailyTimes)) {
      const [h, m] = time.split(':').map(Number);
      const target = h * 60 + m;
      const diff = nowMinutes - target;
      if (diff >= 0 && diff < windowMinutes) {
        const slotKey = buildSlotKey(dateKey, time);
        if (!sent.has(slotKey)) due.push({ slotKey, timeKey: time, dateKey });
      }
    }
    // Also allow exact match on current minute even if window edge cases
    if (!due.length && uniqueDailyTimes(campaign.dailyTimes).includes(timeKey)) {
      const slotKey = buildSlotKey(dateKey, timeKey);
      if (!sent.has(slotKey)) due.push({ slotKey, timeKey, dateKey });
    }
    return due;
  }

  if (campaign.scheduleMode === 'once') {
    const list = Array.isArray(campaign.onceAtList) ? campaign.onceAtList : [];
    for (const onceAt of list) {
      const at = new Date(onceAt);
      if (Number.isNaN(at.getTime())) continue;
      const parts = getZonedParts(at, timeZone);
      const slotKey = buildSlotKey(parts.dateKey, parts.timeKey);
      if (sent.has(slotKey)) continue;
      // Due if scheduled time has passed and we're within 24h after (catch missed cron)
      const lagMs = now.getTime() - at.getTime();
      if (lagMs >= 0 && lagMs < 24 * 60 * 60 * 1000) {
        due.push({ slotKey, timeKey: parts.timeKey, dateKey: parts.dateKey, onceAt: at });
      }
    }
  }

  return due;
}

export function campaignIsFullyCompleted(campaign) {
  if (campaign.scheduleMode !== 'once') return false;
  const list = Array.isArray(campaign.onceAtList) ? campaign.onceAtList : [];
  if (!list.length) return false;
  const sent = new Set(campaign.sentSlots || []);
  const timeZone = campaign.timezone || DEFAULT_TZ;
  return list.every((onceAt) => {
    const at = new Date(onceAt);
    if (Number.isNaN(at.getTime())) return true;
    const parts = getZonedParts(at, timeZone);
    return sent.has(buildSlotKey(parts.dateKey, parts.timeKey));
  });
}
