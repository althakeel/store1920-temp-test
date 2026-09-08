'use client';

import { useLayoutEffect } from 'react';
import { isDomReconcileError, reloadOnceForDomRace } from '@/lib/domReconcileError';

export default function GlobalError({ error, reset }) {
  const isDomError = isDomReconcileError(error);
  const isChunkError = /chunk|loading|failed to fetch|dynamically imported module/i.test(
    String(error?.message || ''),
  );

  useLayoutEffect(() => {
    if (isDomError) {
      reloadOnceForDomRace();
    }
  }, [isDomError]);

  if (isDomError) {
    return (
      <html lang="en">
        <body style={{ margin: 0, background: '#fff' }} />
      </html>
    );
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                margin: '0 auto 1rem',
                borderRadius: '9999px',
                background: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 700,
              }}
            >
              !
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>This page could not load</h1>
            <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
              {isChunkError
                ? 'The page script failed to download. This often happens after a new deploy — reload to fetch the latest files.'
                : 'Something went wrong while opening this page. Please try again.'}
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  border: 'none',
                  borderRadius: '0.5rem',
                  background: '#0f172a',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                style={{
                  borderRadius: '0.5rem',
                  border: '1px solid #cbd5e1',
                  background: 'transparent',
                  color: '#334155',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
