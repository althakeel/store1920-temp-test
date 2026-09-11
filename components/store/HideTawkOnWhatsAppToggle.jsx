'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { normalizeWhatsAppProductWidget } from '@/lib/whatsappProductWidget';

export default function HideTawkOnWhatsAppToggle({ compact = false }) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [widget, setWidget] = useState(null);
  const hideTawk = widget?.hideTawkWhenVisible !== false;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const { data } = await axios.get('/api/store/appearance/sections', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWidget(normalizeWhatsAppProductWidget(data?.whatsappProductWidget));
    } catch (error) {
      console.error(error);
      toast.error('Failed to load Tawk / WhatsApp settings');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveHideTawk = async (nextValue) => {
    if (!widget || saving) return;
    const previous = widget;
    const nextWidget = { ...widget, hideTawkWhenVisible: nextValue };
    setWidget(nextWidget);
    try {
      setSaving(true);
      const token = await getToken();
      await axios.post(
        '/api/store/appearance/sections',
        { whatsappProductWidget: nextWidget },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success(
        nextValue
          ? 'Tawk is hidden on WhatsApp product pages'
          : 'Tawk can show on WhatsApp product pages',
      );
    } catch (error) {
      setWidget(previous);
      toast.error(error?.response?.data?.error || 'Failed to save Tawk setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white ${compact ? 'px-4 py-3' : 'p-5'}`}
      lang="en"
      dir="ltr"
    >
      <label className="flex cursor-pointer items-start gap-3">
        {loading ? (
          <Loader2 className="mt-0.5 animate-spin text-slate-400" size={16} />
        ) : (
          <input
            type="checkbox"
            checked={hideTawk}
            disabled={saving}
            onChange={(event) => {
              void saveHideTawk(event.target.checked);
            }}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        )}
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageCircle size={16} className="text-emerald-600" />
            Hide Tawk chat on WhatsApp product pages
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">
            When the floating WhatsApp button is shown, Tawk stays hidden so the two widgets do not overlap.
          </span>
          {compact ? (
            <Link
              href="/store/customize/whatsapp-widget"
              className="mt-1 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Manage WhatsApp widget
            </Link>
          ) : null}
        </span>
      </label>
    </section>
  );
}
