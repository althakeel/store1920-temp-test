import { NextResponse } from 'next/server';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { isGeminiConfigured } from '@/configs/gemini';
import { ensureOpenAI, isOpenAIConfigured } from '@/configs/openai';
import { getAiErrorMessage } from '@/lib/aiProviderErrors';

const MAX_LENGTH = 2000;
const GEMINI_MODELS = [
  process.env.GEMINI_PRODUCT_AUTOFILL_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
].filter(Boolean).filter((model, index, list) => list.indexOf(model) === index);

function trimText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}

async function verifyStoreSeller(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const storeId = await authSeller(decodedToken.uid);
  if (!storeId) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) };
  }

  return { userId: decodedToken.uid };
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => String(part?.text || '')).join(' ').trim();
}

async function translateWithGemini(english) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Gemini is not configured');

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Translate this ecommerce category description into natural UAE / GCC Arabic.
Return Arabic text only. No quotes, markdown, or extra explanation.

English:
${english}`,
              }],
            }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Gemini request failed (${response.status})`);
      }

      const translated = trimText(extractGeminiText(payload));
      if (translated) return translated;
      lastError = new Error('Gemini returned empty translation');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gemini translation failed');
}

async function translateWithOpenAI(english) {
  const client = ensureOpenAI();
  const model = process.env.OPENAI_PRODUCT_AUTOFILL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Translate ecommerce category descriptions into natural UAE / GCC Arabic. Return Arabic text only.',
      },
      { role: 'user', content: english },
    ],
  });

  const translated = trimText(completion?.choices?.[0]?.message?.content || '');
  if (!translated) throw new Error('OpenAI returned empty translation');
  return translated;
}

export async function POST(request) {
  try {
    const auth = await verifyStoreSeller(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const english = trimText(body?.text || '');
    if (!english) {
      return NextResponse.json({ error: 'Enter an English description first' }, { status: 400 });
    }

    const errors = [];

    if (isGeminiConfigured()) {
      try {
        const descriptionAr = await translateWithGemini(english);
        return NextResponse.json({ descriptionAr });
      } catch (error) {
        errors.push(getAiErrorMessage(error, 'gemini'));
      }
    }

    if (isOpenAIConfigured()) {
      try {
        const descriptionAr = await translateWithOpenAI(english);
        return NextResponse.json({ descriptionAr });
      } catch (error) {
        errors.push(getAiErrorMessage(error, 'openai'));
      }
    }

    if (!isGeminiConfigured() && !isOpenAIConfigured()) {
      return NextResponse.json({ error: 'Translation is not configured' }, { status: 503 });
    }

    return NextResponse.json({
      error: errors.filter(Boolean)[0] || 'Failed to translate description',
    }, { status: 502 });
  } catch (error) {
    console.error('[categories/translate-arabic POST]', error);
    return NextResponse.json({
      error: getAiErrorMessage(error) || 'Failed to translate description',
    }, { status: 500 });
  }
}
