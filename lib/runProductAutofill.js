import { openai, isOpenAIConfigured } from '@/configs/openai';
import { generateProductAutofillFromImage } from '@/lib/geminiProductAutofill';
import { isGeminiConfigured } from '@/configs/gemini';
import { getProductAiRuntimeConfig } from '@/lib/productAiConfig';
import {
  callWithRateLimitRetry,
  isAiRateLimitError,
} from '@/lib/aiProviderErrors';
import {
  parseAutofillJson,
  formatProductAutofillPayload,
} from '@/lib/productAiAutofill';
import { normalizeImageForAi } from '@/lib/normalizeImageForAi';

async function callOpenAIWithRetry(fn, maxRetries = 4) {
  return callWithRateLimitRetry(fn, { maxRetries, baseDelayMs: 2500 });
}

async function runOpenAIAutofill(base64Image, mimeType, additionalContext, includeArabic, storeCategories) {
  const categoryNames = storeCategories
    .map((category) => String(category?.name || '').trim())
    .filter(Boolean)
    .slice(0, 120);

  const categoryHint = categoryNames.length > 0
    ? `Pick 1-3 best matching categories ONLY from this store list: ${categoryNames.join(', ')}`
    : 'Suggest 1-3 practical ecommerce category names for this product.';

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

  const messages = [
    {
      role: 'system',
      content: `
                        You are a senior ecommerce copywriter and product data specialist.
                        Analyze the product image carefully and produce accurate, detailed listing content.

                        Accuracy rules (critical):
                        - Only state facts you can clearly see in the image or that the seller explicitly provided.
                        - Do NOT invent model numbers, certifications, warranty periods, exact dimensions, battery capacity, or compatibility unless visible on packaging/labels or provided in seller context.
                        - NEVER invent, suggest, or return a SKU / stock-keeping unit / product code. SKU is managed only by the seller manually. Do not include any "sku" field.
                        - If a spec is uncertain, omit it instead of guessing.
                        - Prefer practical shopper language over marketing fluff.

                        Content rules:
                        - Write a detailed English listing with rich product information.
                        - descriptionOverview: 2-3 sentences introducing the product.
                        - descriptionDetails: 1-2 paragraphs covering use cases, benefits, build/material cues, and what is visible in the image.
                        - features: 4-8 concise bullet points of real visible benefits.
                        - shortDescription: one compelling line for listing cards.
                        - shortDescription2: one extra highlight line.
                        - specTableRows: include 5-12 accurate rows when possible (type, material, color, connector/type, compatibility, length/size if visible, power/data support if visible, package contents if visible).
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
                        - If unsure about any field, return empty string or [] instead of guessing.
                            ${arabicRules}
                   `,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze this product image and generate complete listing fields. ${categoryHint}. Seller context: ${additionalContext || 'none'}`,
        },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
      ],
    },
  ];

  const response = await callOpenAIWithRetry(() => openai.chat.completions.create({
    model: process.env.OPENAI_PRODUCT_AUTOFILL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.2,
  }));

  const raw = response.choices[0].message.content;
  const parsed = parseAutofillJson(raw);
  return formatProductAutofillPayload(parsed, storeCategories, includeArabic);
}

async function runGeminiAutofill(base64Image, mimeType, additionalContext, includeArabic, storeCategories) {
  return generateProductAutofillFromImage({
    base64Image,
    mimeType,
    additionalContext,
    includeArabic,
    storeCategories,
  });
}

export function isProductAiConfigured() {
  return isGeminiConfigured() || isOpenAIConfigured();
}

export async function runProductAutofill({
  base64Image,
  mimeType,
  additionalContext,
  includeArabic,
  storeCategories,
}) {
  const normalizedImage = await normalizeImageForAi({ base64Image, mimeType });

  const runtime = getProductAiRuntimeConfig();
  const providers = runtime.activeProviders;

  if (providers.length === 0) {
    throw Object.assign(new Error('AI is disabled (set GEMINI_API_KEY or OPENAI_API_KEY)'), { status: 503 });
  }

  const errors = [];

  for (const provider of providers) {
    try {
      const result = provider === 'gemini'
        ? await runGeminiAutofill(
          normalizedImage.base64Image,
          normalizedImage.mimeType,
          additionalContext,
          includeArabic,
          storeCategories,
        )
        : await runOpenAIAutofill(
          normalizedImage.base64Image,
          normalizedImage.mimeType,
          additionalContext,
          includeArabic,
          storeCategories,
        );

      return { ...result, provider, attemptedProviders: providers };
    } catch (error) {
      errors.push({ provider, error });
      if (!runtime.fallbackEnabled || !isAiRateLimitError(error)) {
        throw Object.assign(error, {
          provider,
          attemptedProviders: providers,
        });
      }
    }
  }

  const last = errors[errors.length - 1];
  throw Object.assign(last?.error || new Error('AI autofill failed'), {
    provider: last?.provider,
    attemptedProviders: providers,
    allRateLimited: errors.every((entry) => isAiRateLimitError(entry.error)),
  });
}
