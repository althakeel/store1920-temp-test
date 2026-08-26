'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, BellRing, Globe2, Loader2, Save, Sparkles } from 'lucide-react';
import { MdAutoAwesome } from 'react-icons/md';
import { useAuth } from '@/lib/useAuth';
import { DEFAULT_CHECKOUT_ALERT } from '@/lib/checkoutAlert';

const EMPTY_FORM = {
  enabled: false,
  title: DEFAULT_CHECKOUT_ALERT.title,
  titleAr: DEFAULT_CHECKOUT_ALERT.titleAr,
  message: '',
  messageAr: '',
  showOnCheckout: true,
};

function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-amber-200 hover:bg-amber-50/40">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-amber-500" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function CheckoutAlertPreview({ title, message, language = 'en' }) {
  const isArabic = language === 'ar';
  const displayTitle = String(title || '').trim() || DEFAULT_CHECKOUT_ALERT.title;
  const displayMessage = String(message || '').trim();

  if (!displayMessage) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Add a message to preview the checkout banner.
      </div>
    );
  }

  return (
    <div
      dir={isArabic ? 'rtl' : 'ltr'}
      className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3 text-amber-950 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{displayTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/90">{displayMessage}</p>
        </div>
      </div>
    </div>
  );
}

export default function StoreAlertsPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState('en');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const token = await getToken(true);
        if (!token) {
          toast.error('Please sign in again');
          return;
        }

        const { data } = await axios.get('/api/store/preferences/checkout-alert', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!cancelled && data?.checkoutAlert) {
          setForm({ ...EMPTY_FORM, ...data.checkoutAlert });
        }
      } catch (error) {
        console.error('Load checkout alert failed:', error);
        toast.error(error?.response?.data?.error || 'Failed to load alert settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isLive = form.enabled && form.showOnCheckout && String(form.message || '').trim();

  const previewCopy = useMemo(() => {
    if (previewLanguage === 'ar') {
      return {
        title: form.titleAr || form.title,
        message: form.messageAr || form.message,
      };
    }
    return {
      title: form.title,
      message: form.message,
    };
  }, [form.message, form.messageAr, form.title, form.titleAr, previewLanguage]);

  const translateText = async (text, token) => {
    const { data } = await axios.post('/api/store/categories/translate-arabic', { text }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return String(data?.descriptionAr || '').trim();
  };

  const handleTranslateToArabic = async () => {
    const englishTitle = String(form.title || '').trim();
    const englishMessage = String(form.message || '').trim();

    if (!englishTitle && !englishMessage) {
      toast.error('Enter English title or message first');
      return;
    }

    try {
      setTranslating(true);
      const token = await getToken(true);
      if (!token) {
        toast.error('Please sign in again');
        return;
      }

      const [titleAr, messageAr] = await Promise.all([
        englishTitle ? translateText(englishTitle, token) : Promise.resolve(''),
        englishMessage ? translateText(englishMessage, token) : Promise.resolve(''),
      ]);

      if (!titleAr && !messageAr) {
        toast.error('Could not translate to Arabic');
        return;
      }

      setForm((prev) => ({
        ...prev,
        ...(titleAr ? { titleAr } : {}),
        ...(messageAr ? { messageAr } : {}),
      }));
      setPreviewLanguage('ar');
      toast.success('Arabic fields updated');
    } catch (error) {
      console.error('Translate checkout alert failed:', error);
      toast.error(error?.response?.data?.error || 'Failed to translate to Arabic');
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (form.enabled && !String(form.message || '').trim()) {
      toast.error('Enter an English message before enabling the alert');
      return;
    }

    try {
      setSaving(true);
      const token = await getToken(true);
      if (!token) {
        toast.error('Please sign in again');
        return;
      }

      const { data } = await axios.put('/api/store/preferences/checkout-alert', form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setForm({ ...EMPTY_FORM, ...data.checkoutAlert });
      toast.success('Alert saved');
    } catch (error) {
      console.error('Save checkout alert failed:', error);
      toast.error(error?.response?.data?.error || 'Failed to save alert');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50 to-white">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Checkout Alerts</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Notify customers about delivery delays, holidays, or high order volume directly on checkout.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isLive
                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {isLive ? 'Live on checkout' : 'Not visible'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-12 text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading alert settings…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Visibility</h2>
              <p className="mt-1 text-sm text-slate-500">Control when the banner appears on checkout.</p>

              <div className="mt-4 space-y-3">
                <ToggleSwitch
                  checked={form.enabled}
                  onChange={(value) => updateField('enabled', value)}
                  label="Enable alert"
                  description="Turn the delivery notice on or off store-wide."
                />
                <ToggleSwitch
                  checked={form.showOnCheckout}
                  onChange={(value) => updateField('showOnCheckout', value)}
                  label="Show on checkout page"
                  description="Display the banner above the order details during checkout."
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Alert content</h2>
                  <p className="mt-1 text-sm text-slate-500">Write in English, then auto-fill Arabic for bilingual shoppers.</p>
                </div>
                <button
                  type="button"
                  onClick={handleTranslateToArabic}
                  disabled={translating || (!form.title?.trim() && !form.message?.trim())}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MdAutoAwesome className="h-4 w-4" />}
                  {translating ? 'Translating…' : 'Auto translate to Arabic'}
                </button>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Globe2 className="h-3.5 w-3.5" />
                    English
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => updateField('title', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      placeholder="Delivery notice"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={5}
                      value={form.message}
                      onChange={(e) => updateField('message', e.target.value)}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      placeholder="Delivery may be delayed by 1–2 days due to high order volume."
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Arabic
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={form.titleAr}
                      onChange={(e) => updateField('titleAr', e.target.value)}
                      className="w-full rounded-lg border border-violet-100 bg-white px-3 py-2.5 text-right text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      placeholder="تنبيه التوصيل"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
                    <textarea
                      rows={5}
                      dir="rtl"
                      value={form.messageAr}
                      onChange={(e) => updateField('messageAr', e.target.value)}
                      className="w-full resize-y rounded-lg border border-violet-100 bg-white px-3 py-2.5 text-right text-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      placeholder="قد يتأخر التوصيل يوم أو يومين بسبب كثرة الطلبات."
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save alert'}
              </button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live preview</h2>
                  <p className="mt-1 text-xs text-slate-500">How shoppers will see it on checkout.</p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPreviewLanguage('en')}
                    className={`rounded-md px-2.5 py-1 transition ${
                      previewLanguage === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLanguage('ar')}
                    className={`rounded-md px-2.5 py-1 transition ${
                      previewLanguage === 'ar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    AR
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Checkout page</p>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-3 h-2 w-24 rounded bg-slate-200" />
                    {isLive ? (
                      <CheckoutAlertPreview
                        title={previewCopy.title}
                        message={previewCopy.message}
                        language={previewLanguage}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                        Alert is off — enable it to show on checkout.
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded bg-slate-100" />
                      <div className="h-2 w-4/5 rounded bg-slate-100" />
                      <div className="h-16 rounded-lg border border-slate-100 bg-slate-50" />
                    </div>
                  </div>
                </div>

                <CheckoutAlertPreview
                  title={previewCopy.title}
                  message={previewCopy.message}
                  language={previewLanguage}
                />
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
