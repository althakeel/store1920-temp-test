'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMAIL_BLOCK_TYPES,
  EMAIL_FONT_FAMILY_OPTIONS,
  FORM_FIELD_OPTIONS,
  FORM_STYLE_OPTIONS,
  FORM_TYPE_PRESETS,
  GRID_COLUMN_OPTIONS,
  HEADER_MENU_PRESETS,
  HEADER_NAV_LAYOUT_OPTIONS,
  HEADER_NAV_STYLE_OPTIONS,
  HERO_ICON_OPTIONS,
  HERO_MARK_MODES,
  LOGO_POSITION_OPTIONS,
  BUTTON_ALIGN_OPTIONS,
  BUTTON_STYLE_OPTIONS,
  BUTTON_WEIGHT_OPTIONS,
  BADGE_ALIGN_OPTIONS,
  BADGE_STYLE_OPTIONS,
  PRODUCT_CARD_STYLES,
  PRODUCT_CTA_PRESETS,
  PRODUCT_CTA_STYLES,
  PRODUCT_IMAGE_RATIO_OPTIONS,
  PRODUCT_MEDIA_MODES,
  PRODUCT_SELECTION_MODES,
  PRODUCT_SOURCE_OPTIONS,
  SOCIAL_NETWORKS,
  createBlockId,
  createDefaultBlock,
  renderEmailFromBlocks,
  rewriteEmailPreviewMediaUrls,
} from '@/lib/emailCampaignBuilder';

const UPLOADED_IMAGES_KEY = 'store1920-email-uploaded-images';

function loadUploadedImages() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(UPLOADED_IMAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string' && url) : [];
  } catch {
    return [];
  }
}

function persistUploadedImages(urls) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UPLOADED_IMAGES_KEY, JSON.stringify(urls.slice(0, 48)));
  } catch {
    // ignore quota errors
  }
}

function sanitizeIframeBodyHtml(html) {
  return String(html || '').replace(/<\/script/gi, '<\\/script');
}

const PREVIEW_IFRAME_SCRIPT = `
(function(){
  document.querySelectorAll('.email-product-carousel').forEach(function(el){
    var isDown=false,startX=0,scrollLeft=0;
    el.addEventListener('mousedown',function(e){
      isDown=true; el.classList.add('is-dragging');
      startX=e.pageX-el.offsetLeft; scrollLeft=el.scrollLeft;
    });
    el.addEventListener('mouseleave',function(){ isDown=false; el.classList.remove('is-dragging'); });
    el.addEventListener('mouseup',function(){ isDown=false; el.classList.remove('is-dragging'); });
    el.addEventListener('mousemove',function(e){
      if(!isDown) return; e.preventDefault();
      var x=e.pageX-el.offsetLeft; el.scrollLeft=scrollLeft-(x-startX);
    });
  });
  function highlightBlock(blockId){
    document.querySelectorAll('.email-preview-block').forEach(function(el){ el.classList.remove('is-selected'); });
    if(!blockId) return;
    document.querySelectorAll('[data-block-id]').forEach(function(el){
      if(el.getAttribute('data-block-id')===blockId) el.classList.add('is-selected');
    });
  }
  document.querySelectorAll('[data-block-id]').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.closest('a')) return;
      e.preventDefault();
      e.stopPropagation();
      var blockId=el.getAttribute('data-block-id');
      highlightBlock(blockId);
      window.parent.postMessage({ type:'email-preview-block-click', blockId:blockId }, '*');
    });
    el.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      e.preventDefault();
      var blockId=el.getAttribute('data-block-id');
      highlightBlock(blockId);
      window.parent.postMessage({ type:'email-preview-block-click', blockId:blockId }, '*');
    });
  });
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='email-preview-select-block') highlightBlock(e.data.blockId);
  });
  document.addEventListener('click',function(e){
    var link=e.target.closest('a[href]');
    if(!link) return;
    var href=(link.getAttribute('href')||'').trim();
    if(!href||href==='#') return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({ type:'email-preview-link-click', href:href }, '*');
  },true);
})();
`;

function buildPreviewIframeDocument(bodyHtml, origin = '') {
  const baseHref = String(origin || '').replace(/\/$/, '') || 'https://store1920.com';
  return [
    '<!DOCTYPE html>',
    '<html>',
    `<head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base href="${baseHref}/">`,
    '<style>',
    '.email-product-carousel{scrollbar-width:none;-ms-overflow-style:none;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;touch-action:pan-x;cursor:grab;}',
    '.email-product-carousel::-webkit-scrollbar{display:none;width:0;height:0;}',
    '.email-product-carousel.is-dragging{cursor:grabbing;scroll-behavior:auto;}',
    'img{max-width:100%;}',
    '</style></head>',
    '<body style="margin:0;background:#e2e8f0;padding:16px;">',
    sanitizeIframeBodyHtml(bodyHtml),
    '<script>',
    PREVIEW_IFRAME_SCRIPT,
    '<\\/script>',
    '</body></html>',
  ].join('');
}
async function uploadStoreImage(file, getToken, type = 'email-marketing') {
  if (!file || !getToken) throw new Error('Upload is not available');
  const token = await getToken();
  const formData = new FormData();
  formData.append('image', file);
  formData.append('type', type);
  const response = await fetch('/api/store/upload-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || 'Upload failed');
  }
  return data.url;
}

function ImageField({
  label,
  value,
  onChange,
  heroImages = [],
  getToken,
  uploadType = 'email-marketing',
  hint = '',
  allowPickExisting = true,
  onUploaded,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      setError('');
      const url = await uploadStoreImage(file, getToken, uploadType);
      onChange(url);
      if (typeof onUploaded === 'function') onUploaded(url);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
      <label className="block min-w-0 text-xs text-gray-600">
        {label}
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm"
          placeholder={allowPickExisting ? 'https://... or upload below' : 'Upload a logo below'}
          readOnly={!allowPickExisting}
        />
      </label>
      {hint ? <p className="text-[11px] text-gray-500">{hint}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !getToken}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload image'}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Clear
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {value ? (
        <img src={value} alt="" className="mt-1 h-20 w-auto max-w-full rounded-lg border border-gray-200 object-contain bg-white" />
      ) : null}

      {allowPickExisting && heroImages?.length > 0 && (
        <div className="min-w-0 w-full max-w-full overflow-hidden">
          <div className="mb-1 text-xs text-gray-600">Or pick a store / uploaded image</div>
          <div className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
            {heroImages.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => onChange(url)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${value === url ? 'border-teal-600' : 'border-transparent'}`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BLOCK_LABELS = {
  header: 'Logo header',
  hero: 'Hero banner',
  badge: 'Offer badge',
  text: 'Text',
  two_column: '2-column',
  button: 'Button',
  form: 'Signup form',
  social: 'Social icons',
  image: 'Image',
  products: 'Product grid',
  product_carousel: 'Product carousel',
  product_latest: 'Latest products',
  product_related: 'Related products',
  divider: 'Divider',
  spacer: 'Spacer',
  footer: 'Footer',
};

const PRODUCT_EDITOR_TABS = [
  { id: 'products', label: 'Products' },
  { id: 'layout', label: 'Layout' },
  { id: 'design', label: 'Card design' },
  { id: 'button', label: 'Button' },
];

function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-gray-700">{children}</span>
      {hint ? <span className="text-[10px] text-gray-400">{hint}</span> : null}
    </div>
  );
}

function ToggleChip({ checked, onChange, children }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        checked
          ? 'border-teal-600 bg-teal-50 text-teal-800'
          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function ProductBlockFields({ block, onChange, previewProducts = [], categories = [] }) {
  const [tab, setTab] = useState('products');
  const set = (key, value) => onChange({ ...block, [key]: value });
  const selectedIds = Array.isArray(block.productIds) ? block.productIds.map(String) : [];
  const mode = block.selectionMode || 'manual';
  const isSlider = block.type === 'product_carousel';
  const activeStyle = PRODUCT_CARD_STYLES.find((item) => item.id === (block.cardStyle || 'classic'));

  const visibleProducts = useMemo(() => {
    if (mode === 'category' && block.category) {
      return previewProducts.filter(
        (product) => String(product.category) === String(block.category),
      );
    }
    return previewProducts;
  }, [previewProducts, mode, block.category]);

  const toggleProduct = (productId) => {
    const id = String(productId);
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange({
      ...block,
      selectionMode: 'manual',
      productIds: next,
      limit: Math.max(Number(block.limit) || 4, next.length || 4),
    });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <FieldLabel>Section heading</FieldLabel>
        <input
          value={block.heading || ''}
          onChange={(e) => set('heading', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. Latest arrivals"
        />
      </label>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        {PRODUCT_EDITOR_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
              tab === item.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <FieldLabel>How to pick products</FieldLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PRODUCT_SELECTION_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('selectionMode', option.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-medium ${
                    mode === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {option.label.replace(' (featured / latest / related)', '').replace(' (slider picks)', '')}
                </button>
              ))}
            </div>
          </div>

          {mode === 'auto' && (
            <label className="block">
              <FieldLabel>Auto source</FieldLabel>
              <select
                value={block.productSource || 'featured'}
                onChange={(e) => set('productSource', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {PRODUCT_SOURCE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}

          {mode === 'category' && (
            <label className="block">
              <FieldLabel>Category</FieldLabel>
              <select
                value={block.category || ''}
                onChange={(e) => set('category', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Choose a category...</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          )}

          {mode === 'manual' && (
            <div className="space-y-2">
              <FieldLabel hint={`${selectedIds.length} selected`}>
                Click products to {isSlider ? 'add to slider' : 'include'}
              </FieldLabel>
              <select
                value={block.category || ''}
                onChange={(e) => set('category', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {(block.category
                  ? previewProducts.filter((p) => String(p.category) === String(block.category))
                  : previewProducts
                ).map((product) => {
                  const active = selectedIds.includes(String(product.id));
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => toggleProduct(product.id)}
                      className={`overflow-hidden rounded-lg border text-left ${
                        active ? 'border-teal-600 ring-2 ring-teal-200' : 'border-gray-200'
                      }`}
                      title={product.name}
                    >
                      <img src={product.image} alt="" className="h-16 w-full object-cover" />
                      <div className="truncate px-1 py-1 text-[10px] text-gray-700">{product.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode !== 'manual' && (
            <label className="block max-w-[160px]">
              <FieldLabel>How many</FieldLabel>
              <input
                type="number"
                min={2}
                max={8}
                value={block.limit || 4}
                onChange={(e) => set('limit', Number(e.target.value) || 4)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          {mode !== 'manual' && visibleProducts.length > 0 && (
            <div>
              <FieldLabel>Preview picks</FieldLabel>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {visibleProducts.slice(0, 8).map((product) => (
                  <img
                    key={product.id}
                    src={product.image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'layout' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {block.type === 'product_carousel' ? (
            <p className="text-xs text-gray-500">Carousel shows products in a horizontal row. Pick how many on the Products tab.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Columns</FieldLabel>
                <select
                  value={Number(block.gridColumns) === 1 ? 1 : 2}
                  onChange={(e) => set('gridColumns', Number(e.target.value) || 2)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {GRID_COLUMN_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <FieldLabel>Rows</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={block.gridRows || 2}
                  onChange={(e) => {
                    const rows = Number(e.target.value) || 2;
                    const cols = Number(block.gridColumns) === 1 ? 1 : 2;
                    onChange({ ...block, gridRows: rows, limit: Math.max(Number(block.limit) || 4, rows * cols) });
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
          <div>
            <FieldLabel>Show on cards</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip checked={block.showPrice !== false} onChange={(v) => set('showPrice', v)}>Price</ToggleChip>
              <ToggleChip checked={block.showSalePrice !== false} onChange={(v) => set('showSalePrice', v)}>Sale price</ToggleChip>
              <ToggleChip checked={block.showOriginalPrice !== false} onChange={(v) => set('showOriginalPrice', v)}>Was price</ToggleChip>
              <ToggleChip checked={block.showDiscountPercent !== false} onChange={(v) => set('showDiscountPercent', v)}>% off</ToggleChip>
              <ToggleChip checked={block.showDescription !== false} onChange={(v) => set('showDescription', v)}>Description</ToggleChip>
              <ToggleChip checked={block.showCategory !== false} onChange={(v) => set('showCategory', v)}>Category</ToggleChip>
              <ToggleChip checked={Boolean(block.showBadge)} onChange={(v) => set('showBadge', v)}>Badge</ToggleChip>
            </div>
          </div>
          {block.showBadge ? (
            <label className="block max-w-xs">
              <FieldLabel>Badge text</FieldLabel>
              <input
                value={block.badgeText || 'NEW'}
                onChange={(e) => set('badgeText', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>
      )}

      {tab === 'design' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Selected: <span className="font-semibold text-slate-900">{activeStyle?.label || 'Classic'}</span>
            {activeStyle?.description ? ` — ${activeStyle.description}` : ''}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCT_CARD_STYLES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => set('cardStyle', option.id)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  (block.cardStyle || 'classic') === option.id
                    ? 'border-teal-600 bg-teal-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-xs font-semibold text-gray-900">{option.label}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-gray-500">{option.description}</div>
              </button>
            ))}
          </div>
          <div>
            <FieldLabel>Card look</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip checked={block.showBorder !== false} onChange={(v) => set('showBorder', v)}>Border</ToggleChip>
              <ToggleChip checked={block.showShadow !== false} onChange={(v) => set('showShadow', v)}>Shadow</ToggleChip>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <FieldLabel>Border color</FieldLabel>
              <input type="color" value={block.borderColor || '#e5e7eb'} onChange={(e) => set('borderColor', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-gray-300" />
            </label>
            <label className="block">
              <FieldLabel>Card background</FieldLabel>
              <input type="color" value={block.cardBackground || '#ffffff'} onChange={(e) => set('cardBackground', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-gray-300" />
            </label>
          </div>
          <label className="block">
            <FieldLabel>Media</FieldLabel>
            <select
              value={block.mediaMode || 'image'}
              onChange={(e) => set('mediaMode', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {PRODUCT_MEDIA_MODES.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div>
            <FieldLabel>Image ratio</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_IMAGE_RATIO_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('imageRatio', option.id)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                    (block.imageRatio || '1:1') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'button' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Product button</FieldLabel>
            <ToggleChip checked={block.showCta !== false} onChange={(v) => set('showCta', v)}>
              {block.showCta !== false ? 'On' : 'Off'}
            </ToggleChip>
          </div>

          {block.showCta !== false && (
            <>
              <label className="block">
                <FieldLabel>Button text</FieldLabel>
                <input
                  value={block.ctaLabel || 'Shop now'}
                  onChange={(e) => set('ctaLabel', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Shop now"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_CTA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => set('ctaLabel', preset.label)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      (block.ctaLabel || 'Shop now') === preset.label
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div>
                <FieldLabel>Button style</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {PRODUCT_CTA_STYLES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => set('ctaStyle', option.id)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                        (block.ctaStyle || 'filled') === option.id
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <FieldLabel>Button color</FieldLabel>
                  <input type="color" value={block.buttonColor || '#0f766e'} onChange={(e) => set('buttonColor', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-gray-300" />
                </label>
                <label className="block">
                  <FieldLabel>Text color</FieldLabel>
                  <input type="color" value={block.buttonTextColor || '#ffffff'} onChange={(e) => set('buttonTextColor', e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-gray-300" />
                </label>
              </div>
              <div
                className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"
              >
                <button
                  type="button"
                  className="pointer-events-none rounded-lg px-5 py-2.5 text-xs font-bold"
                  style={
                    (block.ctaStyle || 'filled') === 'outline'
                      ? {
                          border: `2px solid ${block.buttonColor || '#0f766e'}`,
                          color: block.buttonColor || '#0f766e',
                          background: 'transparent',
                        }
                      : (block.ctaStyle || 'filled') === 'text'
                        ? {
                            color: block.buttonColor || '#0f766e',
                            background: 'transparent',
                            textDecoration: 'underline',
                          }
                        : {
                            background: block.buttonColor || '#0f766e',
                            color: block.buttonTextColor || '#ffffff',
                          }
                  }
                >
                  {block.ctaLabel || 'Shop now'}
                </button>
                <p className="mt-2 text-[10px] text-gray-500">Live button preview</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BlockEditor({ block, onChange, previewProducts, heroImages, categories, getToken, onUploaded }) {
  const set = (key, value) => onChange({ ...block, [key]: value });

  if (['products', 'product_carousel', 'product_latest', 'product_related'].includes(block.type)) {
    return (
      <ProductBlockFields
        block={block}
        onChange={onChange}
        previewProducts={previewProducts}
        categories={categories}
      />
    );
  }

  switch (block.type) {
    case 'header':
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Logo, optional navbar menu links, tagline, and header CTA button.
          </div>
          <ImageField
            label="Logo image"
            value={block.logoUrl || ''}
            onChange={(url) => set('logoUrl', url)}
            getToken={getToken}
            uploadType="logo"
            allowPickExisting={false}
            hint="PNG or WebP with transparent background works best. Leave empty for the default Store1920 logo."
            onUploaded={onUploaded}
          />
          <label className="block text-xs text-gray-600">
            Logo link (click destination)
            <input
              value={block.logoLink || ''}
              onChange={(e) => set('logoLink', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="https://store1920.com"
            />
          </label>
          <label className="block text-xs text-gray-600">
            Logo alt text
            <input
              value={block.logoAlt || ''}
              onChange={(e) => set('logoAlt', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Store1920"
            />
          </label>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Logo position</div>
            <div className="flex flex-wrap gap-2">
              {LOGO_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('logoPosition', option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    (block.logoPosition || 'center') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Logo width (px)
              <input
                type="number"
                min={40}
                max={280}
                value={block.logoWidth || 150}
                onChange={(e) => set('logoWidth', Number(e.target.value) || 150)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Max height (px)
              <input
                type="number"
                min={24}
                max={160}
                value={block.logoMaxHeight || 72}
                onChange={(e) => set('logoMaxHeight', Number(e.target.value) || 72)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding top (px)
              <input
                type="number"
                min={0}
                max={64}
                value={block.paddingTop ?? block.paddingY ?? 22}
                onChange={(e) => set('paddingTop', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding bottom (px)
              <input
                type="number"
                min={0}
                max={64}
                value={block.paddingBottom ?? block.paddingY ?? 22}
                onChange={(e) => set('paddingBottom', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding left (px)
              <input
                type="number"
                min={0}
                max={64}
                value={block.paddingLeft ?? block.paddingX ?? 24}
                onChange={(e) => set('paddingLeft', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding right (px)
              <input
                type="number"
                min={0}
                max={64}
                value={block.paddingRight ?? block.paddingX ?? 24}
                onChange={(e) => set('paddingRight', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Header background
              <input
                type="color"
                value={block.backgroundColor || '#ffffff'}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Bottom border color
              <input
                type="color"
                value={block.bottomBorderColor || '#f1f5f9'}
                onChange={(e) => set('bottomBorderColor', e.target.value)}
                disabled={block.showBottomBorder === false}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300 disabled:opacity-40"
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={block.showBottomBorder !== false}
              onChange={(e) => set('showBottomBorder', e.target.checked)}
            />
            Show bottom border
          </label>

          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-teal-900">
              <input
                type="checkbox"
                checked={block.showNav !== false}
                onChange={(e) => set('showNav', e.target.checked)}
              />
              Show navbar menu links
            </label>

            {block.showNav !== false && (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-700">Quick menu presets</div>
                  <div className="flex flex-wrap gap-2">
                    {HEADER_MENU_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          const base = String(block.logoLink || 'https://store1920.com').replace(/\/$/, '');
                          set('navItems', preset.items.map((item) => ({
                            id: createBlockId(),
                            label: item.label,
                            url: `${base}${item.path === '/' ? '/' : item.path}`,
                          })));
                        }}
                        className="rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-50"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-gray-700">Menu position</div>
                  <div className="flex flex-wrap gap-2">
                    {HEADER_NAV_LAYOUT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => set('navLayout', option.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          (block.navLayout || 'below') === option.id
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-gray-700">Link style</div>
                  <div className="flex flex-wrap gap-2">
                    {HEADER_NAV_STYLE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => set('navStyle', option.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          (block.navStyle || 'plain') === option.id
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-gray-700">Menu align</div>
                  <div className="flex flex-wrap gap-2">
                    {LOGO_POSITION_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => set('navAlign', option.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          (block.navAlign || 'center') === option.id
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-gray-600">
                    Link color
                    <input
                      type="color"
                      value={block.navColor || '#334155'}
                      onChange={(e) => set('navColor', e.target.value)}
                      className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Accent / button color
                    <input
                      type="color"
                      value={block.navActiveColor || '#0f766e'}
                      onChange={(e) => set('navActiveColor', e.target.value)}
                      className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Font size
                    <input
                      type="number"
                      min={11}
                      max={18}
                      value={block.navSize || 13}
                      onChange={(e) => set('navSize', Number(e.target.value) || 13)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Gap between links
                    <input
                      type="number"
                      min={6}
                      max={28}
                      value={block.navGap || 16}
                      onChange={(e) => set('navGap', Number(e.target.value) || 16)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600 sm:col-span-2">
                    Weight
                    <select
                      value={block.navWeight || '600'}
                      onChange={(e) => set('navWeight', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="400">Regular</option>
                      <option value="500">Medium</option>
                      <option value="600">Semibold</option>
                      <option value="700">Bold</option>
                    </select>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-gray-800">Menu items (label + link)</div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [
                          ...(Array.isArray(block.navItems) ? block.navItems : []),
                          { id: createBlockId(), label: 'New link', url: block.logoLink || 'https://store1920.com' },
                        ];
                        set('navItems', next);
                      }}
                      className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      + Add link
                    </button>
                  </div>
                  {(Array.isArray(block.navItems) ? block.navItems : []).map((item, index) => (
                    <div key={item.id || index} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                        <label className="block text-[11px] text-gray-600">
                          Label
                          <input
                            value={item.label || ''}
                            onChange={(e) => {
                              const next = (block.navItems || []).map((row, i) => (
                                i === index ? { ...row, label: e.target.value } : row
                              ));
                              set('navItems', next);
                            }}
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            placeholder="Shop"
                          />
                        </label>
                        <label className="block text-[11px] text-gray-600">
                          Link URL
                          <input
                            value={item.url || ''}
                            onChange={(e) => {
                              const next = (block.navItems || []).map((row, i) => (
                                i === index ? { ...row, url: e.target.value } : row
                              ));
                              set('navItems', next);
                            }}
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            placeholder="https://store1920.com"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => set('navItems', (block.navItems || []).filter((_, i) => i !== index))}
                          className="self-end rounded border border-red-200 px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!(block.navItems || []).length ? (
                    <p className="text-[11px] text-slate-500">No menu links yet. Add a link or use a quick preset.</p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-800">
              <input
                type="checkbox"
                checked={block.showHeaderCta === true}
                onChange={(e) => set('showHeaderCta', e.target.checked)}
              />
              Show header button (CTA)
            </label>
            {block.showHeaderCta === true && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-gray-600 sm:col-span-2">
                  Button label
                  <input
                    value={block.headerCtaLabel || ''}
                    onChange={(e) => set('headerCtaLabel', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-gray-600 sm:col-span-2">
                  Button link
                  <input
                    value={block.headerCtaUrl || ''}
                    onChange={(e) => set('headerCtaUrl', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  Button color
                  <input
                    type="color"
                    value={block.headerCtaColor || '#0f766e'}
                    onChange={(e) => set('headerCtaColor', e.target.value)}
                    className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  Text color
                  <input
                    type="color"
                    value={block.headerCtaTextColor || '#ffffff'}
                    onChange={(e) => set('headerCtaTextColor', e.target.value)}
                    className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-800">
              <input
                type="checkbox"
                checked={block.showTagline !== false}
                onChange={(e) => set('showTagline', e.target.checked)}
              />
              Show tagline under logo
            </label>
            {block.showTagline !== false && (
              <>
                <label className="block text-xs text-gray-600">
                  Tagline text
                  <input
                    value={block.tagline || ''}
                    onChange={(e) => set('tagline', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Smart Shopping, Smart Savings"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs text-gray-600">
                    Tagline color
                    <input
                      type="color"
                      value={block.taglineColor || '#64748b'}
                      onChange={(e) => set('taglineColor', e.target.value)}
                      className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Font size
                    <input
                      type="number"
                      min={10}
                      max={22}
                      value={block.taglineSize || 12}
                      onChange={(e) => set('taglineSize', Number(e.target.value) || 12)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    Weight
                    <select
                      value={block.taglineWeight || '500'}
                      onChange={(e) => set('taglineWeight', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="400">Regular</option>
                      <option value="500">Medium</option>
                      <option value="600">Semibold</option>
                      <option value="700">Bold</option>
                    </select>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      );
    case 'hero': {
      const iconMode = block.iconMode || (block.iconImageUrl ? 'image' : 'emoji');
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-gray-600">Hero mark</div>
            <div className="flex flex-wrap gap-2">
              {HERO_MARK_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => set('iconMode', mode.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    iconMode === mode.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {iconMode === 'emoji' ? (
            <label className="block text-xs text-gray-600 sm:col-span-2">
              Emoji
              <input
                value={block.emoji || ''}
                onChange={(e) => set('emoji', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="🎉 or paste any emoji"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {HERO_ICON_OPTIONS.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => set('emoji', item.emoji)}
                    className={`rounded-lg border px-2 py-1 text-lg leading-none ${
                      block.emoji === item.emoji ? 'border-teal-600 bg-teal-50' : 'border-gray-200 bg-white'
                    }`}
                    title={item.label}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </label>
          ) : null}

          {iconMode === 'icon' ? (
            <div className="sm:col-span-2">
              <div className="mb-1 text-xs text-gray-600">Pick an icon</div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {HERO_ICON_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange({ ...block, iconMode: 'icon', iconId: item.id, emoji: item.emoji })}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 ${
                      (block.iconId || 'sparkles') === item.id
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                    title={item.label}
                  >
                    <span className="text-xl leading-none">{item.emoji}</span>
                    <span className="truncate text-[10px] text-gray-500">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {iconMode === 'image' ? (
            <div className="sm:col-span-2">
              <ImageField
                label="Icon / mark image"
                value={block.iconImageUrl || ''}
                onChange={(url) => onChange({ ...block, iconMode: 'image', iconImageUrl: url })}
                heroImages={heroImages}
                getToken={getToken}
                uploadType="email-marketing"
                hint="Upload a small icon or logo mark for the hero"
                onUploaded={onUploaded}
              />
            </div>
          ) : null}

          <label className="block text-xs text-gray-600">
            Color
            <input type="color" value={block.color || '#0f172a'} onChange={(e) => set('color', e.target.value)} className="mt-1 h-9 w-full rounded border border-gray-300" />
          </label>
          <label className="block text-xs text-gray-600 sm:col-span-2">
            Title
            <input value={block.title || ''} onChange={(e) => set('title', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-gray-600 sm:col-span-2">
            Subtitle
            <input value={block.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Supporting line for the campaign" />
          </label>
          <div className="sm:col-span-2">
            <ImageField
              label="Hero image URL"
              value={block.imageUrl || ''}
              onChange={(url) => set('imageUrl', url)}
              heroImages={heroImages}
              getToken={getToken}
              uploadType="email-marketing"
              onUploaded={onUploaded}
            />
          </div>
        </div>
      );
    }
    case 'badge':
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Promo badge — control section spacing, colors, and pill design.
          </div>
          <label className="block text-xs text-gray-600">
            Badge text
            <input
              value={block.text || ''}
              onChange={(e) => set('text', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="LIMITED TIME OFFER"
            />
          </label>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Alignment</div>
            <div className="flex flex-wrap gap-2">
              {BADGE_ALIGN_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('align', option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    (block.align || 'center') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Badge style</div>
            <div className="grid grid-cols-2 gap-2">
              {BADGE_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('badgeStyle', option.id)}
                  className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium ${
                    (block.badgeStyle || 'filled') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Section background
              <input
                type="color"
                value={block.backgroundColor || '#f8fafc'}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Badge color
              <input
                type="color"
                value={block.color || '#0f766e'}
                onChange={(e) => set('color', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Text color
              <input
                type="color"
                value={block.textColor || '#ffffff'}
                onChange={(e) => set('textColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Border color
              <input
                type="color"
                value={block.borderColor || block.color || '#0f766e'}
                onChange={(e) => set('borderColor', e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-300"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ToggleChip checked={Boolean(block.showBorder)} onChange={(v) => set('showBorder', v)}>
              Show border
            </ToggleChip>
            {block.showBorder ? (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                Width (px)
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={block.borderWidth ?? 2}
                  onChange={(e) => set('borderWidth', Number(e.target.value) || 2)}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-gray-800">Section padding (px)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['paddingTop', 'Top', block.paddingTop ?? 18],
                ['paddingBottom', 'Bottom', block.paddingBottom ?? 0],
                ['paddingLeft', 'Left', block.paddingLeft ?? 24],
                ['paddingRight', 'Right', block.paddingRight ?? 24],
              ].map(([key, label, value]) => (
                <label key={key} className="block text-xs text-gray-600">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={96}
                    value={value}
                    onChange={(e) => set(key, Number(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-gray-800">Section margin (px)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['marginTop', 'Top', block.marginTop ?? 0],
                ['marginBottom', 'Bottom', block.marginBottom ?? 0],
                ['marginLeft', 'Left', block.marginLeft ?? 0],
                ['marginRight', 'Right', block.marginRight ?? 0],
              ].map(([key, label, value]) => (
                <label key={key} className="block text-xs text-gray-600">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={96}
                    value={value}
                    onChange={(e) => set(key, Number(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-gray-800">Badge design</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-gray-600">
                Font size (px)
                <input
                  type="number"
                  min={9}
                  max={24}
                  value={block.fontSize ?? 11}
                  onChange={(e) => set('fontSize', Number(e.target.value) || 11)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-gray-600">
                Letter spacing (px)
                <input
                  type="number"
                  min={0}
                  max={4}
                  step={0.1}
                  value={block.letterSpacing ?? 1}
                  onChange={(e) => set('letterSpacing', Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-gray-600">
                Corner radius (px)
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={block.borderRadius ?? 999}
                  onChange={(e) => set('borderRadius', Number(e.target.value) ?? 999)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-gray-600">
                Font weight
                <select
                  value={block.fontWeight || '800'}
                  onChange={(e) => set('fontWeight', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {BUTTON_WEIGHT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 text-xs font-medium text-gray-700">Badge inner padding (px)</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                ['badgePaddingTop', 'Top', block.badgePaddingTop ?? 8],
                ['badgePaddingBottom', 'Bottom', block.badgePaddingBottom ?? 8],
                ['badgePaddingLeft', 'Left', block.badgePaddingLeft ?? 14],
                ['badgePaddingRight', 'Right', block.badgePaddingRight ?? 14],
              ].map(([key, label, value]) => (
                <label key={key} className="block text-xs text-gray-600">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={48}
                    value={value}
                    onChange={(e) => set(key, Number(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      );
    case 'text':
      return (
        <label className="block text-xs text-gray-600">
          Message
          <textarea rows={3} value={block.html || ''} onChange={(e) => set('html', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      );
    case 'two_column':
      return (
        <div className="grid gap-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-900">
            2-column grid — edit left and right sides independently. Upload images optional.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-gray-200 p-2">
              <div className="text-xs font-semibold text-gray-700">Left column</div>
              <input
                value={block.leftTitle || ''}
                onChange={(e) => set('leftTitle', e.target.value)}
                placeholder="Title"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <textarea
                rows={3}
                value={block.leftHtml || ''}
                onChange={(e) => set('leftHtml', e.target.value)}
                placeholder="Text"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <ImageField
                label="Left image"
                value={block.leftImage || ''}
                onChange={(url) => set('leftImage', url)}
                heroImages={heroImages}
                getToken={getToken}
                onUploaded={onUploaded}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-gray-200 p-2">
              <div className="text-xs font-semibold text-gray-700">Right column</div>
              <input
                value={block.rightTitle || ''}
                onChange={(e) => set('rightTitle', e.target.value)}
                placeholder="Title"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <textarea
                rows={3}
                value={block.rightHtml || ''}
                onChange={(e) => set('rightHtml', e.target.value)}
                placeholder="Text"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <ImageField
                label="Right image"
                value={block.rightImage || ''}
                onChange={(url) => set('rightImage', url)}
                heroImages={heroImages}
                getToken={getToken}
                onUploaded={onUploaded}
              />
            </div>
          </div>
          <label className="block text-xs text-gray-600">
            Section background
            <input
              type="color"
              value={block.backgroundColor || '#f8fafc'}
              onChange={(e) => set('backgroundColor', e.target.value)}
              className="mt-1 h-9 w-full rounded border border-gray-300"
            />
          </label>
        </div>
      );
    case 'social': {
      const networks = Array.isArray(block.networks) && block.networks.length
        ? block.networks
        : SOCIAL_NETWORKS.map((item) => ({
          id: item.id,
          enabled: ['instagram', 'facebook', 'whatsapp'].includes(item.id),
          url: item.defaultUrl,
        }));

      const updateNetwork = (networkId, patch) => {
        const next = networks.map((item) => (
          item.id === networkId ? { ...item, ...patch } : item
        ));
        // Ensure all known networks exist
        const ids = new Set(next.map((item) => item.id));
        SOCIAL_NETWORKS.forEach((meta) => {
          if (!ids.has(meta.id)) {
            next.push({ id: meta.id, enabled: false, url: meta.defaultUrl });
          }
        });
        set('networks', next);
      };

      return (
        <div className="grid gap-3">
          <label className="block text-xs text-gray-600">
            Section heading
            <input
              value={block.heading || ''}
              onChange={(e) => set('heading', e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Follow us"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Icons position
              <select
                value={block.align || 'center'}
                onChange={(e) => set('align', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {LOGO_POSITION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Icon size
              <input
                type="number"
                min={28}
                max={48}
                value={block.iconSize || 36}
                onChange={(e) => set('iconSize', Number(e.target.value) || 36)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200 p-2">
            <div className="text-xs font-semibold text-slate-700">Social links</div>
            {SOCIAL_NETWORKS.map((meta) => {
              const row = networks.find((item) => item.id === meta.id) || {
                id: meta.id,
                enabled: false,
                url: meta.defaultUrl,
              };
              return (
                <div key={meta.id} className="grid gap-1 rounded-md border border-gray-100 bg-white p-2 sm:grid-cols-[110px_1fr]">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={Boolean(row.enabled)}
                      onChange={(e) => updateNetwork(meta.id, { enabled: e.target.checked })}
                    />
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{
                        background: meta.color,
                        color: meta.id === 'snapchat' ? '#111' : '#fff',
                      }}
                    >
                      {meta.label.slice(0, 2).toUpperCase()}
                    </span>
                    {meta.label}
                  </label>
                  <input
                    value={row.url || ''}
                    onChange={(e) => updateNetwork(meta.id, { url: e.target.value })}
                    placeholder={`${meta.label} profile URL`}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={!row.enabled}
                  />
                </div>
              );
            })}
          </div>
          <label className="block text-xs text-gray-600">
            Section background
            <input
              type="color"
              value={block.backgroundColor || '#f8fafc'}
              onChange={(e) => set('backgroundColor', e.target.value)}
              className="mt-1 h-9 w-full rounded border border-gray-300"
            />
          </label>
        </div>
      );
    }
    case 'button':
      return (
        <div className="space-y-3">
          <label className="block text-xs text-gray-600">
            Button label
            <input value={block.label || ''} onChange={(e) => set('label', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-gray-600">
            Link URL
            <input value={block.url || ''} onChange={(e) => set('url', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>

          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Alignment</div>
            <div className="flex flex-wrap gap-2">
              {BUTTON_ALIGN_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('align', option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    (block.align || 'center') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Button style</div>
            <div className="flex flex-wrap gap-2">
              {BUTTON_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('buttonStyle', option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    (block.buttonStyle || 'filled') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Button color
              <input type="color" value={block.color || '#0f766e'} onChange={(e) => set('color', e.target.value)} className="mt-1 h-9 w-full rounded border border-gray-300" />
            </label>
            <label className="block text-xs text-gray-600">
              Text color
              <input
                type="color"
                value={block.textColor || '#ffffff'}
                onChange={(e) => set('textColor', e.target.value)}
                disabled={(block.buttonStyle || 'filled') !== 'filled'}
                className="mt-1 h-9 w-full rounded border border-gray-300 disabled:opacity-40"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Font size
              <input
                type="number"
                min={11}
                max={22}
                value={block.fontSize || 15}
                onChange={(e) => set('fontSize', Number(e.target.value) || 15)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Font weight
              <select
                value={block.fontWeight || '700'}
                onChange={(e) => set('fontWeight', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {BUTTON_WEIGHT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Corner radius
              <input
                type="number"
                min={0}
                max={40}
                value={block.borderRadius ?? 10}
                onChange={(e) => set('borderRadius', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding (vertical)
              <input
                type="number"
                min={6}
                max={28}
                value={block.paddingY || 14}
                onChange={(e) => set('paddingY', Number(e.target.value) || 14)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Padding (horizontal)
              <input
                type="number"
                min={10}
                max={56}
                value={block.paddingX || 36}
                onChange={(e) => set('paddingX', Number(e.target.value) || 36)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-gray-700 sm:mt-6">
              <input
                type="checkbox"
                checked={block.fullWidth === true}
                onChange={(e) => set('fullWidth', e.target.checked)}
              />
              Full width button
            </label>
          </div>
        </div>
      );
    case 'form': {
      const selectedFields = Array.isArray(block.fields) ? block.fields : ['email'];
      return (
        <div className="space-y-3">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Email clients cannot submit forms. This block shows a signup preview and links to your site.
          </p>
          <label className="block text-xs text-gray-600">
            Heading
            <input value={block.heading || ''} onChange={(e) => set('heading', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-gray-600">
            Subheading
            <input value={block.subheading || ''} onChange={(e) => set('subheading', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Fields</div>
            <div className="flex flex-wrap gap-2">
              {FORM_FIELD_OPTIONS.map((field) => {
                const checked = selectedFields.includes(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? selectedFields.filter((id) => id !== field.id)
                        : [...selectedFields, field.id];
                      set('fields', next.length ? next : ['email']);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      checked
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {field.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Style</div>
            <div className="flex flex-wrap gap-2">
              {FORM_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set('formStyle', option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    (block.formStyle || 'card') === option.id
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs text-gray-600">
            Button label
            <input value={block.buttonLabel || ''} onChange={(e) => set('buttonLabel', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-gray-600">
            Button color
            <input type="color" value={block.buttonColor || '#0f766e'} onChange={(e) => set('buttonColor', e.target.value)} className="mt-1 h-9 w-full rounded border border-gray-300" />
          </label>
          <label className="block text-xs text-gray-600">
            Signup / success URL
            <input value={block.successUrl || ''} onChange={(e) => set('successUrl', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="https://store1920.com" />
          </label>
        </div>
      );
    }
    case 'image':
      return (
        <div className="grid gap-2">
          <ImageField
            label="Image"
            value={block.src || ''}
            onChange={(url) => set('src', url)}
            heroImages={heroImages}
            getToken={getToken}
            uploadType="email-marketing"
            onUploaded={onUploaded}
          />
          <label className="block text-xs text-gray-600">
            Click URL
            <input value={block.url || ''} onChange={(e) => set('url', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-gray-600">
            Alt text
            <input value={block.alt || ''} onChange={(e) => set('alt', e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
        </div>
      );
    case 'spacer':
      return (
        <label className="block text-xs text-gray-600">
          Height (px)
          <input type="number" min={8} max={120} value={block.height || 24} onChange={(e) => set('height', Number(e.target.value) || 24)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      );
    case 'footer':
      return (
        <div className="grid gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            Edit footer logo, text, support email, website, and unsubscribe link.
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={block.showLogo !== false} onChange={(e) => set('showLogo', e.target.checked)} />
            Show logo
          </label>
          {block.showLogo !== false && (
            <>
              <ImageField
                label="Footer logo"
                value={block.logoUrl || ''}
                onChange={(url) => set('logoUrl', url)}
                getToken={getToken}
                uploadType="logo"
                allowPickExisting={false}
                hint="Upload a logo, or leave empty for the default Store1920 logo"
              />
              <label className="block text-xs text-gray-600">
                Logo position
                <select
                  value={block.logoPosition || 'center'}
                  onChange={(e) => set('logoPosition', e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {LOGO_POSITION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-gray-600">
                Logo width (px)
                <input
                  type="number"
                  min={80}
                  max={200}
                  value={block.logoWidth || 140}
                  onChange={(e) => set('logoWidth', Number(e.target.value) || 140)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
            </>
          )}
          <label className="block text-xs text-gray-600">
            Copyright text
            <input
              value={block.copyrightText || ''}
              onChange={(e) => set('copyrightText', e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={block.showSupport !== false} onChange={(e) => set('showSupport', e.target.checked)} />
            Show support email
          </label>
          {block.showSupport !== false && (
            <>
              <label className="block text-xs text-gray-600">
                Support label
                <input
                  value={block.supportLabel || 'Questions?'}
                  onChange={(e) => set('supportLabel', e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-gray-600">
                Support email
                <input
                  value={block.supportEmail || ''}
                  onChange={(e) => set('supportEmail', e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
            </>
          )}
          <label className="block text-xs text-gray-600">
            Website URL
            <input
              value={block.companyWebsite || ''}
              onChange={(e) => set('companyWebsite', e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="https://store1920.com"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={block.showUnsubscribe !== false} onChange={(e) => set('showUnsubscribe', e.target.checked)} />
            Show unsubscribe link
          </label>
          {block.showUnsubscribe !== false && (
            <label className="block text-xs text-gray-600">
              Unsubscribe text
              <input
                value={block.unsubscribeText || ''}
                onChange={(e) => set('unsubscribeText', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          <label className="block text-xs text-gray-600">
            Footer background
            <input
              type="color"
              value={block.backgroundColor || '#0f172a'}
              onChange={(e) => set('backgroundColor', e.target.value)}
              className="mt-1 h-9 w-full rounded border border-gray-300"
            />
          </label>
        </div>
      );
    default:
      return <p className="text-xs text-gray-500">No extra settings for this block.</p>;
  }
}

export default function EmailCampaignBuilder({
  blocks,
  onChange,
  subject,
  onSubjectChange,
  name,
  onNameChange,
  preheader,
  onPreheaderChange,
  fontFamily = 'helvetica',
  onFontFamilyChange,
  previewProducts = [],
  heroImages = [],
  categories = [],
  getToken,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [paletteDragType, setPaletteDragType] = useState(null);
  const [uploadedImages, setUploadedImages] = useState(() => loadUploadedImages());
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const userChoseBlockRef = useRef(false);
  const blockEditorRefs = useRef({});
  const previewFrameRef = useRef(null);
  const imageLibrary = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const url of [...uploadedImages, ...heroImages]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
    return merged;
  }, [uploadedImages, heroImages]);

  const rememberUploadedImage = (url) => {
    if (!url) return;
    setUploadedImages((prev) => {
      const next = [url, ...prev.filter((item) => item !== url)].slice(0, 48);
      persistUploadedImages(next);
      return next;
    });
  };

  useEffect(() => {
    if (!blocks.length) {
      setExpandedBlockId(null);
      return;
    }
    const ids = blocks.map((block, index) => block.id || `${block.type}-${index}`);
    setExpandedBlockId((current) => {
      if (current && ids.includes(current)) return current;
      if (current === null && userChoseBlockRef.current) return null;
      return ids[0];
    });
  }, [blocks]);

  const previewHtml = useMemo(
    () => {
      const html = renderEmailFromBlocks(blocks, {
        products: previewProducts,
        recipientEmail: 'preview@example.com',
        preheader,
        fontFamily,
        interactivePreview: true,
      });
      if (typeof window === 'undefined') return html;
      return rewriteEmailPreviewMediaUrls(html, window.location.origin);
    },
    [blocks, preheader, previewProducts, fontFamily],
  );

  const selectBlockFromPreview = (blockId) => {
    if (!blockId) return;
    userChoseBlockRef.current = true;
    setExpandedBlockId(blockId);
    window.setTimeout(() => {
      const node = blockEditorRefs.current[blockId];
      if (node?.scrollIntoView) {
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 80);
    try {
      previewFrameRef.current?.contentWindow?.postMessage({
        type: 'email-preview-select-block',
        blockId,
      }, '*');
    } catch {
      // ignore cross-origin issues in dev
    }
  };

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'email-preview-block-click') {
        selectBlockFromPreview(event.data.blockId);
        return;
      }
      if (event.data?.type === 'email-preview-link-click') {
        const href = String(event.data.href || '').trim();
        if (!href || href === '#') return;
        const label = href.startsWith('mailto:')
          ? 'Open your email app for this address?'
          : 'Open this link in a new tab?';
        if (window.confirm(label)) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!expandedBlockId) return;
    try {
      previewFrameRef.current?.contentWindow?.postMessage({
        type: 'email-preview-select-block',
        blockId: expandedBlockId,
      }, '*');
    } catch {
      // ignore
    }
  }, [expandedBlockId, previewHtml]);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return undefined;

    const writePreview = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://store1920.com';
      const html = buildPreviewIframeDocument(previewHtml, origin);
      // srcdoc inherits parent better for media loading than about:blank + document.write
      frame.removeAttribute('src');
      frame.srcdoc = html;
      if (expandedBlockId) {
        try {
          frame.contentWindow?.postMessage({
            type: 'email-preview-select-block',
            blockId: expandedBlockId,
          }, '*');
        } catch {
          // ignore
        }
      }
    };

    if (frame.contentDocument?.readyState === 'complete') {
      writePreview();
      return undefined;
    }

    frame.addEventListener('load', writePreview);
    writePreview();
    return () => frame.removeEventListener('load', writePreview);
  }, [previewHtml]);

  const updateBlock = (index, next) => {
    const copy = blocks.map((block, i) => (i === index ? { ...next } : block));
    onChange(copy);
  };

  const removeBlock = (index) => {
    onChange(blocks.filter((_, i) => i !== index));
  };

  const moveBlock = (from, to) => {
    if (from === to || from == null || to == null) return;
    const copy = [...blocks];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(copy);
  };

  const addBlock = (type, atIndex = blocks.length) => {
    const next = [...blocks];
    const created = createDefaultBlock(type);
    next.splice(atIndex, 0, created);
    onChange(next);
    userChoseBlockRef.current = true;
    setExpandedBlockId(created.id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="min-w-0 space-y-4 overflow-hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-gray-700 sm:col-span-2">
            Template name
            <input value={name} onChange={(e) => onNameChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="My campaign template" />
          </label>
          <label className="block text-sm text-gray-700 sm:col-span-2">
            Email subject
            <input value={subject} onChange={(e) => onSubjectChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Subject customers will see" />
          </label>
          <label className="block text-sm text-gray-700 sm:col-span-2">
            Preheader (inbox preview text)
            <input value={preheader} onChange={(e) => onPreheaderChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Optional short preview" />
          </label>
          <label className="block text-sm text-gray-700 sm:col-span-2">
            Email font family (applies to whole email)
            <select
              value={fontFamily || 'helvetica'}
              onChange={(e) => onFontFamilyChange?.(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {EMAIL_FONT_FAMILY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-500">
              Changes headings, body text, menus, and buttons across the full template.
            </span>
          </label>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-gray-800">Add blocks (drag or click)</div>
          <div className="flex flex-wrap gap-2">
            {EMAIL_BLOCK_TYPES.map((item) => (
              <button
                key={item.type}
                type="button"
                draggable
                onDragStart={() => setPaletteDragType(item.type)}
                onDragEnd={() => setPaletteDragType(null)}
                onClick={() => addBlock(item.type)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  item.type.startsWith('product')
                    ? 'border-teal-300 bg-teal-50 text-teal-900'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title={item.description}
              >
                + {item.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="min-h-[220px] space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (paletteDragType) {
              addBlock(paletteDragType);
              setPaletteDragType(null);
            }
          }}
        >
          {blocks.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              Drag blocks here — logo header, hero upload, product slider, category products
            </div>
          ) : (
            blocks.map((block, index) => {
              const blockKey = block.id || `${block.type}-${index}`;
              const expanded = expandedBlockId === blockKey;
              const label = BLOCK_LABELS[block.type] || block.type.replace(/_/g, ' ');
              return (
              <div
                key={blockKey}
                ref={(node) => {
                  if (node) blockEditorRefs.current[blockKey] = node;
                  else delete blockEditorRefs.current[blockKey];
                }}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (paletteDragType) {
                    addBlock(paletteDragType, index);
                    setPaletteDragType(null);
                    return;
                  }
                  moveBlock(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm ${
                  expanded ? 'border-teal-300 ring-1 ring-teal-100' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      userChoseBlockRef.current = true;
                      setExpandedBlockId(expanded ? null : blockKey);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="text-slate-400">⋮⋮</span>
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {index + 1}. {label}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {expanded ? 'Hide' : 'Edit'}
                    </span>
                  </button>
                  <button type="button" onClick={() => removeBlock(index)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
                {expanded ? (
                  <div className="border-t border-slate-100 p-3">
                    <BlockEditor
                      block={block}
                      onChange={(next) => updateBlock(index, next)}
                      previewProducts={previewProducts}
                      heroImages={imageLibrary}
                      categories={categories}
                      getToken={getToken}
                      onUploaded={rememberUploadedImage}
                    />
                  </div>
                ) : null}
              </div>
              );
            })
          )}
        </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-3 lg:z-10 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-800">Live preview</div>
            <div className="text-[11px] text-gray-500">Click a section to edit · product links open in a new tab</div>
          </div>
          <div className="text-xs text-gray-500">{previewProducts.length} products loaded</div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
          <iframe
            ref={previewFrameRef}
            title="Email preview"
            className="h-[min(720px,calc(100vh-9rem))] w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
    </div>
  );
}
