'use client';

import { useEffect } from 'react';

export default function StoreError({ error, reset }) {
  useEffect(() => {
    console.error('[store] page error:', error);
  }, [error]);

  const message = String(error?.message || '');
  const isChunkError = /chunk|loading|failed to fetch|dynamically imported module/i.test(message);
  const isFirebaseConfigError = /firebase|Missing Firebase/i.test(message);

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 py-12 text-center text-white">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xl">
          !
        </div>
        <h1 className="text-2xl font-semibold">This page could not load</h1>
        <p className="mt-3 text-sm text-slate-300">
          {isFirebaseConfigError
            ? 'Firebase client settings are missing on the server build. Rebuild with all NEXT_PUBLIC_FIREBASE_* variables set.'
            : isChunkError
              ? 'The page script failed to download. This often happens after a new deploy — reload to fetch the latest files.'
              : 'Something went wrong while opening this store page.'}
        </p>
        {message && !/removeChild|insertBefore|not a child of this node/i.test(message) ? (
          <p className="mt-3 break-words rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-400">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
