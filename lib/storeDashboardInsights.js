import { openai, isOpenAIConfigured } from '@/configs/openai';
import { ensureGemini, isGeminiConfigured } from '@/configs/gemini';
import { getProductAiProviderPreference, isProductAiFallbackEnabled } from '@/lib/productAiConfig';

function buildFallbackInsights(stats = {}) {
  const {
    ordersToday = 0,
    revenueToday = 0,
    ordersThisWeek = 0,
    revenueThisWeek = 0,
    ordersLastWeek = 0,
    abandonedCarts = 0,
    totalOrders = 0,
    statusTotals = {},
    currency = 'AED',
  } = stats;

  const bullets = [];
  const priorities = [];

  if (ordersToday > 0) {
    bullets.push(`Today: ${ordersToday} paid order${ordersToday > 1 ? 's' : ''} · ${currency} ${Number(revenueToday).toLocaleString()} revenue.`);
  } else {
    bullets.push('No paid orders yet today — focus on converting live visitors and abandoned checkouts.');
  }

  if (ordersThisWeek > ordersLastWeek) {
    bullets.push(`This week is ahead of last week (${ordersThisWeek} vs ${ordersLastWeek} orders).`);
  } else if (ordersLastWeek > 0 && ordersThisWeek < ordersLastWeek) {
    bullets.push(`Order pace is slower than last week (${ordersThisWeek} vs ${ordersLastWeek}).`);
  } else if (ordersThisWeek > 0) {
    bullets.push(`${ordersThisWeek} orders this week · ${currency} ${Number(revenueThisWeek).toLocaleString()} revenue.`);
  }

  if (abandonedCarts > 0) {
    priorities.push(`Follow up on ${abandonedCarts} abandoned cart${abandonedCarts > 1 ? 's' : ''} from Abandoned Checkout.`);
  }

  if ((statusTotals.processing || 0) > 0) {
    priorities.push(`Ship ${statusTotals.processing} order${statusTotals.processing > 1 ? 's' : ''} still in processing.`);
  }

  if (totalOrders === 0) {
    priorities.push('Share your store link and run a promotion to land your first paid order.');
  }

  return {
    provider: 'rules',
    headline: ordersToday > 0 ? 'Sales are coming in today' : 'Room to grow today',
    bullets: bullets.slice(0, 4),
    priorities: priorities.slice(0, 3),
    outlook: abandonedCarts > 0
      ? 'Recovering abandoned carts is your fastest path to more revenue without extra ad spend.'
      : 'Keep products visible and respond quickly to customer messages to build momentum.',
  };
}

async function callOpenAiInsights(prompt) {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_DASHBOARD_INSIGHTS_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a concise e-commerce analyst for a seller dashboard. Reply with valid JSON only:
{"headline":"string","bullets":["string"],"priorities":["string"],"outlook":"string"}
Rules: English only, max 4 bullets, max 3 priorities, actionable tone, no markdown.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

async function callGeminiInsights(prompt) {
  const genAI = ensureGemini();
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_DASHBOARD_INSIGHTS_MODEL || 'gemini-3.6-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  });
  const result = await model.generateContent([
    `You are a concise e-commerce analyst. Return JSON only: {"headline","bullets":[],"priorities":[],"outlook"}. English, actionable, max 4 bullets.\n\n${prompt}`,
  ]);
  return JSON.parse(result.response.text() || '{}');
}

export function isDashboardAiConfigured() {
  return isGeminiConfigured() || isOpenAIConfigured();
}

export async function generateStoreDashboardInsights(stats = {}) {
  const fallback = buildFallbackInsights(stats);

  if (!isDashboardAiConfigured()) {
    return fallback;
  }

  const prompt = `Store snapshot (paid orders only):
- Today: ${stats.ordersToday} orders, ${stats.currency} ${stats.revenueToday} revenue
- This week: ${stats.ordersThisWeek} orders, ${stats.currency} ${stats.revenueThisWeek}
- Last week: ${stats.ordersLastWeek} orders, ${stats.currency} ${stats.revenueLastWeek}
- All time: ${stats.totalOrders} orders, ${stats.currency} ${stats.totalEarnings} total revenue
- Abandoned carts: ${stats.abandonedCarts}
- Awaiting payment checkouts: ${stats.awaitingPaymentCount}
- Processing: ${stats.statusTotals?.processing || 0}, Shipping: ${stats.statusTotals?.shipping || 0}, Delivered: ${stats.statusTotals?.delivered || 0}
- Avg order value: ${stats.currency} ${stats.avgOrderValue}
- Payment mix: ${JSON.stringify(stats.paymentMethodBreakdown || [])}
- Peak hour today: ${stats.peakHourToday || 'none'}`;

  const preference = getProductAiProviderPreference();
  const fallbackEnabled = isProductAiFallbackEnabled();
  const providers = preference === 'openai'
    ? ['openai', ...(fallbackEnabled && isGeminiConfigured() ? ['gemini'] : [])]
    : ['gemini', ...(fallbackEnabled && isOpenAIConfigured() ? ['openai'] : [])];

  for (const provider of providers) {
    try {
      const parsed = provider === 'openai'
        ? await callOpenAiInsights(prompt)
        : await callGeminiInsights(prompt);

      return {
        provider,
        headline: String(parsed.headline || fallback.headline).slice(0, 120),
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 4).map(String) : fallback.bullets,
        priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 3).map(String) : fallback.priorities,
        outlook: String(parsed.outlook || fallback.outlook).slice(0, 280),
      };
    } catch (error) {
      console.warn(`[dashboard insights] ${provider} failed:`, error?.message || error);
    }
  }

  return fallback;
}
