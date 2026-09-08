'use client';

import { useEffect } from 'react';
import axios from 'axios';

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

function requestPath(url = '') {
  try {
    const parsed = String(url || '').startsWith('http')
      ? new URL(url)
      : new URL(url, 'https://store.local');
    return parsed.pathname || '';
  } catch {
    return String(url || '').split('?')[0];
  }
}

function readAuthHeader(headers) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return headers.get('Authorization') || headers.get('authorization') || '';
  }
  return headers.Authorization || headers.authorization || '';
}

function logStoreChange({ method, path, status, authorization }) {
  if (!MUTATING.has(method)) return;
  if (!path.startsWith('/api/store/') || path.includes('/activity-log')) return;
  if (Number(status) >= 400) return;

  axios.post(
    '/api/store/activity-log',
    {
      method,
      path,
      pagePath: typeof window !== 'undefined' ? window.location.pathname : '',
      status,
    },
    authorization ? { headers: { Authorization: authorization } } : {},
  ).catch(() => {});
}

export default function StoreActivityLogger() {
  useEffect(() => {
    const interceptor = axios.interceptors.response.use((response) => {
      try {
        const config = response.config || {};
        logStoreChange({
          method: String(config.method || 'get').toLowerCase(),
          path: requestPath(config.url),
          status: response.status,
          authorization: readAuthHeader(config.headers),
        });
      } catch {
        // Never block dashboard work if logging fails.
      }
      return response;
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const response = await originalFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : input?.url;
        logStoreChange({
          method: String(init.method || input?.method || 'GET').toLowerCase(),
          path: requestPath(url),
          status: response.status,
          authorization: readAuthHeader(init.headers || input?.headers),
        });
      } catch {
        // Ignore logging failures.
      }
      return response;
    };

    return () => {
      axios.interceptors.response.eject(interceptor);
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
