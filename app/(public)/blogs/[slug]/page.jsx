'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PolicyPageLayout from '@/components/PolicyPageLayout'
import BlogSidebar from '@/components/BlogSidebar'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'

export default function BlogPostPage() {
  const { isArabic } = useStorefrontI18n()
  const params = useParams()
  const slug = String(params?.slug || '')
  const [blog, setBlog] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [next, setNext] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return undefined
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setNotFound(false)
        const res = await fetch(`/api/public/blogs/${encodeURIComponent(slug)}?lang=${isArabic ? 'ar' : 'en'}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data?.blog) {
          setNotFound(true)
          setBlog(null)
          setPrevious(null)
          setNext(null)
          setRecent([])
        } else {
          setBlog(data.blog)
          setPrevious(data.previous || null)
          setNext(data.next || null)
          setRecent(Array.isArray(data.recent) ? data.recent : [])
        }
      } catch {
        if (!cancelled) {
          setNotFound(true)
          setBlog(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug, isArabic])

  return (
    <PolicyPageLayout dir={isArabic ? 'rtl' : undefined}>
      <Link
        href="/blogs"
        className="mb-6 inline-block text-sm font-medium text-sky-700 hover:underline"
      >
        {isArabic ? '← العودة إلى المدونة' : '← Back to blog'}
      </Link>

      {loading ? (
        <p className="text-sm text-gray-500">{isArabic ? 'جاري التحميل…' : 'Loading…'}</p>
      ) : notFound || !blog ? (
        <div className="rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          {isArabic ? 'المقال غير موجود.' : 'Blog post not found.'}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article>
            <h1 className="mb-3 text-3xl font-bold text-gray-900">{blog.title}</h1>
            <div className="mb-6 flex flex-wrap gap-3 text-sm text-gray-500">
              {blog.authorName ? <span>{blog.authorName}</span> : null}
              {blog.publishedAt ? (
                <span>
                  {new Date(blog.publishedAt).toLocaleString(isArabic ? 'ar-AE' : 'en-AE', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>

            {blog.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={blog.coverImage}
                alt={blog.title}
                className="mb-8 aspect-[21/9] w-full rounded-xl object-cover"
              />
            ) : null}

            {blog.excerpt ? (
              <p className="mb-8 text-lg text-gray-600">{blog.excerpt}</p>
            ) : null}

            <div
              className="blog-content prose prose-slate max-w-none prose-headings:font-bold prose-a:text-sky-700 prose-img:rounded-xl"
              dangerouslySetInnerHTML={{ __html: blog.contentHtml || '' }}
            />

            <nav className="mt-10 grid gap-3 border-t border-gray-200 pt-6 sm:grid-cols-2">
              {previous ? (
                <Link
                  href={`/blogs/${previous.slug}`}
                  className="rounded-xl border border-gray-200 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {isArabic ? 'السابق' : 'Previous'}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{previous.title}</p>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/blogs/${next.slug}`}
                  className={`rounded-xl border border-gray-200 p-4 text-end transition hover:border-sky-300 hover:bg-sky-50 ${isArabic ? 'text-start' : ''}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {isArabic ? 'التالي' : 'Next'}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{next.title}</p>
                </Link>
              ) : null}
            </nav>
          </article>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <BlogSidebar
              recentBlogs={recent}
              currentSlug={blog.slug}
              isArabic={isArabic}
            />
          </div>
        </div>
      )}

      <style jsx global>{`
        .blog-content img.blog-img-full,
        .blog-content img[data-width='full'] {
          max-width: 100% !important;
          width: 100% !important;
          height: auto;
          display: block;
          margin: 1rem 0;
        }
        .blog-content img.blog-img-half,
        .blog-content img[data-width='half'] {
          max-width: 50% !important;
          width: 50% !important;
          height: auto;
          display: block;
          margin: 1rem 0;
        }
        .blog-content img.blog-img-third,
        .blog-content img[data-width='third'] {
          max-width: 33.333% !important;
          width: 33.333% !important;
          height: auto;
          display: block;
          margin: 1rem 0;
        }
        .blog-content img.blog-img-align-left,
        .blog-content img[data-align='left'] {
          margin-left: 0 !important;
          margin-right: auto !important;
        }
        .blog-content img.blog-img-align-center,
        .blog-content img[data-align='center'] {
          margin-left: auto !important;
          margin-right: auto !important;
        }
        .blog-content img.blog-img-align-right,
        .blog-content img[data-align='right'] {
          margin-left: auto !important;
          margin-right: 0 !important;
        }
      `}</style>
    </PolicyPageLayout>
  )
}
