'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Copy, ExternalLink, Plus, Search, Trash2, Check } from 'lucide-react';
import { EMAIL_CAMPAIGN_PAGE_MAX_PRODUCTS } from '@/lib/emailCampaignPageHelpers';

const EMPTY_FORM = {
  title: '',
  titleAr: '',
  slug: '',
  subtitle: '',
  subtitleAr: '',
  heroImage: '',
  productIds: [],
  ctaLabel: '',
  ctaUrl: '',
  backgroundColor: '#f8fafc',
  accentColor: '#0f766e',
  status: 'published',
  seoTitle: '',
  seoDescription: '',
};

export default function EmailCampaignLandingPages({ getToken }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMeta, setSelectedMeta] = useState({});

  const authHeaders = useCallback(async () => {
    const token = await getToken?.();
    if (!token) throw new Error('Sign in required');
    return { Authorization: `Bearer ${token}` };
  }, [getToken]);

  const loadPages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const headers = await authHeaders();
      const { data } = await axios.get('/api/store/email-marketing/pages', { headers });
      setPages(Array.isArray(data.pages) ? data.pages : []);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const selectedProducts = useMemo(
    () => (form.productIds || [])
      .map((id) => selectedMeta[id] || { id, name: id })
      .filter(Boolean),
    [form.productIds, selectedMeta],
  );

  useEffect(() => {
    if (!form.productIds?.length || !getToken) return undefined;
    const missing = form.productIds.filter((id) => !selectedMeta[id]?.name);
    if (!missing.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const chunkSize = 80;
        const found = [];
        for (let i = 0; i < missing.length; i += chunkSize) {
          const chunk = missing.slice(i, i + chunkSize);
          const { data } = await axios.get(
            `/api/store/email-marketing/products?ids=${encodeURIComponent(chunk.join(','))}&limit=${chunk.length}`,
            { headers },
          );
          if (cancelled) return;
          found.push(...(Array.isArray(data.products) ? data.products : []));
        }
        if (cancelled) return;
        setSelectedMeta((prev) => {
          const next = { ...prev };
          found.forEach((product) => {
            const id = String(product.id || product._id || '');
            if (!id) return;
            next[id] = {
              id,
              name: product.name || '',
              image: product.image || '',
              price: product.price,
            };
          });
          return next;
        });
      } catch {
        // ignore hydrate failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.productIds.join('|'), getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = productSearch.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const headers = await authHeaders();
        const { data } = await axios.get(
          `/api/store/email-marketing/products?q=${encodeURIComponent(q)}&limit=24`,
          { headers },
        );
        if (!cancelled) setSearchResults(Array.isArray(data.products) ? data.products : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productSearch, authHeaders]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setStatusMessage('');
    setError('');
  };

  const startEdit = (page) => {
    setEditingId(page.id);
    setForm({
      title: page.title || '',
      titleAr: page.titleAr || '',
      slug: page.slug || '',
      subtitle: page.subtitle || '',
      subtitleAr: page.subtitleAr || '',
      heroImage: page.heroImage || '',
      productIds: Array.isArray(page.productIds) ? page.productIds : [],
      ctaLabel: page.ctaLabel || '',
      ctaUrl: page.ctaUrl || '',
      backgroundColor: page.backgroundColor || '#f8fafc',
      accentColor: page.accentColor || '#0f766e',
      status: page.status || 'draft',
      seoTitle: page.seoTitle || '',
      seoDescription: page.seoDescription || '',
    });
    setStatusMessage('');
    setError('');
  };

  const toggleProduct = (product) => {
    const id = String(product.id || product._id || '');
    if (!id) return;
    setSelectedMeta((prev) => ({
      ...prev,
      [id]: {
        id,
        name: product.name || '',
        image: product.image || '',
        price: product.price,
      },
    }));
    setForm((prev) => {
      const exists = prev.productIds.includes(id);
      if (exists) {
        return { ...prev, productIds: prev.productIds.filter((item) => item !== id) };
      }
      if (prev.productIds.length >= EMAIL_CAMPAIGN_PAGE_MAX_PRODUCTS) return prev;
      return { ...prev, productIds: [...prev.productIds, id] };
    });
  };

  const savePage = async () => {
    try {
      setSaving(true);
      setError('');
      setStatusMessage('');
      const headers = await authHeaders();
      const payload = { ...form };
      if (editingId) {
        const { data } = await axios.patch(
          `/api/store/email-marketing/pages/${editingId}`,
          payload,
          { headers },
        );
        setStatusMessage('Page updated.');
        if (data.page) startEdit(data.page);
      } else {
        const { data } = await axios.post('/api/store/email-marketing/pages', payload, { headers });
        setStatusMessage('Page created.');
        if (data.page) startEdit(data.page);
      }
      await loadPages();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const deletePage = async (page) => {
    if (!window.confirm(`Delete landing page “${page.title}”?`)) return;
    try {
      const headers = await authHeaders();
      await axios.delete(`/api/store/email-marketing/pages/${page.id}`, { headers });
      if (editingId === page.id) startCreate();
      await loadPages();
      setStatusMessage('Page deleted.');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to delete page');
    }
  };

  const copyLink = async (page) => {
    if (page.status !== 'published') {
      setError('This page is still a Draft. Set status to Published and save — then the /c/ link will work.');
      return;
    }
    const url = page.publicUrl || '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(page.id);
      setError('');
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setError('Could not copy link');
    }
  };

  const publishPage = async (page) => {
    try {
      setSaving(true);
      setError('');
      const headers = await authHeaders();
      const { data } = await axios.patch(
        `/api/store/email-marketing/pages/${page.id}`,
        { status: 'published' },
        { headers },
      );
      setStatusMessage(`Published. Public link: ${data?.page?.publicUrl || page.publicUrl || `/c/${page.slug}`}`);
      await loadPages();
      if (data?.page) startEdit(data.page);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Campaign landing pages</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Create a page with only the products from your email (e.g. 5–6 items). Publish it, copy the link,
            and use that URL as the email CTA so customers open this curated page.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          New page
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {statusMessage ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{statusMessage}</div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">Your pages</h4>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : pages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No landing pages yet. Create one for your next campaign.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className={`rounded-xl border px-3 py-3 ${
                    editingId === page.id ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => startEdit(page)} className="min-w-0 text-start">
                      <div className="truncate text-sm font-semibold text-slate-900">{page.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className={page.status === 'published' ? 'font-semibold text-teal-700' : 'font-semibold text-amber-700'}>
                          {page.status === 'published' ? 'Published' : 'Draft (not public yet)'}
                        </span>
                        {' · '}{page.productCount} products · /c/{page.slug}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {page.status !== 'published' ? (
                        <button
                          type="button"
                          onClick={() => publishPage(page)}
                          disabled={saving}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          Publish
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Copy public link"
                        onClick={() => copyLink(page)}
                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
                      >
                        {copiedId === page.id ? <Check className="h-3.5 w-3.5 text-teal-700" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      {page.status === 'published' ? (
                        <a
                          href={page.publicPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
                          title="Open page"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deletePage(page)}
                        className="rounded-lg border border-red-100 bg-white p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900">
              {editingId ? 'Edit page' : 'Create page'}
            </h4>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          {form.status !== 'published' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Draft pages are not public. Choose <strong>Published</strong> and save (or click Publish in the list) before sharing <code className="rounded bg-white px-1">/c/{form.slug || '…'}</code>.
            </div>
          ) : (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[12px] text-teal-900">
              Public link after save: <code className="rounded bg-white px-1">/c/{form.slug || 'your-slug'}</code>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-600 sm:col-span-2">
              Title (English)
              <input
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Weekend picks"
              />
            </label>
            <label className="block text-xs text-slate-600 sm:col-span-2">
              Title (Arabic) optional
              <input
                value={form.titleAr}
                onChange={(e) => setField('titleAr', e.target.value)}
                dir="rtl"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-600 sm:col-span-2">
              Subtitle
              <input
                value={form.subtitle}
                onChange={(e) => setField('subtitle', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Only the products from this email"
              />
            </label>
            <label className="block text-xs text-slate-600">
              URL slug
              <input
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="weekend-picks"
              />
              <span className="mt-1 block text-[11px] text-slate-400">Public URL: /c/{form.slug || 'your-slug'}</span>
            </label>
            <label className="block text-xs text-slate-600">
              Hero image URL
              <input
                value={form.heroImage}
                onChange={(e) => setField('heroImage', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Background
              <input
                type="color"
                value={form.backgroundColor || '#f8fafc'}
                onChange={(e) => setField('backgroundColor', e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Accent
              <input
                type="color"
                value={form.accentColor || '#0f766e'}
                onChange={(e) => setField('accentColor', e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Optional CTA label
              <input
                value={form.ctaLabel}
                onChange={(e) => setField('ctaLabel', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Shop all deals"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Optional CTA link
              <input
                value={form.ctaUrl}
                onChange={(e) => setField('ctaUrl', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://store1920.com/shop"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800">
                Products on this page ({form.productIds.length}/{EMAIL_CAMPAIGN_PAGE_MAX_PRODUCTS})
              </div>
            </div>

            {selectedProducts.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProduct(product)}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                    title="Remove"
                  >
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : null}
                    <span className="truncate">{product.name || product.id}</span>
                    <span className="text-slate-400">×</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Search and add the same products you put in the email.</p>
            )}

            <label className="relative block">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name or SKU…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-8 pe-3 text-sm"
              />
            </label>
            {searchLoading ? <p className="text-xs text-slate-500">Searching…</p> : null}
            {searchResults.length > 0 ? (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                {searchResults.map((product) => {
                  const id = String(product.id || product._id || '');
                  const selected = form.productIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleProduct(product)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs ${
                        selected ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <span className="h-8 w-8 rounded bg-slate-100" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{product.name}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {selected ? 'Added' : 'Add'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={savePage}
              disabled={saving || !form.title.trim() || form.productIds.length === 0}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create page'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={startCreate}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear form
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
