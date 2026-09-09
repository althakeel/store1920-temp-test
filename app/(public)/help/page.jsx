'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  STORE1920_SUPPORT_EMAIL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact'

const HELP_CATEGORIES = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'shopping', title: 'Shopping' },
  { id: 'orders', title: 'Orders & Delivery' },
  { id: 'payments', title: 'Payments' },
  { id: 'returns', title: 'Returns & Refunds' },
  { id: 'account', title: 'Account' },
]

const HELP_CONTENT = {
  'getting-started': [
    {
      question: 'How do I create an account?',
      answer: 'Click "Sign Up" at the top right, enter your email and create a password. You can also sign up with Google for faster registration.',
    },
    {
      question: 'How do I reset my password?',
      answer: 'On the login page, click "Forgot Password?", enter your email, and we will send a reset link within minutes.',
    },
    {
      question: 'Can I use Store1920 without an account?',
      answer: 'You can browse products without an account, but you need one to place an order or track deliveries.',
    },
  ],
  shopping: [
    {
      question: 'How do I search for products?',
      answer: 'Use the search bar at the top, browse categories, or filter by price, ratings, and delivery options.',
    },
    {
      question: 'How do I add items to my wishlist?',
      answer: 'Click the heart icon on a product. Manage saved items anytime from your account.',
    },
    {
      question: 'Can I save items for later?',
      answer: 'Yes. Add items to your wishlist or cart. Cart items stay saved for 30 days if you do not check out.',
    },
    {
      question: 'How do I apply a coupon code?',
      answer: 'During checkout, open "Apply Coupon", enter your code, and the discount applies if the code is valid.',
    },
  ],
  orders: [
    {
      question: 'How can I track my order?',
      answer: 'Open "My Orders" in your account, or use the track link in your order confirmation email for live updates.',
    },
    {
      question: 'What are the delivery timeframes?',
      answer: 'Standard delivery is typically 3–5 business days. Faster options may be available at checkout depending on your area.',
    },
    {
      question: 'Can I change my delivery address?',
      answer: 'You can update the address within about 1 hour of placing the order. After that, contact support.',
    },
    {
      question: 'Do you deliver on weekends?',
      answer: 'Yes, we deliver 7 days a week in most areas. Weekend timing can vary by location.',
    },
  ],
  payments: [
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept cards, Apple Pay, Tabby, Tamara, and cash on delivery across the UAE where available.',
    },
    {
      question: 'Is my payment information secure?',
      answer: 'Yes. Card payments run through PCI-compliant hosted gateways with encrypted connections.',
    },
    {
      question: 'Why was my payment declined?',
      answer: 'This can happen with insufficient funds, incorrect details, or bank restrictions. Try another method or contact your bank.',
    },
  ],
  returns: [
    {
      question: 'What is your return policy?',
      answer: 'You may request a return within 7 calendar days after delivery for an eligible item. Store1920 pays return shipping for wrong, damaged, defective or not-as-described items. Change-of-mind returns are unused items only and you pay the disclosed collection charge. See our Return Policy for full conditions.',
    },
    {
      question: 'How do I initiate a return?',
      answer: 'Go to My Orders, open the delivered order, and submit a Return Request online.',
    },
    {
      question: 'When will I get my refund?',
      answer: 'Approved refunds are initiated within 5–7 business days after approval. Your bank or payment provider may take extra time to show the credit.',
    },
  ],
  account: [
    {
      question: 'How do I update my profile information?',
      answer: 'Open My Profile, edit your details, and save. Changes apply immediately.',
    },
    {
      question: 'Can I delete my account?',
      answer: 'Yes. Request account deletion from Settings. Data removal follows our privacy process.',
    },
    {
      question: 'How do I view my address book?',
      answer: 'Go to My Profile → Addresses to add, edit, or remove saved addresses.',
    },
    {
      question: 'How can I become a seller?',
      answer: 'Use "Create Your Store" to start seller registration. Business documents and bank details are required.',
    },
  ],
}

export default function HelpPage() {
  const [activeCategory, setActiveCategory] = useState('getting-started')
  const [expandedItem, setExpandedItem] = useState(null)
  const [query, setQuery] = useState('')

  const phoneDisplay = formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE)
  const currentCategory = HELP_CONTENT[activeCategory] || []
  const categoryTitle = HELP_CATEGORIES.find((c) => c.id === activeCategory)?.title || 'Help'

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return currentCategory
    return currentCategory.filter(
      (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q),
    )
  }, [currentCategory, query])

  return (
    <div className="min-h-[70vh] bg-[#f7f5f2] text-slate-900">
      <header className="border-b border-slate-200/80 bg-[#1c1917] text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300/90">Store1920</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Help Center</h1>
          <p className="mt-3 max-w-2xl text-base text-stone-300">
            Answers for shopping, orders, payments, and returns — plus ways to reach our team.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <label className="sr-only" htmlFor="help-search">Search help</label>
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this category…"
            className="w-full flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-900 outline-none ring-orange-500/30 transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2"
          />
          <button
            type="button"
            className="rounded-xl bg-[#1c1917] px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            onClick={() => setExpandedItem(null)}
          >
            Search
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-4 lg:sticky lg:top-24">
            <h2 className="px-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Categories</h2>
            <nav className="mt-3 space-y-1" aria-label="Help categories">
              {HELP_CATEGORIES.map((cat) => {
                const active = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id)
                      setExpandedItem(null)
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? 'bg-orange-50 font-semibold text-orange-800'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {cat.title}
                  </button>
                )
              })}
            </nav>
          </aside>

          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{categoryTitle}</h2>
            <div className="mt-6 space-y-3">
              {filteredItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-stone-600">
                  No matching articles in this category. Try another search or category.
                </p>
              ) : (
                filteredItems.map((item, idx) => {
                  const open = expandedItem === idx
                  return (
                    <div
                      key={`${activeCategory}-${item.question}`}
                      className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedItem(open ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-stone-50"
                        aria-expanded={open}
                      >
                        <span className="text-base font-medium text-stone-900">{item.question}</span>
                        <span className={`text-stone-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden>
                          ▾
                        </span>
                      </button>
                      {open ? (
                        <div className="border-t border-stone-100 bg-stone-50/80 px-5 py-4 text-sm leading-relaxed text-stone-700">
                          {item.answer}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>

        <section className="mt-14 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-stone-900">Contact Store1920 support</h2>
          <p className="mt-2 text-sm text-stone-600">Support hours: Sunday – Thursday, 9:00 AM – 6:00 PM (UAE time). Not 24/7. Guests can send a complaint or return request from Contact Us or Support without an account.</p>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-stone-100 bg-[#f7f5f2] p-5">
              <h3 className="font-semibold text-stone-900">Email</h3>
              <p className="mt-1 text-sm text-stone-600">Usually the next business day</p>
              <a
                href={`mailto:${STORE1920_SUPPORT_EMAIL}`}
                className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:underline"
              >
                {STORE1920_SUPPORT_EMAIL}
              </a>
            </div>

            <div className="rounded-xl border border-stone-100 bg-[#f7f5f2] p-5">
              <h3 className="font-semibold text-stone-900">Live chat</h3>
              <p className="mt-1 text-sm text-stone-600">Message us from the support page</p>
              <Link href="/support" className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:underline">
                Start chat
              </Link>
            </div>

            <div className="rounded-xl border border-stone-100 bg-[#f7f5f2] p-5">
              <h3 className="font-semibold text-stone-900">Call us</h3>
              <p className="mt-1 text-sm text-stone-600">Toll-free UAE</p>
              <a
                href={STORE1920_CUSTOMER_SUPPORT_TEL}
                className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:underline"
              >
                {phoneDisplay}
              </a>
              <p className="mt-1 text-xs text-stone-500">{STORE1920_CUSTOMER_SUPPORT_PHONE}</p>
            </div>
          </div>
        </section>

        <div className="mt-10 text-center">
          <p className="text-stone-600">Still need help?</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/faq"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              FAQ
            </Link>
            <Link
              href="/return-policy"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              Return policy
            </Link>
            <Link
              href="/support"
              className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
