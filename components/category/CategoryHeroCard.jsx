'use client';

import { useMemo, useState } from 'react';
import { CreditCard, ShieldCheck, Star, Truck, Wallet } from 'lucide-react';

const DEFAULT_CATEGORY_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%23f8fafc'/%3E%3C/svg%3E";
const DESCRIPTION_PREVIEW_LENGTH = 220;

function StarRow({ rating = 0 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = rating >= value;
        return (
          <Star
            key={value}
            size={14}
            className={filled ? 'text-amber-500' : 'text-slate-300'}
            fill={filled ? 'currentColor' : 'none'}
            strokeWidth={1.8}
          />
        );
      })}
    </span>
  );
}

export default function CategoryHeroCard({
  name,
  image,
  description = '',
  descriptionRtl = false,
  stats = {},
  t,
  isArabic = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const productCount = Number(stats.productCount) || 0;
  const reviewCount = Number(stats.reviewCount) || 0;
  const averageRating = Number(stats.averageRating) || 0;
  const fastDeliveryPercent = Number(stats.fastDeliveryPercent) || 0;
  const locale = isArabic ? 'ar-AE' : 'en';
  const imageSrc = String(image || '').trim() || DEFAULT_CATEGORY_IMAGE;
  const fullDescription = String(description || '').trim();
  const canCollapse = fullDescription.length > DESCRIPTION_PREVIEW_LENGTH;
  const visibleDescription = useMemo(() => {
    if (!fullDescription || expanded || !canCollapse) return fullDescription;
    return `${fullDescription.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...`;
  }, [canCollapse, expanded, fullDescription]);

  const trustItems = [
    { icon: ShieldCheck, label: t('category.trust.warranty') },
    { icon: Truck, label: t('category.trust.freeDelivery') },
    { icon: Wallet, label: t('category.trust.cod') },
    { icon: CreditCard, label: t('category.trust.instalments') },
  ];

  return (
    <section className="mb-6" aria-label={name}>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className={`flex flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-start ${isArabic ? 'md:flex-row-reverse' : ''}`}>
          <div className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:h-32 sm:w-32 md:mx-0">
            <img
              src={imageSrc}
              alt={name}
              className="h-full w-full object-contain"
              onError={(event) => {
                event.currentTarget.src = DEFAULT_CATEGORY_IMAGE;
              }}
            />
          </div>

          <div className={`min-w-0 flex-1 text-center md:text-start ${isArabic ? 'md:text-end' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
              {t('category.category')}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {name}
            </h1>

            <div className={`mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start ${isArabic ? 'md:justify-end' : ''}`}>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {t('category.productsAvailable', {
                  count: productCount.toLocaleString(locale),
                })}
              </span>

              <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 ${isArabic ? 'flex-row-reverse' : ''}`}>
                {reviewCount > 0 ? (
                  <>
                    <StarRow rating={averageRating} />
                    <span>
                      {t('category.reviewsSummary', {
                        rating: averageRating.toFixed(1),
                        count: reviewCount.toLocaleString(locale),
                      })}
                    </span>
                  </>
                ) : (
                  <span>{t('category.noReviewsYet')}</span>
                )}
              </span>

              {fastDeliveryPercent > 0 ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700 ${isArabic ? 'flex-row-reverse' : ''}`}>
                  <Truck size={14} />
                  {t('category.fastShippingPercent', { percent: fastDeliveryPercent })}
                </span>
              ) : null}
            </div>

            {fullDescription ? (
              <div
                className={`mt-4 text-sm leading-6 text-slate-600 ${descriptionRtl ? 'text-right' : ''}`}
                dir={descriptionRtl ? 'rtl' : 'ltr'}
              >
                <p>{visibleDescription}</p>
                {canCollapse ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => !current)}
                    className="mt-1 font-semibold text-orange-600 hover:text-orange-700"
                  >
                    {expanded ? t('category.showLess') : t('category.continueReading')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {trustItems.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 ${isArabic ? 'flex-row-reverse text-right' : ''}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Icon size={16} strokeWidth={1.9} />
            </span>
            <span className="font-medium leading-snug">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
