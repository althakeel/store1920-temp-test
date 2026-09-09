"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import axios from "axios"
import { useAuth } from "@/lib/useAuth"

const PRESET_PAGES = [
  // Main
  { label: "Home", path: "/" },
  { label: "Shop", path: "/shop" },
  { label: "Categories", path: "/categories" },
  // Shopping
  { label: "Fast Delivery", path: "/fast-delivery" },
  { label: "Offers", path: "/offers" },
  { label: "New Arrivals", path: "/new-arrivals" },
  { label: "Top Selling", path: "/top-selling" },
  { label: "Trending Now", path: "/trending-now" },
  { label: "Clearance Sale", path: "/clearance-sale" },
  { label: "5 Star Rated", path: "/5-star-rated" },
  { label: "Under 149", path: "/under-149" },
  { label: "Under 499", path: "/under-499" },
  { label: "Recently Viewed", path: "/recently-viewed" },
  // Account / cart
  { label: "Wishlist", path: "/wishlist" },
  { label: "Cart", path: "/cart" },
  { label: "Checkout", path: "/checkout" },
  { label: "Orders", path: "/orders" },
  { label: "Track Order", path: "/track-order" },
  { label: "Return Request", path: "/return-request" },
  { label: "Sign In", path: "/sign-in" },
  { label: "Sign Up", path: "/sign-up" },
  // Content
  { label: "Blog", path: "/blogs" },
  { label: "About Us", path: "/about-us" },
  { label: "Contact Us", path: "/contact-us" },
  { label: "Business Information", path: "/business-information" },
  { label: "Careers", path: "/careers" },
  { label: "FAQ", path: "/faq" },
  { label: "Help", path: "/help" },
  { label: "Support", path: "/support" },
  { label: "Sitemap", path: "/sitemap" },
  { label: "Payment and Pricing", path: "/payment-and-pricing" },
  // Policies (canonical only — stubs/duplicates redirect)
  { label: "Privacy Policy", path: "/privacy-policy" },
  { label: "Shipping Policy", path: "/shipping-policy" },
  { label: "Return, Refund, Replacement & Cancellation", path: "/return-policy" },
  { label: "Terms and Conditions", path: "/terms-and-conditions" },
  { label: "Terms of Sale", path: "/terms-of-sale" },
  { label: "Cookie Policy", path: "/cookie-policy" },
  { label: "Warranty Policy", path: "/warranty-policy" },
  // Legacy aliases (if older SEO was saved under these)
  { label: "About (legacy)", path: "/about" },
  { label: "Contact (legacy)", path: "/contact" },
]

function normalizePath(path = "/") {
  const raw = String(path || "").trim()
  if (!raw) return "/"
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`
  const withoutQuery = withSlash.split("?")[0].split("#")[0]
  const clean = withoutQuery.replace(/\/{2,}/g, "/").replace(/\/$/, "")
  return clean || "/"
}

function parseKeywords(input = "") {
  return Array.from(
    new Set(
      String(input || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function pathLabel(path) {
  const preset = PRESET_PAGES.find((page) => page.path === path)
  return preset ? `${preset.label} (${path})` : path
}

function hasSeoContent(entry = {}) {
  const title = String(entry.title || "").trim()
  const description = String(entry.description || "").trim()
  const keywords = Array.isArray(entry.keywords) ? entry.keywords.filter(Boolean) : []
  return Boolean(title || description || keywords.length)
}

export default function StorefrontSeoPage() {
  const { getToken } = useAuth()
  const formRef = useRef(null)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [customPath, setCustomPath] = useState("")
  const [selectedPath, setSelectedPath] = useState("/")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [keywordsInput, setKeywordsInput] = useState("")
  const [pageSeoMap, setPageSeoMap] = useState({})

  const allPathOptions = useMemo(() => {
    const presetOrder = PRESET_PAGES.map((page) => page.path)
    const dynamic = Object.keys(pageSeoMap || {}).filter((path) => !presetOrder.includes(path))
    return [...presetOrder, ...dynamic.sort((a, b) => a.localeCompare(b))]
  }, [pageSeoMap])

  const savedEntries = useMemo(() => {
    return Object.entries(pageSeoMap || {})
      .filter(([, value]) => hasSeoContent(value))
      .map(([path, value]) => ({
        path,
        title: value?.title || "",
        description: value?.description || "",
        keywords: Array.isArray(value?.keywords) ? value.keywords : [],
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [pageSeoMap])

  const hydrateFormForPath = (path, map = pageSeoMap) => {
    const key = normalizePath(path)
    const current = map?.[key] || {}
    setSelectedPath(key)
    setTitle(current.title || "")
    setDescription(current.description || "")
    setKeywordsInput(Array.isArray(current.keywords) ? current.keywords.join(", ") : "")
  }

  const loadSettings = async () => {
    setLoading(true)
    setMessage("")
    try {
      const token = await getToken()
      const { data } = await axios.get("/api/store/appearance/sections", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const nextMap = data?.pageSeo && typeof data.pageSeo === "object" ? data.pageSeo : {}
      setPageSeoMap(nextMap)
      hydrateFormForPath(selectedPath, nextMap)
    } catch (error) {
      setMessage(error?.response?.data?.error || "Failed to load SEO settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handlePathSelect = (value) => {
    const normalized = normalizePath(value)
    hydrateFormForPath(normalized)
    setMessage("")
  }

  const handleUseCustomPath = () => {
    const normalized = normalizePath(customPath)
    handlePathSelect(normalized)
    setCustomPath("")
  }

  const handleEditEntry = (path) => {
    handlePathSelect(path)
    setMessage(`Editing SEO for ${path}`)
    // Scroll form into view for editing
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage("")

    const key = normalizePath(selectedPath)
    const nextKeywords = parseKeywords(keywordsInput)

    const nextMap = {
      ...(pageSeoMap || {}),
      [key]: {
        title: title.trim(),
        description: description.trim(),
        keywords: nextKeywords,
      },
    }

    if (!title.trim() && !description.trim() && nextKeywords.length === 0) {
      delete nextMap[key]
    }

    try {
      const token = await getToken()
      await axios.post(
        "/api/store/appearance/sections",
        { pageSeo: nextMap },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      setPageSeoMap(nextMap)
      setMessage("SEO settings saved successfully")
    } catch (error) {
      setMessage(error?.response?.data?.error || "Failed to save SEO settings")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (path = selectedPath) => {
    const key = normalizePath(path)
    const nextMap = { ...(pageSeoMap || {}) }
    delete nextMap[key]

    try {
      setSaving(true)
      setMessage("")
      const token = await getToken()
      await axios.post(
        "/api/store/appearance/sections",
        { pageSeo: nextMap },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setPageSeoMap(nextMap)
      if (normalizePath(selectedPath) === key) {
        setTitle("")
        setDescription("")
        setKeywordsInput("")
      }
      setMessage(`SEO settings removed for ${key}`)
    } catch (error) {
      setMessage(error?.response?.data?.error || "Failed to remove SEO settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div ref={formRef} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Page SEO Meta Tags</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set Google/search meta title, description, and keywords for each storefront page.
          Choose a page (or type a custom path), fill the fields, then click <strong>Save SEO</strong>.
          Saved pages appear in the list below — use <strong>Edit</strong> to change them anytime.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading settings...</p>
        ) : (
          <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Select page</label>
                <select
                  value={selectedPath}
                  onChange={(e) => handlePathSelect(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {allPathOptions.map((path) => (
                    <option key={path} value={path}>
                      {pathLabel(path)}
                      {hasSeoContent(pageSeoMap?.[path]) ? " • saved" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Custom page path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="/your-page"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleUseCustomPath}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white"
                  >
                    Use
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Meta title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Enter page meta title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Meta description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={320}
                rows={4}
                placeholder="Enter page meta description"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Meta keywords</label>
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Separate keywords using commas.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save SEO"}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(selectedPath)}
                disabled={saving}
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
              >
                Remove For This Page
              </button>
              <button
                type="button"
                onClick={loadSettings}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            {message && (
              <p className={`text-sm ${message.toLowerCase().includes("success") || message.toLowerCase().includes("editing") || message.toLowerCase().includes("removed") ? "text-emerald-700" : "text-slate-700"}`}>
                {message}
              </p>
            )}
          </form>
        )}
      </div>

      {!loading && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Saved SEO pages</h2>
              <p className="mt-1 text-sm text-slate-600">
                Pages you already configured. Click Edit to load them into the form above.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {savedEntries.length} saved
            </p>
          </div>

          {savedEntries.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No SEO entries yet. Select a page, fill meta fields, and click Save SEO.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Page</th>
                    <th className="px-4 py-3">Meta title</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Keywords</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {savedEntries.map((entry) => (
                    <tr key={entry.path} className={selectedPath === entry.path ? "bg-sky-50/60" : undefined}>
                      <td className="px-4 py-3 align-top font-medium text-slate-900 whitespace-nowrap">
                        {pathLabel(entry.path)}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700 max-w-[180px]">
                        <span className="line-clamp-2">{entry.title || "—"}</span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 max-w-[260px]">
                        <span className="line-clamp-2">{entry.description || "—"}</span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 max-w-[180px]">
                        <span className="line-clamp-2">
                          {entry.keywords.length ? entry.keywords.join(", ") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleEditEntry(entry.path)}
                          disabled={saving}
                          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(entry.path)}
                          disabled={saving}
                          className="ml-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
