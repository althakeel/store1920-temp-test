import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrashFilters';
import mongoose from 'mongoose';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function parseDashboardLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.floor(parsed));
}

export function parseDashboardPage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

export function parseDashboardDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildAbandonedCheckoutBaseMatch({
  storeId,
  fromDate = null,
  toDate = null,
} = {}) {
  const match = {
    storeId: String(storeId),
    ...ACTIVE_RECORD_FILTER,
  };

  if (fromDate || toDate) {
    const range = {};
    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lte = toDate;
    match.$or = [
      { lastSeenAt: range },
      { lastSeenAt: null, updatedAt: range },
      { lastSeenAt: { $exists: false }, updatedAt: range },
    ];
  }

  return match;
}

export function buildAbandonedCheckoutFilterMatch(filter = 'all') {
  const key = String(filter || 'all').trim().toLowerCase();

  if (key === 'converted') return { status: 'converted' };
  if (key === 'pending_payment') return { status: 'pending_payment' };
  if (key === 'checkout') return { status: { $ne: 'converted' }, source: 'checkout' };
  if (key === 'cart') {
    return {
      status: { $ne: 'converted' },
      source: { $in: ['cart', 'guest-cart'] },
    };
  }
  if (key === 'guest') {
    return {
      status: { $ne: 'converted' },
      $and: [
        { $or: [{ email: null }, { email: '' }, { email: { $exists: false } }] },
        { $or: [{ phone: null }, { phone: '' }, { phone: { $exists: false } }] },
      ],
    };
  }
  if (key === 'email_sent') {
    return {
      $or: [
        { conversionEmailSent: true },
        { recoveryLinkSentAt: { $ne: null } },
      ],
    };
  }
  if (key === 'all') return { status: { $ne: 'converted' } };
  return { status: { $ne: 'converted' }, source: key };
}

export function buildAbandonedCheckoutSearchMatch(search = '') {
  const query = String(search || '').trim();
  if (!query) return null;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };
  const phoneDigits = query.replace(/\D/g, '');

  const clauses = [
    { name: regex },
    { email: regex },
    { phone: regex },
    { anonymousId: regex },
    { 'items.name': regex },
    { 'items.productName': regex },
    { 'items.sku': regex },
    { 'address.city': regex },
    { 'address.state': regex },
    { 'address.country': regex },
  ];

  if (phoneDigits.length >= 3) {
    clauses.push({ phone: { $regex: phoneDigits } });
  }

  return { $or: clauses };
}

export function buildProductKeyExpression() {
  return {
    $cond: [
      {
        $and: [
          { $ne: [{ $ifNull: ['$items.productId', ''] }, ''] },
          { $ne: [{ $toString: '$items.productId' }, ''] },
        ],
      },
      { $concat: ['id:', { $toString: '$items.productId' }] },
      {
        $concat: [
          'name:',
          {
            $toLower: {
              $trim: {
                input: {
                  $ifNull: ['$items.name', { $ifNull: ['$items.productName', 'unknown'] }],
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export async function loadAbandonedCheckoutStats(AbandonedCart, baseMatch) {
  const [statsRows] = await AbandonedCart.aggregate([
    { $match: baseMatch },
    {
      $facet: {
        active: [
          { $match: { status: { $ne: 'converted' } } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ['$cartTotal', 0] } },
              guest: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: [{ $ifNull: ['$email', ''] }, [null, '']] },
                        { $in: [{ $ifNull: ['$phone', ''] }, [null, '']] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              checkout: {
                $sum: { $cond: [{ $eq: ['$source', 'checkout'] }, 1, 0] },
              },
              cart: {
                $sum: {
                  $cond: [{ $in: ['$source', ['cart', 'guest-cart']] }, 1, 0],
                },
              },
              pendingPayment: {
                $sum: { $cond: [{ $eq: ['$status', 'pending_payment'] }, 1, 0] },
              },
            },
          },
        ],
        converted: [
          { $match: { status: 'converted' } },
          { $count: 'count' },
        ],
        emailSent: [
          {
            $match: {
              $or: [
                { conversionEmailSent: true },
                { recoveryLinkSentAt: { $ne: null } },
              ],
            },
          },
          { $count: 'count' },
        ],
        products: [
          { $match: { status: { $ne: 'converted' } } },
          { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: buildProductKeyExpression(),
            },
          },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const active = statsRows?.active?.[0] || {};
  const activeCount = Number(active.count || 0);
  const guestCount = Number(active.guest || 0);

  return {
    active: activeCount,
    identified: Math.max(0, activeCount - guestCount),
    guest: guestCount,
    pendingPayment: Number(active.pendingPayment || 0),
    cart: Number(active.cart || 0),
    checkout: Number(active.checkout || 0),
    converted: Number(statsRows?.converted?.[0]?.count || 0),
    emailSent: Number(statsRows?.emailSent?.[0]?.count || 0),
    activeValue: Number(active.value || 0),
    productCount: Number(statsRows?.products?.[0]?.count || 0),
  };
}

export async function loadAbandonedCheckoutProducts(AbandonedCart, {
  baseMatch,
  search = '',
  page = 1,
  limit = DEFAULT_LIMIT,
} = {}) {
  const skip = (page - 1) * limit;
  const searchRegex = String(search || '').trim()
    ? { $regex: String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    : null;

  const pipeline = [
    { $match: { ...baseMatch, status: { $ne: 'converted' } } },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: {
          key: buildProductKeyExpression(),
          cartId: '$_id',
        },
        name: {
          $first: {
            $ifNull: ['$items.name', { $ifNull: ['$items.productName', 'Product'] }],
          },
        },
        productId: { $first: '$items.productId' },
        imageUrl: {
          $first: { $ifNull: ['$items.imageUrl', { $ifNull: ['$items.image', ''] }] },
        },
        quantity: { $sum: { $ifNull: ['$items.quantity', 1] } },
        lineTotal: {
          $sum: {
            $ifNull: [
              '$items.lineTotal',
              {
                $multiply: [
                  { $ifNull: ['$items.price', 0] },
                  { $ifNull: ['$items.quantity', 1] },
                ],
              },
            ],
          },
        },
        currency: { $first: { $ifNull: ['$currency', 'AED'] } },
      },
    },
    {
      $group: {
        _id: '$_id.key',
        name: { $first: '$name' },
        productId: { $first: '$productId' },
        imageUrl: { $first: '$imageUrl' },
        abandonCount: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalValue: { $sum: '$lineTotal' },
        currency: { $first: '$currency' },
      },
    },
    ...(searchRegex
      ? [{ $match: { name: searchRegex } }]
      : []),
    { $sort: { abandonCount: -1, totalQuantity: -1, totalValue: -1, name: 1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              key: '$_id',
              name: 1,
              productId: 1,
              imageUrl: 1,
              abandonCount: 1,
              totalQuantity: 1,
              totalValue: 1,
              currency: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await AbandonedCart.aggregate(pipeline).allowDiskUse(true);
  return {
    products: Array.isArray(result?.items) ? result.items : [],
    total: Number(result?.total?.[0]?.count || 0),
  };
}

export function buildProductCartMatch(productKey = '') {
  const key = String(productKey || '').trim();
  if (!key) return null;

  if (key.startsWith('id:')) {
    const productId = key.slice(3);
    if (!productId) return null;
    if (mongoose.isValidObjectId(productId)) {
      return {
        $or: [
          { 'items.productId': productId },
          { 'items.productId': new mongoose.Types.ObjectId(productId) },
        ],
      };
    }
    return { 'items.productId': productId };
  }

  if (key.startsWith('name:')) {
    const name = key.slice(5);
    if (!name) return null;
    return {
      $or: [
        { 'items.name': { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        { 'items.productName': { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    };
  }

  return {
    $or: [
      { 'items.productId': key },
      { 'items.name': { $regex: key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ],
  };
}
