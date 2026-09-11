import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeVariantOptionGroups,
  formatVariantOptionValue,
  getProductBundleMode,
  getVariantStock,
  isVariantOptionValueAvailable,
  limitSelectedOptionsToGroups,
} from '../lib/productVariantOptions.js';

test('drops title picker when it is the same choice as color', () => {
  const groups = dedupeVariantOptionGroups([
    {
      key: 'title',
      label: 'Variant',
      values: [
        'porododo-ap-smart-watch-01-black',
        'porododo-ap-smart-watch-01-silver',
        'porododo-ap-smart-watch-01-rosegold',
      ],
    },
    {
      key: 'color',
      label: 'Color',
      values: ['01-black', '01-silver', '01-rosegold'],
    },
  ]);

  assert.deepEqual(groups.map((group) => group.key), ['color']);
  assert.deepEqual(groups[0].values, ['01-black', '01-silver', '01-rosegold']);
});

test('hides leftover title so other colors stay in stock', () => {
  const variants = [
    { stock: 4, options: { title: 'porododo-ap-smart-watch-01-black', color: '01-black' } },
    { stock: 3, options: { title: 'porododo-ap-smart-watch-01-silver', color: '01-silver' } },
  ];
  const selected = limitSelectedOptionsToGroups(
    { title: 'porododo-ap-smart-watch-01-black', color: '01-black' },
    [{ key: 'color', values: ['01-black', '01-silver'] }],
  );

  assert.deepEqual(selected, { color: '01-black' });
  assert.equal(
    isVariantOptionValueAvailable(variants, selected, 'color', '01-silver'),
    true,
  );
});

test('formats slug-like color values for the picker', () => {
  assert.equal(formatVariantOptionValue('01-black'), 'Black');
  assert.equal(formatVariantOptionValue('01 Black'), 'Black');
  assert.equal(formatVariantOptionValue('porododo-ap-smart-watch-01-silver'), 'Silver');
  assert.equal(formatVariantOptionValue('rose-gold'), 'Rose Gold');
});

test('does not treat color-only products as bundle packs', () => {
  assert.equal(getProductBundleMode({
    attributes: { variantType: 'variant_bundles' },
    variants: [
      { stock: 4, options: { color: '01 Black' } },
      { stock: 2, options: { color: '01 Silver' } },
    ],
  }), 'none');
});

test('reads imported stockQuantity when stock is missing', () => {
  assert.equal(getVariantStock({ stockQuantity: 7 }), 7);
  assert.equal(getVariantStock({ stock: 0, stockQuantity: 7 }), 0);
});
