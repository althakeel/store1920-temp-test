'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
  STORE1920_LEGAL_NAME,
  STORE1920_TRADE_LICENSE_NO,
  STORE1920_BUSINESS_HOURS_EN,
  getBusinessAddressLines,
} from '@/lib/businessIdentity';
import Link from 'next/link';

const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache';
const DEFAULT_BG = '#8f3404';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export default function ContactUs() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', topic: 'Question', orderNumber: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [navBg, setNavBg] = useState(DEFAULT_BG);

  useEffect(() => {
    try {
      const draftRaw = sessionStorage.getItem('productReportDraft');
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        const composedMessage = [
          draft?.subject ? `Subject: ${draft.subject}` : '',
          draft?.message || '',
        ].filter(Boolean).join('\n\n');

        setForm((prev) => ({
          ...prev,
          message: composedMessage || prev.message,
        }));
        sessionStorage.removeItem('productReportDraft');
        return;
      }
    } catch {
      // ignore malformed draft
    }

    const subject = searchParams.get('subject');
    const message = searchParams.get('message');
    if (!subject && !message) return;

    setForm((prev) => ({
      ...prev,
      message: [
        subject ? `Subject: ${subject}` : '',
        message || prev.message,
      ].filter(Boolean).join('\n\n'),
    }));
  }, [searchParams]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.backgroundColor) setNavBg(parsed.backgroundColor);
      }
    } catch {}
  }, []);

  const { r, g, b } = hexToRgb(navBg);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          topic: form.topic,
          orderNumber: form.orderNumber,
          message: form.message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not send your message. Please try again.');
      }
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error?.message || 'Could not send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Hero banner */}
      <div
        className="w-full py-16 px-4 flex flex-col items-center text-center"
        style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},1) 0%, rgba(${r},${g},${b},0.78) 100%)` }}
      >
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4 shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow">Get in Touch</h1>
        <p className="mt-2 text-white/80 text-sm sm:text-base max-w-md">
          Questions, complaints, and return requests — no account required. We reply during {STORE1920_BUSINESS_HOURS_EN}.
        </p>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Left — info cards */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                ),
                label: 'Customer Support',
                value: formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE),
                href: STORE1920_CUSTOMER_SUPPORT_TEL,
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                ),
                label: 'Email Us',
                value: STORE1920_SUPPORT_EMAIL,
                href: null,
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                ),
                label: 'Business Hours',
                value: STORE1920_BUSINESS_HOURS_EN,
                href: null,
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                ),
                label: 'Business Address',
                value: getBusinessAddressLines().join(', '),
                href: null,
              },
            ].map(({ icon, label, value, href }) => (
              <div key={label} className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md transition-shadow">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `rgba(${r},${g},${b},0.1)`, color: navBg }}
                >
                  {icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                  {href ? (
                    <a href={href} className="text-sm font-medium text-gray-800 hover:underline break-all" style={{ '--tw-ring-color': navBg }}>
                      {value}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{value}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Business info card */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4 text-sm text-gray-600 space-y-2">
              <p className="font-semibold text-gray-700">Store1920</p>
              <p>
                Operated by <strong>{STORE1920_LEGAL_NAME}</strong> (UAE Trade License {STORE1920_TRADE_LICENSE_NO}).
              </p>
              <p>
                Full company details:{' '}
                <Link href="/business-information" className="font-semibold text-[#E52721] hover:underline">
                  Business Information
                </Link>
              </p>
              <p>We typically reply the next business day. We are not a 24/7 desk.</p>
              <p>
                Guest return or complaint:{' '}
                <Link href="/support" className="font-semibold text-[#E52721] hover:underline">
                  Support form
                </Link>
                {' '}or this page. Signed-in customers can also use{' '}
                <Link href="/return-request" className="font-semibold text-[#E52721] hover:underline">
                  Return Request
                </Link>.
              </p>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Card top bar */}
              <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, rgba(${r},${g},${b},1), rgba(${r},${g},${b},0.5))` }} />

              <div className="p-7">
                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center gap-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={navBg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Message Sent!</h3>
                      <p className="text-sm text-gray-500 mt-1">Thanks. We&apos;ll reply during business hours, usually the next business day.</p>
                    </div>
                    <button
                      onClick={() => { setSubmitted(false); setForm({ name: '', email: '', topic: 'Question', orderNumber: '', message: '' }); }}
                      className="mt-2 text-sm font-semibold px-5 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: navBg }}
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Send us a message</h2>
                    <p className="text-sm text-gray-400 mb-6">Guests can submit a complaint or return request here. Include your order number if you have one.</p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                      {submitError ? (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                          {submitError}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Topic</label>
                          <select
                            name="topic"
                            value={form.topic}
                            onChange={handleChange}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent transition"
                            style={{ '--tw-ring-color': `rgba(${r},${g},${b},0.4)` }}
                          >
                            <option value="Question">Question</option>
                            <option value="Complaint">Complaint</option>
                            <option value="Return Request">Return request</option>
                            <option value="Order Issue">Order issue</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Order number (optional)</label>
                          <input
                            type="text"
                            name="orderNumber"
                            value={form.orderNumber}
                            onChange={handleChange}
                            placeholder="If this is a return or complaint"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition"
                            style={{ '--tw-ring-color': `rgba(${r},${g},${b},0.4)` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name</label>
                          <input
                            type="text"
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            required
                            placeholder="John Doe"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition"
                            style={{ '--tw-ring-color': `rgba(${r},${g},${b},0.4)` }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email Address</label>
                          <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={handleChange}
                            required
                            placeholder="john@example.com"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition"
                            style={{ '--tw-ring-color': `rgba(${r},${g},${b},0.4)` }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Message</label>
                        <textarea
                          name="message"
                          value={form.message}
                          onChange={handleChange}
                          required
                          rows={6}
                          placeholder="Describe your issue or question in detail..."
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent transition resize-none"
                          style={{ '--tw-ring-color': `rgba(${r},${g},${b},0.4)` }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-white text-sm shadow-md transition-opacity hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                        style={{ backgroundColor: navBg, boxShadow: `0 4px 14px rgba(${r},${g},${b},0.35)` }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                        {submitting ? 'Sending…' : 'Send Message'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

