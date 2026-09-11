'use client';

import {
  expandOffersNavShortcodes,
  getOffersNavEmojiImageSrc,
  splitOffersNavTextParts,
} from '@/lib/offersPageSettings';

function EmojiMark({ value, size = 16 }) {
  const src = getOffersNavEmojiImageSrc(value);
  if (!src) {
    return <span className="navbar-deals-emoji">{value}</span>;
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="navbar-deals-emoji-img"
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}

function LabelParts({ text = '', shineClass = '', emojiSize = 16 }) {
  const parts = splitOffersNavTextParts(text);
  return (
    <span className="inline-flex items-center">
      {parts.map((part, index) => {
        if (part.type === 'emoji') {
          return <EmojiMark key={`emoji-${index}`} value={part.value} size={emojiSize} />;
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
  const textShine = !hasGif && shineClass ? shineClass : '';
  const emojiSize = Math.max(14, Number(gifSize) || 16);

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
          <LabelParts text={resolvedTop || resolvedLabel} shineClass={textShine} emojiSize={emojiSize} />
          {resolvedBottom ? <LabelParts text={resolvedBottom} shineClass={textShine} emojiSize={emojiSize} /> : null}
        </span>
      ) : (
        <LabelParts text={resolvedLabel} shineClass={textShine} emojiSize={emojiSize} />
      )}
    </span>
  );
}
