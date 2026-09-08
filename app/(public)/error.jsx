'use client';

import { useLayoutEffect } from 'react';

const CHUNK_RELOAD_KEY = 'store1920-chunk-reload';

function isDomReconcileError(message = '') {
  return /removeChild|insertBefore|not a child of this node|The node before which/i.test(message);
}

export default function PublicError({ error, reset }) {
  const message = String(error?.message || '');
  const isChunkError = /chunk|loading|failed to fetch|dynamically imported module/i.test(message);
  const isDomError = isDomReconcileError(message);

  useLayoutEffect(() => {
    if (isDomError) {
      reset();
      return;
    }

    if (!isChunkError || typeof window === 'undefined') return;
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  }, [isChunkError, isDomError, reset]);

  if (isDomError) {
    return null;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">
          !
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">This page could not load</h1>
        <p className="mt-3 text-sm text-slate-600">
          {isChunkError
            ? 'The page script failed to download. This often happens after a new deploy — reload to fetch the latest files.'
            : 'Something went wrong while opening this page. Please try again.'}
        </p>
        {message ? (
          <p className="mt-3 break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-500">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
