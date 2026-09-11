'use client';

import {
  expandOffersNavShortcodes,
  splitOffersNavTextParts,
} from '@/lib/offersPageSettings';

function LabelParts({ text = '', shineClass = '' }) {
  const parts = splitOffersNavTextParts(text);
  return (
    <span className="inline-flex items-center">
      {parts.map((part, index) => {
        if (part.type === 'emoji') {
          return (
            <span key={`emoji-${index}`} className="navbar-deals-emoji" aria-hidden="false">
              {part.value}
            </span>
          );
        }
        return (
          <span key={`text-${index}`} className={shineClass || undefined}>
            {part.value}
          </span>
        );
      })}
    </span>
  );
}

export default function OffersNavLabel({
  label = '',
  gifUrl = '',
  shineClass = '',
  gifSize = 18,
  stacked = false,
  top = '',
  bottom = '',
}) {
  const resolvedLabel = expandOffersNavShortcodes(label);
  const resolvedTop = expandOffersNavShortcodes(top);
  const resolvedBottom = expandOffersNavShortcodes(bottom);
  const hasGif = Boolean(String(gifUrl || '').trim());
  // Shine stays on letters only. Emoji is rendered in its own span so it keeps color.
  const textShine = !hasGif && shineClass ? shineClass : '';

  return (
    <span className={`inline-flex items-center gap-1 ${stacked ? 'flex-col' : ''}`}>
      {hasGif ? (
        // Native img keeps GIF animation. Next/Image often freezes GIFs.
        <img
          src={gifUrl}
          alt=""
          width={gifSize}
          height={gifSize}
          className="shrink-0 object-contain"
          style={{ width: gifSize, height: gifSize }}
        />
      ) : null}
      {stacked ? (
        <span className="inline-flex flex-col items-center leading-[1.05]">
          <LabelParts text={resolvedTop || resolvedLabel} shineClass={textShine} />
          {resolvedBottom ? <LabelParts text={resolvedBottom} shineClass={textShine} /> : null}
        </span>
      ) : (
        <LabelParts text={resolvedLabel} shineClass={textShine} />
      )}
    </span>
  );
}
