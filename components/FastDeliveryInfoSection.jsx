'use client';

import {
  BadgeCheck,
  CalendarClock,
  Clock3,
  CreditCard,
  MapPin,
  PackageCheck,
  Truck,
} from 'lucide-react';

const QUALIFY_ICONS = [PackageCheck, Clock3, CalendarClock, BadgeCheck, CreditCard];
const HIGHLIGHT_ICONS = [Truck, Clock3, MapPin];

export default function FastDeliveryInfoSection({ copy, className = '' }) {
  const highlights = copy.highlights || [];

  return (
    <section className={`overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-[0_18px_50px_-28px_rgba(15,118,110,0.45)] ${className}`}>
      <div className="bg-[linear-gradient(135deg,#0f766e_0%,#115e59_48%,#0f172a_100%)] px-6 py-8 text-white sm:px-8 sm:py-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold tracking-wide text-teal-50 ring-1 ring-white/20">
          <Truck className="h-3.5 w-3.5" />
          {copy.freeBadge}
        </div>
        <h2 className="mt-4 max-w-3xl text-2xl font-bold tracking-tight sm:text-4xl">
          {copy.conditionsTitle || copy.qualifyTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-teal-50/90 sm:text-base">
          {copy.intro}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {highlights.map((item, index) => {
            const Icon = HIGHLIGHT_ICONS[index] || Truck;
            return (
              <div
                key={item.title}
                className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-teal-200" />
                  {item.title}
                </div>
                <p className="mt-1 text-xs text-teal-50/80">{item.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl bg-slate-50 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">{copy.qualifyTitle}</h2>
          <ol className="mt-5 space-y-4">
            {copy.qualify.map((item, index) => {
              const Icon = QUALIFY_ICONS[index] || PackageCheck;
              return (
                <li key={item} className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <p className="text-sm leading-relaxed text-slate-700">{item}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-6">
          <div className="relative overflow-hidden rounded-2xl border border-teal-100 bg-[linear-gradient(180deg,#f0fdfa_0%,#ffffff_70%)] p-5 sm:p-6">
            <div className="absolute -end-8 -top-8 h-28 w-28 rounded-full bg-teal-200/40" />
            <h2 className="text-lg font-semibold text-slate-900">{copy.chargesTitle}</h2>
            <p className="mt-4 text-4xl font-bold tracking-tight text-teal-800">{copy.freeAmount}</p>
            <p className="mt-1 text-sm font-medium text-teal-700">{copy.freeBadge}</p>
            {copy.charges.map((item) => (
              <p key={item} className="mt-3 text-sm leading-relaxed text-slate-700">
                {item}
              </p>
            ))}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">{copy.coverageTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{copy.coverageLead}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {copy.emirates.map((emirate) => (
                <li
                  key={emirate}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800"
                >
                  <MapPin className="h-3.5 w-3.5 text-teal-700" />
                  {emirate}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-sm leading-relaxed text-slate-600 sm:px-8">
        {copy.coverageNote}
      </div>
    </section>
  );
}
