import { ensureGemini, isGeminiConfigured } from '@/configs/gemini';
import {
  formatProductAutofillPayload,
  parseAutofillJson,
} from '@/lib/productAiAutofill';
import { callWithRateLimitRetry } from '@/lib/aiProviderErrors';
import { shouldUseGeminiForProducts } from '@/lib/productAiConfig';

export { shouldUseGeminiForProducts };

const TEXT_MODEL = process.env.GEMINI_PRODUCT_AUTOFILL_MODEL || 'gemini-3.6-flash';
const VISION_MODEL = process.env.GEMINI_PRODUCT_VISION_MODEL || TEXT_MODEL;

function buildCategoryHint(storeCategories = []) {
  const categoryNames = storeCategories
    .map((category) => String(category?.name || '').trim())
    .filter(Boolean)
    .slice(0, 120);

  return categoryNames.length > 0
    ? `Pick 1-3 best matching categories ONLY from this store list: ${categoryNames.join(', ')}`
    : 'Suggest 1-3 practical ecommerce category names for this product.';
}

function buildAutofillInstructions(includeArabic = false) {
  const arabicSchema = includeArabic
    ? `,
  "nameAr": string,
  "brandAr": string,
  "shortDescriptionAr": string,
  "shortDescription2Ar": string,
  "descriptionAr": string,
  "descriptionOverviewAr": string,
  "descriptionDetailsAr": string,
  "specTableTitleAr": string,
  "specTableColumnsAr": string[],
  "specTableRowsAr": string[][]`
    : '';

  const arabicRules = includeArabic
    ? `
- Also provide complete Arabic counterparts for every Arabic field above.
- Write Arabic in natural GCC e-commerce Modern Standard Arabic.
- specTableColumnsAr must be exactly: ["الخاصية", "القيمة"].
- specTableRowsAr must mirror specTableRows with accurate Arabic translations.
- shortDescription2Ar must mirror shortDescription2 in Arabic.
- specTableTitleAr should be a natural Arabic title such as "مواصفات المنتج".`
    : '';

  return `
You are a senior ecommerce copywriter and product data specialist.
Analyze the product carefully and produce accurate, detailed listing content.

Accuracy rules (critical):
- Only state facts you can clearly see or that were explicitly provided.
- Do NOT invent model numbers, certifications, warranty periods, or exact specs unless visible or provided.
- NEVER invent, suggest, or return a SKU / stock-keeping unit / product code. SKU is managed only by the seller manually. Do not include any "sku" field.
- If a spec is uncertain, omit it instead of guessing.

Content rules:
- Write a detailed English listing with rich product information.
- descriptionOverview: 2-3 sentences introducing the product.
- descriptionDetails: 1-2 paragraphs covering use cases, benefits, and visible details.
- features: 4-8 concise bullet points of real benefits.
- shortDescription: one compelling line for listing cards.
- shortDescription2: one extra highlight line.
- specTableRows: include 5-12 accurate rows when possible.
- suggestedCategories: choose only from the provided store category list when available.

Respond ONLY with raw JSON (no code block, no markdown, no explanation).
Schema:
{
  "name": string,
  "brand": string,
  "shortDescription": string,
  "shortDescription2": string,
  "descriptionOverview": string,
  "descriptionDetails": string,
  "features": string[],
  "suggestedCategories": string[],
  "tags": string[],
  "seoTitle": string,
  "seoDescription": string,
  "seoKeywords": string[],
  "badges": string[],
  "deliveredBy": string,
  "soldBy": string,
  "paymentInfo": string,
  "specTableTitle": string,
  "specTableColumns": string[],
  "specTableRows": string[][]${arabicSchema}
}

Additional rules:
- Keep name concise and ecommerce-ready.
- Use exactly 2 spec columns: Property and Value.
- tags and seoKeywords: max 10 each, practical search terms only.
- If unsure about any field, return empty string or [] instead of guessing.${arabicRules}
`.trim();
}

function stripHtmlToText(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateJsonWithGemini({ model, parts }) {
  return callWithRateLimitRetry(async () => {
    const genAI = ensureGemini();
    const geminiModel = genAI.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.2 },
    });

    const result = await geminiModel.generateContent(parts);
    const raw = result?.response?.text?.();
    if (!raw) {
      throw new Error('Gemini returned empty response');
    }
    return parseAutofillJson(raw);
  }, { maxRetries: 4, baseDelayMs: 2500 });
}

export async function generateProductAutofillFromImage({
  base64Image,
  mimeType,
  additionalContext = '',
  includeArabic = false,
  storeCategories = [],
}) {
  const parsed = await generateJsonWithGemini({
    model: VISION_MODEL,
    parts: [
      {
        text: `${buildAutofillInstructions(includeArabic)}\n\n${buildCategoryHint(storeCategories)}\nSeller context: ${additionalContext || 'none'}`,
      },
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
    ],
  });

  return formatProductAutofillPayload(parsed, storeCategories, includeArabic);
}

export async function extractProductDetailsFromPageWithGemini({
  html = '',
  sourceUrl = '',
  imageUrls = [],
  storeCategories = [],
}) {
  const pageText = stripHtmlToText(html).slice(0, 20000);
  const parsed = await generateJsonWithGemini({
    model: TEXT_MODEL,
    parts: [{
      text: `${buildAutofillInstructions(false)}

Extract product listing data from this e-commerce page.
Source URL: ${sourceUrl}
Known image URLs: ${imageUrls.slice(0, 8).join(', ') || 'none'}

Also include these extra fields in JSON:
{
  "price": string,
  "AED": string,
  "images": string[] // include every product gallery image URL you can find, up to 8
}

Page content:
${pageText}`,
    }],
  });

  const formatted = formatProductAutofillPayload(parsed, storeCategories, false);
  return {
    ...formatted,
    price: String(parsed.price || '').trim(),
    AED: String(parsed.AED || parsed.price || '').trim(),
    images: Array.isArray(parsed.images)
      ? parsed.images.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
  };
}

export function mergeImportedProduct(baseProduct = {}, geminiProduct = {}) {
  const pick = (primary, fallback) => {
    const value = String(primary || '').trim();
    return value || String(fallback || '').trim();
  };

  const mergedImages = Array.from(new Set([
    ...(Array.isArray(baseProduct.images) ? baseProduct.images : []),
    ...(Array.isArray(geminiProduct.images) ? geminiProduct.images : []),
  ])).slice(0, 8);

  const mergedTags = Array.from(new Set([
    ...(Array.isArray(baseProduct.tags) ? baseProduct.tags : []),
    ...(Array.isArray(geminiProduct.tags) ? geminiProduct.tags : []),
  ]));

  return {
    ...baseProduct,
    name: pick(baseProduct.name, geminiProduct.name),
    brand: pick(baseProduct.brand, geminiProduct.brand),
    shortDescription: pick(baseProduct.shortDescription, geminiProduct.shortDescription),
    shortDescription2: pick(baseProduct.shortDescription2, geminiProduct.shortDescription2),
    description: pick(baseProduct.description, geminiProduct.description),
    AED: pick(baseProduct.AED, geminiProduct.AED),
    price: pick(baseProduct.price, geminiProduct.price),
    images: mergedImages,
    tags: mergedTags,
    specTableRows: (Array.isArray(baseProduct.specTableRows) && baseProduct.specTableRows.length)
      ? baseProduct.specTableRows
      : (geminiProduct.specTableRows || []),
    seoTitle: pick(baseProduct.seoTitle, geminiProduct.seoTitle),
    seoDescription: pick(baseProduct.seoDescription, geminiProduct.seoDescription),
    seoKeywords: mergedTags.length ? mergedTags : (baseProduct.seoKeywords || geminiProduct.seoKeywords || []),
    suggestedCategoryIds: geminiProduct.suggestedCategoryIds || [],
  };
}
