import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhoneVariants } from '../lib/orderIdentity.js';

test('guest order phone variants include local, 0-prefix, and +971', () => {
  const variants = getPhoneVariants('0526478393', '+971');
  assert.ok(variants.includes('526478393'));
  assert.ok(variants.includes('0526478393'));
  assert.ok(variants.includes('971526478393'));
  assert.ok(variants.includes('+971526478393'));
});

test('E.164 WhatsApp number still matches guest checkout digits', () => {
  const variants = getPhoneVariants('+971526478393');
  assert.ok(variants.includes('971526478393'));
  assert.ok(variants.includes('0526478393'));
  assert.ok(variants.includes('526478393'));
});
