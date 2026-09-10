import { localizeField } from '@/lib/storefrontLanguage'

const TITLE_AR_FALLBACKS = {
  'deals under 99/aed': 'عروض أقل من ٩٩ درهم',
  'ultra smart watches': 'ساعات ذكية ألترا',
  'deals you might like': 'عروض قد تعجبك',
  'gadgets on the go': 'أجهزة للطريق',
  'top picks from porodo': 'أفضل اختيارات بورودو',
  'experience pure sound': 'استمتع بصوت نقي',
  'track every move': 'تتبع كل حركة',
}

const SUBTITLE_AR_FALLBACKS = {
  'shop our value deals all under 99 aed': 'تسوق عروض القيمة كلها بأقل من ٩٩ درهم',
  'discover trending smart watches with exclusive deals.': 'اكتشف أحدث الساعات الذكية مع عروض حصرية',
  'curated collections, top brands, and exclusive offers': 'مجموعات مختارة وأشهر العلامات وعروض حصرية',
  'smart gadgets and innovative accessories designed to simplify your everyday life.': 'أجهزة ذكية وإكسسوارات مبتكرة لتسهيل يومك',
  'shop the latest wireless earbuds and headphones with exclusive online offers.': 'تسوق أحدث سماعات الأذن والرأس اللاسلكية مع عروض حصرية',
  'save big on fitness wearables.': 'وفّر أكثر على الأجهزة القابلة للارتداء',
}

function normalizeCopy(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function getLocalizedCategorySliderTitle(section, language = 'en') {
  const stored = localizeField(section, 'title', language) || section?.category || ''
  if (language !== 'ar' || String(section?.titleAr || '').trim()) return stored
  return TITLE_AR_FALLBACKS[normalizeCopy(section?.title)] || stored
}

export function getLocalizedCategorySliderSubtitle(section, language = 'en') {
  const stored = localizeField(section, 'subtitle', language)
  if (language !== 'ar' || String(section?.subtitleAr || '').trim()) return stored
  return SUBTITLE_AR_FALLBACKS[normalizeCopy(section?.subtitle)] || stored
}
