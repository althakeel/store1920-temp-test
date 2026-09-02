'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function UnsubscribeForm() {
  const searchParams = useSearchParams();
  const emailFromLink = useMemo(
    () => String(searchParams.get('email') || '').trim().toLowerCase(),
    [searchParams],
  );
  const type = useMemo(() => {
    const raw = String(searchParams.get('unsubscribe') || searchParams.get('type') || 'promotional')
      .trim()
      .toLowerCase();
    return ['promotional', 'orders', 'updates'].includes(raw) ? raw : 'promotional';
  }, [searchParams]);

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMounted(true);
    setEmail(emailFromLink);
  }, [emailFromLink]);

  const typeLabel = type === 'orders'
    ? 'order emails'
    : type === 'updates'
      ? 'update emails'
      : 'promotional emails';

  const onConfirm = async (event) => {
    event.preventDefault();
    const target = String(email || '').trim().toLowerCase();
    if (!target.includes('@')) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    try {
      setStatus('loading');
      setMessage('');
      const response = await fetch('/api/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: target,
          type,
          value: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Could not unsubscribe. Please try again.');
      }
      setStatus('done');
      setMessage(`You are unsubscribed from ${typeLabel}. You will not receive these emails again.`);
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Could not unsubscribe. Please try again.');
    }
  };

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-16 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-6 h-11 w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Store1920</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        Unsubscribe from emails
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Confirm below to stop {typeLabel}. Order receipts and account messages are not affected unless you choose those separately.
      </p>

      {status === 'done' ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {message}
          </p>
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Back to Store1920
          </Link>
        </div>
      ) : (
        <form onSubmit={onConfirm} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          {status === 'error' && message ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {status === 'loading' ? 'Unsubscribing…' : `Unsubscribe from ${typeLabel}`}
          </button>
          <p className="text-center text-[11px] text-slate-500">
            Changed your mind?{' '}
            <Link href="/" className="font-medium text-teal-700 hover:underline">
              Keep shopping
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-[70vh] bg-gradient-to-b from-slate-50 to-teal-50/40 px-4 py-14 sm:py-20">
      <Suspense
        fallback={
          <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading…
          </div>
        }
      >
        <UnsubscribeForm />
      </Suspense>
    </main>
  );
}
