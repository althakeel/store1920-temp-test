'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  CalendarRange,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import Image from '@/components/SafeNextImage';
import { useAuth } from '@/lib/useAuth';
import Loading from '@/components/Loading';
import { getAbandonedCartDisplayName, getAbandonedCartTotal, isAnonymousAbandonedCart } from '@/lib/abandonedCartUtils';
import { getAbandonedCartDisplayItems } from '@/lib/abandonedCartLineItems';
import { getConversionPaymentMethodLabel, isValidPaymentLink } from '@/lib/abandonedCartRecoveryPayment';
import { buildRecoveryLink } from '@/lib/abandonedCartRecoveryOffer';
import { getCustomerSiteUrl } from '@/lib/appUrl';
import { formatWhatsAppErrorMessage } from '@/lib/whatsapp/formatWhatsAppError';

const PAGE_SIZE = 20;

const SOURCE_META = {
  cart: { label: 'Added to cart', className: 'bg-blue-50 text-blue-700' },
  'guest-cart': { label: 'Guest cart', className: 'bg-violet-50 text-violet-700' },
  checkout: { label: 'At checkout', className: 'bg-amber-50 text-amber-700' },
  checkout_payment: { label: 'Awaiting card payment', className: 'bg-amber-50 text-amber-800' },
  payment_failed: { label: 'Payment failed', className: 'bg-orange-50 text-orange-700' },
  payment_cancelled: { label: 'Payment cancelled', className: 'bg-orange-50 text-orange-700' },
  converted: { label: 'Converted', className: 'bg-emerald-50 text-emerald-700' },
  pending_payment: { label: 'Awaiting payment', className: 'bg-amber-50 text-amber-800' },
  anonymous: { label: 'Guest', className: 'bg-slate-100 text-slate-700' },
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(amount, currency = 'AED') {
  const value = Number(amount || 0);
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getCartTotal(cart) {
  if (
    (cart?.status === 'converted' || cart?.status === 'pending_payment')
    && Number.isFinite(Number(cart?.convertedCartTotal))
  ) {
    return Number(cart.convertedCartTotal);
  }

  return getAbandonedCartTotal(cart);
}

function getLocationLabel(address) {
  if (!address || typeof address !== 'object') return null;

  const parts = [address.city, address.district, address.state, address.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function getCustomerLabel(cart) {
  return getAbandonedCartDisplayName(cart);
}

function hasCustomerEmailSent(cart = {}) {
  if (cart.conversionEmailSent) return true;
  if (cart.recoveryLinkSentAt) return true;
  return false;
}

function getEmailSentLabel(cart = {}) {
  if (cart.conversionEmailSent) {
    return `Conversion email · ${cart.conversionCustomerEmail || cart.email || 'customer'}`;
  }
  if (cart.recoveryLinkSentAt) {
    return `Discount link email · ${cart.recoveryLinkSentTo || cart.email || 'customer'}`;
  }
  return '';
}

function normalizePhoneForWhatsApp(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('971') ? digits : `971${digits.replace(/^0+/, '')}`;
}

function toDatetimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join('T');
}

function startOfLocalDay(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (daysAgo) date.setDate(date.getDate() - daysAgo);
  return date;
}

function endOfLocalDay() {
  const date = new Date();
  date.setHours(23, 59, 0, 0);
  return date;
}

function ListPagination({
  page,
  totalPages,
  totalItems,
  pageSize = PAGE_SIZE,
  onPageChange,
  label = 'items',
}) {
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-600">
        Showing {from}-{to} of {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function PaymentLinkShare({ cart, link, amount, currency = 'AED', title = 'Payment link for customer' }) {
  const [copied, setCopied] = useState(false);
  const message = `Hi${cart?.name ? ` ${getCustomerLabel(cart)}` : ''}, please complete your payment of ${formatMoney(amount, currency)} here: ${link}`;
  const whatsappPhone = normalizePhoneForWhatsApp(cart?.phone);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : null;
  const mailUrl = cart?.email
    ? `mailto:${encodeURIComponent(cart.email)}?subject=${encodeURIComponent('Complete your payment')}&body=${encodeURIComponent(message)}`
    : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{title}</p>
      <p className="mt-2 break-all rounded-md border border-blue-100 bg-white px-2 py-2 text-xs text-slate-700">
        {link}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Copy size={14} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
          >
            Share on WhatsApp
          </a>
        ) : null}
        {mailUrl ? (
          <a
            href={mailUrl}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Share by email
          </a>
        ) : null}
      </div>
    </div>
  );
}

function computeFinalPrice(cartTotalMax, pricingMode, discountInput, customPrice) {
  if (pricingMode === 'none') {
    return { final: cartTotalMax, error: '' };
  }

  if (pricingMode === 'amount') {
    if (discountInput === '') {
      return { final: null, error: 'Enter discount amount' };
    }
    const discount = Number(discountInput);
    if (!Number.isFinite(discount) || discount < 0) {
      return { final: null, error: 'Enter a valid discount amount' };
    }
    if (discount > cartTotalMax) {
      return { final: null, error: `Discount cannot exceed ${formatMoney(cartTotalMax)}` };
    }
    return {
      final: Number((cartTotalMax - discount).toFixed(2)),
      error: '',
    };
  }

  if (pricingMode === 'percent') {
    if (discountInput === '') {
      return { final: null, error: 'Enter discount percentage' };
    }
    const percent = Number(discountInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { final: null, error: 'Enter a percentage between 0 and 100' };
    }
    return {
      final: Number((cartTotalMax * (1 - percent / 100)).toFixed(2)),
      error: '',
    };
  }

  if (customPrice === '') {
    return { final: null, error: 'Enter the final order value' };
  }

  const parsed = Number(customPrice);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { final: null, error: 'Enter a valid amount' };
  }
  if (parsed > cartTotalMax) {
    return { final: null, error: `Maximum allowed is ${formatMoney(cartTotalMax)} (cart total)` };
  }

  return { final: parsed, error: '' };
}

function ConvertModal({
  cart,
  open,
  onClose,
  onConfirm,
  onSendRecoveryLink,
  saving,
  sendingRecoveryLink = false,
  dashboardUsers = [],
  currentUserId = null,
}) {
  const [pricingMode, setPricingMode] = useState('none');
  const [discountInput, setDiscountInput] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [note, setNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sendCustomerEmail, setSendCustomerEmail] = useState(true);
  const [sendWhatsAppReminder, setSendWhatsAppReminder] = useState(true);
  const [convertedById, setConvertedById] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentLinkInput, setPaymentLinkInput] = useState('');
  const [paymentLinkError, setPaymentLinkError] = useState('');
  const [successCart, setSuccessCart] = useState(null);
  const [recoveryLink, setRecoveryLink] = useState('');
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [recoveryEmailError, setRecoveryEmailError] = useState('');
  const [recoveryWhatsAppSent, setRecoveryWhatsAppSent] = useState(false);
  const [recoveryWhatsAppError, setRecoveryWhatsAppError] = useState('');

  const cartTotalMax = cart ? getAbandonedCartTotal(cart) : 0;
  const currency = cart?.currency || 'AED';

  useEffect(() => {
    if (!open || !cart) return;
    setPricingMode('none');
    setDiscountInput('');
    setCustomPrice(String(getAbandonedCartTotal(cart)));
    setNote('');
    setPaymentMethod('cod');
    setPaymentLinkInput('');
    setPaymentLinkError('');
    setSuccessCart(null);
    setRecoveryLink(cart.recoveryToken
      ? buildRecoveryLink(getCustomerSiteUrl(), cart.recoveryToken)
      : '');
    setRecoveryEmailSent(false);
    setRecoveryEmailError('');
    const label = getCustomerLabel(cart);
    setCustomerName(label === 'Guest' || label === 'Logged-in customer' ? '' : label);
    setCustomerEmail(String(cart.email || '').trim());
    setCustomerPhone(String(cart.phone || '').trim());
    setSendCustomerEmail(true);
    setSendWhatsAppReminder(true);

    const defaultUser = dashboardUsers.find(
      (member) => member.userId === currentUserId || member.id === currentUserId
    ) || dashboardUsers[0];

    setConvertedById(defaultUser?.id || '');
  }, [open, cart, dashboardUsers, currentUserId]);

  useEffect(() => {
    if (paymentMethod !== 'tabby' && paymentMethod !== 'tamara') {
      setPaymentLinkError('');
      return;
    }

    if (!paymentLinkInput.trim()) {
      setPaymentLinkError('Paste the payment link to share with the customer');
      return;
    }

    setPaymentLinkError(isValidPaymentLink(paymentLinkInput)
      ? ''
      : 'Enter a valid payment URL');
  }, [paymentMethod, paymentLinkInput]);

  const selectedConverter = dashboardUsers.find((member) => member.id === convertedById);

  const { final: computedFinal, error: priceError } = computeFinalPrice(
    cartTotalMax,
    pricingMode,
    discountInput,
    customPrice
  );

  const canSubmit = Boolean(
    computedFinal !== null
    && !priceError
    && !paymentLinkError
    && customerName.trim()
    && convertedById
    && (paymentMethod !== 'tabby' && paymentMethod !== 'tamara' ? true : paymentLinkInput.trim())
    && (!sendCustomerEmail || customerEmail.trim())
  );

  const canSendRecoveryLink = Boolean(
    onSendRecoveryLink
    && pricingMode !== 'none'
    && computedFinal !== null
    && !priceError
    && computedFinal < cartTotalMax
    && customerName.trim()
    && (!sendCustomerEmail || customerEmail.trim())
  );

  const handleSendRecoveryLink = async () => {
    if (!canSendRecoveryLink || !onSendRecoveryLink) return;

    const result = await onSendRecoveryLink({
      recoveryDiscountType: pricingMode,
      recoveryDiscountValue: pricingMode === 'amount' || pricingMode === 'percent'
        ? Number(discountInput)
        : null,
      recoveryOfferTotal: computedFinal,
      customerName,
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      sendRecoveryEmail: sendCustomerEmail,
      sendWhatsApp: sendWhatsAppReminder && Boolean(customerPhone.trim()),
    });

    if (result?.recoveryLink) {
      setRecoveryLink(result.recoveryLink);
      setRecoveryEmailSent(Boolean(result.emailSent));
      setRecoveryEmailError(result.emailError || '');
      setRecoveryWhatsAppSent(Boolean(result.whatsappSent));
      setRecoveryWhatsAppError(result.whatsappError || '');
    }
  };

  const paymentOptions = [
    { id: 'cod', label: 'COD' },
    { id: 'card', label: 'Card' },
    { id: 'stripe', label: 'Stripe link' },
    { id: 'tabby', label: 'Tabby link' },
    { id: 'tamara', label: 'Tamara link' },
  ];

  const handleSubmit = async () => {
    const result = await onConfirm({
      convertedCartTotal: computedFinal,
      conversionNote: note,
      customerName,
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      sendCustomerEmail,
      conversionDiscountType: pricingMode,
      conversionDiscountValue: pricingMode === 'amount' || pricingMode === 'percent'
        ? Number(discountInput)
        : null,
      convertedByUserId: selectedConverter?.userId || selectedConverter?.id || currentUserId,
      convertedByName: selectedConverter?.name || selectedConverter?.label || 'Store staff',
      conversionPaymentMethod: paymentMethod,
      conversionPaymentLink: paymentMethod === 'tabby' || paymentMethod === 'tamara'
        ? paymentLinkInput.trim()
        : null,
    });

    if (result) {
      setSuccessCart(result);
      return;
    }

    onClose();
  };

  const pricingOptions = [
    { id: 'none', label: 'No discount' },
    { id: 'amount', label: 'Amount off' },
    { id: 'percent', label: '% off' },
    { id: 'custom', label: 'Custom total' },
  ];

  if (!open || !cart) return null;

  if (successCart) {
    const isPendingPayment = successCart.status === 'pending_payment' || successCart.pendingPayment;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
        <div className="flex min-h-full items-center justify-center">
          <div className="flex w-full max-w-md max-h-[min(90vh,calc(100dvh-2rem))] flex-col rounded-xl bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-900">
              {isPendingPayment ? 'Payment link sent' : 'Cart converted'}
            </h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className={`rounded-lg border px-3 py-2.5 text-sm ${
              isPendingPayment
                ? 'border-amber-100 bg-amber-50 text-amber-900'
                : 'border-emerald-100 bg-emerald-50 text-emerald-800'
            }`}>
              <p className="font-semibold">
                {isPendingPayment
                  ? 'Payment link created. Waiting for customer payment.'
                  : 'Conversion saved successfully.'}
              </p>
              {isPendingPayment ? (
                <p className="mt-1 text-xs">
                  Order created on Orders (awaiting payment). Cart moves to Converted after you confirm payment.
                </p>
              ) : null}
              <p className="mt-1">
                Payment method: {getConversionPaymentMethodLabel(successCart.conversionPaymentMethod)}
              </p>
              <p className="mt-0.5">
                Final value: {formatMoney(successCart.convertedCartTotal, successCart.currency || currency)}
              </p>
              {successCart.emailSent ? (
                <p className="mt-1 font-medium text-emerald-900">
                  Email sent to {successCart.conversionCustomerEmail || successCart.customerEmail}
                </p>
              ) : null}
              {successCart.emailError ? (
                <p className="mt-1 text-amber-800">
                  Email not sent: {successCart.emailError}
                </p>
              ) : null}
              {successCart.shortOrderNumber || successCart.orderId ? (
                <p className="mt-2 font-medium">
                  Order {successCart.shortOrderNumber ? `#${successCart.shortOrderNumber}` : 'created'} — view it on the{' '}
                  <a href="/store/orders" className="underline">Orders</a> page.
                </p>
              ) : null}
            </div>
            {successCart.conversionPaymentLink ? (
              <PaymentLinkShare
                cart={successCart}
                link={successCart.conversionPaymentLink}
                amount={successCart.convertedCartTotal}
                currency={successCart.currency || currency}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-md max-h-[min(90vh,calc(100dvh-2rem))] flex-col rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">Convert abandoned cart</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-sm text-slate-600">
            Mark <span className="font-medium text-slate-900">{getCustomerLabel(cart)}</span> as converted.
            This moves the cart to the Converted tab.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Abandoned cart total</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">{formatMoney(cartTotalMax, currency)}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Customer name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Enter customer name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Customer email
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="customer@email.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={sendCustomerEmail}
                onChange={(event) => setSendCustomerEmail(event.target.checked)}
                className="rounded border-slate-300"
              />
              Send order details and payment link to this email
            </label>
            {sendCustomerEmail && !customerEmail.trim() ? (
              <p className="mt-1 text-xs text-red-600">Enter the customer email to send the message.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Customer phone (for WhatsApp)
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="05xxxxxxxx or 9715xxxxxxxx"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={sendWhatsAppReminder}
                onChange={(event) => setSendWhatsAppReminder(event.target.checked)}
                className="rounded border-slate-300"
              />
              Send WhatsApp cart reminder with discount link
            </label>
            {sendWhatsAppReminder && !customerPhone.trim() ? (
              <p className="mt-1 text-xs text-amber-700">Add a phone number to send the WhatsApp cart reminder.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Converted by
            </label>
            {dashboardUsers.length > 0 ? (
              <select
                value={convertedById}
                onChange={(event) => setConvertedById(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {dashboardUsers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {selectedConverter?.label || 'Current dashboard user'}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Team members with access to this dashboard
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Discount
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pricingOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setPricingMode(option.id);
                    setDiscountInput('');
                    if (option.id === 'custom') {
                      setCustomPrice(String(cartTotalMax));
                    }
                  }}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    pricingMode === option.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {pricingMode === 'amount' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Discount amount
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">{currency}</span>
                <input
                  type="number"
                  min="0"
                  max={cartTotalMax}
                  step="0.01"
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="e.g. 16"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-500 ${
                    priceError ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
              </div>
            </div>
          ) : null}

          {pricingMode === 'percent' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Discount percentage
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="e.g. 10"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-500 ${
                    priceError ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
                <span className="text-sm font-medium text-slate-500">%</span>
              </div>
            </div>
          ) : null}

          {pricingMode === 'custom' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Final order value (max {formatMoney(cartTotalMax, currency)})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">{currency}</span>
                <input
                  type="number"
                  min="0"
                  max={cartTotalMax}
                  step="0.01"
                  value={customPrice}
                  onChange={(event) => setCustomPrice(event.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-500 ${
                    priceError ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Final order value</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-900">
              {computedFinal !== null ? formatMoney(computedFinal, currency) : '—'}
            </p>
            {pricingMode === 'amount' && computedFinal !== null && discountInput
              ? (
                <p className="mt-1 text-xs text-emerald-700">
                  {formatMoney(cartTotalMax, currency)} − {formatMoney(Number(discountInput), currency)} discount
                </p>
              )
              : null}
            {pricingMode === 'percent' && computedFinal !== null && discountInput
              ? (
                <p className="mt-1 text-xs text-emerald-700">
                  {formatMoney(cartTotalMax, currency)} with {discountInput}% off
                </p>
              )
              : null}
          </div>

          {priceError ? <p className="text-xs text-red-600">{priceError}</p> : null}

          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              Send private discount link first
            </p>
            <p className="mt-1 text-xs text-violet-800">
              Share a private link by email and WhatsApp so the customer only sees the discounted cart total above.
            </p>
            <button
              type="button"
              disabled={!canSendRecoveryLink || sendingRecoveryLink}
              onClick={handleSendRecoveryLink}
              className="mt-3 w-full rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingRecoveryLink ? 'Sending...' : 'Generate & send discount link'}
            </button>
            {pricingMode === 'none' ? (
              <p className="mt-2 text-xs text-violet-700">Choose a discount type above before sending a link.</p>
            ) : null}
            {recoveryLink ? (
              <div className="mt-3">
                <PaymentLinkShare
                  cart={cart}
                  link={recoveryLink}
                  amount={computedFinal ?? cart.recoveryOfferTotal ?? cartTotalMax}
                  currency={currency}
                  title="Private discount link for customer"
                />
                {recoveryEmailSent ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">Recovery email sent to {customerEmail}</p>
                ) : null}
                {recoveryEmailError ? (
                  <p className="mt-2 text-xs text-amber-800">{recoveryEmailError}</p>
                ) : null}
                {recoveryWhatsAppSent ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={14} />
                    WhatsApp sent to {customerPhone.trim() || cart.phone}
                  </p>
                ) : null}
                {recoveryWhatsAppError ? (
                  <p className="mt-2 text-xs text-amber-800">{recoveryWhatsAppError}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payment method
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {paymentOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(option.id);
                    setPaymentLinkInput('');
                  }}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    paymentMethod === option.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {paymentMethod === 'stripe' ? (
              <p className="mt-2 text-xs text-slate-500">
                A Stripe checkout link for the final amount will be created. The cart is marked converted only after payment.
              </p>
            ) : null}
            {paymentMethod === 'tabby' || paymentMethod === 'tamara' ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {paymentMethod === 'tabby' ? 'Tabby' : 'Tamara'} payment link
                </label>
                <input
                  type="url"
                  value={paymentLinkInput}
                  onChange={(event) => setPaymentLinkInput(event.target.value)}
                  placeholder={`Paste ${paymentMethod === 'tabby' ? 'Tabby' : 'Tamara'} checkout link`}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-500 ${
                    paymentLinkError ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
                {paymentLinkError ? <p className="mt-1 text-xs text-red-600">{paymentLinkError}</p> : null}
              </div>
            ) : null}
            {paymentMethod === 'cod' ? (
              <p className="mt-2 text-xs text-slate-500">Customer will pay cash on delivery.</p>
            ) : null}
            {paymentMethod === 'card' ? (
              <p className="mt-2 text-xs text-slate-500">Mark as paid by card in store or over phone.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Note (optional)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="How was this recovered? e.g. WhatsApp follow-up, phone call..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !canSubmit}
            onClick={handleSubmit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : (paymentMethod === 'stripe' || paymentMethod === 'tabby' || paymentMethod === 'tamara'
              ? 'Send payment link'
              : 'Mark as converted')}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

function CartRow({
  cart,
  expanded,
  onToggle,
  onConvertClick,
  onConfirmPayment,
  onResendEmail,
  onSendWhatsApp,
  onDelete,
  resendingId,
  sendingWhatsAppId,
  whatsappSentCartId,
  deletingId,
  confirmingPaymentId,
  canDelete = false,
}) {
  const items = Array.isArray(cart.items) ? cart.items : [];
  const displayItems = useMemo(() => getAbandonedCartDisplayItems(cart), [cart]);
  const isConverted = cart.status === 'converted';
  const isPendingPayment = cart.status === 'pending_payment';
  const isAnonymous = cart.isAnonymousGuest || isAnonymousAbandonedCart(cart);
  const source = isConverted
    ? SOURCE_META.converted
    : isPendingPayment
      ? SOURCE_META.pending_payment
      : isAnonymous
        ? SOURCE_META.anonymous
        : (SOURCE_META[cart.source] || { label: cart.source || 'Abandoned', className: 'bg-slate-50 text-slate-700' });
  const total = getCartTotal(cart);
  const location = getLocationLabel(cart.address);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${source.className}`}>
              {source.label}
            </span>
            <span className="text-[11px] text-slate-500">
              {formatDate(isConverted ? cart.convertedAt : isPendingPayment ? cart.updatedAt : cart.lastSeenAt)}
            </span>
            {hasCustomerEmailSent(cart) ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                Email sent
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{getCustomerLabel(cart)}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-slate-900">{formatMoney(total, cart.currency || 'AED')}</p>
          <p className="text-[11px] text-slate-500">{items.length} item{items.length === 1 ? '' : 's'}</p>
        </div>

        {expanded ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 sm:px-4">
          <div className="space-y-1.5 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <Mail size={14} className="shrink-0 text-slate-400" />
              <span className={cart.email ? '' : 'italic text-slate-400'}>{cart.email || 'Email not provided'}</span>
            </p>
            {cart.phone ? (
              <p className="flex items-center gap-2">
                <Phone size={14} className="shrink-0 text-slate-400" />
                {cart.phone}
              </p>
            ) : null}
            <p className="flex items-center gap-2">
              <MapPin size={14} className="shrink-0 text-slate-400" />
              <span className={location ? '' : 'text-slate-400'}>{location || 'Location not provided'}</span>
            </p>
            {hasCustomerEmailSent(cart) ? (
              <p className="flex items-center gap-2 text-sky-700">
                <Mail size={14} className="shrink-0 text-sky-500" />
                <span>{getEmailSentLabel(cart)}</span>
                {cart.recoveryLinkSentAt ? (
                  <span className="text-slate-500">· {formatDate(cart.recoveryLinkSentAt)}</span>
                ) : null}
                {cart.conversionEmailSentAt ? (
                  <span className="text-slate-500">· {formatDate(cart.conversionEmailSentAt)}</span>
                ) : null}
              </p>
            ) : null}
            {cart.whatsappCheckoutReminderSentAt ? (
              <p className="flex items-center gap-2 text-emerald-700">
                <MessageCircle size={14} className="shrink-0 text-emerald-500" />
                <span>WhatsApp sent · {formatDate(cart.whatsappCheckoutReminderSentAt)}</span>
              </p>
            ) : null}
            {cart.whatsappCheckoutReminderError ? (
              <p className="flex items-center gap-2 text-amber-800">
                <MessageCircle size={14} className="shrink-0 text-amber-500" />
                <span>{formatWhatsAppErrorMessage(cart.whatsappCheckoutReminderError)}</span>
              </p>
            ) : null}
          </div>

          {isConverted ? (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p className="font-medium">Converted {formatDate(cart.convertedAt)}</p>
              <p className="mt-0.5 font-semibold">
                Final value: {formatMoney(getCartTotal(cart), cart.currency || 'AED')}
              </p>
              {cart.conversionDiscountType === 'amount' && cart.conversionDiscountValue != null ? (
                <p className="mt-0.5 text-emerald-700">
                  Discount: {formatMoney(cart.conversionDiscountValue, cart.currency || 'AED')} off
                </p>
              ) : null}
              {cart.conversionDiscountType === 'percent' && cart.conversionDiscountValue != null ? (
                <p className="mt-0.5 text-emerald-700">
                  Discount: {cart.conversionDiscountValue}% off
                </p>
              ) : null}
              {cart.conversionPaymentMethod ? (
                <p className="mt-0.5 text-emerald-700">
                  Payment: {getConversionPaymentMethodLabel(cart.conversionPaymentMethod)}
                </p>
              ) : null}
              {cart.conversionEmailSent ? (
                <p className="mt-0.5 text-emerald-700">
                  Email sent to {cart.conversionCustomerEmail || cart.email}
                </p>
              ) : null}
              {cart.conversionEmailError ? (
                <p className="mt-0.5 text-amber-700">{cart.conversionEmailError}</p>
              ) : null}
              {(cart.conversionCustomerEmail || cart.email) ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onResendEmail?.(cart);
                  }}
                  disabled={resendingId === cart._id}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                >
                  <Mail size={13} />
                  {resendingId === cart._id ? 'Sending...' : 'Resend email to customer'}
                </button>
              ) : null}
              {cart.convertedByName ? <p className="mt-0.5 text-emerald-700">By {cart.convertedByName}</p> : null}
              {cart.conversionNote ? <p className="mt-1 text-emerald-700">{cart.conversionNote}</p> : null}
            </div>
          ) : null}

          {isPendingPayment ? (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Waiting for customer payment</p>
              <p className="mt-0.5">
                Offer total: {formatMoney(getCartTotal(cart), cart.currency || 'AED')}
              </p>
              {cart.conversionPaymentMethod ? (
                <p className="mt-0.5">
                  Payment: {getConversionPaymentMethodLabel(cart.conversionPaymentMethod)}
                </p>
              ) : null}
              {cart.conversionEmailSent ? (
                <p className="mt-0.5">Email sent to {cart.conversionCustomerEmail || cart.email}</p>
              ) : null}
            </div>
          ) : null}

          {(isConverted || isPendingPayment) && cart.conversionPaymentLink ? (
            <div className="mt-3">
              <PaymentLinkShare
                cart={cart}
                link={cart.conversionPaymentLink}
                amount={getCartTotal(cart)}
                currency={cart.currency || 'AED'}
              />
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Products</p>
              {displayItems.map((item, index) => (
                <div
                  key={`${item?.productId || item?.name || 'item'}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-900">{item?.name || 'Product'}</p>
                    <p className="text-xs text-slate-500">
                      {item.isBulkBundle
                        ? `Bundle of ${item.bundleUnits || item.quantity} (${item.packQuantity} pack${item.packQuantity > 1 ? 's' : ''})`
                        : `Qty ${item.quantity || 1}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-slate-800">
                    {formatMoney(item.lineTotal, cart.currency || 'AED')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No products saved.</p>
          )}

          {!isConverted ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
              {cart.phone && onSendWhatsApp ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSendWhatsApp(cart);
                  }}
                  disabled={sendingWhatsAppId === cart._id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                    whatsappSentCartId === cart._id
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {sendingWhatsAppId === cart._id ? (
                    <>
                      <MessageCircle size={14} />
                      Sending...
                    </>
                  ) : whatsappSentCartId === cart._id ? (
                    <>
                      <CheckCircle2 size={14} />
                      Queued
                    </>
                  ) : (
                    <>
                      <MessageCircle size={14} />
                      Send WhatsApp reminder
                    </>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onConvertClick(cart);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 size={14} />
                {isPendingPayment ? 'Update payment link' : 'Convert order'}
              </button>
              {isPendingPayment ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onConfirmPayment?.(cart);
                  }}
                  disabled={confirmingPaymentId === cart._id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                >
                  <CreditCard size={14} />
                  {confirmingPaymentId === cart._id ? 'Saving...' : 'Mark payment received'}
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.(cart);
                  }}
                  disabled={deletingId === cart._id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deletingId === cart._id ? 'Moving...' : 'Move to Trash'}
                </button>
              ) : null}
              </div>
              {whatsappSentCartId === cart._id ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={14} />
                  WhatsApp queued to {cart.phone} (971 format). Check customer&apos;s WhatsApp in a few minutes.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              {canDelete ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.(cart);
                  }}
                  disabled={deletingId === cart._id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deletingId === cart._id ? 'Moving...' : 'Move to Trash'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AbandonedCheckoutPage() {
  const { user, getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [carts, setCarts] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({
    active: 0,
    identified: 0,
    guest: 0,
    pendingPayment: 0,
    cart: 0,
    checkout: 0,
    converted: 0,
    emailSent: 0,
    activeValue: 0,
    productCount: 0,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [whatsappSuccess, setWhatsappSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('products');
  const [selectedProductKey, setSelectedProductKey] = useState('');
  const [selectedProductLabel, setSelectedProductLabel] = useState('');
  const [selectedProductAbandonCount, setSelectedProductAbandonCount] = useState(0);
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [convertCart, setConvertCart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingRecoveryLink, setSendingRecoveryLink] = useState(false);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState(null);
  const [whatsappSentCartId, setWhatsappSentCartId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState(null);
  const [dashboardUsers, setDashboardUsers] = useState([]);
  const [canDeleteAbandonedCarts, setCanDeleteAbandonedCarts] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [filter, debouncedSearch, selectedProductKey, viewMode, fromDateTime, toDateTime]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const usersResult = await axios.get('/api/store/users', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);

        if (!cancelled && usersResult?.data) {
          setDashboardUsers(Array.isArray(usersResult.data.dashboardAccessUsers)
            ? usersResult.data.dashboardAccessUsers
            : []);
        }
      } catch {
        // Team list is optional for convert modal.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setListLoading(true);
        setError('');

        const token = await getToken();
        if (!token || cancelled) return;

        const params = {
          view: viewMode,
          page,
          limit: PAGE_SIZE,
          filter: viewMode === 'carts' ? filter : 'all',
          search: debouncedSearch || undefined,
          productKey: viewMode === 'carts' && selectedProductKey ? selectedProductKey : undefined,
          from: fromDateTime || undefined,
          to: toDateTime || undefined,
        };

        const { data } = await axios.get('/api/store/abandoned-checkout', {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });

        if (cancelled) return;

        setStats(data?.stats || {
          active: 0,
          identified: 0,
          guest: 0,
          pendingPayment: 0,
          cart: 0,
          checkout: 0,
          converted: 0,
          emailSent: 0,
          activeValue: 0,
          productCount: 0,
        });
        setProducts(Array.isArray(data?.products) ? data.products : []);
        setCarts(Array.isArray(data?.carts) ? data.carts : []);
        setTotalItems(Number(data?.total || 0));
        setTotalPages(Math.max(1, Number(data?.totalPages || 1)));
        setCanDeleteAbandonedCarts(Boolean(data?.canDeleteAbandonedCarts));
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err.message || 'Failed to fetch abandoned carts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setListLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    getToken,
    viewMode,
    page,
    filter,
    debouncedSearch,
    selectedProductKey,
    fromDateTime,
    toDateTime,
    reloadToken,
  ]);

  const hasDateTimeFilter = Boolean(fromDateTime || toDateTime);
  const safePage = Math.min(page, totalPages);
  const selectedProduct = selectedProductKey
    ? {
        key: selectedProductKey,
        name: selectedProductLabel || 'Selected product',
        abandonCount: selectedProductAbandonCount,
      }
    : null;

  const refreshList = () => setReloadToken((value) => value + 1);

  const applyDatePreset = (preset) => {
    if (preset === 'clear') {
      setFromDateTime('');
      setToDateTime('');
      return;
    }

    const end = endOfLocalDay();
    if (preset === 'today') {
      setFromDateTime(toDatetimeLocalValue(startOfLocalDay(0)));
      setToDateTime(toDatetimeLocalValue(end));
      return;
    }
    if (preset === '7d') {
      setFromDateTime(toDatetimeLocalValue(startOfLocalDay(6)));
      setToDateTime(toDatetimeLocalValue(end));
      return;
    }
    if (preset === '30d') {
      setFromDateTime(toDatetimeLocalValue(startOfLocalDay(29)));
      setToDateTime(toDatetimeLocalValue(end));
    }
  };

  const openCartsForProduct = (product) => {
    setSelectedProductKey(product.key);
    setSelectedProductLabel(product.name || 'Product');
    setSelectedProductAbandonCount(Number(product.abandonCount || 0));
    setViewMode('carts');
    setFilter('all');
    setSearchQuery('');
    setDebouncedSearch('');
    setPage(1);
  };

  const clearSelectedProduct = () => {
    setSelectedProductKey('');
    setSelectedProductLabel('');
    setSelectedProductAbandonCount(0);
  };

  const handleSendRecoveryLink = async ({
    recoveryDiscountType,
    recoveryDiscountValue,
    recoveryOfferTotal,
    customerName,
    customerEmail,
    customerPhone,
    sendRecoveryEmail,
    sendWhatsApp = true,
  }) => {
    if (!convertCart?._id) return null;

    setSendingRecoveryLink(true);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.patch(
        '/api/store/abandoned-checkout',
        {
          cartId: convertCart._id,
          action: 'send-recovery-link',
          recoveryDiscountType,
          recoveryDiscountValue,
          recoveryOfferTotal,
          customerName,
          customerEmail,
          customerPhone,
          sendRecoveryEmail,
          sendWhatsApp,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.cart) {
        setCarts((current) => current.map((cart) => (
          cart._id === data.cart._id ? data.cart : cart
        )));
        setConvertCart(data.cart);
      }

      return data;
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to send recovery link');
      return null;
    } finally {
      setSendingRecoveryLink(false);
    }
  };

  const handleSendWhatsAppCartReminder = async (cart) => {
    if (!cart?._id || !cart?.phone) return;

    setSendingWhatsAppId(cart._id);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.patch(
        '/api/store/abandoned-checkout',
        {
          cartId: cart._id,
          action: 'send-whatsapp-cart-reminder',
          variant: cart.source === 'checkout' ? 'checkout' : 'cart',
          useRecoveryLink: Boolean(cart.recoveryToken),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data?.whatsapp?.success) {
        const displayPhone = data.whatsapp.to || cart.phone;
        const queued = data.whatsapp.queued !== false && !data.whatsapp.alreadySent;
        setError('');
        setWhatsappSentCartId(cart._id);
        setWhatsappSuccess(
          data.whatsapp.alreadySent
            ? (data.whatsapp.message || `WhatsApp was already sent to ${displayPhone} recently.`)
            : queued
              ? `WhatsApp queued to ${displayPhone}. Customer should receive it within a few minutes if that number has WhatsApp.`
              : `WhatsApp sent to ${displayPhone}`,
        );
        setTimeout(() => {
          setWhatsappSentCartId(null);
          setWhatsappSuccess('');
        }, 12000);
        return;
      }

      if (data?.whatsapp?.skipped) {
        setError(formatWhatsAppErrorMessage(data.whatsapp.reason || 'WhatsApp could not be sent'));
        return;
      }

      const reason = formatWhatsAppErrorMessage(
        data?.whatsapp?.reason || data?.whatsapp?.error || data?.whatsapp?.message || 'WhatsApp could not be sent',
      );
      setError(reason.includes('missing token') ? `${reason}. Add WABA_TOKEN_* to .env and restart the server.` : reason);
    } catch (err) {
      setError(formatWhatsAppErrorMessage(err?.response?.data?.error || err.message || 'Failed to send WhatsApp reminder'));
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  const handleConvert = async ({
    convertedCartTotal,
    conversionNote,
    customerName,
    conversionDiscountType,
    conversionDiscountValue,
    convertedByUserId,
    convertedByName,
    conversionPaymentMethod,
    conversionPaymentLink,
    customerEmail,
    customerPhone,
    sendCustomerEmail,
  }) => {
    if (!convertCart?._id) return null;

    setSaving(true);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.patch(
        '/api/store/abandoned-checkout',
        {
          cartId: convertCart._id,
          action: 'convert',
          convertedCartTotal,
          conversionNote,
          customerName,
          conversionDiscountType,
          conversionDiscountValue,
          conversionPaymentMethod,
          conversionPaymentLink,
          customerEmail,
          customerPhone,
          sendCustomerEmail,
          convertedByUserId,
          convertedByName,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.cart) {
        setCarts((current) => current.map((cart) => (
          cart._id === data.cart._id ? data.cart : cart
        )));
        if (data.cart.status === 'converted') {
          setFilter('converted');
        }
        return {
          ...data.cart,
          pendingPayment: Boolean(data.pendingPayment),
          emailSent: Boolean(data.emailSent),
          emailError: data.emailError || null,
          customerEmail: data.customerEmail || customerEmail || null,
          orderId: data.orderId || null,
          shortOrderNumber: data.shortOrderNumber || null,
        };
      }

      return null;
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to convert cart');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPayment = async (cart) => {
    if (!cart?._id) return;

    setConfirmingPaymentId(cart._id);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.patch(
        '/api/store/abandoned-checkout',
        {
          cartId: cart._id,
          action: 'confirm-payment',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.cart) {
        setCarts((current) => current.map((entry) => (
          entry._id === data.cart._id ? data.cart : entry
        )));
        setFilter('converted');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to confirm payment');
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  const handleResendEmail = async (cart) => {
    if (!cart?._id) return;

    setResendingId(cart._id);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.patch(
        '/api/store/abandoned-checkout',
        {
          cartId: cart._id,
          action: 'resend-email',
          customerEmail: cart.conversionCustomerEmail || cart.email,
          customerName: cart.name,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.cart) {
        setCarts((current) => current.map((entry) => (
          entry._id === data.cart._id ? data.cart : entry
        )));
      }

      if (data?.emailError) {
        setError(`Email failed: ${data.emailError}`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to resend email');
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (cart) => {
    if (!cart?._id) return;

    const label = getCustomerLabel(cart);
    const confirmed = window.confirm(
      `Move this ${cart.status === 'converted' ? 'converted' : 'abandoned'} cart for ${label} to trash? You can restore it from Trash.`
    );
    if (!confirmed) return;

    setDeletingId(cart._id);
    setError('');

    try {
      const token = await getToken();
      await axios.delete('/api/store/abandoned-checkout', {
        params: { cartId: cart._id },
        headers: { Authorization: `Bearer ${token}` },
      });

      setCarts((current) => current.filter((entry) => entry._id !== cart._id));
      setExpandedId((current) => (current === cart._id ? null : current));
      if (convertCart?._id === cart._id) {
        setConvertCart(null);
      }
      refreshList();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to move cart to trash');
    } finally {
      setDeletingId(null);
    }
  };

  const filters = [
    { id: 'all', label: 'All active', count: stats.active },
    { id: 'checkout', label: 'Checkout', count: stats.checkout },
    { id: 'cart', label: 'Added to cart', count: stats.cart },
    { id: 'guest', label: 'Guest only', count: stats.guest },
    { id: 'pending_payment', label: 'Awaiting payment', count: stats.pendingPayment },
    { id: 'email_sent', label: 'Email sent', count: stats.emailSent },
    { id: 'converted', label: 'Converted', count: stats.converted },
  ];

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Abandoned Checkout</h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          See which products customers leave behind, then open those carts to recover the sale.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {whatsappSuccess ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0" />
          {whatsappSuccess}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active abandons</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.active}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{stats.identified} with contact · {stats.guest} guest</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Products left behind</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{stats.productCount || 0}</p>
          <p className="mt-0.5 text-[10px] text-indigo-700/80">Across active carts</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">Guest</p>
          <p className="mt-1 text-2xl font-bold text-violet-800">{stats.guest}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">At checkout</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{stats.checkout}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Converted</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{stats.converted}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3 shadow-sm lg:col-span-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Potential value</p>
          <p className="mt-1 text-lg font-bold text-blue-800 sm:text-xl">{formatMoney(stats.activeValue)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange size={16} className="text-slate-500" />
            <p className="text-sm font-semibold text-slate-900">From / to date & time</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 days' },
              { id: '30d', label: 'Last 30 days' },
              { id: 'clear', label: 'All time' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyDatePreset(preset.id)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input
              type="datetime-local"
              value={fromDateTime}
              onChange={(event) => setFromDateTime(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input
              type="datetime-local"
              value={toDateTime}
              min={fromDateTime || undefined}
              onChange={(event) => setToDateTime(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {hasDateTimeFilter
            ? `Showing stats for the selected date range. Lists load ${PAGE_SIZE} at a time for speed.`
            : `Lists load ${PAGE_SIZE} at a time. Use From / To to narrow abandons and product counts.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('products')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
              viewMode === 'products'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package size={15} />
            By product
          </button>
          <button
            type="button"
            onClick={() => setViewMode('carts')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
              viewMode === 'carts'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShoppingCart size={15} />
            By cart
          </button>
        </div>
        {selectedProduct ? (
          <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 sm:text-sm">
            <span className="truncate">
              Showing carts with <span className="font-semibold">{selectedProduct.name}</span>
              {' '}({selectedProduct.abandonCount} abandon{selectedProduct.abandonCount === 1 ? '' : 's'})
            </span>
            <button
              type="button"
              onClick={clearSelectedProduct}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <X size={14} />
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={
            viewMode === 'products'
              ? 'Search products left in abandoned checkouts...'
              : 'Search by name, email, phone, address, or product...'
          }
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {viewMode === 'products' ? (
        products.length === 0 && !listLoading ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <Package className="mx-auto mb-2 text-slate-300" size={28} />
            <p className="text-sm font-semibold text-slate-700">
              {searchQuery.trim()
                ? `No products match "${searchQuery.trim()}"`
                : 'No products in abandoned checkouts yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hasDateTimeFilter
                ? 'No products match this date range. Try widening From / To, or clear the filter.'
                : 'When customers leave items at cart or checkout, each product appears here with an abandon count.'}
            </p>
          </div>
        ) : (
          <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${listLoading ? 'opacity-70' : ''}`}>
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Products by abandoned checkout count</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Ranked by how many active abandoned carts include each product
                {hasDateTimeFilter ? ' in the selected date range' : ''}. Click a row to open those carts.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {products.map((product, index) => (
                <button
                  key={product.key}
                  type="button"
                  onClick={() => openCartsForProduct(product)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {(safePage - 1) * PAGE_SIZE + index + 1}
                  </span>
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <Package size={18} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {product.totalQuantity} unit{product.totalQuantity === 1 ? '' : 's'} left behind
                      {' · '}
                      {formatMoney(product.totalValue, product.currency)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-sm font-bold text-indigo-800">
                      {product.abandonCount}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      abandon{product.abandonCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {totalItems > PAGE_SIZE ? (
              <div className="border-t border-slate-100 p-3">
                <ListPagination
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  onPageChange={setPage}
                  label="products"
                />
              </div>
            ) : null}
          </div>
        )
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
              filter === item.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      {carts.length === 0 && !listLoading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <ShoppingCart className="mx-auto mb-2 text-slate-300" size={28} />
          <p className="text-sm font-semibold text-slate-700">
            {searchQuery.trim()
              ? `No results for "${searchQuery.trim()}"`
              : selectedProduct
              ? `No carts found for "${selectedProduct.name}"`
              : filter === 'converted'
              ? 'No converted carts yet'
              : filter === 'guest'
                ? 'No guest abandons yet'
                : filter === 'pending_payment'
                  ? 'No awaiting-payment carts'
                : filter === 'email_sent'
                  ? 'No emails sent yet'
                  : 'No abandoned carts found'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {searchQuery.trim()
              ? 'Try another name, email, phone number, city, or product name.'
              : selectedProduct
              ? 'Clear the product filter or switch to By product to pick another item.'
              : filter === 'converted'
              ? 'When you convert a recovered cart, it will appear here.'
              : filter === 'guest'
                ? 'Guests who reached checkout or cart without entering email or phone.'
                : filter === 'pending_payment'
                  ? 'Stripe, Tabby, or Tamara checkouts that started but did not finish payment.'
                : filter === 'email_sent'
                  ? 'Carts appear here after you send a discount link email or a conversion/payment email.'
                  : 'New sessions appear within seconds of customers opening checkout. Completed orders move to Converted.'}
          </p>
        </div>
      ) : (
        <>
          <div className={`space-y-2 ${listLoading ? 'opacity-70' : ''}`}>
            {carts.map((cart) => (
              <CartRow
                key={cart._id}
                cart={cart}
                expanded={expandedId === cart._id}
                onToggle={() => setExpandedId((current) => (current === cart._id ? null : cart._id))}
                onConvertClick={setConvertCart}
                onConfirmPayment={handleConfirmPayment}
                onResendEmail={handleResendEmail}
                onSendWhatsApp={handleSendWhatsAppCartReminder}
                onDelete={handleDelete}
                resendingId={resendingId}
                sendingWhatsAppId={sendingWhatsAppId}
                whatsappSentCartId={whatsappSentCartId}
                deletingId={deletingId}
                confirmingPaymentId={confirmingPaymentId}
                canDelete
              />
            ))}
          </div>

          {totalItems > PAGE_SIZE ? (
            <ListPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
              label="carts"
            />
          ) : null}
        </>
      )}
        </>
      )}

      <ConvertModal
        cart={convertCart}
        open={Boolean(convertCart)}
        onClose={() => {
          if (saving || sendingRecoveryLink) return;
          setConvertCart(null);
          setExpandedId(null);
        }}
        onConfirm={handleConvert}
        onSendRecoveryLink={handleSendRecoveryLink}
        saving={saving}
        sendingRecoveryLink={sendingRecoveryLink}
        dashboardUsers={dashboardUsers}
        currentUserId={user?.uid || null}
      />
    </div>
  );
}
