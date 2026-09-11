'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_NEW_TAG_SETTINGS, normalizeNewTagSettings } from '@/lib/newProductTag';

let cachedSettings = null;
let inflight = null;

async function loadNewTagSettings() {
  if (cachedSettings) return cachedSettings;
  if (!inflight) {
    inflight = fetch('/api/public/new-tag', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : DEFAULT_NEW_TAG_SETTINGS))
      .then((data) => {
        cachedSettings = normalizeNewTagSettings(data);
        return cachedSettings;
      })
      .catch(() => DEFAULT_NEW_TAG_SETTINGS)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export default function useNewProductTag() {
  const [settings, setSettings] = useState(cachedSettings || DEFAULT_NEW_TAG_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    loadNewTagSettings().then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
