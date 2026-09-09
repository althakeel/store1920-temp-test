'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  STORE1920_SUPPORT_EMAIL,
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact'
import { STORE1920_BUSINESS_HOURS_EN } from '@/lib/businessIdentity'

export default function SupportPage() {
  const [user, setUser] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderNumber: '',
    subject: '',
    message: '',
    issue: 'Other',
    priority: 'normal'
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null)
      if (u) {
        setFormData(prev => ({
          ...prev,
          name: u.displayName || '',
          email: u.email || ''
        }))
      }
    })
    return () => unsub()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Prepare ticket data matching the API format
      const looksLikeObjectId = /^[a-fA-F0-9]{24}$/.test(String(formData.orderNumber || '').trim())
      const ticketData = {
        subject: formData.subject,
        category: formData.issue,
        description: formData.orderNumber && !looksLikeObjectId
          ? `Order: ${formData.orderNumber}\n\n${formData.message}`
          : formData.message,
        priority: formData.priority || 'normal',
        orderId: looksLikeObjectId ? formData.orderNumber : undefined
      }

      if (user) {
        const token = await auth.currentUser.getIdToken(true)
        await axios.post('/api/tickets', ticketData, {
          headers: { Authorization: `Bearer ${token}` }
        })
      } else {
        await axios.post('/api/contact', {
          name: formData.name,
          email: formData.email,
          topic: formData.issue,
          orderNumber: formData.orderNumber,
          message: `${formData.subject}\n\n${formData.message}`,
        })
      }

      setSuccess(true)
      setFormData({ 
        name: user?.displayName || '', 
        email: user?.email || '', 
        orderNumber: '', 
        subject: '', 
        message: '', 
        issue: 'Other',
        priority: 'normal'
      })
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      console.error('Submit error:', err)
      setError(err.response?.data?.error || 'Failed to submit support ticket. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const supportOptions = [
    { icon: '❓', title: 'Quick Answers', desc: 'Find answers to common questions', link: '/faq' },
    { icon: '✓', title: 'Track Order', desc: 'Check your order status', link: '/track-order' },
    { icon: '↩️', title: 'Return or complain', desc: 'Signed-in return form, or guest form below', link: '/return-request' },
    { icon: '💬', title: 'FAQ & Help', desc: 'Browse our help center', link: '/help' },
  ]

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">How Can We Help?</h1>
          <p className="text-blue-100 text-lg">Support hours: {STORE1920_BUSINESS_HOURS_EN}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Quick Support Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {supportOptions.map((option, idx) => (
            <Link key={idx} href={option.link} className="group">
              <div className="bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-lg transition text-center">
                <div className="text-3xl mb-3 group-hover:scale-110 transition">{option.icon}</div>
                <h3 className="font-semibold text-slate-800 mb-1">{option.title}</h3>
                <p className="text-slate-600 text-sm">{option.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Contact Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Submit a Ticket</h2>
            
            {!user && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
                No account needed. Use this form for a complaint or return request. Include your order number if you have one.
                {' '}Signed-in customers can also start a return from{' '}
                <Link href="/orders" className="font-semibold underline">My Orders</Link>.
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                ✓ Thank you. We received your message and will reply during business hours.
                {user ? (
                  <>
                    {' '}
                    <Link href="/dashboard/tickets" className="font-semibold underline">View your tickets</Link>
                  </>
                ) : null}
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                ✗ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    readOnly={!!user}
                    className={`w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition ${user ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    readOnly={!!user}
                    className={`w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition ${user ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Issue Type *</label>
                  <select
                    name="issue"
                    value={formData.issue}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                  >
                    <option value="Return Request">Return Request</option>
                    <option value="Complaint">Complaint</option>
                    <option value="Order Issue">Order Issue</option>
                    <option value="Product Question">Product Question</option>
                    <option value="Payment Issue">Payment Issue</option>
                    <option value="Account Issue">Account Issue</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Priority *</label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Order Number (Optional)</label>
                <input
                  type="text"
                  name="orderNumber"
                  value={formData.orderNumber}
                  onChange={handleChange}
                  placeholder="If related to an order"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Subject *</label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  placeholder="Brief subject"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Message *</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Describe your issue in detail..."
                  rows="5"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition"
              >
                {loading ? 'Submitting...' : user ? 'Submit Support Ticket' : 'Submit complaint or return request'}
              </button>
            </form>
          </div>

          {/* Contact Information */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Other Ways to Reach Us</h2>
              
              <div className="space-y-6">
                <div>
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-2xl">📧</span>
                    <div>
                      <p className="font-medium text-slate-800">Email</p>
                      <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{STORE1920_SUPPORT_EMAIL}</a>
                      <p className="text-sm text-slate-600 mt-1">We reply during business hours, usually the next business day</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">💬</span>
                    <div>
                      <p className="font-medium text-slate-800">Live Chat</p>
                      <p className="text-slate-600 text-sm mt-1">Chat with our team in real-time during business hours</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3">Business hours</h3>
              <p className="text-slate-700 text-sm mb-3">{STORE1920_BUSINESS_HOURS_EN}</p>
              <p className="text-slate-700 text-sm mb-3">
                Phone:{' '}
                <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="font-semibold text-blue-700 underline">
                  {formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE)}
                </a>
              </p>
              <p className="text-slate-600 text-sm">
                We are not a 24/7 desk. Messages sent after hours are answered on the next business day.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Link */}
        <div className="text-center py-8 border-t border-slate-200">
          <p className="text-slate-600 mb-4">Still have questions?</p>
          <Link href="/faq" className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-6 py-3 rounded-lg transition">
            Browse our FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
