export const AED_DIRHAM_SRC = '/currency/aed-dirham.png';

const AED_ALIASES = new Set(['AED', 'د.إ', 'د.ا', 'دإ']);

export function isAedCurrency(currency = '') {
  const value = String(currency || '').trim();
  if (!value) return true;
  return AED_ALIASES.has(value) || value.toUpperCase() === 'AED';
}

export const AED_TEXT_PATTERN = /AED|د\.إ\.?|د\.ا\.?|دإ/g;
