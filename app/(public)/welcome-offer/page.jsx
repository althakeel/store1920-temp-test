'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function WelcomeOfferForm() {
  const searchParams = useSearchParams();
  const heading = searchParams.get('heading') || 'Unlock your welcome offer';
  const subheading =
    searchParams.get('sub') ||
    'Quality, value, and delivery you can trust across the UAE. Sign up to get your offer.';
  const buttonLabel = searchParams.get('cta') || 'Shop with us';
  const formStyle = searchParams.get('style') || 'discount';
  const source = searchParams.get('source') || 'welcome_offer';
  const campaignId = searchParams.get('campaign') || '';
  const campaignName = searchParams.get('campaignName') || '';
  const showName = searchParams.get('name') === '1';
  const showPhone = searchParams.get('phone') === '1';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const fieldsHint = useMemo(() => {
    const parts = ['email'];
    if (showName) parts.unshift('name');
    if (showPhone) parts.push('phone');
    return parts;
  }, [showName, showPhone]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/email-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: showName ? name : '',
          phone: showPhone ? phone : '',
          source,
          formStyle,
          heading,
          campaignId,
          campaignName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Could not submit. Please try again.');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border-2 border-dashed border-rose-400 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-3 inline-block rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
          SAVE NOW
        </div>
        <h1 className="text-2xl font-black tracking-tight text-rose-900 sm:text-[1.7rem]">
          {heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-rose-800/90">{subheading}</p>

        {done ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              You are signed up. Check your inbox for offers from Store1920.
            </p>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-xl bg-stone-700 px-5 py-3 text-sm font-bold text-white hover:bg-stone-800"
            >
              Continue shopping
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-3 text-left">
            {showName ? (
              <label className="block text-sm font-semibold text-rose-900">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-300 placeholder:text-rose-300 focus:ring-2"
                  placeholder="Enter name"
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="block text-sm font-semibold text-rose-900">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-300 placeholder:text-rose-300 focus:ring-2"
                placeholder="Enter email"
                autoComplete="email"
              />
            </label>
            {showPhone ? (
              <label className="block text-sm font-semibold text-rose-900">
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-300 placeholder:text-rose-300 focus:ring-2"
                  placeholder="Enter phone"
                  autoComplete="tel"
                />
              </label>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-stone-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : buttonLabel}
            </button>
            <p className="text-center text-[11px] text-rose-800/70">
              Submissions appear in Email Marketing → Leads
              {fieldsHint.length > 1 ? ` (${fieldsHint.join(', ')})` : ''}.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function WelcomeOfferPage() {
  return (
    <main className="min-h-[70vh] bg-[#e8f5ef] px-4 py-14 sm:py-20">
      <Suspense
        fallback={
          <div className="mx-auto max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading signup…
          </div>
        }
      >
        <WelcomeOfferForm />
      </Suspense>
    </main>
  );
}
