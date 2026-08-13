import { isGeminiConfigured } from '@/configs/gemini';
import { uploadToS3 } from '@/lib/storage';
import { normalizeImageForAi } from '@/lib/normalizeImageForAi';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_IMAGES = 8;

const MODEL_CANDIDATES = [
  process.env.GEMINI_IMAGE_ENHANCE_MODEL,
  'gemini-2.5-flash-image',
].filter(Boolean);

function buildEnhancePrompt(productName = '') {
  const label = String(productName || '').trim();
  return [
    'Enhance this e-commerce product photo to high resolution with maximum clarity and sharpness.',
    'Keep the exact same product, colors, packaging, labels, and shape. Do not change the product design.',
    'Remove JPEG compression artifacts, improve lighting, and make details crisp for an online store listing.',
    'Use a clean professional white or neutral studio background.',
    label ? `Product: ${label}.` : '',
    'Return one enhanced product image suitable for a marketplace product page.',
  ].filter(Boolean).join(' ');
}

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function extractImagePart(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts || [];
  return parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
}

async function downloadImageBuffer(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`Could not download image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error('Downloaded image was empty');
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('Image is too large to enhance');
  }

  const mimeType = String(response.headers.get('content-type') || 'image/jpeg')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!mimeType.startsWith('image/')) {
    throw new Error('URL is not a valid image');
  }

  return { buffer, mimeType };
}

async function callGeminiImageEnhance({ base64, mimeType, productName }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini is not configured');
  }

  let lastError = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: buildEnhancePrompt(productName) },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
          signal: AbortSignal.timeout(90000),
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error?.message || `Gemini request failed (${response.status})`;
        throw new Error(message);
      }

      const imagePart = extractImagePart(payload);
      const outputBase64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
      if (!outputBase64) {
        throw new Error('Gemini returned no enhanced image');
      }

      const outputMime = String(
        imagePart?.inlineData?.mimeType
        || imagePart?.inline_data?.mime_type
        || 'image/png'
      ).toLowerCase();

      return {
        buffer: Buffer.from(outputBase64, 'base64'),
        mimeType: outputMime,
        model,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[geminiProductImageEnhancer] model ${model} failed:`, error?.message || error);
    }
  }

  throw lastError || new Error('Gemini image enhancement failed');
}

export async function enhanceProductImageFromUrl(imageUrl, productName = '') {
  const { buffer, mimeType } = await downloadImageBuffer(imageUrl);
  const normalized = await normalizeImageForAi({
    base64Image: buffer.toString('base64'),
    mimeType,
  });
  const enhanced = await callGeminiImageEnhance({
    base64: normalized.base64Image,
    mimeType: normalized.mimeType,
    productName,
  });

  const extension = enhanced.mimeType.includes('png') ? 'png' : 'jpg';
  const upload = await uploadToS3({
    buffer: enhanced.buffer,
    fileName: `enhanced_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`,
    folder: 'products',
    contentType: enhanced.mimeType,
  });

  return {
    url: upload.url,
    enhanced: true,
    model: enhanced.model,
    sourceUrl: imageUrl,
  };
}

export async function enhanceProductImages(imageUrls = [], productName = '', options = {}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  const maxImages = Number(options.maxImages || process.env.GEMINI_IMAGE_ENHANCE_MAX || DEFAULT_MAX_IMAGES);
  const enhanceEnabled = options.enhanceImages !== false;
  const concurrency = Math.max(1, Number(options.concurrency || process.env.GEMINI_IMAGE_ENHANCE_CONCURRENCY || 2));

  if (!urls.length || !enhanceEnabled || !isGeminiConfigured()) {
    return {
      images: urls,
      enhancedCount: 0,
      provider: null,
    };
  }

  const enhancedUrls = [...urls];
  let enhancedCount = 0;
  const targets = urls.slice(0, maxImages).map((sourceUrl, index) => ({ sourceUrl, index }));

  for (let start = 0; start < targets.length; start += concurrency) {
    const batch = targets.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async ({ sourceUrl, index }) => {
      try {
        const result = await enhanceProductImageFromUrl(sourceUrl, productName);
        return { index, url: result.url, enhanced: true };
      } catch (error) {
        console.warn('[geminiProductImageEnhancer] fallback to original image:', sourceUrl, error?.message || error);
        return { index, url: sourceUrl, enhanced: false };
      }
    }));

    results.forEach(({ index, url, enhanced }) => {
      enhancedUrls[index] = url;
      if (enhanced) enhancedCount += 1;
    });
  }

  return {
    images: enhancedUrls,
    enhancedCount,
    provider: enhancedCount > 0 ? 'gemini' : null,
  };
}
