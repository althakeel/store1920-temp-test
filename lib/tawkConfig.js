const DEFAULT_PROPERTY_ID = '6a97d1f051f67f344244adbb';
const DEFAULT_WIDGET_ID = '1k1ggo524';

export function resolveTawkPropertyId(value = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID) {
  const raw = String(value || '').trim();
  if (/^[a-f0-9]{24}$/i.test(raw)) return raw.toLowerCase();
  return DEFAULT_PROPERTY_ID;
}

export function resolveTawkWidgetId(value = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID) {
  const raw = String(value || '').trim();
  if (/^[a-z0-9]+$/i.test(raw)) return raw;
  return DEFAULT_WIDGET_ID;
}

export const TAWK_PROPERTY_ID = resolveTawkPropertyId();
export const TAWK_WIDGET_ID = resolveTawkWidgetId();

export function getTawkEmbedSrc(
  propertyId = TAWK_PROPERTY_ID,
  widgetId = TAWK_WIDGET_ID,
) {
  return `https://embed.tawk.to/${propertyId}/${widgetId}`;
}

export function isTawkEnabled() {
  const flag = String(process.env.NEXT_PUBLIC_TAWK_ENABLED ?? 'true').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes';
}
