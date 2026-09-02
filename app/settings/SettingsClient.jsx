'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { useSearchParams } from 'next/navigation'
import Loading from '@/components/Loading'
import Link from 'next/link'
import DashboardSidebar from '@/components/DashboardSidebar'

export default function SettingsClient() {
  const [user, setUser] = useState(undefined)
  const [emailPreferences, setEmailPreferences] = useState({
    promotional: true,
    orders: true,
    updates: true
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.email) return
      try {
        const response = await fetch(`/api/email-preferences?email=${encodeURIComponent(user.email)}`)
        const data = await response.json()
        if (response.ok && data?.preferences) {
          setEmailPreferences((prev) => ({
            ...prev,
            ...data.preferences
          }))
        }
      } catch (error) {
        console.error('Error loading email preferences:', error)
      }
    }

    loadPreferences()
  }, [user?.email])

  // Legacy /settings?unsubscribe=… links → dedicated confirm page
  useEffect(() => {
    const unsubscribeType = searchParams.get('unsubscribe')
    const emailParam = searchParams.get('email')

    if (unsubscribeType && emailParam) {
      const params = new URLSearchParams({
        unsubscribe: unsubscribeType,
        email: emailParam,
      })
      window.location.replace(`/unsubscribe?${params.toString()}`)
    }
  }, [searchParams])

  const handleUnsubscribe = async (type, email) => {
    try {
      setLoading(true)
      const response = await fetch('/api/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || user?.email,
          type,
          value: false
        })
      })

      const data = await response.json()

      if (response.ok) {
        setEmailPreferences(prev => ({
          ...prev,
          [type]: false
        }))
        setMessage({
          type: 'success',
          text: `You have been unsubscribed from ${type} emails.`
        })
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to update preferences'
        })
      }
    } catch (error) {
      console.error('Error updating preferences:', error)
      setMessage({
        type: 'error',
        text: 'An error occurred. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePreferenceChange = async (type, value) => {
    try {
      setLoading(true)
      const response = await fetch('/api/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          type,
          value
        })
      })

      const data = await response.json()

      if (response.ok) {
        setEmailPreferences(prev => ({
          ...prev,
          [type]: value
        }))
        setMessage({
          type: 'success',
          text: 'Email preferences updated successfully'
        })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to update preferences'
        })
      }
    } catch (error) {
      console.error('Error updating preferences:', error)
      setMessage({
        type: 'error',
        text: 'An error occurred. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    try {
      setDeletingAccount(true)
      const token = await auth.currentUser?.getIdToken(true)
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete account')
      }
      setMessage({
        type: 'success',
        text: 'Your account has been deleted successfully.'
      })
      setShowDeleteModal(false)
      setDeleteConfirmText('')
      await auth.signOut()
      window.location.href = '/'
    } catch (error) {
      setMessage({
        type: 'error',
        text: error?.message || 'Failed to delete account'
      })
    } finally {
      setDeletingAccount(false)
    }
  }

  if (user === undefined) return <Loading />

  if (user === null) {
    return (
      <>
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-2xl font-semibold text-slate-800 mb-3">Account Settings</h1>
          <p className="text-slate-600 mb-6">Please sign in to access your account settings.</p>
          <Link href="/" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg">Go to Home</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-6">
        <DashboardSidebar />
        <main className="md:col-span-3">
          <h1 className="text-2xl font-semibold text-slate-800 mb-6">Account Settings</h1>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">📧 Email Preferences</h2>
              <p className="text-slate-600 text-sm mb-4">Manage which types of emails you want to receive</p>
              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer"
                    checked={emailPreferences.promotional}
                    onChange={(e) => handlePreferenceChange('promotional', e.target.checked)}
                    disabled={loading}
                  />
                  <div className="flex-1">
                    <span className="text-slate-700 font-medium">Promotional Emails</span>
                    <p className="text-sm text-slate-500">Receive special offers, deals, and discounts</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer"
                    checked={emailPreferences.orders}
                    onChange={(e) => handlePreferenceChange('orders', e.target.checked)}
                    disabled={loading}
                  />
                  <div className="flex-1">
                    <span className="text-slate-700 font-medium">Order Updates</span>
                    <p className="text-sm text-slate-500">Status updates for your orders and shipments</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer"
                    checked={emailPreferences.updates}
                    onChange={(e) => handlePreferenceChange('updates', e.target.checked)}
                    disabled={loading}
                  />
                  <div className="flex-1">
                    <span className="text-slate-700 font-medium">Product Updates</span>
                    <p className="text-sm text-slate-500">New products and important service announcements</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">🔒 Privacy</h2>
              <p className="text-slate-600 text-sm mb-4">Control how your data is used and shared.</p>
              <button className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700">
                Manage Privacy Settings
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">⚠️ Danger Zone</h2>
              <p className="text-slate-600 text-sm mb-4">Permanently delete your account and all associated data.</p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete Account
              </button>
            </div>
          </div>
        </main>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="border-b border-slate-200 p-6">
              <h3 className="text-xl font-semibold text-slate-800">Confirm Account Deletion</h3>
              <p className="text-sm text-slate-600 mt-2">
                This will permanently delete your account and data. This action cannot be undone.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type DELETE to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirmText('')
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  disabled={deletingAccount}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className={`px-4 py-2 rounded-lg text-white ${
                    deleteConfirmText === 'DELETE' && !deletingAccount
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-red-300 cursor-not-allowed'
                  }`}
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                >
                  {deletingAccount ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
