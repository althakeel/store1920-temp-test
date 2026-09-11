'use client';

import { useEffect } from 'react';
import axios from 'axios';
import {
  shouldSkipStoreActivityPath,
  summarizeStoreActivityPayload,
} from '@/lib/storeActivityDescribe';

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

function readRequestPayload(data) {
  if (!data) return null;
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return { upload: 'file' };
  }
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function logStoreChange({ method, path, status, authorization, payload }) {
  if (!MUTATING.has(method)) return;
  if (!path.startsWith('/api/store/') || shouldSkipStoreActivityPath(path)) return;
  if (Number(status) >= 400) return;

  const { summary, details, itemName } = summarizeStoreActivityPayload(payload);

  axios.post(
    '/api/store/activity-log',
    {
      method,
      path,
      pagePath: typeof window !== 'undefined' ? window.location.pathname : '',
      status,
      summary,
      details,
      itemName,
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
          payload: readRequestPayload(config.data),
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
          payload: readRequestPayload(init.body),
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
