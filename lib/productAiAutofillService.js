import Product from '@/models/Product';
import Category from '@/models/Category';
import ProductAiAutofillJob from '@/models/ProductAiAutofillJob';
import { runInProductAiQueue } from '@/lib/aiRequestQueue';
import {
  buildProductUpdateFromAutofill,
  getFirstProductImageUrl,
} from '@/lib/applyProductAutofillUpdate';
import { deleteCacheKey, invalidateStorefrontProductCaches } from '@/lib/cache';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_BULK_INTERVAL_MS = Number(process.env.PRODUCT_AI_BULK_INTERVAL_MS || 60000);
const MAX_RECENT_RESULTS = 30;

export function getBulkAutofillIntervalMs() {
  return Math.max(1000, DEFAULT_BULK_INTERVAL_MS);
}

async function loadImageFromUrl(imageUrl) {
  let url = String(imageUrl || '').trim();
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    url = `${base.replace(/\/$/, '')}${url}`;
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Product needs a valid image URL for AI autofill');
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) {
    throw new Error(`Could not load product image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image is too large for AI autofill');
  }

  const mimeType = String(response.headers.get('content-type') || 'image/jpeg')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!mimeType.startsWith('image/')) {
    throw new Error('Product media must include an image for AI autofill');
  }

  return {
    base64Image: buffer.toString('base64'),
    mimeType,
  };
}

export async function autofillSingleProduct({
  productId,
  storeId,
  includeArabic = true,
  storeCategories = null,
  // Bulk/cron must never overwrite seller-written copy. Manual AI button may overwrite.
  overwriteExisting = false,
}) {
  const product = await Product.findOne({ _id: productId, storeId }).lean();
  if (!product) {
    throw new Error('Product not found');
  }

  const imageUrl = getFirstProductImageUrl(product);
  if (!imageUrl) {
    throw new Error('Upload at least one product image before running AI autofill');
  }

  const categories = storeCategories
    || await Category.find({}).select('_id name').sort({ name: 1 }).lean();

  const additionalContext = [
    product.name ? `Current product name: ${product.name}` : '',
    product.brand ? `Current brand: ${product.brand}` : '',
    // Never send SKU to AI — SKU is seller-managed only and must not be rewritten.
  ].filter(Boolean).join('\n');

  const resolvedImage = await loadImageFromUrl(imageUrl);

  const { runProductAutofill } = await import('@/lib/runProductAutofill');
  const autofill = await runInProductAiQueue(() => runProductAutofill({
    base64Image: resolvedImage.base64Image,
    mimeType: resolvedImage.mimeType,
    additionalContext,
    includeArabic,
    storeCategories: categories,
  }));

  const update = buildProductUpdateFromAutofill(autofill, product, {
    includeArabic,
    updateSlug: false,
    fillEmptyOnly: !overwriteExisting,
  });

  // Hard lock: AI autofill must never write product or variant SKUs.
  delete update.sku;
  delete update.variants;

  if (!Object.keys(update).length) {
    return {
      productId: String(productId),
      name: product.name,
      updatedFields: [],
      skipped: true,
      reason: 'Product already has details — left unchanged',
      provider: autofill.provider || 'ai',
    };
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, storeId },
    { $set: update },
    { new: true },
  ).lean();

  deleteCacheKey(`reviews:product:${productId}`);
  invalidateStorefrontProductCaches();

  return {
    productId: String(productId),
    name: updated?.name || product.name,
    updatedFields: Object.keys(update),
    provider: autofill.provider || 'ai',
  };
}

function productHasImage(product = {}) {
  return Boolean(getFirstProductImageUrl(product));
}

function productNeedsAutofill(product = {}, includeArabic = true) {
  const missingDescription = !String(product.description || '').trim();
  const missingShort = !String(product.shortDescription || '').trim();
  const missingArabic = includeArabic && (
    !String(product.nameAr || '').trim()
    || !String(product.descriptionAr || '').trim()
  );
  return missingDescription || missingShort || missingArabic;
}

export async function findBulkAutofillCandidates(storeId, { mode = 'missing_details' } = {}) {
  const products = await Product.find({ storeId })
    .select('_id name images externalImages description shortDescription nameAr descriptionAr')
    .sort({ createdAt: 1 })
    .lean();

  return products.filter((product) => {
    if (!productHasImage(product)) return false;
    // Default and recommended: only products missing copy — never queue filled products.
    if (mode === 'with_images') {
      return true;
    }
    return productNeedsAutofill(product, true);
  });
}

export function serializeAutofillJob(job) {
  if (!job) return null;

  const total = Number(job.totalCount || job.productIds?.length || 0);
  const processed = Number(job.currentIndex || 0);
  const remaining = Math.max(0, total - processed);

  return {
    id: String(job._id),
    storeId: job.storeId,
    status: job.status,
    includeArabic: job.includeArabic !== false,
    mode: job.mode || 'missing_details',
    intervalMs: job.intervalMs || getBulkAutofillIntervalMs(),
    totalCount: total,
    processedCount: processed,
    remainingCount: remaining,
    successCount: Number(job.successCount || 0),
    failedCount: Number(job.failedCount || 0),
    currentProductId: job.currentProductId || '',
    currentProductName: job.currentProductName || '',
    lastProcessedAt: job.lastProcessedAt || null,
    nextProcessAt: job.nextProcessAt || null,
    startedAt: job.startedAt || job.createdAt || null,
    completedAt: job.completedAt || null,
    recentResults: Array.isArray(job.recentResults) ? job.recentResults.slice(-MAX_RECENT_RESULTS) : [],
  };
}

export async function getActiveAutofillJob(storeId) {
  const job = await ProductAiAutofillJob.findOne({
    storeId: String(storeId),
    status: { $in: ['running', 'paused'] },
  }).sort({ createdAt: -1 }).lean();

  return serializeAutofillJob(job);
}

export async function startBulkAutofillJob(storeId, {
  mode = 'missing_details',
  includeArabic = true,
  intervalMs = getBulkAutofillIntervalMs(),
} = {}) {
  const existing = await ProductAiAutofillJob.findOne({
    storeId: String(storeId),
    status: { $in: ['running', 'paused'] },
  });

  if (existing) {
    return serializeAutofillJob(existing);
  }

  const safeMode = mode === 'with_images' ? 'with_images' : 'missing_details';
  const candidates = await findBulkAutofillCandidates(storeId, { mode: safeMode });
  const productIds = candidates.map((product) => String(product._id));

  if (!productIds.length) {
    throw new Error(
      safeMode === 'missing_details'
        ? 'No products with images are missing details for AI auto-fill'
        : 'No products with images found for AI auto-fill'
    );
  }

  const now = new Date();
  const job = await ProductAiAutofillJob.create({
    storeId: String(storeId),
    status: 'running',
    mode: safeMode,
    includeArabic: includeArabic !== false,
    intervalMs: Math.max(1000, Number(intervalMs) || getBulkAutofillIntervalMs()),
    productIds,
    currentIndex: 0,
    totalCount: productIds.length,
    nextProcessAt: now,
    startedAt: now,
  });

  return serializeAutofillJob(job);
}

export async function pauseBulkAutofillJob(storeId) {
  const job = await ProductAiAutofillJob.findOneAndUpdate(
    { storeId: String(storeId), status: 'running' },
    { $set: { status: 'paused' } },
    { new: true },
  ).lean();
  return serializeAutofillJob(job);
}

export async function resumeBulkAutofillJob(storeId) {
  const now = new Date();
  const job = await ProductAiAutofillJob.findOneAndUpdate(
    { storeId: String(storeId), status: 'paused' },
    {
      $set: {
        status: 'running',
        nextProcessAt: now,
      },
    },
    { new: true },
  ).lean();
  return serializeAutofillJob(job);
}

export async function cancelBulkAutofillJob(storeId) {
  const job = await ProductAiAutofillJob.findOneAndUpdate(
    { storeId: String(storeId), status: { $in: ['running', 'paused'] } },
    { $set: { status: 'cancelled', completedAt: new Date() } },
    { new: true },
  ).lean();
  return serializeAutofillJob(job);
}

export async function cancelAllRunningAutofillJobs() {
  const result = await ProductAiAutofillJob.updateMany(
    { status: { $in: ['running', 'paused'] } },
    {
      $set: {
        status: 'cancelled',
        completedAt: new Date(),
        currentProductId: '',
        currentProductName: '',
      },
    },
  );
  return {
    cancelled: Number(result?.modifiedCount || 0),
  };
}

export async function processNextBulkAutofillItem(storeId = null) {
  const query = {
    status: 'running',
    ...(storeId ? { storeId: String(storeId) } : {}),
  };

  const jobs = await ProductAiAutofillJob.find(query).sort({ nextProcessAt: 1 }).limit(storeId ? 1 : 20);
  const outputs = [];

  for (const jobDoc of jobs) {
    const job = jobDoc.toObject();
    const now = Date.now();
    const nextAt = job.nextProcessAt ? new Date(job.nextProcessAt).getTime() : 0;

    if (nextAt > now) {
      outputs.push({
        jobId: String(job._id),
        storeId: job.storeId,
        skipped: true,
        waitMs: nextAt - now,
      });
      continue;
    }

    const index = Number(job.currentIndex || 0);
    const productIds = Array.isArray(job.productIds) ? job.productIds : [];

    if (index >= productIds.length) {
      const completed = await ProductAiAutofillJob.findByIdAndUpdate(
        job._id,
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            currentProductId: '',
            currentProductName: '',
          },
        },
        { new: true },
      ).lean();
      outputs.push({ jobId: String(job._id), storeId: job.storeId, completed: true, job: serializeAutofillJob(completed) });
      continue;
    }

    const productId = String(productIds[index]);
    const product = await Product.findOne({ _id: productId, storeId: job.storeId })
      .select('name description shortDescription nameAr descriptionAr')
      .lean();
    const productName = product?.name || 'Product';

    await ProductAiAutofillJob.findByIdAndUpdate(job._id, {
      $set: {
        currentProductId: productId,
        currentProductName: productName,
      },
    });

    let result;
    try {
      // Never overwrite existing seller copy from bulk/cron.
      if (product && !productNeedsAutofill(product, job.includeArabic !== false)) {
        result = {
          productId,
          name: productName,
          success: true,
          skipped: true,
          updatedFields: [],
          error: 'Skipped — product already has details',
        };
      } else {
        const autofillResult = await autofillSingleProduct({
          productId,
          storeId: job.storeId,
          includeArabic: job.includeArabic !== false,
          overwriteExisting: false,
        });
        result = {
          productId,
          name: autofillResult.name || productName,
          success: true,
          skipped: Boolean(autofillResult.skipped),
          updatedFields: autofillResult.updatedFields || [],
        };
      }
    } catch (error) {
      result = {
        productId,
        name: productName,
        success: false,
        error: error?.message || 'AI autofill failed',
      };
    }

    const processedAt = new Date();
    const nextProcessAt = new Date(processedAt.getTime() + (job.intervalMs || getBulkAutofillIntervalMs()));
    const isLast = index + 1 >= productIds.length;

    const updated = await ProductAiAutofillJob.findByIdAndUpdate(
      job._id,
      {
        $set: {
          currentIndex: index + 1,
          lastProcessedAt: processedAt,
          nextProcessAt: isLast ? null : nextProcessAt,
          currentProductId: isLast ? '' : productId,
          currentProductName: isLast ? '' : productName,
          ...(isLast ? { status: 'completed', completedAt: processedAt } : {}),
        },
        $inc: {
          successCount: result.success ? 1 : 0,
          failedCount: result.success ? 0 : 1,
        },
        $push: {
          recentResults: {
            $each: [{ ...result, at: processedAt }],
            $slice: -MAX_RECENT_RESULTS,
          },
        },
      },
      { new: true },
    ).lean();

    outputs.push({
      jobId: String(job._id),
      storeId: job.storeId,
      processed: true,
      result,
      job: serializeAutofillJob(updated),
    });
  }

  return outputs;
}
