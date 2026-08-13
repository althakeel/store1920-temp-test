import { isGeminiConfigured } from '@/configs/gemini';
import { isOpenAIConfigured } from '@/configs/openai';

export function getProductAiProviderPreference() {
  return String(process.env.PRODUCT_AI_PROVIDER || 'gemini').trim().toLowerCase();
}

export function isProductAiFallbackEnabled() {
  return String(process.env.PRODUCT_AI_FALLBACK || 'true').trim().toLowerCase() !== 'false';
}

export function maskApiKeySuffix(value) {
  const key = String(value || '').trim();
  if (!key) return null;
  if (key.length <= 4) return '****';
  return `...${key.slice(-4)}`;
}

export function getProductAiRuntimeConfig() {
  const preference = getProductAiProviderPreference();
  const geminiConfigured = isGeminiConfigured();
  const openaiConfigured = isOpenAIConfigured();
  const fallbackEnabled = isProductAiFallbackEnabled();

  const providers = [];
  if (preference === 'openai') {
    if (openaiConfigured) providers.push('openai');
    if (fallbackEnabled && geminiConfigured) providers.push('gemini');
  } else {
    if (geminiConfigured) providers.push('gemini');
    if (fallbackEnabled && openaiConfigured) providers.push('openai');
  }

  return {
    preference,
    fallbackEnabled,
    geminiConfigured,
    openaiConfigured,
    activeProviders: providers,
    geminiModel: process.env.GEMINI_PRODUCT_AUTOFILL_MODEL || 'gemini-3.6-flash',
    openaiModel: process.env.OPENAI_PRODUCT_AUTOFILL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    geminiKeySuffix: maskApiKeySuffix(process.env.GEMINI_API_KEY),
    openaiKeySuffix: maskApiKeySuffix(process.env.OPENAI_API_KEY),
  };
}

export function shouldUseGeminiForProducts() {
  return getProductAiProviderPreference() !== 'openai' && isGeminiConfigured();
}
