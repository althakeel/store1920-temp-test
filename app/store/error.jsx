'use client';

import { useLayoutEffect } from 'react';
import { isDomReconcileError } from '@/lib/domReconcileError';

export default function StoreError({ error, reset }) {
  const message = String(error?.message || '');
  const isChunkError = /chunk|loading|failed to fetch|dynamically imported module/i.test(message);
  const isFirebaseConfigError = /firebase|Missing Firebase/i.test(message);
  const isDomError = isDomReconcileError(error);

  useLayoutEffect(() => {
    if (isDomError) {
      reset();
      return;
    }

    console.error('[store] page error:', error);
  }, [error, isDomError, reset]);

  if (isDomError) {
    return null;
  }

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
