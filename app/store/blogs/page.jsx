'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import toast from 'react-hot-toast'
import { FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'

export default function StoreBlogsPage() {
  const { getToken } = useAuth()
  const [blogs, setBlogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const params = {}
      if (status !== 'all') params.status = status
      if (q.trim()) params.q = q.trim()
      const { data } = await axios.get('/api/store/blogs', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      setBlogs(Array.isArray(data?.blogs) ? data.blogs : [])
    } catch (error) {
      console.error(error)
      toast.error(error?.response?.data?.error || 'Failed to load blogs')
    } finally {
      setLoading(false)
    }
  }, [getToken, status, q])

  useEffect(() => {
    load()
  }, [load])

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return
    const id = deleteTarget.id
    try {
      setDeletingId(id)
      const token = await getToken()
      await axios.delete(`/api/store/blogs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setDeleteTarget(null)
      toast.success('Blog deleted')
      await load()
    } catch (error) {
      console.error(error)
      toast.error(error?.response?.data?.error || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16" lang="en" dir="ltr">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Blogs</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Create and publish store blog posts. Public pages: <code className="rounded bg-slate-100 px-1 text-xs">/blogs</code>
          </p>
        </div>
        <Link
          href="/store/blogs/new"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Plus size={16} />
          Add blog
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or slug…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        </div>
      ) : blogs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">No blog posts yet</p>
          <Link
            href="/store/blogs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus size={16} />
            Create first post
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {blogs.map((blog) => (
                <tr key={blog.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      {blog.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={blog.coverImage}
                          alt=""
                          className="h-14 w-20 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                          No cover
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{blog.title}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">/{blog.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        blog.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {blog.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {blog.updatedAt ? new Date(blog.updatedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {blog.status === 'published' ? (
                        <Link
                          href={`/blogs/${blog.slug}`}
                          target="_blank"
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                        >
                          View
                        </Link>
                      ) : null}
                      <Link
                        href={`/store/blogs/${blog.id}`}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(blog)}
                        disabled={deletingId === blog.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === blog.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onClick={() => (deletingId ? null : setDeleteTarget(null))}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="blog-delete-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="blog-delete-title" className="text-base font-semibold text-slate-900">
                  Delete blog post?
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  “{deleteTarget.title || 'Untitled'}” will be permanently removed. This cannot be undone.
                </p>
                {deleteTarget.slug ? (
                  <p className="mt-2 font-mono text-xs text-slate-400">/{deleteTarget.slug}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingId)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingId)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {deletingId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deletingId ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
