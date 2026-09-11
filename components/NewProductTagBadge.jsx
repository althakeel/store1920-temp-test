'use client';

import useNewProductTag from '@/lib/useNewProductTag';
import {
  getNewBadgeStyle,
  getVisibleNewProductBadges,
  shouldShowNewProductTag,
} from '@/lib/newProductTag';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

export default function NewProductTagBadge({
  product,
  size = 'card',
  className = '',
}) {
  const settings = useNewProductTag();
  const { language } = useStorefrontI18n();

  if (!shouldShowNewProductTag(product, settings)) return null;

  const badges = getVisibleNewProductBadges(settings, language);
  if (!badges.length) return null;

  const thumb = size === 'thumb';
  const compact = size === 'card' || thumb;

  return (
    <>
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={`pointer-events-none absolute z-20 leading-none shadow-sm ${
            thumb
              ? `${badge.position === 'right' ? 'right-1' : 'left-1'} top-1 px-1 py-px text-[8px]`
              : compact
                ? `${badge.position === 'right' ? 'right-2' : 'left-2'} top-2 px-1.5 py-0.5 text-[10px]`
                : `${badge.position === 'right' ? 'right-3' : 'left-3'} top-3 px-2.5 py-1 text-xs`
          } ${className}`.trim()}
          style={getNewBadgeStyle(badge, compact)}
        >
          {badge.label}
        </span>
      ))}
    </>
  );
}
