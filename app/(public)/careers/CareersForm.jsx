'use client';

import { useState } from 'react';

const COPY = {
  en: {
    name: 'Full name',
    email: 'Email address',
    phone: 'Phone (UAE)',
    role: 'Area of interest',
    rolePlaceholder: 'Select an area',
    roles: [
      'Customer support',
      'Fulfilment & warehouse',
      'Merchandising & catalog',
      'Digital & store operations',
      'Other',
    ],
    message: 'Tell us about your experience and the role you want',
    submit: 'Submit application',
    thanks: 'Thank you. We have received your application and will contact you if there is a fit.',
  },
  ar: {
    name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف (الإمارات)',
    role: 'مجال الاهتمام',
    rolePlaceholder: 'اختر مجالًا',
    roles: [
      'خدمة العملاء',
      'التجهيز والمستودع',
      'التصنيف والكتالوج',
      'العمليات الرقمية والمتجر',
      'أخرى',
    ],
    message: 'أخبرنا عن خبرتك والدور الذي تريده',
    submit: 'إرسال الطلب',
    thanks: 'شكرًا لك. استلمنا طلبك وسنتواصل معك إذا وُجد توافق.',
  },
};

export default function CareersForm({ isArabic = false }) {
  const copy = isArabic ? COPY.ar : COPY.en;
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const phoneLine = form.phone.trim()
        ? `${isArabic ? 'الهاتف' : 'Phone'}: ${form.phone.trim()}`
        : '';
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          topic: `Careers — ${form.role}`,
          message: [phoneLine, form.message].filter(Boolean).join('\n\n'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || (isArabic ? 'تعذر إرسال الطلب. حاول مرة أخرى.' : 'Could not send your application. Please try again.'));
      }
      setSubmitted(true);
    } catch (error) {
      setSubmitError(
        error?.message || (isArabic ? 'تعذر إرسال الطلب. حاول مرة أخرى.' : 'Could not send your application. Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-slate-900 focus:border-[#E52721] focus:outline-none focus:ring-1 focus:ring-[#E52721]';

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm leading-relaxed text-emerald-800">
        {copy.thanks}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="name">
          {copy.name}
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className={fieldClass}
          value={form.name}
          onChange={handleChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="email">
          {copy.email}
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className={fieldClass}
          value={form.email}
          onChange={handleChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="phone">
          {copy.phone}
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          className={fieldClass}
          value={form.phone}
          onChange={handleChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="role">
          {copy.role}
        </label>
        <select
          id="role"
          name="role"
          required
          className={fieldClass}
          value={form.role}
          onChange={handleChange}
        >
          <option value="">{copy.rolePlaceholder}</option>
          {copy.roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="message">
          {copy.message}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className={fieldClass}
          value={form.message}
          onChange={handleChange}
        />
      </div>
      {submitError ? (
        <p className="text-sm text-red-600" role="alert">
          {submitError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#E52721] py-3 text-sm font-bold text-white transition hover:bg-[#c41f1a] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? (isArabic ? 'جارٍ الإرسال…' : 'Sending…') : copy.submit}
      </button>
    </form>
  );
}
