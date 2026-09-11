import StoreActivityLog from '@/models/StoreActivityLog';
import Store from '@/models/Store';
import StoreUser from '@/models/StoreUser';
import User from '@/models/User';
import { isAdminEmail } from '@/lib/adminEmails';
import {
  describeStoreActivity,
  normalizeActivityPath,
  shouldSkipStoreActivityPath,
} from '@/lib/storeActivityDescribe';

export {
  describeStoreActivity,
  normalizeActivityPath,
  shouldSkipStoreActivityPath,
  summarizeStoreActivityPayload,
} from '@/lib/storeActivityDescribe';

const DUBAI_OFFSET_HOURS = 4;

export function canViewStoreActivityHistory(email = '', permissions = {}) {
  if (isAdminEmail(email)) return true;
  return permissions?.viewActivityHistory === true;
}

function dubaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: read('year'), month: read('month'), day: read('day') };
}

export function startOfDubaiDay(date = new Date()) {
  const { year, month, day } = dubaiParts(date);
  return new Date(Date.UTC(year, month - 1, day, -DUBAI_OFFSET_HOURS, 0, 0, 0));
}

export function endOfDubaiDay(date = new Date()) {
  const start = startOfDubaiDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function parseDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00+04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildActivityLogQuery({
  storeId = '',
  actorUserId = '',
  range = 'all',
  fromDate = '',
  toDate = '',
  q = '',
} = {}) {
  const query = { storeId: String(storeId) };

  if (actorUserId) query.actorUserId = String(actorUserId);

  const search = String(q || '').trim();
  if (search) {
    query.$or = [
      { actorName: { $regex: search, $options: 'i' } },
      { actorEmail: { $regex: search, $options: 'i' } },
      { action: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
      { path: { $regex: search, $options: 'i' } },
      { pagePath: { $regex: search, $options: 'i' } },
    ];
  }

  const now = new Date();
  if (range === 'today') {
    query.createdAt = { $gte: startOfDubaiDay(now), $lte: endOfDubaiDay(now) };
  } else if (range === 'week') {
    const weekStart = new Date(startOfDubaiDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
    query.createdAt = { $gte: weekStart, $lte: endOfDubaiDay(now) };
  } else {
    const from = parseDateInput(fromDate);
    const to = parseDateInput(toDate);
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = startOfDubaiDay(from);
      if (to) query.createdAt.$lte = endOfDubaiDay(to);
    }
  }

  return query;
}

export function formatActivityLogRow(row = {}) {
  const path = row.path || '';
  const isInsights = /\/dashboard\/insights/.test(path);
  const details = Array.isArray(row.metadata?.details)
    ? row.metadata.details.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    _id: String(row._id),
    storeId: String(row.storeId || ''),
    actorUserId: String(row.actorUserId || ''),
    actorEmail: String(row.actorEmail || ''),
    actorName: String(row.actorName || ''),
    actorRole: row.actorRole || 'unknown',
    method: String(row.method || '').toUpperCase(),
    path,
    pagePath: row.pagePath || '',
    action: isInsights ? 'Generated AI insights' : (row.action || describeStoreActivity(row)),
    summary: isInsights
      ? 'Refreshed dashboard recommendations. No store settings were changed.'
      : (row.summary || details.join(' · ')),
    details,
    status: Number(row.status || 200),
    createdAt: row.createdAt || null,
  };
}

export async function recordStoreActivity(entry = {}) {
  try {
    const storeId = String(entry.storeId || '').trim();
    const path = normalizeActivityPath(entry.path);
    if (!storeId || !path || shouldSkipStoreActivityPath(path)) return null;

    const method = String(entry.method || 'POST').toLowerCase();
    if (!['post', 'put', 'patch', 'delete'].includes(method)) return null;

    await StoreActivityLog.create({
      storeId,
      actorUserId: String(entry.actorUserId || ''),
      actorEmail: String(entry.actorEmail || '').trim().toLowerCase(),
      actorName: String(entry.actorName || entry.actorEmail || 'Store user').trim(),
      actorRole: ['owner', 'admin', 'member'].includes(entry.actorRole) ? entry.actorRole : 'unknown',
      method: method.toUpperCase(),
      path,
      pagePath: normalizeActivityPath(entry.pagePath),
      action: String(entry.action || describeStoreActivity({ method, path, pagePath: entry.pagePath })).slice(0, 240),
      summary: String(entry.summary || '').trim().slice(0, 800),
      status: Number(entry.status || 200),
      metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
    });
  } catch (error) {
    console.warn('[recordStoreActivity] failed:', error?.message || error);
  }
  return null;
}

export async function listActivityActors(storeId) {
  const store = await Store.findById(String(storeId)).select('userId name').lean();
  const owner = store?.userId
    ? await User.findById(String(store.userId)).select('name email').lean()
    : null;
  const members = await StoreUser.find({
    storeId: String(storeId),
    status: { $in: ['approved', 'pending'] },
  }).select('userId email username role').lean();

  const actors = [];
  const seen = new Set();

  const pushActor = (userId, name, email, role) => {
    const id = String(userId || email || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    actors.push({
      id,
      userId: String(userId || ''),
      name: String(name || email || 'Store user').trim(),
      email: String(email || '').trim().toLowerCase(),
      role: role || 'member',
    });
  };

  if (store?.userId) {
    pushActor(
      store.userId,
      owner?.name || owner?.email || 'Store owner',
      owner?.email || '',
      'owner',
    );
  }

  for (const member of members) {
    pushActor(
      member.userId || member._id,
      member.username || member.email,
      member.email,
      member.role === 'admin' ? 'admin' : 'member',
    );
  }

  return actors;
}
