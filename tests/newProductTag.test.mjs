import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductImageBadge,
  getNewTagLabel,
  isProductWithinNewWindow,
  normalizeNewTagSettings,
  oppositeBadgePosition,
  shouldShowNewProductTag,
} from '../lib/newProductTag.js';

test('clamps display days and keeps a custom New label', () => {
  const settings = normalizeNewTagSettings({
    label: 'Just in',
    displayDays: 400,
  });
  assert.equal(settings.label, 'Just in');
  assert.equal(settings.displayDays, 365);
  assert.equal(settings.badges[0].label, 'Just in');
});

test('migrates a single legacy badge and defaults it to the left', () => {
  const settings = normalizeNewTagSettings({
    label: 'New',
    labelAr: 'جديد',
  });
  assert.equal(settings.badges.length, 1);
  assert.equal(settings.badges[0].position, 'left');
});

test('keeps a second badge on the opposite side', () => {
  const settings = normalizeNewTagSettings({
    badges: [
      { label: 'New', position: 'left' },
      { label: 'Hot', position: 'left' },
    ],
  });
  assert.equal(settings.badges.length, 2);
  assert.equal(settings.badges[0].position, 'left');
  assert.equal(settings.badges[1].position, 'right');
});

test('adds a second badge on the free side', () => {
  const first = normalizeNewTagSettings({}).badges;
  const second = createProductImageBadge({ label: 'Sale' }, first);
  assert.equal(second.position, oppositeBadgePosition(first[0].position));
  assert.equal(second.label, 'Sale');
});

test('hides the badge after the configured number of days', () => {
  const now = Date.parse('2026-09-11T00:00:00.000Z');
  const settings = { enabled: true, displayDays: 7, showOnImageOverlay: true };
  const fresh = { createdAt: '2026-09-08T00:00:00.000Z' };
  const expired = { createdAt: '2026-08-01T00:00:00.000Z' };

  assert.equal(isProductWithinNewWindow(fresh, settings, now), true);
  assert.equal(isProductWithinNewWindow(expired, settings, now), false);
  assert.equal(shouldShowNewProductTag(expired, settings, now), false);
});

test('shows a fresh product anywhere when the New badge is enabled', () => {
  const now = Date.parse('2026-09-11T00:00:00.000Z');
  const fresh = { createdAt: '2026-09-08T00:00:00.000Z' };

  assert.equal(shouldShowNewProductTag(fresh, { enabled: true, displayDays: 14 }, now), true);
  assert.equal(shouldShowNewProductTag(fresh, { enabled: false, displayDays: 14 }, now), false);
});

test('uses the Arabic label on the Arabic storefront', () => {
  assert.equal(getNewTagLabel({ label: 'New', labelAr: 'جديد' }, 'ar'), 'جديد');
});
