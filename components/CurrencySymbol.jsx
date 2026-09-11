'use client';

import { AED_DIRHAM_SRC, AED_TEXT_PATTERN, isAedCurrency } from '@/lib/currencySymbol';

export default function CurrencySymbol({
  currency = 'AED',
  className = '',
}) {
  if (!isAedCurrency(currency)) {
    return <span className={className}>{currency}</span>;
  }

  return (
    <span
      role="img"
      aria-label="AED"
      className={`inline-block shrink-0 bg-current align-[-0.18em] ${className}`.trim()}
      style={{
        width: '0.68em',
        height: '0.68em',
        marginInlineEnd: '0.12em',
        WebkitMaskImage: `url(${AED_DIRHAM_SRC})`,
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskImage: `url(${AED_DIRHAM_SRC})`,
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
      }}
    />
  );
}

export function AedText({
  children,
  currency = 'AED',
  className = '',
}) {
  const text = children == null ? '' : String(children);
  if (!text) return null;

  if (!isAedCurrency(currency) && !text.match(AED_TEXT_PATTERN)) {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(new RegExp(AED_TEXT_PATTERN.source, 'g'));
  if (parts.length === 1) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`inline-flex items-baseline ${className}`.trim()}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex items-baseline">
          {index > 0 ? <CurrencySymbol currency="AED" /> : null}
          {part}
        </span>
      ))}
    </span>
  );
}
