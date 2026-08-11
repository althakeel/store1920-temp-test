'use client'
import { assets } from "@/assets/assets"

import axios from "axios"
import Image from "next/image"
import { useState, useEffect, useMemo, useRef } from "react"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapImage from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Node, mergeAttributes } from '@tiptap/core'

import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

import { useAuth } from '@/lib/useAuth';
import { readSellerCache } from '@/lib/storeDashboardCache';
import { Trash2 } from 'lucide-react';
import { formatStorefrontMoney } from '@/lib/storefrontMarket';
import { getProductImageAspectRatioClass } from '@/lib/productMedia';
import { compressImageForUpload, getUploadErrorMessage } from '@/lib/compressImageForUpload';
import { uploadStoreImage } from '@/lib/uploadStoreImage';
import { sanitizeRichTextMedia } from '@/lib/sanitizeRichTextMedia';
import { getVariantCardLabel, formatMatrixPackSizeLabel, normalizeSellerVariantOptions } from '@/lib/productVariantOptions';

const MAX_PRODUCT_MEDIA = 16

function createEmptyImageSlots(count = MAX_PRODUCT_MEDIA) {
    const slots = {}
    for (let i = 1; i <= count; i += 1) {
        slots[String(i)] = null
    }
    return slots
}

function fillImageSlotsFromList(list = [], count = MAX_PRODUCT_MEDIA) {
    const slots = createEmptyImageSlots(count)
    ;(Array.isArray(list) ? list : []).forEach((img, i) => {
        if (i < count && img) slots[String(i + 1)] = img
    })
    return slots
}

function reorderImageSlots(images, fromKey, toKey) {
    const keys = Object.keys(images || {}).sort((a, b) => Number(a) - Number(b))
    if (!keys.length) return images
    const list = keys.map((key) => images[key] ?? null)
    const from = Number(fromKey) - 1
    const to = Number(toKey) - 1
    if (
        Number.isNaN(from) ||
        Number.isNaN(to) ||
        from < 0 ||
        to < 0 ||
        from >= list.length ||
        to >= list.length ||
        from === to
    ) {
        return images
    }
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return fillImageSlotsFromList(next, keys.length)
}
import { sanitizeCategoryIdsForSave } from '@/lib/productCategoryRefs';

const VARIANT_MATRIX_SELECTION_FIELDS = ['title', 'optionLabel', 'option', 'color', 'size'];
const getVariantMatrixKey = (options = {}) =>
    VARIANT_MATRIX_SELECTION_FIELDS.map((field) => `${field}:${String(options?.[field] || '').trim()}`).join('|');
const buildMatrixCellKey = (options = {}, qty) => `${getVariantMatrixKey(options)}__${Number(qty) || 0}`;
// Pick the first usable numeric value, skipping undefined/null/empty-string so a
// blank matrix cell falls back to the variant price, then the shared bundle-row price.
const pickMatrixNumber = (...vals) => {
    for (const val of vals) {
        if (val === undefined || val === null || val === '') continue;
        const num = Number(val);
        if (Number.isFinite(num)) return num;
    }
    return 0;
};

/** Keep price fields as strings while typing; avoid Number('') → 0 jumps. */
const parseOptionalPriceInput = (value) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') return '';
    const num = Number(trimmed);
    return Number.isFinite(num) ? trimmed : value;
};

const migrateMatrixCellsForVariantOptions = (cells, oldOptions, newOptions, tiers = []) => {
    if (!oldOptions || !newOptions) return cells;
    const next = { ...cells };
    tiers.forEach((tier) => {
        const qty = Number(tier?.qty) || 0;
        if (qty <= 0) return;
        const oldKey = buildMatrixCellKey(oldOptions, qty);
        const newKey = buildMatrixCellKey(newOptions, qty);
        if (oldKey === newKey) return;
        if (next[oldKey]) {
            next[newKey] = { ...(next[newKey] || {}), ...next[oldKey] };
            delete next[oldKey];
        }
    });
    return next;
};

const VARIANT_BUNDLE_MODE_OPTIONS = [
    {
        id: 'none',
        label: 'Simple product',
        description: 'One price and stock for the whole product.',
    },
    {
        id: 'variants',
        label: 'Product variants only',
        description: 'Size, color, or other options — each with its own price and stock.',
    },
    {
        id: 'bundles',
        label: 'Bulk bundles only',
        description: 'Buy 1, Bundle of 2, etc. Customers pick a pack on the product page (like choosing a variant).',
    },
    {
        id: 'matrix',
        label: 'Variants + bundle packs',
        description: 'Enables both variant options and pack sizes (Pack of 1, Pack of 2, …). Set combined prices in the matrix below.',
    },
];

const inferBulkRowLabel = (opts = {}, qty = 1) => {
    const n = Math.max(1, Number(qty) || 1);
    const raw = String(opts?.title || '').trim();
    if (raw && !/^Pack of /i.test(raw)) {
        if (raw === 'Buy 1' && n > 1) return `Bundle of ${n}`;
        return raw;
    }
    return n === 1 ? 'Buy 1' : `Bundle of ${n}`;
};

/** Bulk-only tiers: Buy 1 / Bundle of 2 rows — not a color/size × pack matrix. */
const isBulkTierOnlyProduct = (pv = []) => {
    const withBundle = (Array.isArray(pv) ? pv : []).filter(
        (v) => v?.options?.bundleQty != null && v?.options?.bundleQty !== '',
    );
    if (!withBundle.length) return false;
    if (withBundle.some(
        (v) => String(v?.options?.color || '').trim() || String(v?.options?.size || '').trim(),
    )) {
        return false;
    }
    const baseKeys = new Set();
    const tierSet = new Set();
    for (const v of withBundle) {
        const opts = { ...(v.options || {}) };
        delete opts.bundleQty;
        delete opts.tag;
        delete opts.image;
        delete opts.imageSlot;
        baseKeys.add(getVariantMatrixKey(opts));
        tierSet.add(Number(v.options?.bundleQty) || 0);
    }
    // One product option with multiple pack sizes → matrix, not bulk tiers.
    if (baseKeys.size === 1 && tierSet.size > 1) return false;
    return true;
};

const productUsesVariantEditor = (product, pv = []) => {
    if (isBulkTierOnlyProduct(pv)) return false;
    if (product?.attributes?.variantType === 'variant_bundles') return true;
    return (Array.isArray(pv) ? pv : []).some(
        (v) => String(v?.options?.color || '').trim() || String(v?.options?.size || '').trim(),
    );
};

const toArabicPriceDisplay = (amount) => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return formatStorefrontMoney(numeric, {
        marketCode: 'AE',
        language: 'ar',
        alreadyConverted: true,
    });
};

const stripBundleQtyFromVariants = (rows = []) => (
    (Array.isArray(rows) ? rows : []).map((row) => {
        const options = { ...(row?.options || {}) };
        delete options.bundleQty;
        delete options.tag;
        return { ...row, options };
    })
);

// Custom Video Extension for Tiptap
const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      controls: {
        default: true,
      },
      width: {
        default: '100%',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'video',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, { controls: true })]
  },

  addCommands() {
    return {
      setVideo: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        })
      },
    }
  },
})

export const dynamic = 'force-dynamic'

const slugifyValue = (value = '') => {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
}

const parseTagList = (rawValue = '') => {
    return Array.from(
        new Set(
            String(rawValue || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    )
}

const appendUniqueTags = (existing = [], incoming = []) => {
    const seen = new Set(existing.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
    const merged = [...existing]

    incoming.forEach((item) => {
        const tag = String(item || '').trim()
        const key = tag.toLowerCase()
        if (!tag || seen.has(key)) return
        seen.add(key)
        merged.push(tag)
    })

    return merged
}

const mergeSpecTableRows = (existingRows = [], incomingRows = [], columnCount = 2) => {
    const normalizedExisting = Array.isArray(existingRows)
        ? existingRows
            .map((row) => Array.isArray(row)
                ? Array.from({ length: columnCount }, (_, idx) => String(row[idx] || '').trim())
                : null
            )
            .filter((row) => row && row.some((cell) => cell.length > 0))
        : []

    const normalizedIncoming = Array.isArray(incomingRows)
        ? incomingRows
            .map((row) => Array.isArray(row)
                ? Array.from({ length: columnCount }, (_, idx) => String(row[idx] || '').trim())
                : null
            )
            .filter((row) => row && row.some((cell) => cell.length > 0))
        : []

    const seen = new Set(normalizedExisting.map((row) => JSON.stringify(row)))
    const merged = [...normalizedExisting]

    normalizedIncoming.forEach((row) => {
        const key = JSON.stringify(row)
        if (seen.has(key)) return
        seen.add(key)
        merged.push(row)
    })

    return merged
}

const removeSpecTableColumnAt = (columns = [], rows = [], colIndex = 0) => {
    if (!Array.isArray(columns) || columns.length <= 1) {
        return { columns, rows }
    }

    const nextColumns = columns.filter((_, idx) => idx !== colIndex)
    const nextRows = (rows || []).map((row) => (
        Array.isArray(row) ? row.filter((_, idx) => idx !== colIndex) : row
    ))

    return { columns: nextColumns, rows: nextRows }
}

const removeSpecTableRowAt = (rows = [], rowIndex = 0) => {
    if (!Array.isArray(rows) || rows.length <= 1) return rows
    return rows.filter((_, idx) => idx !== rowIndex)
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.avi', '.mkv']
const DEFAULT_BADGE_OPTIONS = [
    'Price Lower Than Usual',
    'Hot Deal',
    'Best Seller',
    'New Arrival',
    'Limited Stock',
    'Free Shipping',
]

const isVideoSource = (value = '') => {
    const raw = String(value || '').toLowerCase().split('?')[0]
    return VIDEO_EXTENSIONS.some((ext) => raw.endsWith(ext))
}

function RichTextDescriptionEditor({
    label,
    value,
    onChange,
    placeholder,
    getAuthTokenOrThrow,
    dir = 'ltr',
}) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TiptapImage.configure({
                inline: true,
                allowBase64: true,
            }),
            Video,
            Link.configure({ openOnClick: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            Color,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            Placeholder.configure({ placeholder })
        ],
        content: value || '',
        immediatelyRender: false,
        onUpdate: ({ editor: activeEditor }) => {
            onChange(activeEditor.getHTML())
        }
    })

    useEffect(() => {
        if (!editor) return

        const nextValue = value || ''
        const currentValue = editor.getHTML()

        if (nextValue && currentValue !== nextValue) {
            editor.commands.setContent(nextValue)
            return
        }

        if (!nextValue && currentValue !== '<p></p>') {
            editor.commands.clearContent()
        }
    }, [value, editor])

    return (
        <div dir={dir}>
            <label className="block text-sm font-medium mb-1">{label}</label>

            <div className="border border-gray-300 rounded-t bg-white p-3 flex flex-wrap gap-1.5 shadow-sm">
                <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('bold') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Bold"><strong>B</strong></button>
                <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('italic') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Italic"><em>I</em></button>
                <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('strike') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Strikethrough"><s>S</s></button>
                <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
                <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Heading 1">H1</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Heading 2">H2</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('heading', { level: 3 }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Heading 3">H3</button>
                <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
                <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('bulletList') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Bullet List">• List</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive('orderedList') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Numbered List">1. List</button>
                <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
                <button type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="px-3 py-1.5 rounded text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-all" title="Insert Table">📊 <span className="hidden sm:inline">Table</span></button>
                {editor?.isActive('table') && (
                    <>
                        <div className="w-px h-6 bg-blue-300 self-center mx-1"></div>
                        <span className="self-center text-xs text-blue-600 font-semibold px-1">Table:</span>
                        <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()} className="px-2 py-1.5 rounded text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all" title="Add Column After">+ Col</button>
                        <button type="button" onClick={() => editor?.chain().focus().deleteColumn().run()} className="px-2 py-1.5 rounded text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all" title="Delete Column">- Col</button>
                        <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()} className="px-2 py-1.5 rounded text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all" title="Add Row After">+ Row</button>
                        <button type="button" onClick={() => editor?.chain().focus().deleteRow().run()} className="px-2 py-1.5 rounded text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all" title="Delete Row">- Row</button>
                        <button type="button" onClick={() => editor?.chain().focus().deleteTable().run()} className="px-2 py-1.5 rounded text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-all" title="Delete Entire Table">🗑️ Table</button>
                    </>
                )}
                <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
                <button type="button" onClick={() => editor?.chain().focus().setTextAlign('left').run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive({ textAlign: 'left' }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Align Left">⬅</button>
                <button type="button" onClick={() => editor?.chain().focus().setTextAlign('center').run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive({ textAlign: 'center' }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Align Center">↔</button>
                <button type="button" onClick={() => editor?.chain().focus().setTextAlign('right').run()} className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${editor?.isActive({ textAlign: 'right' }) ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Align Right">➡</button>
                <div className="w-px h-6 bg-gray-300 self-center mx-1"></div>
                <label className="px-3 py-1.5 rounded text-sm font-medium bg-green-100 hover:bg-green-200 transition-all cursor-pointer flex items-center gap-1" title="Upload Image">
                    🖼️ <span className="hidden sm:inline">Image</span>
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            try {
                                const token = await getAuthTokenOrThrow()
                                const data = await uploadStoreImage(file, { token })

                                editor?.chain().focus().setImage({ src: data.url }).run()
                                toast.success('Image uploaded!')
                            } catch (error) {
                                toast.error(getUploadErrorMessage(error))
                            }
                            e.target.value = ''
                        }}
                    />
                </label>
                <label className="px-3 py-1.5 rounded text-sm font-medium bg-purple-100 hover:bg-purple-200 transition-all cursor-pointer flex items-center gap-1" title="Upload Video">
                    🎥 <span className="hidden sm:inline">Video</span>
                    <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            if (file.size > 50 * 1024 * 1024) {
                                toast.error('Video file too large (max 50MB)')
                                return
                            }

                            try {
                                toast.loading('Uploading video...')
                                const token = await getAuthTokenOrThrow()
                                const data = await uploadStoreImage(file, { token, compress: false })

                                editor?.chain().focus().setVideo({ src: data.url }).run()
                                toast.dismiss()
                                toast.success('Video uploaded!')
                            } catch (error) {
                                toast.dismiss()
                                toast.error(getUploadErrorMessage(error))
                            }
                            e.target.value = ''
                        }}
                    />
                </label>
                <button type="button" onClick={() => {
                    const url = prompt('Enter link URL:')
                    if (url) editor?.chain().focus().setLink({ href: url }).run()
                }} className="px-3 py-1.5 rounded text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-all" title="Add Link">🔗 <span className="hidden sm:inline">Link</span></button>
                <input type="color" onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()} className="w-10 h-8 rounded border-2 cursor-pointer hover:border-blue-400 transition-all" title="Text Color" />
            </div>

            <EditorContent
                editor={editor}
                className={`border border-t-0 border-gray-300 rounded-b bg-white p-4 min-h-[250px] max-h-[500px] overflow-y-auto prose prose-slate max-w-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all [&_video]:max-w-full [&_video]:rounded [&_video]:my-4 [&_img]:max-w-full [&_img]:rounded [&_img]:my-2 ${dir === 'rtl' ? '[&_p]:text-right [&_h1]:text-right [&_h2]:text-right [&_h3]:text-right [&_li]:text-right' : ''}`}
            />
            <p className="text-xs text-gray-500 mt-1">💡 You can upload images and videos (max 50MB) directly into the description</p>
        </div>
    )
}

function ShortDescriptionRichTextEditor({
    label,
    value,
    onChange,
    placeholder,
    dir = 'ltr',
}) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Link.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder })
        ],
        content: value || '',
        immediatelyRender: false,
        onUpdate: ({ editor: activeEditor }) => {
            onChange(activeEditor.getHTML())
        }
    })

    useEffect(() => {
        if (!editor) return

        const nextValue = value || ''
        const currentValue = editor.getHTML()

        if (nextValue && currentValue !== nextValue) {
            editor.commands.setContent(nextValue)
            return
        }

        if (!nextValue && currentValue !== '<p></p>') {
            editor.commands.clearContent()
        }
    }, [value, editor])

    return (
        <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">{label}</label>
            <div className="border border-gray-300 rounded-t bg-white p-2 flex flex-wrap gap-1.5 shadow-sm">
                <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${editor?.isActive('bold') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Bold"><strong>B</strong></button>
                <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${editor?.isActive('bulletList') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Bullet List">• List</button>
                <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${editor?.isActive('orderedList') ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 hover:bg-gray-200'}`} title="Numbered List">1. List</button>
                <button
                    type="button"
                    onClick={() => {
                        const url = prompt('Enter link URL:')
                        if (!url) return
                        editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
                    }}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 transition-all"
                    title="Add Link"
                >
                    🔗 Link
                </button>
            </div>
            <EditorContent
                editor={editor}
                dir={dir}
                className="border border-t-0 border-gray-300 rounded-b bg-white p-3 min-h-[110px] max-h-[260px] overflow-y-auto prose prose-slate max-w-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all"
            />
            <p className="text-xs text-gray-500 mt-1">Use Enter for next line. Select text then click Link to add URL.</p>
        </div>
    )
}

function AiAutofillProgressPanel({ progress }) {
    if (!progress) return null

    const isAnalyzing = progress.phase === 'analyzing'

    return (
        <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-2.5" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                <span className="min-w-0">{progress.message}</span>
                <span className="shrink-0 tabular-nums">{progress.percent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                    className={`h-full rounded-full bg-blue-600 transition-all duration-500 ease-out ${isAnalyzing ? 'animate-pulse' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                />
            </div>
            {progress.filledGroups?.length > 0 ? (
                <ul className="max-h-32 overflow-y-auto space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    {progress.filledGroups.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

function FormSection({ id, title, icon, subtitle, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <section id={id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-left hover:bg-slate-100 transition"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    {icon ? (
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 text-sm">
                            {icon}
                        </span>
                    ) : null}
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                        {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
                    </div>
                </div>
                <span className="shrink-0 text-xs font-medium text-slate-500">{open ? 'Hide' : 'Show'}</span>
            </button>
            {open ? <div className="p-4">{children}</div> : null}
        </section>
    )
}

export default function ProductForm({ product = null, onClose, onSubmitSuccess }) {
        // MISSING STATE HOOKS (add these at the top of ProductForm)
        const [dbCategories, setDbCategories] = useState([]);
        const [selectedCategories, setSelectedCategories] = useState([]);
        const isDirtyRef = useRef(false);
        const initializedProductIdRef = useRef(null);
        const markDirty = () => { isDirtyRef.current = true; };
        const [bulkEnabled, setBulkEnabled] = useState(false);
        const [variants, setVariants] = useState([]);
        const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
        const [images, setImages] = useState(() => createEmptyImageSlots());
        const [draggingMediaKey, setDraggingMediaKey] = useState(null);
        const [dragOverMediaKey, setDragOverMediaKey] = useState(null);
        const [productInfo, setProductInfo] = useState({
            name: '', nameAr: '', slug: '', brand: '', brandAr: '', shortDescription: '', shortDescriptionAr: '', shortDescription2: '', shortDescription2Ar: '', specTableEnabled: false, specTableTitle: 'Product information', specTableTitleAr: 'مواصفات المنتج', specTableColumns: ['Property', 'Value'], specTableColumnsAr: ['الخاصية', 'القيمة'], specTableRows: [['', '']], specTableRowsAr: [['', '']], description: '', descriptionAr: '', AED: '', price: '', priceAr: '', AEDAr: '', category: '', sku: '', stockQuantity: 50, soldCount: 0, colors: [], sizes: [], fastDelivery: false, freeShippingEligible: false, useProductsPath: false, allowReturn: true, allowReplacement: true, reviews: [], badges: [], imageAspectRatio: '1:1', cardVideoPreviewEnabled: true, cardVideoPreviewDelaySec: 24, tags: [], seoTitle: '', seoDescription: '', seoKeywords: [], deliveredBy: '', soldBy: '', paymentInfo: '', hsCode: '', originCountry: '', shippingWeightKg: ''
        });
        const [tagInput, setTagInput] = useState('');
        const [seoKeywordInput, setSeoKeywordInput] = useState('');
        const [showArabic, setShowArabic] = useState(true);
        const [loading, setLoading] = useState(false);
        const [reviewInput, setReviewInput] = useState({ name: '', rating: 5, comment: '', image: null });
        const aspectRatioOptions = ['1:1', '4:5', '3:4', '16:9'];
        const [hasVariants, setHasVariants] = useState(false);
        const [variantBundleMode, setVariantBundleMode] = useState('none');
        const [bulkOptions, setBulkOptions] = useState([]);
        const [matrixCells, setMatrixCells] = useState({});
        const updateVariantOptionField = (idx, field, value) => {
            const v = variants[idx];
            if (!v) return;
            const oldOpts = v.options || {};
            const newOpts = { ...oldOpts, [field]: value };
            markDirty();
            setVariants((prev) => {
                const nv = [...prev];
                nv[idx] = { ...v, options: newOpts };
                return nv;
            });
            if (hasVariants && bulkEnabled) {
                setMatrixCells((prev) => migrateMatrixCellsForVariantOptions(prev, oldOpts, newOpts, bulkOptions));
            }
        };
        const [aiAdditionalDetails, setAiAdditionalDetails] = useState('');
        const [aiLoading, setAiLoading] = useState(false);
        const [aiProgress, setAiProgress] = useState(null);
        const [categorySearch, setCategorySearch] = useState('');
        const [importUrl, setImportUrl] = useState('');
        const [importUrlLoading, setImportUrlLoading] = useState(false);
        const [importUrlStatus, setImportUrlStatus] = useState('');
        const [enhanceImportedImages, setEnhanceImportedImages] = useState(true);
    const router = useRouter();
    // ...existing state declarations...
    const sellerAccess = readSellerCache()?.dashboardAccess || {};
    const canEditPricing = Boolean(
        sellerAccess.isOwner
        || sellerAccess.accessRole === 'owner'
        || sellerAccess.accessRole === 'admin'
        || !product?._id // new products: allow initial price
    );

    // UI stepper state
    const [step, setStep] = useState(1);
    const steps = [
        { label: 'Product Information' },
        { label: 'Pricing' },
        { label: 'Description & Tags' },
        { label: 'Features & Options' },
        { label: 'Images & Variants' },
    ];

    // ...existing state declarations...
    const [enableFBT, setEnableFBT] = useState(false)
    const [selectedFbtProducts, setSelectedFbtProducts] = useState([])
    const [availableProducts, setAvailableProducts] = useState([])
    const [fbtBundlePrice, setFbtBundlePrice] = useState('')
    const [fbtBundleDiscount, setFbtBundleDiscount] = useState('')
    const [searchFbt, setSearchFbt] = useState('')
    const [loadingFbt, setLoadingFbt] = useState(false)
    // Only PATCH FBT after config loaded — otherwise every save wiped the bundle to empty.
    const [fbtConfigLoaded, setFbtConfigLoaded] = useState(!product?._id)
    const [fbtConfigDirty, setFbtConfigDirty] = useState(false)
    const [storeBadgeOptions, setStoreBadgeOptions] = useState(DEFAULT_BADGE_OPTIONS)

    const { user, loading: authLoading, getToken } = useAuth();

    const getAuthTokenOrThrow = async (forceRefresh = false) => {
        const token = await getToken(forceRefresh)
        if (!token) {
            throw new Error('Session expired. Please login again.')
        }
        return token
    }

    const normalizeErrorMessage = (value, fallback = 'Request failed') => {
        if (!value) return fallback;
        if (typeof value === 'string') {
            if (value.length > 80) return value;
            if (/429|rate limit|too many requests|quota/i.test(value)) {
                return fallback;
            }
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (typeof value === 'object') {
            const msg = value.error || value.message || value.detail || value.code;
            if (typeof msg === 'string') return msg;
            try {
                return JSON.stringify(value);
            } catch {
                return fallback;
            }
        }
        return fallback;
    };

    // Fetch categories from database
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch('/api/store/categories');

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    console.error('Failed to fetch categories:', res.status, res.statusText, errorData);
                    setDbCategories([]);
                    return;
                }

                const data = await res.json();
                const categories = Array.isArray(data?.categories) ? data.categories : [];

                if (categories.length > 0) {
                    setDbCategories(categories);
                    return;
                }

                // Fallback: if only store menu categories exist, auto-sync them into system categories
                // so they become selectable for products.
                if (!user) {
                    setDbCategories([]);
                    return;
                }

                const token = await getToken();
                if (!token) {
                    setDbCategories([]);
                    return;
                }

                const menuRes = await fetch('/api/store/category-menu', {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!menuRes.ok) {
                    setDbCategories([]);
                    return;
                }

                const menuData = await menuRes.json();
                const menuCategories = Array.isArray(menuData?.categories) ? menuData.categories : [];

                if (menuCategories.length === 0) {
                    setDbCategories([]);
                    return;
                }

                await Promise.all(
                    menuCategories
                        .map((category) => category?.name?.trim())
                        .filter(Boolean)
                        .map(async (name) => {
                            try {
                                await fetch('/api/store/categories', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ name }),
                                });
                            } catch (syncError) {
                                console.warn('Category sync skipped for:', name, syncError?.message || syncError);
                            }
                        })
                );

                const refetchRes = await fetch('/api/store/categories');
                const refetchData = refetchRes.ok ? await refetchRes.json() : {};
                setDbCategories(Array.isArray(refetchData?.categories) ? refetchData.categories : []);
            } catch (error) {
                console.error('Error fetching categories:', error);
                setDbCategories([]);
            }
        };

        // Fetch categories and auto-sync menu categories if needed
        fetchCategories();
    }, [user, getToken]);
    useEffect(() => {
        const fetchBadgeOptions = async () => {
            if (!user) return

            try {
                const token = await getToken()
                if (!token) return

                const res = await fetch('/api/store/appearance/sections', {
                    headers: { Authorization: `Bearer ${token}` },
                })

                if (!res.ok) return

                const data = await res.json()
                const configuredBadges = Array.isArray(data?.productPageInfo?.badgeSettings?.badges)
                    ? data.productPageInfo.badgeSettings.badges
                        .map((badge) => String(badge?.label || '').trim())
                        .filter(Boolean)
                    : []

                if (configuredBadges.length > 0) {
                    setStoreBadgeOptions(configuredBadges)
                }
            } catch (error) {
                console.warn('Failed to load store badge options:', error)
            }
        }

        fetchBadgeOptions()
    }, [user, getToken])

    // Fetch products for FBT selection (lazy, only when enabled)
    useEffect(() => {
        if (!enableFBT || availableProducts.length > 0) return;

        const fetchProducts = async () => {
            try {
                const { data } = await axios.get('/api/products?limit=60');
                setAvailableProducts(data.products || []);
            } catch (error) {
                console.warn('Could not fetch products for FBT (this is optional):', error.message);
                // Set empty array so the feature still works, just with no products
                setAvailableProducts([]);
            }
        };
        fetchProducts();
    }, [enableFBT, availableProducts.length]);

    // Fetch FBT config when editing — never default-wipe on fetch failure.
    useEffect(() => {
        if (!product?._id) {
            setFbtConfigLoaded(true);
            return undefined;
        }

        let cancelled = false;
        const fetchFbtConfig = async () => {
            try {
                setLoadingFbt(true);
                setFbtConfigLoaded(false);
                const { data } = await axios.get(`/api/products/${product._id}/fbt`);
                if (cancelled) return;
                setEnableFBT(Boolean(data.enableFBT));
                setFbtBundlePrice(data.bundlePrice || '');
                setFbtBundleDiscount(data.bundleDiscount || '');
                setSelectedFbtProducts(Array.isArray(data.products) ? data.products : []);
                setFbtConfigDirty(false);
                setFbtConfigLoaded(true);
            } catch (error) {
                if (cancelled) return;
                // Keep existing DB FBT — do not mark loaded/dirty so save will not PATCH empty.
                console.warn('Could not load FBT config; leaving bundle unchanged on save:', error?.message);
                setFbtConfigLoaded(false);
                setFbtConfigDirty(false);
            } finally {
                if (!cancelled) setLoadingFbt(false);
            }
        };
        fetchFbtConfig();
        return () => { cancelled = true; };
    }, [product?._id]);
    useEffect(() => {
        isDirtyRef.current = false;
        initializedProductIdRef.current = null;
    }, [product?._id]);

    // Prefill form when editing (once per product unless user has edited)
    useEffect(() => {
        if (!product?._id || isDirtyRef.current) {
            return;
        }
        const productId = String(product._id);
        if (initializedProductIdRef.current === productId) {
            return;
        }

        console.log('Initializing form with product:', product._id)
            setProductInfo({
                name: product.name || "",
                nameAr: product.nameAr || "",
                slug: product.slug || "",
                brand: product.brand || "",
                brandAr: product.brandAr || "",
                shortDescription: product.shortDescription || "",
                shortDescriptionAr: product.shortDescriptionAr || "",
                shortDescription2: product.shortDescription2 || product.attributes?.shortDescription2 || "",
                shortDescription2Ar: product.attributes?.shortDescription2Ar || "",
                specTableEnabled: Boolean(product.specTableEnabled ?? product.attributes?.specTableEnabled ?? false),
                specTableTitle: product.attributes?.specTableTitle || product.specTableTitle || 'Product information',
                specTableTitleAr: product.attributes?.specTableTitleAr || 'مواصفات المنتج',
                specTableColumns: Array.isArray(product.specTableColumns) && product.specTableColumns.length > 0
                    ? product.specTableColumns
                    : (Array.isArray(product.attributes?.specTableColumns) && product.attributes.specTableColumns.length > 0
                        ? product.attributes.specTableColumns
                        : ['Property', 'Value']),
                specTableColumnsAr: Array.isArray(product.attributes?.specTableColumnsAr) && product.attributes.specTableColumnsAr.length > 0
                    ? product.attributes.specTableColumnsAr
                    : ['الخاصية', 'القيمة'],
                specTableRows: Array.isArray(product.specTableRows) && product.specTableRows.length > 0
                    ? product.specTableRows
                    : (Array.isArray(product.attributes?.specRows) && product.attributes.specRows.length > 0
                        ? product.attributes.specRows
                        : [['', '']]),
                specTableRowsAr: Array.isArray(product.attributes?.specRowsAr) && product.attributes.specRowsAr.length > 0
                    ? product.attributes.specRowsAr
                    : [['', '']],
                description: product.description || "",
                descriptionAr: product.descriptionAr || "",
                AED: product.AED || "",
                price: product.price || "",
                priceAr: product.attributes?.priceAr || "",
                AEDAr: product.attributes?.AEDAr || "",
                category: product.category?._id || product.category || "",
                sku: product.sku || "",
                stockQuantity: product.stockQuantity ?? '',
                soldCount: product.soldCount ?? 0,
                colors: product.colors || [],
                sizes: product.sizes || [],
                fastDelivery: product.fastDelivery || false,
                freeShippingEligible: product.freeShippingEligible || false,
                hsCode: product.hsCode || '',
                originCountry: product.originCountry || '',
                shippingWeightKg: product.shippingWeightKg || '',
                useProductsPath: product.useProductsPath || false,
                allowReturn: product.allowReturn !== undefined ? product.allowReturn : true,
                allowReplacement: product.allowReplacement !== undefined ? product.allowReplacement : true,
                reviews: product.reviews || [],
                badges: product.attributes?.badges || [],
                imageAspectRatio: product.imageAspectRatio || '1:1',
                cardVideoPreviewEnabled: product.cardVideoPreviewEnabled !== false,
                cardVideoPreviewDelaySec: Number(product.cardVideoPreviewDelaySec) || 24,
                tags: Array.isArray(product.tags) ? product.tags : [],
                seoTitle: product.seoTitle || '',
                seoDescription: product.seoDescription || '',
                seoKeywords: Array.isArray(product.seoKeywords) ? product.seoKeywords : [],
                deliveredBy: product.attributes?.deliveredBy || '',
                soldBy: product.attributes?.soldBy || '',
                paymentInfo: product.attributes?.paymentInfo || '',
            })
            setAiAdditionalDetails(product.attributes?.additionalDetails || '')
            // Set selected categories from product data - debug and handle all cases
            console.log('Product data for categories:', { 
                categories: product.categories, 
                category: product.category,
                type: typeof product.categories 
            })
            
            let categoriesToSet = []
            
            // Check if product has categories array
            if (product.categories && Array.isArray(product.categories) && product.categories.length > 0) {
                categoriesToSet = sanitizeCategoryIdsForSave(product.categories)
            }
            // Fallback to single category
            else if (product.category) {
                const catId = typeof product.category === 'object' ? product.category._id : product.category
                if (catId) {
                    categoriesToSet = sanitizeCategoryIdsForSave([catId])
                }
            }
            
            console.log('Setting selected categories:', categoriesToSet)
            setSelectedCategories(categoriesToSet)
            setIsSlugManuallyEdited(true)
            
            const pv = Array.isArray(product.variants) ? product.variants : []
            const variantType = String(product.attributes?.variantType || '').trim()
            const bulkTierOnly = isBulkTierOnlyProduct(pv)
            const hasColorSizeBundles = pv.some(
                (v) => (String(v?.options?.color || '').trim() || String(v?.options?.size || '').trim())
                  && (v?.options?.bundleQty != null && v?.options?.bundleQty !== ''),
            )
            // Prefer the saved pricing mode flag. Only infer matrix from variant shape
            // when there is no explicit simple/variants/bundles mode saved.
            const explicitSimpleOrVariants = variantType === 'simple' || variantType === 'variants'
            const explicitBundles = variantType === 'bulk_bundles'
            const isMatrix = !explicitSimpleOrVariants && !explicitBundles && !bulkTierOnly && (
              variantType === 'variant_bundles'
              || (variantType !== 'bulk_bundles' && hasColorSizeBundles)
            )
            setHasVariants(isMatrix ? true : (explicitSimpleOrVariants ? variantType === 'variants' : productUsesVariantEditor(product, pv)))
            setVariants(isMatrix ? pv : ((explicitSimpleOrVariants ? variantType === 'variants' : productUsesVariantEditor(product, pv)) ? pv : []))
            if (isMatrix) {
                // Reconstruct base variants, bundle tiers, and the price/stock matrix.
                setHasVariants(true)
                setBulkEnabled(true)

                const baseMap = new Map()
                const tierMap = new Map()
                const cells = {}
                const productStockFallback = Number(product.stockQuantity) || 0
                pv.forEach((v) => {
                    const opts = v?.options || {}
                    const qty = Number(opts.bundleQty) || 1
                    const baseOpts = { ...opts }
                    delete baseOpts.bundleQty
                    delete baseOpts.tag
                    const key = getVariantMatrixKey(baseOpts)
                    const rowStock = Number(v.stock) > 0 ? Number(v.stock) : productStockFallback
                    if (!baseMap.has(key)) {
                        baseMap.set(key, {
                            options: baseOpts,
                            price: v.price ?? '',
                            AED: v.AED ?? v.price ?? '',
                            stock: rowStock,
                            sku: v.sku || '',
                        })
                    }
                    if (!tierMap.has(qty)) {
                        tierMap.set(qty, {
                            title: qty === 1 ? 'Pack of 1' : `Pack of ${qty}`,
                            qty,
                            price: v.price ?? '',
                            AED: v.AED ?? v.price ?? '',
                            stock: rowStock,
                            tag: opts.tag || v.tag || '',
                            image: '',
                            imageSlot: '',
                        })
                    }
                    cells[buildMatrixCellKey(baseOpts, qty)] = {
                        price: v.price ?? '',
                        AED: v.AED ?? v.price ?? '',
                        stock: Number(v.stock) > 0 ? Number(v.stock) : '',
                    }
                })
                setVariants([...baseMap.values()])
                setBulkOptions([...tierMap.values()].sort((a, b) => a.qty - b.qty))
                setMatrixCells(cells)
                const matrixImgState = fillImageSlotsFromList(
                    product.images && Array.isArray(product.images) ? product.images : []
                )
                setImages(matrixImgState)
                setVariantBundleMode('matrix')
                initializedProductIdRef.current = productId;
                return
            }
            const isBulk = explicitBundles || bulkTierOnly
              || (!isMatrix && !explicitSimpleOrVariants && pv.length > 0 && pv.every((v) => v?.options && (v.options.bundleQty || v.options.bundleQty === 0) && !v.options.color && !v.options.size))
            if (isBulk) {
                setBulkEnabled(true)
                setHasVariants(false)
                setVariantBundleMode('bundles')
                setVariants([])
                const mapped = pv.map((v) => {
                    const qty = Number(v?.options?.bundleQty) || 1
                    return {
                        title: inferBulkRowLabel(v?.options, qty),
                        qty,
                        price: v.price ?? '',
                        AED: v.AED ?? v.price ?? '',
                        stock: v.stock ?? 0,
                        tag: v.tag || v.options?.tag || '',
                        image: v?.options?.image || '',
                        imageSlot: v?.options?.imageSlot || '',
                    }
                })
                mapped.sort((a, b) => a.qty - b.qty)
                setBulkOptions(mapped)
                setMatrixCells({})
            } else if (variantType === 'variants' || (!explicitSimpleOrVariants && productUsesVariantEditor(product, pv))) {
                setBulkEnabled(false)
                setHasVariants(true)
                setVariantBundleMode('variants')
                setBulkOptions([])
                setMatrixCells({})
                // If this product was previously matrix, strip pack Qty so the editor
                // and next save stay on "Product variants only".
                const cleaned = stripBundleQtyFromVariants(pv)
                    .map((v) => ({
                        ...v,
                        options: normalizeSellerVariantOptions(v?.options),
                    }))
                    .filter((v) => (
                    VARIANT_MATRIX_SELECTION_FIELDS.some((f) => String(v?.options?.[f] || '').trim())
                ))
                setVariants(cleaned.length ? cleaned : stripBundleQtyFromVariants(pv).map((v) => ({
                    ...v,
                    options: normalizeSellerVariantOptions(v?.options),
                })))
            } else {
                setBulkEnabled(false)
                setHasVariants(false)
                setVariantBundleMode('none')
                setVariants([])
                setBulkOptions([])
                setMatrixCells({})
            }
            // Map existing images to slots - store as strings (URLs)
            const imgState = fillImageSlotsFromList(
                product.images && Array.isArray(product.images) ? product.images : []
            )
            setImages(imgState)
            initializedProductIdRef.current = productId;
    }, [product])
    
    useEffect(() => {
        setProductInfo(prev => ({
            ...prev,
            category: selectedCategories[0] || ''
        }))
    }, [selectedCategories])

    const onChangeHandler = (e) => {
        const { name, value } = e.target
        
        // Auto-generate slug from product name
        if (name === 'name') {
            const slug = slugifyValue(value)
            
            setProductInfo(prev => ({ 
                ...prev, 
                [name]: value,
                slug: isSlugManuallyEdited ? prev.slug : slug
            }))
        } else if (name === 'slug') {
            setIsSlugManuallyEdited(true)
            setProductInfo(prev => ({ ...prev, slug: slugifyValue(value) }))
        } else {
            setProductInfo(prev => ({ ...prev, [name]: value }))
        }
    }

    const translateSalePriceToArabic = () => {
        const next = toArabicPriceDisplay(productInfo.price);
        if (!next) {
            toast.error('Enter a sale price first');
            return;
        }
        setProductInfo((prev) => ({ ...prev, priceAr: next }));
        toast.success('Arabic sale price updated');
    };

    const translateRegularPriceToArabic = () => {
        const next = toArabicPriceDisplay(productInfo.AED);
        if (!next) {
            toast.error('Enter a regular price first');
            return;
        }
        setProductInfo((prev) => ({ ...prev, AEDAr: next }));
        toast.success('Arabic regular price updated');
    };

    const translateAllPricesToArabic = () => {
        const priceAr = toArabicPriceDisplay(productInfo.price);
        const AEDAr = toArabicPriceDisplay(productInfo.AED);
        if (!priceAr && !AEDAr) {
            toast.error('Enter at least one price first');
            return;
        }
        setProductInfo((prev) => ({
            ...prev,
            ...(priceAr ? { priceAr } : {}),
            ...(AEDAr ? { AEDAr } : {}),
        }));
        toast.success('Arabic prices updated');
    };

    const toggleCategorySelection = (categoryId, checked) => {
        const normalizedId = String(categoryId)
        setSelectedCategories(prev => {
            if (checked) {
                return prev.includes(normalizedId) ? prev : [...prev, normalizedId]
            }
            return prev.filter(id => id !== normalizedId)
        })
    }

    const dedupeCategoryIds = (ids = []) => (
        Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)))
    )

    const filteredCategories = useMemo(() => {
        const query = categorySearch.trim().toLowerCase()
        if (!query) return dbCategories
        return dbCategories.filter((cat) => {
            const name = String(cat?.name || '').toLowerCase()
            const nameAr = String(cat?.nameAr || '').toLowerCase()
            return name.includes(query) || nameAr.includes(query)
        })
    }, [dbCategories, categorySearch])

    const handleImageUpload = async (key, file) => {
        const mimeType = String(file?.type || '').toLowerCase()
        const isImage = mimeType.startsWith('image/')
        const isVideo = mimeType.startsWith('video/') || isVideoSource(file?.name)

        if (!isImage && !isVideo) {
            toast.error('Please select a valid image or video file')
            return
        }

        let uploadFile = file
        if (isImage) {
            uploadFile = await compressImageForUpload(file)
        }

        if (isImage && uploadFile.size > 8 * 1024 * 1024) {
            toast.error('Image is still too large after compression. Try a smaller photo.')
            return
        }
        if (isVideo && file.size > 50 * 1024 * 1024) {
            toast.error('Single video must be 50MB or smaller')
            return
        }
        // Create preview URL for the file
        const previewUrl = URL.createObjectURL(uploadFile)
        setImages(prev => ({ ...prev, [key]: { file: uploadFile, preview: previewUrl, type: isVideo ? 'video' : 'image' } }))
    }

    const handleImageDelete = async (key) => {
        setImages(prev => {
            const updated = { ...prev, [key]: null };

            // If editing an existing product, persist the change
            if (product && product._id) {
                // Collect all non-null images (string URLs only)
                const newImages = Object.values(updated)
                    .filter(img => typeof img === 'string' && img)
                ;
                (async () => {
                    try {
                        const token = await getAuthTokenOrThrow();
                        await axios.put('/api/store/product', {
                            productId: product._id,
                            images: newImages
                        }, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        toast.success('Image deleted and saved!');
                    } catch (err) {
                        toast.error('Failed to delete image on server');
                    }
                })();
            }
            return updated;
        });
    }

    const handleImageReorder = (fromKey, toKey) => {
        if (!fromKey || !toKey || fromKey === toKey) return
        markDirty()
        setImages((prev) => reorderImageSlots(prev, fromKey, toKey))
    }

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = String(reader.result || '')
                const base64 = result.includes(',') ? result.split(',')[1] : result
                resolve(base64)
            }
            reader.onerror = () => reject(new Error('Failed to read image file'))
            reader.readAsDataURL(file)
        })
    }

    const compressImageForAi = async (file) => {
        const mimeType = String(file?.type || '').toLowerCase()
        if (!mimeType.startsWith('image/')) {
            return file
        }

        const aiSupported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        const needsConversion = !aiSupported.includes(mimeType) || file.size > 1.5 * 1024 * 1024
        if (!needsConversion) {
            return file
        }

        return new Promise((resolve) => {
            const objectUrl = URL.createObjectURL(file)
            const img = new window.Image()

            img.onload = () => {
                const maxWidth = 1280
                const scale = Math.min(1, maxWidth / Math.max(img.width, img.height, 1))
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.round(img.width * scale))
                canvas.height = Math.max(1, Math.round(img.height * scale))
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl)
                    resolve(file)
                    return
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(objectUrl)
                    if (!blob) {
                        resolve(file)
                        return
                    }
                    resolve(new File([blob], file.name || 'product.jpg', { type: 'image/jpeg' }))
                }, 'image/jpeg', 0.82)
            }

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl)
                resolve(file)
            }

            img.src = objectUrl
        })
    }

    const getFirstImageSourceForAi = async () => {
        const mediaValues = Object.values(images)
        for (const media of mediaValues) {
            if (!media) continue

            if (typeof media === 'object' && media.file) {
                const mimeType = String(media.file.type || '').toLowerCase()
                if (mimeType.startsWith('image/')) {
                    const compressed = await compressImageForAi(media.file)
                    return {
                        base64Image: await fileToBase64(compressed),
                        mimeType: String(compressed.type || mimeType || 'image/jpeg').toLowerCase(),
                    }
                }
                continue
            }

            if (typeof media === 'string' && !isVideoSource(media)) {
                return { imageUrl: media }
            }
        }
        return null
    }

    const applyAiAutofillProgressively = async (data) => {
        const nextColumns = Array.isArray(data?.specTableColumns) && data.specTableColumns.length > 1
            ? data.specTableColumns.slice(0, 2)
            : ['Property', 'Value']

        const nextRows = Array.isArray(data?.specTableRows) && data.specTableRows.length > 0
            ? data.specTableRows
            : mergeSpecTableRows([], data?.specTableRows, nextColumns.length || 2)

        const nextRowsAr = Array.isArray(data?.specTableRowsAr) && data.specTableRowsAr.length > 0
            ? data.specTableRowsAr
            : []

        const steps = [
            {
                label: 'Product name & brand',
                patch: (prev) => {
                    const nextName = data?.name || prev.name
                    return {
                        name: nextName,
                        slug: isSlugManuallyEdited ? prev.slug : slugifyValue(nextName),
                        brand: data?.brand || prev.brand,
                    }
                },
            },
            {
                label: 'Short descriptions (English)',
                patch: (prev) => ({
                    shortDescription: data?.shortDescription || prev.shortDescription,
                    shortDescription2: data?.shortDescription2 || prev.shortDescription2,
                }),
            },
            {
                label: 'Full description (English)',
                patch: (prev) => ({
                    description: data?.description || prev.description,
                }),
            },
            {
                label: 'Specification table (English)',
                patch: (prev) => ({
                    specTableEnabled: Boolean(data?.specTableEnabled ?? (nextRows.length > 0)),
                    specTableTitle: data?.specTableTitle || prev.specTableTitle,
                    specTableColumns: nextColumns,
                    specTableRows: nextRows,
                }),
            },
            {
                label: 'Tags, SEO & badges',
                patch: (prev) => ({
                    tags: appendUniqueTags(prev.tags || [], data?.tags || []),
                    seoTitle: data?.seoTitle || prev.seoTitle,
                    seoDescription: data?.seoDescription || prev.seoDescription,
                    seoKeywords: appendUniqueTags(prev.seoKeywords || [], data?.seoKeywords || []),
                    badges: appendUniqueTags(prev.badges || [], data?.badges || []),
                    deliveredBy: data?.deliveredBy || prev.deliveredBy,
                    soldBy: data?.soldBy || prev.soldBy,
                    paymentInfo: data?.paymentInfo || prev.paymentInfo,
                }),
            },
        ]

        if (showArabic) {
            steps.push(
                {
                    label: 'Arabic name & brand',
                    patch: (prev) => ({
                        nameAr: data?.nameAr || prev.nameAr,
                        brandAr: data?.brandAr || prev.brandAr,
                        shortDescriptionAr: data?.shortDescriptionAr || prev.shortDescriptionAr,
                    }),
                },
                {
                    label: 'Arabic prices',
                    patch: (prev) => ({
                        priceAr: toArabicPriceDisplay(prev.price) || prev.priceAr,
                        AEDAr: toArabicPriceDisplay(prev.AED) || prev.AEDAr,
                    }),
                },
                {
                    label: 'Arabic descriptions',
                    patch: (prev) => ({
                        shortDescription2Ar: data?.shortDescription2Ar || prev.shortDescription2Ar,
                        descriptionAr: data?.descriptionAr || prev.descriptionAr,
                    }),
                },
                {
                    label: 'Specification table (Arabic)',
                    patch: (prev) => ({
                        specTableTitleAr: data?.specTableTitleAr || prev.specTableTitleAr,
                        specTableColumnsAr: Array.isArray(data?.specTableColumnsAr) && data.specTableColumnsAr.length > 1
                            ? data.specTableColumnsAr.slice(0, 2)
                            : prev.specTableColumnsAr,
                        specTableRowsAr: nextRowsAr,
                    }),
                }
            )
        }

        const filledGroups = []
        const applyStartPercent = 65
        const applySpan = 35
        const stepSize = applySpan / steps.length

        for (let index = 0; index < steps.length; index += 1) {
            const step = steps[index]
            setProductInfo((prev) => ({ ...prev, ...step.patch(prev) }))
            filledGroups.push(step.label)
            setAiProgress({
                percent: Math.round(applyStartPercent + stepSize * (index + 1)),
                phase: 'applying',
                message: `Auto-filled: ${step.label}`,
                filledGroups: [...filledGroups],
            })
            await new Promise((resolve) => setTimeout(resolve, 140))
        }

        if (Array.isArray(data?.suggestedCategoryIds) && data.suggestedCategoryIds.length > 0) {
            setSelectedCategories(dedupeCategoryIds(data.suggestedCategoryIds))
            filledGroups.push('Suggested categories')
            setAiProgress({
                percent: 100,
                phase: 'complete',
                message: 'Auto-fill complete',
                filledGroups: [...filledGroups],
            })
            await new Promise((resolve) => setTimeout(resolve, 140))
        } else {
            setAiProgress({
                percent: 100,
                phase: 'complete',
                message: 'Auto-fill complete',
                filledGroups: [...filledGroups],
            })
        }
    }

    const handleAiAutofill = async () => {
        let queuePoll = null

        const updateProgress = (next) => {
            setAiProgress((prev) => ({
                percent: 0,
                phase: 'preparing',
                message: 'Starting...',
                filledGroups: [],
                ...prev,
                ...next,
            }))
        }

        try {
            updateProgress({ percent: 4, phase: 'preparing', message: 'Preparing product image...', filledGroups: [] })

            const sourceImage = await getFirstImageSourceForAi()
            if (!sourceImage) {
                toast.error('Upload at least one image in Product Media before AI autofill')
                return
            }

            setAiLoading(true)
            updateProgress({ percent: 10, message: 'Authenticating...' })

            const token = await getAuthTokenOrThrow()

            queuePoll = setInterval(async () => {
                try {
                    const { data: queueData } = await axios.get('/api/store/ai/queue', {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                    const pending = Number(queueData?.pending || 0)
                    const running = Number(queueData?.running || 0)
                    const waitSec = Number(queueData?.estimatedWaitSec || 0)

                    if (pending > 0) {
                        updateProgress({
                            percent: Math.min(24, 14 + pending * 3),
                            phase: 'queued',
                            message: pending === 1
                                ? 'Waiting in queue (1 request ahead) — rate limit protection'
                                : `Waiting in queue (${pending} requests ahead) — rate limit protection`,
                        })
                    } else if (running > 0) {
                        updateProgress({
                            percent: 30,
                            phase: 'analyzing',
                            message: waitSec > 45
                                ? 'Store1920 AI is analyzing your product image (this may take up to a minute)...'
                                : 'Store1920 AI is analyzing your product image...',
                        })
                    }
                } catch {
                    // Ignore queue polling errors while the main request is in flight.
                }
            }, 900)

            updateProgress({ percent: 18, message: 'Sending request to Store1920 AI...' })

            const payload = sourceImage.imageUrl
                ? {
                    imageUrl: sourceImage.imageUrl,
                    additionalContext: aiAdditionalDetails || '',
                    includeArabic: showArabic,
                }
                : {
                    base64Image: sourceImage.base64Image,
                    mimeType: sourceImage.mimeType,
                    additionalContext: aiAdditionalDetails || '',
                    includeArabic: showArabic,
                }

            const { data } = await axios.post('/api/store/ai', payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (queuePoll) {
                clearInterval(queuePoll)
                queuePoll = null
            }

            updateProgress({
                percent: 60,
                phase: 'applying',
                message: 'AI response received — applying fields to your form...',
            })

            await applyAiAutofillProgressively(data)

            const providerLabel = data?.provider === 'openai' ? 'OpenAI' : 'Gemini AI'
            toast.success(
                showArabic
                    ? `Product details auto-filled with ${providerLabel} (English + Arabic)`
                    : `Product details auto-filled with ${providerLabel} from image`
            )
        } catch (error) {
            const status = Number(error?.response?.status)
            const responseData = error?.response?.data || {}
            const apiError = typeof responseData.error === 'string' ? responseData.error.trim() : ''
            const provider = responseData.provider
            const attemptedProviders = Array.isArray(responseData.attemptedProviders)
                ? responseData.attemptedProviders.join(', ')
                : ''

            let message = apiError
            if (!message) {
                if (status === 429) {
                    message = provider === 'openai'
                        ? 'OpenAI quota reached. Set PRODUCT_AI_PROVIDER=openai, enable billing, and redeploy AWS.'
                        : provider === 'gemini'
                            ? 'Gemini quota reached. Enable billing in Google AI Studio, or set PRODUCT_AI_PROVIDER=openai and redeploy AWS.'
                            : 'AI quota reached. Redeploy AWS after updating API keys.'
                } else if (status === 401) {
                    message = 'AI API key is invalid. Update the key in AWS environment variables and redeploy.'
                } else if (status === 400) {
                    message = 'Upload a product image first, then run AI autofill.'
                } else {
                    message = 'AI autofill failed'
                }
            }

            if (attemptedProviders) {
                message = `${message} (tried: ${attemptedProviders})`
            }

            setAiProgress({
                percent: 0,
                phase: 'error',
                message,
                filledGroups: [],
            })
            toast.error(message)
        } finally {
            if (queuePoll) clearInterval(queuePoll)
            setAiLoading(false)
            setTimeout(() => {
                setAiProgress((current) => (current?.phase === 'complete' ? null : current))
            }, 4000)
        }
    }

    const suggestCategoryIdsFromImport = (imported = {}, categories = []) => {
        const haystack = `${imported.name || ''} ${imported.brand || ''} ${(imported.tags || []).join(' ')}`.toLowerCase();
        if (!haystack.trim()) return [];

        const matches = categories
            .map((category) => {
                const label = String(category?.name || '').trim().toLowerCase();
                if (!label || label.length < 3) return null;
                if (haystack.includes(label)) return String(category._id);
                return null;
            })
            .filter(Boolean);

        return dedupeCategoryIds(matches).slice(0, 3);
    }

    const handleImportFromUrl = async () => {
        const url = importUrl.trim();
        if (!url) {
            toast.error('Paste a product URL first');
            return;
        }

        try {
            setImportUrlLoading(true);
            setImportUrlStatus('Fetching product page...');
            const token = await getAuthTokenOrThrow();
            const { data } = await axios.post('/api/store/product/import-from-url', {
                url,
                enhanceImages: enhanceImportedImages,
            }, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 300000,
                onUploadProgress: () => {
                    setImportUrlStatus((prev) => (
                        prev.includes('Gemini') ? prev : 'Analyzing product with Gemini AI...'
                    ));
                },
            });

            const imported = data?.product || {};
            const nextName = String(imported.name || '').trim();
            const nextRows = Array.isArray(imported.specTableRows) && imported.specTableRows.length
                ? imported.specTableRows
                : [];

            setProductInfo((prev) => ({
                ...prev,
                name: nextName || prev.name,
                slug: isSlugManuallyEdited ? prev.slug : slugifyValue(nextName || prev.name),
                brand: imported.brand || prev.brand,
                shortDescription: imported.shortDescription || prev.shortDescription,
                shortDescription2: imported.shortDescription2 || prev.shortDescription2,
                description: imported.description || prev.description,
                AED: imported.AED || prev.AED,
                price: imported.price || prev.price,
                priceAr: toArabicPriceDisplay(imported.price || prev.price) || prev.priceAr,
                AEDAr: toArabicPriceDisplay(imported.AED || prev.AED) || prev.AEDAr,
                specTableEnabled: nextRows.length > 0 ? true : prev.specTableEnabled,
                specTableRows: nextRows.length > 0 ? nextRows : prev.specTableRows,
                tags: appendUniqueTags(prev.tags || [], imported.tags || []),
                seoTitle: imported.seoTitle || prev.seoTitle,
                seoDescription: imported.seoDescription || prev.seoDescription,
                seoKeywords: appendUniqueTags(prev.seoKeywords || [], imported.seoKeywords || []),
            }));

            if (Array.isArray(imported.images) && imported.images.length > 0) {
                const imgState = fillImageSlotsFromList(imported.images);
                setImages(imgState);
            }

            const suggestedCategoryIds = Array.isArray(data?.suggestedCategoryIds) && data.suggestedCategoryIds.length
                ? data.suggestedCategoryIds
                : suggestCategoryIdsFromImport(imported, dbCategories);
            if (suggestedCategoryIds.length > 0) {
                setSelectedCategories((prev) => dedupeCategoryIds([...prev, ...suggestedCategoryIds]));
            }

            toast.success(
                data?.imageEnhancement?.enhancedCount
                    ? `Imported ${imported.images?.length || 0} image(s) with Gemini AI enhancement on ${data.imageEnhancement.enhancedCount}. Review before saving.`
                    : data?.imageEnhancement?.skipped
                        ? `Imported ${imported.images?.length || 0} image(s). Image enhancement was skipped — original images kept.`
                    : data?.aiProvider === 'gemini'
                        ? `Imported ${imported.images?.length || 0} image(s) and product details with Gemini AI from ${data?.source || 'website'}. Review before saving.`
                        : `Imported ${imported.images?.length || 0} image(s) and product details from ${data?.source || 'website'}. Review before saving.`
            );
        } catch (error) {
            const status = Number(error?.response?.status);
            const apiError = error?.response?.data?.error;
            const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
            const fallback = isTimeout
                ? 'Import took too long. Try again with image enhancement turned off, or use a shorter product link.'
                : status === 400
                    ? 'Could not read this product URL. Some sites block imports — try another link.'
                    : 'Could not import product from this URL. Try another link or fill manually.';
            const message = normalizeErrorMessage(apiError || error?.message, fallback);
            toast.error(message);
        } finally {
            setImportUrlLoading(false);
            setImportUrlStatus('');
        }
    }

    const addReview = () => {
        if (!reviewInput.name || !reviewInput.comment) return toast.error("Please fill all review fields")
        setProductInfo(prev => ({ ...prev, reviews: [...prev.reviews, reviewInput] }))
        setReviewInput({ name: "", rating: 5, comment: "", image: null })
        toast.success("Review added ✅")
    }

    const hasPrimaryVideoWithPoster = useMemo(() => {
        const first = images['1']
        if (!first) return false

        const firstIsVideo = typeof first === 'string'
            ? isVideoSource(first)
            : first?.type === 'video' || isVideoSource(first?.preview)

        if (!firstIsVideo) return false

        return Object.entries(images).some(([slot, img]) => {
            if (slot === '1' || !img) return false
            if (typeof img === 'string') return !isVideoSource(img)
            return img.type !== 'video' && !isVideoSource(img?.preview)
        })
    }, [images])

    const variantImageOptions = Object.entries(images)
        .filter(([, img]) => {
            if (!img || (!img.preview && typeof img !== 'string')) return false
            if (typeof img === 'string') return !isVideoSource(img)
            return img.type !== 'video'
        })
        .map(([slot, img]) => ({
            slot,
            preview: img.preview || img,
            persistentUrl: typeof img === 'string'
                ? img
                : String(img?.url || img?.persistentUrl || img?.preview || '').trim(),
        }))

    const removeReview = (index) => {
        setProductInfo(prev => ({ ...prev, reviews: prev.reviews.filter((_, i) => i !== index) }))
    }

    const buildBulkRow = (qty, title = '', usePackLabel = false) => {
        const basePrice = Number(productInfo.price) || 0
        const baseAED = Number(productInfo.AED) || basePrice
        const stock = Number(productInfo.stockQuantity) || 0
        const bundleMultiplier = Math.max(1, Number(qty) || 1)
        return {
            title: title || (usePackLabel
                ? formatMatrixPackSizeLabel(bundleMultiplier)
                : (bundleMultiplier === 1 ? 'Buy 1' : `Bundle of ${bundleMultiplier}`)),
            qty: bundleMultiplier,
            price: basePrice ? Number((basePrice * bundleMultiplier * (bundleMultiplier > 1 ? 0.9 : 1)).toFixed(2)) : '',
            AED: baseAED ? Number((baseAED * bundleMultiplier).toFixed(2)) : '',
            stock: bundleMultiplier === 1 ? stock : (stock ? Math.max(1, Math.floor(stock / bundleMultiplier)) : 0),
            tag: bundleMultiplier === 2 ? 'MOST_POPULAR' : '',
            image: '',
            imageSlot: '',
        }
    }

    const seedBulkOptionsIfEmpty = (mode, usePackLabel) => {
        if (bulkOptions.length > 0) return
        const existingBulk = (Array.isArray(variants) ? variants : []).filter(
            (v) => v?.options && (v.options.bundleQty || v.options.bundleQty === 0) && !v.options?.color && !v.options?.size
        )
        if (existingBulk.length > 0) {
            setBulkOptions(existingBulk.map((v) => {
                const qty = Number(v?.options?.bundleQty) || 1
                return {
                    title: usePackLabel ? formatMatrixPackSizeLabel(qty) : inferBulkRowLabel(v?.options, qty),
                    qty,
                    price: v.price ?? '',
                    AED: v.AED ?? v.price ?? '',
                    stock: v.stock ?? 0,
                    tag: v.tag || v.options?.tag || '',
                    image: v?.options?.image || '',
                    imageSlot: v?.options?.imageSlot || '',
                }
            }).sort((a, b) => a.qty - b.qty))
            return
        }
        setBulkOptions([
            buildBulkRow(1, '', usePackLabel),
            buildBulkRow(2, '', usePackLabel),
        ])
    }

    const applyVariantBundleMode = (mode) => {
        markDirty()
        setVariantBundleMode(mode)
        const nextHasVariants = mode === 'variants' || mode === 'matrix'
        const nextBulkEnabled = mode === 'bundles' || mode === 'matrix'
        setHasVariants(nextHasVariants)
        setBulkEnabled(nextBulkEnabled)
        if (mode === 'bundles' || mode === 'matrix') {
            seedBulkOptionsIfEmpty(mode, mode === 'matrix')
        }
        if (mode === 'variants' || mode === 'none') {
            // Leaving pack/matrix mode must not keep pack rows in memory — otherwise
            // a later refresh re-infers "Variants + bundle packs" from leftover data.
            setBulkOptions([])
            setMatrixCells({})
            if (mode === 'variants') {
                setVariants((prev) => stripBundleQtyFromVariants(prev))
            } else {
                setVariants([])
            }
        }
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()
        try {
            const hasImage = Object.values(images).some(img => img)
            if (!hasImage) return toast.error('Please upload at least one product image')

            if (dedupeCategoryIds(selectedCategories).length === 0) {
                return toast.error('Please select at least one category')
            }

            if (product && !product._id) {
                return toast.error('Product ID missing. Close the editor and try again.')
            }

            if (variantBundleMode === 'bundles') {
                const validRows = bulkOptions.filter((b) => Number(b.qty) > 0 && Number(b.price) > 0)
                if (validRows.length === 0) {
                    return toast.error('Bundle rows need a Qty and Sale (AED) greater than 0. Rows with 0.00 are not saved.')
                }
                const inStockRows = validRows.filter((b) => Number(b.stock) > 0)
                if (inStockRows.length === 0) {
                    return toast.error('Set Stock greater than 0 on at least one bundle row so customers can buy it.')
                }
            } else if (variantBundleMode === 'matrix') {
                // Matrix mode stock is validated after expanding rows below.
            }

            setLoading(true)
            const token = await getAuthTokenOrThrow(true)
            const uploadMedia = (file) => uploadStoreImage(file, {
                token,
                compress: !isVideoSource(file?.name) && String(file?.type || '').indexOf('video/') !== 0,
            })
            const uploadEmbedded = (file) => uploadStoreImage(file, { token })

            const imageUrls = []
            const slotToUrl = {}
            const sortedImageKeys = Object.keys(images).sort((a, b) => Number(a) - Number(b))
            for (const key of sortedImageKeys) {
                const img = images[key]
                if (!img) continue
                if (typeof img === 'string') {
                    imageUrls.push(img)
                    slotToUrl[key] = img
                    continue
                }
                if (img.file) {
                    const uploaded = await uploadMedia(img.file)
                    imageUrls.push(uploaded.url)
                    slotToUrl[key] = uploaded.url
                } else if (img.preview && typeof img.preview === 'string' && !img.preview.startsWith('blob:')) {
                    imageUrls.push(img.preview)
                    slotToUrl[key] = img.preview
                }
            }

            const resolveVariantImageOptions = (options = {}) => {
                const next = { ...(options || {}) }
                const slot = String(next.imageSlot || '').trim()
                if (slot && slotToUrl[slot]) {
                    next.image = slotToUrl[slot]
                }
                return next
            }

            const description = await sanitizeRichTextMedia(productInfo.description, uploadEmbedded)
            const descriptionAr = await sanitizeRichTextMedia(productInfo.descriptionAr, uploadEmbedded)

            // Pricing mode radio is the source of truth — do not re-infer from leftover
            // bulkOptions / bundleQty that may still be in state after switching modes.
            const pricingMode = variantBundleMode
            const wantsVariants = pricingMode === 'variants' || pricingMode === 'matrix'
            const wantsBulk = pricingMode === 'bundles' || pricingMode === 'matrix'

            let variantsToSend = wantsVariants
                ? variants.map((variant) => ({
                    ...variant,
                    options: resolveVariantImageOptions(variant.options),
                }))
                : []
            let hasVariantsFlag = wantsVariants

            // Base variant rows carry a color/size/option selection and are NOT
            // bundle rows themselves (bundle rows have bundleQty and live in bulkOptions).
            const baseVariantRows = (Array.isArray(variants) ? variants : []).filter((v) => {
                const opts = v?.options || {}
                const isBundleRow = opts.bundleQty != null && opts.bundleQty !== ''
                if (isBundleRow) return false
                return VARIANT_MATRIX_SELECTION_FIELDS.some((f) => String(opts[f] || '').trim())
            })
            const isMatrixMode = pricingMode === 'matrix' && baseVariantRows.length > 0

            if (isMatrixMode) {
                // Matrix: every base variant × every bundle tier is its own priced variant.
                const productStockFallback = Number(productInfo.stockQuantity) || 0
                const bundleRows = bulkOptions.filter((b) => Number(b.qty) > 0)
                if (bundleRows.length === 0) {
                    setLoading(false)
                    return toast.error('Add at least one pack size (Qty) for Variants + bundle packs.')
                }
                const expanded = []
                baseVariantRows.forEach((v) => {
                    const baseOpts = { ...(v.options || {}) }
                    delete baseOpts.bundleQty
                    bundleRows.forEach((b) => {
                        const cell = matrixCells[buildMatrixCellKey(v.options, b.qty)] || {}
                        // Blank matrix cells fall back to the variant price, then the
                        // shared bundle-row price, so the seller doesn't have to fill
                        // every cell for the bundle price to apply.
                        const price = pickMatrixNumber(cell.price, v.price, b.price)
                        if (!(price > 0)) return
                        const aed = pickMatrixNumber(cell.AED, v.AED, b.AED, price) || price
                        // Prefer matrix cell → variant row → pack row → product Stock Qty.
                        const stock = pickMatrixNumber(cell.stock, v.stock, b.stock, productStockFallback, 0)
                        expanded.push({
                            sku: v.sku || '',
                            options: resolveVariantImageOptions({
                                ...baseOpts,
                                bundleQty: Number(b.qty),
                                ...(b.tag ? { tag: b.tag } : {}),
                            }),
                            price,
                            AED: aed,
                            stock,
                        })
                    })
                })
                if (expanded.length === 0) {
                    setLoading(false)
                    return toast.error('Fill price for at least one color/size × pack combination in the matrix.')
                }
                if (!expanded.some((row) => Number(row.stock) > 0)) {
                    setLoading(false)
                    return toast.error('Set Stock greater than 0 on at least one matrix cell (or Stock Qty) so customers can buy it.')
                }
                variantsToSend = expanded
                hasVariantsFlag = expanded.length > 0
            } else if (pricingMode === 'bundles' || (wantsBulk && !wantsVariants)) {
                const validBundles = bulkOptions.filter(b => Number(b.qty) > 0 && Number(b.price) > 0)
                if (validBundles.length === 0) {
                    setLoading(false)
                    return toast.error('Add at least one pack with Qty and Price before saving. Bundle pricing will not clear automatically.')
                }
                if (product?._id && !canEditPricing) {
                    setLoading(false)
                    return toast.error('Only the store owner or store admin can change pack prices.')
                }
                variantsToSend = validBundles
                    .map(b => ({
                        options: resolveVariantImageOptions({
                            bundleQty: Number(b.qty),
                            title: inferBulkRowLabel({ title: b.title }, b.qty),
                            tag: b.tag || undefined,
                            ...(b.image ? { image: b.image } : {}),
                            ...(b.imageSlot ? { imageSlot: b.imageSlot } : {}),
                        }),
                        price: Number(b.price),
                        AED: Number(b.AED || b.price),
                        stock: Number(b.stock || 0),
                    }))
                hasVariantsFlag = true
            } else if (pricingMode === 'variants') {
                // Persist color/size rows only — strip any leftover pack Qty so reload
                // cannot re-detect matrix mode from saved data.
                variantsToSend = stripBundleQtyFromVariants(variantsToSend)
                    .map((v) => ({
                        ...v,
                        options: normalizeSellerVariantOptions(v?.options),
                    }))
                    .filter((v) => VARIANT_MATRIX_SELECTION_FIELDS.some(
                        (f) => String(v?.options?.[f] || '').trim(),
                    ))
                hasVariantsFlag = variantsToSend.length > 0
                if (!hasVariantsFlag) {
                    setLoading(false)
                    return toast.error('Add at least one variant (color/size/option) before saving.')
                }
            } else {
                variantsToSend = []
                hasVariantsFlag = false
            }

            const resolvedVariantType = pricingMode === 'matrix'
                ? 'variant_bundles'
                : pricingMode === 'bundles'
                    ? 'bulk_bundles'
                    : pricingMode === 'variants'
                        ? 'variants'
                        : 'simple'

            const attributes = {
                brand: productInfo.brand,
                brandAr: productInfo.brandAr || '',
                shortDescription: productInfo.shortDescription,
                shortDescriptionAr: productInfo.shortDescriptionAr || '',
                shortDescription2: productInfo.shortDescription2 || '',
                shortDescription2Ar: productInfo.shortDescription2Ar || '',
                priceAr: productInfo.priceAr || '',
                AEDAr: productInfo.AEDAr || '',
                specTableEnabled: Boolean(productInfo.specTableEnabled),
                specTableTitle: productInfo.specTableTitle || 'Product information',
                specTableTitleAr: productInfo.specTableTitleAr || 'مواصفات المنتج',
                specTableColumns: Array.isArray(productInfo.specTableColumns) ? productInfo.specTableColumns : ['Property', 'Value'],
                specTableColumnsAr: Array.isArray(productInfo.specTableColumnsAr) ? productInfo.specTableColumnsAr : ['الخاصية', 'القيمة'],
                specRows: Array.isArray(productInfo.specTableRows) ? productInfo.specTableRows : [],
                specRowsAr: Array.isArray(productInfo.specTableRowsAr) ? productInfo.specTableRowsAr : [],
                badges: productInfo.badges || [],
                deliveredBy: productInfo.deliveredBy,
                soldBy: productInfo.soldBy,
                paymentInfo: productInfo.paymentInfo,
                additionalDetails: aiAdditionalDetails || '',
                // Always persist an explicit mode so refresh does not re-infer matrix
                // from leftover color/size × bundleQty rows.
                variantType: resolvedVariantType,
            }

            const payload = {
                name: productInfo.name,
                nameAr: productInfo.nameAr || '',
                slug: productInfo.slug?.trim() || '',
                brand: productInfo.brand || '',
                brandAr: productInfo.brandAr || '',
                shortDescription: productInfo.shortDescription || '',
                shortDescriptionAr: productInfo.shortDescriptionAr || '',
                shortDescription2: productInfo.shortDescription2 || '',
                shortDescription2Ar: productInfo.shortDescription2Ar || '',
                description,
                descriptionAr,
                price: Number(productInfo.price)
                    || (variantsToSend.length > 0 ? Number(variantsToSend[0].price) : 0)
                    || 0,
                AED: Number(productInfo.AED)
                    || (variantsToSend.length > 0 ? Number(variantsToSend[0].AED || variantsToSend[0].price) : 0)
                    || 0,
                sku: String(productInfo.sku || '').trim(),
                // Omit blank stock on edit so server keeps existing qty (Number('')||0 was wiping stock).
                ...(String(productInfo.stockQuantity ?? '').trim() !== ''
                  ? { stockQuantity: Number(productInfo.stockQuantity) }
                  : (product?._id ? {} : { stockQuantity: 0 })),
                soldCount: Math.max(0, Number(productInfo.soldCount) || 0),
                colors: productInfo.colors || [],
                sizes: productInfo.sizes || [],
                fastDelivery: Boolean(productInfo.fastDelivery),
                freeShippingEligible: Boolean(productInfo.freeShippingEligible),
                hsCode: String(productInfo.hsCode || '').trim(),
                originCountry: String(productInfo.originCountry || '').trim().toUpperCase(),
                shippingWeightKg: Number(productInfo.shippingWeightKg) || 0,
                useProductsPath: Boolean(productInfo.useProductsPath),
                imageAspectRatio: productInfo.imageAspectRatio || '1:1',
                cardVideoPreviewEnabled: productInfo.cardVideoPreviewEnabled !== false,
                cardVideoPreviewDelaySec: Number(productInfo.cardVideoPreviewDelaySec) || 24,
                tags: productInfo.tags || [],
                seoTitle: productInfo.seoTitle || '',
                seoDescription: productInfo.seoDescription || '',
                seoKeywords: productInfo.seoKeywords || [],
                specTableEnabled: Boolean(productInfo.specTableEnabled),
                specTableColumns: productInfo.specTableColumns || ['Property', 'Value'],
                specTableRows: productInfo.specTableRows || [],
                categories: sanitizeCategoryIdsForSave(selectedCategories),
                attributes,
                hasVariants: hasVariantsFlag,
                variants: hasVariantsFlag ? variantsToSend : [],
                images: imageUrls,
                ...(product?._id ? { productId: String(product._id) } : {}),
            }

            console.log('Submitting product JSON payload, images:', imageUrls.length)

            const apiCall = product?._id
                ? axios.put('/api/store/product', payload, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                })
                : axios.post('/api/store/product', payload, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                })

            const { data } = await apiCall
            toast.success(data.message)
            
            // Never auto-save FBT on edit unless seller changed it (fbtConfigDirty).
            // Old code always PATCHed enableFBT:false and cleared Frequently Bought Together bundles.
            const savedProduct = data.product || data.updatedProduct;
            const shouldPersistFbt = Boolean(savedProduct?._id)
              && fbtConfigLoaded
              && (fbtConfigDirty || !product?._id);
            if (shouldPersistFbt) {
                try {
                    await axios.patch(`/api/products/${savedProduct._id}/fbt`, {
                        enableFBT: enableFBT,
                        fbtProductIds: enableFBT ? selectedFbtProducts.map(p => p._id) : [],
                        fbtBundlePrice: enableFBT && fbtBundlePrice ? parseFloat(fbtBundlePrice) : null,
                        fbtBundleDiscount: enableFBT && fbtBundleDiscount ? parseFloat(fbtBundleDiscount) : null
                    });
                    setFbtConfigDirty(false);
                } catch (fbtError) {
                    console.error('Error saving FBT config:', fbtError);
                    toast.error('Product saved but FBT/bundle config failed');
                }
            }
            
            // Call success callback if provided
            if (onSubmitSuccess) {
                await onSubmitSuccess(savedProduct)
            } else {
                if (onClose) {
                    onClose()
                }
                router.push('/store/manage-product')
            }
        } catch (error) {
            toast.error(getUploadErrorMessage(error) || normalizeErrorMessage(error?.response?.data?.error || error?.response?.data || error?.message))
        } finally {
            setLoading(false)
        }
    }

    const availableBadgeOptions = Array.from(new Set([
        ...(storeBadgeOptions || []),
        ...((productInfo.badges || []).map((badge) => String(badge || '').trim()).filter(Boolean))
    ]))

    const isEditing = Boolean(product)
    const sectionLinks = [
        { id: 'section-quick-start', label: 'Quick Start' },
        { id: 'section-media', label: 'Media' },
        { id: 'section-basic', label: 'Basics' },
        { id: 'section-content', label: 'Content' },
        { id: 'section-advanced', label: 'Advanced' },
        { id: 'section-variants', label: 'Variants' },
    ]

    const isModal = Boolean(onClose)

    return (

        <div className={isModal ? 'fixed inset-0 z-[1000] bg-slate-100 overflow-y-auto' : 'w-full'}>
            <div className={isModal ? 'w-full min-h-full px-4 sm:px-6 lg:px-8 py-4' : 'w-full'}>
                <form onSubmit={onSubmitHandler} className="w-full bg-white p-4 sm:p-6 lg:p-8 rounded-xl shadow-sm space-y-5 border border-slate-200">
                    <div className={`${isModal ? 'sticky top-0 z-20' : ''} -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white border-b border-slate-200 space-y-3`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900">{isEditing ? 'Edit Product' : 'Add New Product'}</h2>
                                <p className="text-sm text-slate-500">Upload media, auto-fill details, then review basics and pricing before saving.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {sectionLinks.map((item) => (
                                    <a
                                        key={item.id}
                                        href={`#${item.id}`}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                                    >
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>

                <FormSection
                    id="section-quick-start"
                    title="Quick Start"
                    icon="⚡"
                    subtitle="Import from a URL or auto-fill with AI"
                    defaultOpen
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-slate-800">Import from URL</h4>
                            <p className="text-xs text-slate-600">Paste Amazon, Noon, or another product link.</p>
                            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enhanceImportedImages}
                                    onChange={(e) => setEnhanceImportedImages(e.target.checked)}
                                    className="accent-sky-600"
                                />
                                <span>Enhance imported images with Gemini</span>
                            </label>
                            <input
                                type="url"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                placeholder="https://www.amazon.ae/..."
                                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                            />
                            <button
                                type="button"
                                onClick={handleImportFromUrl}
                                disabled={importUrlLoading}
                                className="w-full px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-60"
                            >
                                {importUrlLoading ? (importUrlStatus || 'Importing...') : 'Import Details'}
                            </button>
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-slate-800">AI Auto Fill</h4>
                            <p className="text-xs text-slate-600">
                                Upload at least one image in Media, then auto-fill English and Arabic fields. Requests are queued to avoid rate limits.
                            </p>
                            <textarea
                                value={aiAdditionalDetails}
                                onChange={(e) => setAiAdditionalDetails(e.target.value)}
                                rows={3}
                                disabled={aiLoading}
                                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 bg-white disabled:opacity-60"
                                placeholder="Optional: material, warranty, package contents..."
                            />
                            <AiAutofillProgressPanel progress={aiProgress} />
                            <button
                                type="button"
                                onClick={handleAiAutofill}
                                disabled={aiLoading}
                                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                            >
                                {aiLoading
                                    ? (aiProgress?.message || 'Auto filling...')
                                    : 'Auto Fill With Store1920 AI'}
                            </button>
                        </div>
                    </div>
                </FormSection>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(380px,30%)] 2xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
                {/* MAIN COLUMN */}
                <div className="space-y-4 order-2 xl:order-1">
                <FormSection id="section-basic" title="Basic Information" icon="📦" subtitle="Name, categories, stock, and shipping options" defaultOpen>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Product Name</label>
                        <input name="name" value={productInfo.name} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none transition" placeholder="Enter product name" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Slug <span className="normal-case text-green-500">(auto)</span></label>
                        <input name="slug" value={productInfo.slug} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 outline-none" placeholder="Auto-generated" />
                        <p className="mt-1 text-[11px] text-gray-500">
                          Store URL: <span className="font-mono text-gray-700">/{productInfo.useProductsPath ? 'products' : 'product'}/{productInfo.slug || 'your-slug'}</span>
                        </p>
                    </div>
                    <div className="flex items-end">
                        <label className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs cursor-pointer group">
                          <span>
                            <span className="block font-semibold text-gray-700 group-hover:text-indigo-700">Use /products/ URL</span>
                            <span className="mt-0.5 block text-[11px] text-gray-500">Off = /product/slug (default). On = /products/slug for this product only.</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(productInfo.useProductsPath)}
                            onChange={(e) => setProductInfo((p) => ({ ...p, useProductsPath: e.target.checked }))}
                            className="accent-indigo-500 h-4 w-4 shrink-0"
                          />
                        </label>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Brand</label>
                        <input name="brand" value={productInfo.brand} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Brand (optional)" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">SKU</label>
                        <input name="sku" value={productInfo.sku || ""} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Optional" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Categories</label>
                        <input
                            type="search"
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            placeholder="Search categories..."
                            className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className={`border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 overflow-y-auto space-y-1 ${categorySearch.trim() ? 'max-h-44' : 'max-h-32'}`}>
                            {dbCategories.length === 0 ? (
                                <p className="text-xs text-gray-400">No categories available</p>
                            ) : filteredCategories.length === 0 ? (
                                <p className="text-xs text-gray-400">No categories match your search</p>
                            ) : (
                                filteredCategories.map(cat => (
                                    <label key={cat._id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded transition">
                                        <input type="checkbox" checked={selectedCategories.includes(String(cat._id))} onChange={(e) => toggleCategorySelection(cat._id, e.target.checked)} className="w-3.5 h-3.5 rounded cursor-pointer accent-indigo-500" />
                                        <span className="text-sm text-gray-700">{cat.name}{cat.nameAr ? <span className="text-gray-400"> · {cat.nameAr}</span> : null}</span>
                                    </label>
                                ))
                            )}
                        </div>
                        {selectedCategories.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {dedupeCategoryIds(selectedCategories).map(catId => { const cat = dbCategories.find(c => String(c._id) === String(catId)); return cat ? (<span key={catId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{cat.name}<button type="button" onClick={() => setSelectedCategories(prev => prev.filter(id => String(id) !== String(catId)))} className="ml-1 hover:text-indigo-900 font-bold">×</button></span>) : null })}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Stock Qty</label>
                        <input type="number" name="stockQuantity" value={productInfo.stockQuantity ?? ''} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. 100" min="0" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Units Sold (display)</label>
                        <input type="number" name="soldCount" value={productInfo.soldCount ?? ''} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. 250" min="0" />
                        <p className="mt-1 text-[11px] text-gray-500">Shown on the product page as &quot;X sold&quot; (e.g. 250 sold).</p>
                    </div>
                    <div className="sm:col-span-2 grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                        <label className="flex items-center gap-2 text-xs cursor-pointer group"><input type="checkbox" checked={productInfo.fastDelivery} onChange={(e)=> setProductInfo(p=>({...p, fastDelivery: e.target.checked}))} className="accent-green-500 w-3.5 h-3.5" /><span className="text-gray-600 group-hover:text-green-700">Fast Delivery</span></label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer group"><input type="checkbox" checked={productInfo.freeShippingEligible} onChange={(e)=> setProductInfo(p=>({...p, freeShippingEligible: e.target.checked}))} className="accent-teal-500 w-3.5 h-3.5" /><span className="text-gray-600 group-hover:text-teal-700">Free Shipping</span></label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer group"><input type="checkbox" checked={productInfo.allowReturn} onChange={(e)=> setProductInfo(p=>({...p, allowReturn: e.target.checked}))} className="accent-purple-500 w-3.5 h-3.5" /><span className="text-gray-600 group-hover:text-purple-700">Return 7d</span></label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer group"><input type="checkbox" checked={productInfo.allowReplacement} onChange={(e)=> setProductInfo(p=>({...p, allowReplacement: e.target.checked}))} className="accent-pink-500 w-3.5 h-3.5" /><span className="text-gray-600 group-hover:text-pink-700">Replace 7d</span></label>
                    </div>
                    <div className="sm:col-span-2 grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Waslah HS code</label>
                            <input name="hsCode" value={productInfo.hsCode || ''} onChange={onChangeHandler} maxLength={12} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="620449000000" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Origin country</label>
                            <input name="originCountry" value={productInfo.originCountry || ''} onChange={onChangeHandler} maxLength={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-indigo-200" placeholder="CN" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Ship weight (kg)</label>
                            <input type="number" name="shippingWeightKg" value={productInfo.shippingWeightKg ?? ''} onChange={onChangeHandler} min="0" step="0.01" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0.25" />
                        </div>
                    </div>
                  </div>
                </FormSection>

                <FormSection id="section-content" title="Pricing & Descriptions" icon="💰" subtitle="Price, short text, Arabic, specs, and full description" defaultOpen>
                  <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Regular Price</label>
                          <button type="button" onClick={translateRegularPriceToArabic} className="text-[11px] font-semibold text-amber-700 hover:text-amber-800">Translate</button>
                        </div>
                        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">AED</span><input type="number" step="0.01" name="AED" value={productInfo.AED} onChange={onChangeHandler} disabled={!canEditPricing} className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-12 text-sm outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:cursor-not-allowed" placeholder="0.00" /></div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Sale Price</label>
                          <button type="button" onClick={translateSalePriceToArabic} className="text-[11px] font-semibold text-amber-700 hover:text-amber-800">Translate</button>
                        </div>
                        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">AED</span><input type="number" step="0.01" name="price" value={productInfo.price} onChange={onChangeHandler} disabled={!canEditPricing} className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-12 text-sm outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:cursor-not-allowed" placeholder="0.00" /></div>
                    </div>
                  </div>
                  {!canEditPricing ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Only the store owner or store admin can change prices. Saving will keep the current prices.
                    </p>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-amber-800 uppercase tracking-wide text-right" dir="rtl">السعر الأصلي (عربي)</label>
                      <input name="AEDAr" value={productInfo.AEDAr || ''} onChange={onChangeHandler} dir="rtl" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 text-right bg-amber-50/40" placeholder="مثال: ١٥٠٫٠٠ د.إ." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-amber-800 uppercase tracking-wide text-right" dir="rtl">سعر البيع (عربي)</label>
                      <input name="priceAr" value={productInfo.priceAr || ''} onChange={onChangeHandler} dir="rtl" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 text-right bg-amber-50/40" placeholder="مثال: ١٠٩٫٩٠ د.إ." />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={translateAllPricesToArabic} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                      Translate all prices to Arabic
                    </button>
                  </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Short Description</label>
                  <input name="shortDescription" value={productInfo.shortDescription || ''} onChange={onChangeHandler} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200" placeholder="One-liner overview shown on product cards" />
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-amber-100">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">ع</span>
                      <span className="text-sm font-semibold text-slate-800">Arabic Content</span>
                      {showArabic && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                    </div>
                    <button type="button" onClick={() => setShowArabic(v => !v)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${showArabic ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
                      {showArabic ? 'Hide Arabic' : 'Enable Arabic'}
                    </button>
                  </div>
                  {showArabic && (
                    <div className="px-4 pb-4 space-y-3 pt-4" dir="rtl">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-amber-800 text-right">الاسم</label>
                          <input name="nameAr" value={productInfo.nameAr} onChange={onChangeHandler} dir="rtl" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 text-right" placeholder="أدخل اسم المنتج" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-amber-800 text-right">العلامة التجارية</label>
                          <input name="brandAr" value={productInfo.brandAr} onChange={onChangeHandler} dir="rtl" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 text-right" placeholder="العلامة التجارية" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-semibold mb-1 text-amber-800 text-right">الوصف المختصر</label>
                          <input name="shortDescriptionAr" value={productInfo.shortDescriptionAr || ''} onChange={onChangeHandler} dir="rtl" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 text-right" placeholder="وصف مختصر بالعربية" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-amber-800 text-right">الوصف التفصيلي</label>
                        <RichTextDescriptionEditor label="" value={productInfo.descriptionAr || ''} onChange={(nextValue) => setProductInfo(prev => ({ ...prev, descriptionAr: nextValue }))} placeholder="اكتب وصفًا تفصيليًا للمنتج بالعربية..." getAuthTokenOrThrow={getAuthTokenOrThrow} dir="rtl" />
                      </div>
                      <div>
                        <ShortDescriptionRichTextEditor
                          label="الوصف القصير الثاني"
                          value={productInfo.shortDescription2Ar || ''}
                          onChange={(nextValue) => setProductInfo(prev => ({ ...prev, shortDescription2Ar: nextValue }))}
                          placeholder="وصف إضافي قصير عن المنتج بالعربية"
                          dir="rtl"
                        />
                      </div>
                      {productInfo.specTableEnabled ? (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                          <label className="block text-xs font-semibold text-amber-800 text-right">جدول المواصفات</label>
                          <input
                            type="text"
                            value={productInfo.specTableTitleAr || ''}
                            onChange={(e) => setProductInfo((prev) => ({ ...prev, specTableTitleAr: e.target.value }))}
                            dir="rtl"
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                            placeholder="مواصفات المنتج"
                          />
                          <div className="flex flex-wrap gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setProductInfo((prev) => ({
                                ...prev,
                                specTableColumnsAr: [...(prev.specTableColumnsAr || []), `عمود ${(prev.specTableColumnsAr || []).length + 1}`],
                                specTableRowsAr: (prev.specTableRowsAr || []).map((row) => ([...(Array.isArray(row) ? row : []), ''])),
                              }))}
                              className="px-3 py-1.5 rounded text-xs font-medium bg-blue-100 hover:bg-blue-200 text-blue-800"
                            >
                              + إضافة عمود
                            </button>
                            <button
                              type="button"
                              onClick={() => setProductInfo((prev) => {
                                const colCount = Math.max((prev.specTableColumnsAr || []).length, 1)
                                return {
                                  ...prev,
                                  specTableRowsAr: [...(prev.specTableRowsAr || []), Array(colCount).fill('')],
                                }
                              })}
                              className="px-3 py-1.5 rounded text-xs font-medium bg-blue-100 hover:bg-blue-200 text-blue-800"
                            >
                              + إضافة صف
                            </button>
                            <button
                              type="button"
                              onClick={() => setProductInfo((prev) => {
                                const nextColumns = (prev.specTableColumnsAr || []).length > 1
                                  ? prev.specTableColumnsAr.slice(0, -1)
                                  : prev.specTableColumnsAr
                                const nextRows = (prev.specTableRowsAr || []).map((row) => (
                                  Array.isArray(row) && row.length > 1 ? row.slice(0, -1) : row
                                ))
                                return {
                                  ...prev,
                                  specTableColumnsAr: nextColumns,
                                  specTableRowsAr: nextRows,
                                }
                              })}
                              disabled={(productInfo.specTableColumnsAr || []).length <= 1}
                              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40"
                            >
                              - حذف آخر عمود
                            </button>
                            <button
                              type="button"
                              onClick={() => setProductInfo((prev) => ({
                                ...prev,
                                specTableRowsAr: (prev.specTableRowsAr || []).length > 1
                                  ? prev.specTableRowsAr.slice(0, -1)
                                  : prev.specTableRowsAr,
                              }))}
                              disabled={(productInfo.specTableRowsAr || []).length <= 1}
                              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40"
                            >
                              - حذف آخر صف
                            </button>
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr>
                                  {(productInfo.specTableColumnsAr || ['الخاصية', 'القيمة']).map((col, colIndex) => (
                                    <th key={`spec-ar-head-${colIndex}`} className="border-b border-amber-100 bg-amber-50 p-2 min-w-[180px]">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={col || ''}
                                          onChange={(e) => setProductInfo((prev) => {
                                            const nextColumns = [...(prev.specTableColumnsAr || [])]
                                            nextColumns[colIndex] = e.target.value
                                            return { ...prev, specTableColumnsAr: nextColumns }
                                          })}
                                          dir="rtl"
                                          className="w-full min-w-0 flex-1 rounded border border-amber-200 px-2 py-1 text-xs font-medium text-right"
                                          placeholder={`عمود ${colIndex + 1}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setProductInfo((prev) => {
                                            const { columns, rows } = removeSpecTableColumnAt(
                                              prev.specTableColumnsAr,
                                              prev.specTableRowsAr,
                                              colIndex,
                                            )
                                            return { ...prev, specTableColumnsAr: columns, specTableRowsAr: rows }
                                          })}
                                          disabled={(productInfo.specTableColumnsAr || []).length <= 1}
                                          className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                          title="حذف العمود"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </th>
                                  ))}
                                  <th className="border-b border-amber-100 bg-amber-50 p-2 w-10" aria-label="حذف الصف" />
                                </tr>
                              </thead>
                              <tbody>
                                {(productInfo.specTableRowsAr || []).map((row, rowIndex) => (
                                  <tr key={`spec-ar-row-${rowIndex}`}>
                                    {(productInfo.specTableColumnsAr || ['الخاصية', 'القيمة']).map((_, colIndex) => (
                                      <td key={`spec-ar-cell-${rowIndex}-${colIndex}`} className="border-t border-amber-100 p-2 min-w-[180px]">
                                        <input
                                          type="text"
                                          value={Array.isArray(row) ? (row[colIndex] || '') : ''}
                                          onChange={(e) => setProductInfo((prev) => {
                                            const nextRows = [...(prev.specTableRowsAr || [])]
                                            const targetRow = Array.isArray(nextRows[rowIndex]) ? [...nextRows[rowIndex]] : Array((prev.specTableColumnsAr || []).length).fill('')
                                            targetRow[colIndex] = e.target.value
                                            nextRows[rowIndex] = targetRow
                                            return { ...prev, specTableRowsAr: nextRows }
                                          })}
                                          dir="rtl"
                                          className="w-full rounded border border-amber-200 px-2 py-1 text-xs text-right"
                                          placeholder={`صف ${rowIndex + 1}، عمود ${colIndex + 1}`}
                                        />
                                      </td>
                                    ))}
                                    <td className="border-t border-amber-100 p-2 w-10 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setProductInfo((prev) => ({
                                          ...prev,
                                          specTableRowsAr: removeSpecTableRowAt(prev.specTableRowsAr, rowIndex),
                                        }))}
                                        disabled={(productInfo.specTableRowsAr || []).length <= 1}
                                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                        title="حذف الصف"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Spec Table */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">Spec Table</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">{productInfo.specTableEnabled ? 'Enabled' : 'Disabled'}</span>
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${productInfo.specTableEnabled ? 'bg-sky-200' : 'bg-slate-200'}`}>
                        <input type="checkbox" checked={productInfo.specTableEnabled || false} onChange={(e) => setProductInfo(p => ({ ...p, specTableEnabled: e.target.checked }))} className="sr-only" />
                        <div onClick={() => setProductInfo(p => ({ ...p, specTableEnabled: !p.specTableEnabled }))} className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform cursor-pointer ${productInfo.specTableEnabled ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                      </div>
                    </label>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Table Title:</label>
                        <input type="text" value={productInfo.specTableTitle || ''} onChange={(e) => setProductInfo(p => ({ ...p, specTableTitle: e.target.value }))} className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-200" placeholder="e.g. Product information" />
                    </div>
                    {productInfo.specTableEnabled ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setProductInfo((prev) => ({
                                        ...prev,
                                        specTableColumns: [...(prev.specTableColumns || []), `Column ${(prev.specTableColumns || []).length + 1}`],
                                        specTableRows: (prev.specTableRows || []).map((row) => ([...(Array.isArray(row) ? row : []), '']))
                                    }))}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-blue-100 hover:bg-blue-200 text-blue-800"
                                >
                                    + Add Column
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProductInfo((prev) => {
                                        const colCount = Math.max((prev.specTableColumns || []).length, 1)
                                        return {
                                            ...prev,
                                            specTableRows: [...(prev.specTableRows || []), Array(colCount).fill('')]
                                        }
                                    })}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-blue-100 hover:bg-blue-200 text-blue-800"
                                >
                                    + Add Row
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProductInfo((prev) => {
                                        const nextColumns = (prev.specTableColumns || []).length > 1
                                            ? prev.specTableColumns.slice(0, -1)
                                            : prev.specTableColumns
                                        const nextRows = (prev.specTableRows || []).map((row) => (
                                            Array.isArray(row) && row.length > 1 ? row.slice(0, -1) : row
                                        ))
                                        return {
                                            ...prev,
                                            specTableColumns: nextColumns,
                                            specTableRows: nextRows
                                        }
                                    })}
                                    disabled={(productInfo.specTableColumns || []).length <= 1}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40"
                                >
                                    - Remove Last Column
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProductInfo((prev) => ({
                                        ...prev,
                                        specTableRows: (prev.specTableRows || []).length > 1 ? prev.specTableRows.slice(0, -1) : prev.specTableRows
                                    }))}
                                    disabled={(productInfo.specTableRows || []).length <= 1}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40"
                                >
                                    - Remove Last Row
                                </button>
                            </div>

                            <div className="overflow-x-auto rounded border border-slate-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            {(productInfo.specTableColumns || []).map((col, colIndex) => (
                                                <th key={`spec-col-${colIndex}`} className="border-b border-slate-200 p-2 min-w-[180px]">
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={col || ''}
                                                            onChange={(e) => setProductInfo((prev) => {
                                                                const nextColumns = [...(prev.specTableColumns || [])]
                                                                nextColumns[colIndex] = e.target.value
                                                                return { ...prev, specTableColumns: nextColumns }
                                                            })}
                                                            className="w-full min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium"
                                                            placeholder={`Column ${colIndex + 1}`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setProductInfo((prev) => {
                                                                const { columns, rows } = removeSpecTableColumnAt(
                                                                    prev.specTableColumns,
                                                                    prev.specTableRows,
                                                                    colIndex,
                                                                )
                                                                return { ...prev, specTableColumns: columns, specTableRows: rows }
                                                            })}
                                                            disabled={(productInfo.specTableColumns || []).length <= 1}
                                                            className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                                            title="Delete column"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="border-b border-slate-200 p-2 w-10" aria-label="Delete row" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(productInfo.specTableRows || []).map((row, rowIndex) => (
                                            <tr key={`spec-row-${rowIndex}`} className="odd:bg-white even:bg-slate-50">
                                                {(productInfo.specTableColumns || []).map((_, colIndex) => (
                                                    <td key={`spec-cell-${rowIndex}-${colIndex}`} className="border-t border-slate-200 p-2 min-w-[180px]">
                                                        <input
                                                            type="text"
                                                            value={Array.isArray(row) ? (row[colIndex] || '') : ''}
                                                            onChange={(e) => setProductInfo((prev) => {
                                                                const nextRows = [...(prev.specTableRows || [])]
                                                                const targetRow = Array.isArray(nextRows[rowIndex]) ? [...nextRows[rowIndex]] : Array((prev.specTableColumns || []).length).fill('')
                                                                targetRow[colIndex] = e.target.value
                                                                nextRows[rowIndex] = targetRow
                                                                return { ...prev, specTableRows: nextRows }
                                                            })}
                                                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                                            placeholder={`Row ${rowIndex + 1}, Col ${colIndex + 1}`}
                                                        />
                                                    </td>
                                                ))}
                                                <td className="border-t border-slate-200 p-2 w-10 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setProductInfo((prev) => ({
                                                            ...prev,
                                                            specTableRows: removeSpecTableRowAt(prev.specTableRows, rowIndex),
                                                        }))}
                                                        disabled={(productInfo.specTableRows || []).length <= 1}
                                                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                                        title="Delete row"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Toggle on to add a spec/details table to this product.</p>
                    )}
                    <div className="pt-2 border-t border-gray-100">
                    <ShortDescriptionRichTextEditor
                        label="2nd Short Description (About this item)"
                        value={productInfo.shortDescription2 || ''}
                        onChange={(nextValue) => setProductInfo(prev => ({ ...prev, shortDescription2: nextValue }))}
                        placeholder="Optional: add bold text, bullet points, and links for About this item"
                    />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-500 uppercase tracking-wide">Full Description</label>
                  <RichTextDescriptionEditor
                    label=""
                    value={productInfo.description || ''}
                    onChange={(nextValue) => setProductInfo(prev => ({ ...prev, description: nextValue }))}
                    placeholder="Write a detailed product description..."
                    getAuthTokenOrThrow={getAuthTokenOrThrow}
                  />
                </div>
                  </div>
                </FormSection>

                <FormSection id="section-advanced" title="Tags, SEO & Badges" icon="🔧" subtitle="Optional — tags, search metadata, and promotional badges" defaultOpen={isEditing}>
                  <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-500 uppercase tracking-wide">Product Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const nextTags = parseTagList(tagInput); if (nextTags.length === 0) return; setProductInfo(prev => ({ ...prev, tags: appendUniqueTags(prev.tags || [], nextTags) })); setTagInput('') } }} onBlur={() => { const nextTags = parseTagList(tagInput); if (nextTags.length === 0) return; setProductInfo(prev => ({ ...prev, tags: appendUniqueTags(prev.tags || [], nextTags) })); setTagInput('') }} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-200" placeholder="Type tags, press comma or Enter" />
                    <button type="button" onClick={() => { const nextTags = parseTagList(tagInput); if (nextTags.length === 0) return; setProductInfo(prev => ({ ...prev, tags: appendUniqueTags(prev.tags || [], nextTags) })); setTagInput('') }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">Add</button>
                  </div>
                  {productInfo.tags && productInfo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {productInfo.tags.map((tag, idx) => (<span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-800 border border-green-200">{tag}<button type="button" onClick={() => setProductInfo(prev => ({ ...prev, tags: prev.tags.filter((_, i) => i !== idx) }))} className="ml-1 text-green-500 hover:text-green-900 font-bold">×</button></span>))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">SEO</label>
                        <div><label className="block text-xs font-medium mb-1 text-gray-500">Meta Title</label><input name="seoTitle" value={productInfo.seoTitle || ''} onChange={onChangeHandler} maxLength={120} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-200" placeholder="SEO title" /></div>
                        <div><label className="block text-xs font-medium mb-1 text-gray-500">Meta Description</label><textarea name="seoDescription" value={productInfo.seoDescription || ''} onChange={onChangeHandler} maxLength={320} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-200" placeholder="SEO description" /></div>
                        <div>
                            <label className="block text-xs font-medium mb-1 text-gray-500">Meta Keywords</label>
                            <div className="flex gap-2 mb-2">
                                <input type="text" value={seoKeywordInput} onChange={(e) => setSeoKeywordInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const kw = parseTagList(seoKeywordInput); if (!kw.length) return; setProductInfo((prev) => ({ ...prev, seoKeywords: appendUniqueTags(prev.seoKeywords || [], kw) })); setSeoKeywordInput('') } }} onBlur={() => { const kw = parseTagList(seoKeywordInput); if (!kw.length) return; setProductInfo((prev) => ({ ...prev, seoKeywords: appendUniqueTags(prev.seoKeywords || [], kw) })); setSeoKeywordInput('') }} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-200" placeholder="Keywords, comma or Enter" />
                                <button type="button" onClick={() => { const kw = parseTagList(seoKeywordInput); if (!kw.length) return; setProductInfo((prev) => ({ ...prev, seoKeywords: appendUniqueTags(prev.seoKeywords || [], kw) })); setSeoKeywordInput('') }} className="px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 font-medium">Add</button>
                            </div>
                            {Array.isArray(productInfo.seoKeywords) && productInfo.seoKeywords.length > 0 && (<div className="flex flex-wrap gap-1">{productInfo.seoKeywords.map((keyword, idx) => (<span key={`${keyword}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-xs text-cyan-800">{keyword}<button type="button" onClick={() => setProductInfo((prev) => ({ ...prev, seoKeywords: prev.seoKeywords.filter((_, i) => i !== idx) }))} className="font-bold text-cyan-600 hover:text-cyan-900">×</button></span>))}</div>)}
                        </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-semibold mb-2 text-gray-500 uppercase tracking-wide">Product Badges</label>
                  <div className="flex flex-wrap gap-2">
                    {availableBadgeOptions.map((badge) => (<button key={badge} type="button" onClick={() => { if (productInfo.badges.includes(badge)) { setProductInfo(prev => ({ ...prev, badges: prev.badges.filter(b => b !== badge) })) } else { setProductInfo(prev => ({ ...prev, badges: [...prev.badges, badge] })) } }} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${productInfo.badges.includes(badge) ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{productInfo.badges.includes(badge) ? '✓ ' : ''}{badge}</button>))}
                  </div>
                </div>
                  </div>
                </FormSection>

                </div>{/* END LEFT COLUMN */}

                {/* RIGHT COLUMN */}
                <div className="space-y-4 order-1 xl:order-2">
                <FormSection id="section-media" title="Product Media" icon="🖼️" subtitle={`Up to ${MAX_PRODUCT_MEDIA} images or videos — upload before using AI auto-fill`} defaultOpen>
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                        <span className="text-gray-700 font-medium">Image Aspect Ratio:</span>
                        {aspectRatioOptions.map((ratio) => (
                            <button
                                key={ratio}
                                type="button"
                                onClick={() => setProductInfo(prev => ({ ...prev, imageAspectRatio: ratio }))}
                                className={`px-3 py-1 rounded-full border transition text-xs font-semibold ${
                                    productInfo.imageAspectRatio === ratio
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {ratio}
                            </button>
                        ))}
                        <span className="text-xs text-gray-500">Pick how product images render on the product page.</span>
                    </div>
                    {hasPrimaryVideoWithPoster ? (
                        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                            <label className="flex items-start gap-2 text-sm text-gray-800">
                                <input
                                    type="checkbox"
                                    checked={productInfo.cardVideoPreviewEnabled !== false}
                                    onChange={(e) => setProductInfo((prev) => ({
                                        ...prev,
                                        cardVideoPreviewEnabled: e.target.checked,
                                    }))}
                                    className="mt-0.5"
                                />
                                <span>
                                    <span className="font-semibold">Delay video on product cards</span>
                                    <span className="mt-1 block text-xs text-gray-600">
                                        Show Media 2 first on cards across the website. After the video finishes loading, wait then autoplay the video.
                                    </span>
                                </span>
                            </label>
                            {productInfo.cardVideoPreviewEnabled !== false ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                                    <label htmlFor="cardVideoPreviewDelaySec" className="font-medium text-gray-700">
                                        Delay after video loads (seconds)
                                    </label>
                                    <input
                                        id="cardVideoPreviewDelaySec"
                                        type="number"
                                        min={0}
                                        max={120}
                                        value={productInfo.cardVideoPreviewDelaySec ?? 24}
                                        onChange={(e) => setProductInfo((prev) => ({
                                            ...prev,
                                            cardVideoPreviewDelaySec: Math.min(120, Math.max(0, Number(e.target.value) || 0)),
                                        }))}
                                        className="w-24 rounded-md border border-gray-300 px-3 py-1.5"
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <p className="mb-3 text-xs text-slate-500">
                        Drag media to reorder. Slot 1 is the main product image.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.keys(images).map((key) => {
                            const img = images[key]
                            const hasImage = img && (img.preview || typeof img === 'string')
                            const mediaSrc = img?.preview || img
                            const isVideo = Boolean(hasImage && ((typeof img === 'string' && isVideoSource(img)) || img?.type === 'video' || isVideoSource(mediaSrc)))
                            const mediaAspectClass = getProductImageAspectRatioClass(productInfo.imageAspectRatio)
                            const isDragging = draggingMediaKey === key
                            const isDropTarget = dragOverMediaKey === key && draggingMediaKey && draggingMediaKey !== key
                            return (
                                <div
                                    key={key}
                                    draggable={Boolean(hasImage)}
                                    onDragStart={(e) => {
                                        if (!hasImage) {
                                            e.preventDefault()
                                            return
                                        }
                                        e.dataTransfer.setData('text/plain', key)
                                        e.dataTransfer.effectAllowed = 'move'
                                        setDraggingMediaKey(key)
                                    }}
                                    onDragEnd={() => {
                                        setDraggingMediaKey(null)
                                        setDragOverMediaKey(null)
                                    }}
                                    onDragOver={(e) => {
                                        if (!draggingMediaKey) return
                                        e.preventDefault()
                                        e.dataTransfer.dropEffect = 'move'
                                        if (dragOverMediaKey !== key) setDragOverMediaKey(key)
                                    }}
                                    onDragLeave={() => {
                                        if (dragOverMediaKey === key) setDragOverMediaKey(null)
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        const fromKey = e.dataTransfer.getData('text/plain') || draggingMediaKey
                                        handleImageReorder(fromKey, key)
                                        setDraggingMediaKey(null)
                                        setDragOverMediaKey(null)
                                    }}
                                    className={`relative border rounded flex items-center justify-center w-full ${mediaAspectClass} bg-gray-50 hover:bg-gray-100 overflow-hidden group transition ${
                                        hasImage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                    } ${isDragging ? 'opacity-50 ring-2 ring-blue-300' : ''} ${
                                        isDropTarget ? 'ring-2 ring-blue-500 border-blue-400' : ''
                                    }`}
                                >
                                    {hasImage ? (
                                        <div
                                            className="absolute left-2 top-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white pointer-events-none"
                                            title="Drag to reorder"
                                        >
                                            Drag
                                        </div>
                                    ) : null}
                                    <label className="absolute inset-0 w-full h-full cursor-pointer">
                                        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e)=> e.target.files && handleImageUpload(key, e.target.files[0])} />
                                        {hasImage ? (
                                            <>
                                                {isVideo ? (
                                                    <video
                                                        src={mediaSrc}
                                                        className="h-full w-full object-cover pointer-events-none"
                                                        muted
                                                        loop
                                                        autoPlay
                                                        playsInline
                                                    />
                                                ) : (
                                                    <img
                                                        src={mediaSrc}
                                                        alt={`Product ${key}`}
                                                        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                                                        draggable={false}
                                                    />
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                    <span className="text-white text-sm">Change / Drag</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center">
                                                <span className="text-gray-400 text-sm">+ Media {key}</span>
                                            </div>
                                        )}
                                    </label>
                                    {hasImage && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleImageDelete(key)
                                            }}
                                            className="absolute top-2 right-2 z-10 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 focus:outline-none"
                                            title="Delete image"
                                        >
                                            &times;
                                        </button>
                                    )}
                                    <span className="absolute bottom-1.5 left-1.5 z-10 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 pointer-events-none">
                                        #{key}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </FormSection>

                </div>{/* END RIGHT COLUMN */}
                </div>{/* END TWO-COLUMN GRID */}

                <FormSection id="section-variants" title="Variants & Bundles" icon="🎨" subtitle="Size/color variants and bulk bundle pricing" defaultOpen={variantBundleMode !== 'none'}>
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Pricing mode</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {VARIANT_BUNDLE_MODE_OPTIONS.map((option) => {
                          const selected = variantBundleMode === option.id
                          const accent = option.id === 'matrix'
                            ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-200'
                            : option.id === 'bundles'
                              ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200'
                              : option.id === 'variants'
                                ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200'
                                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                          return (
                            <label
                              key={option.id}
                              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${selected ? accent : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                            >
                              <input
                                type="radio"
                                name="variantBundleMode"
                                checked={selected}
                                onChange={() => applyVariantBundleMode(option.id)}
                                className="mt-0.5 h-4 w-4 accent-indigo-600"
                              />
                              <div>
                                <span className="text-sm font-semibold text-slate-800">{option.label}</span>
                                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{option.description}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Switching modes keeps color and price values. Pack rows are cleared when you leave bundle or matrix mode so the selected mode saves correctly.
                      </p>
                    </div>

                    {variantBundleMode === 'bundles' ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-xs text-emerald-900">
                        <strong>Bundle-only mode.</strong> Customers pick Buy 1, Bundle of 2, etc. on the product page — same idea as choosing a size or color.
                      </div>
                    ) : null}

                    {variantBundleMode === 'matrix' ? (
                      <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-2.5 text-xs text-violet-900">
                        <strong>Variants + bundles.</strong> Both are enabled automatically. Add your color/size variants below, pack sizes above, then set price &amp; stock for each combination in the matrix.
                      </div>
                    ) : null}

                    {bulkEnabled && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 overflow-hidden">
                        <div className="px-4 py-3 border-b border-emerald-100 bg-white/80">
                          <h4 className="text-sm font-semibold text-slate-800">Bundle pricing rows</h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {hasVariants
                              ? 'Pack sizes (Pack of 1, Pack of 2, …) — combined with your product variants in the matrix below.'
                              : 'Customer-facing bundle options (Buy 1, Bundle of 2, …). Sale (AED) must be greater than 0 or the row will not be saved.'}
                          </p>
                        </div>
                        <div className="p-4 space-y-3 overflow-x-auto">
                          <div className="min-w-[860px] grid grid-cols-[88px_minmax(130px,1.2fr)_64px_100px_100px_72px_110px_64px] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
                            <div>Image</div>
                            <div>Label</div>
                            <div>Qty</div>
                            <div>Sale (AED)</div>
                            <div>Regular (AED)</div>
                            <div>Stock</div>
                            <div>Tag</div>
                            <div></div>
                          </div>
                          <div className="space-y-2">
                            {bulkOptions.map((b, idx) => {
                              const bulkImagePreview = b.image
                                || variantImageOptions.find((opt) => opt.slot === b.imageSlot)?.preview
                                || ''
                              return (
                              <div key={idx} className="min-w-[860px] grid grid-cols-[88px_minmax(130px,1.2fr)_64px_100px_100px_72px_110px_64px] gap-2 items-center">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="h-12 w-12 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                                    {bulkImagePreview ? (
                                      <Image
                                        src={bulkImagePreview}
                                        alt={`Bundle ${b.qty || idx + 1}`}
                                        width={48}
                                        height={48}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-slate-400 text-center leading-tight px-1">No image</span>
                                    )}
                                  </div>
                                  <select
                                    className="w-full border border-slate-200 rounded-md px-1 py-1 text-[10px] bg-white"
                                    value={b.imageSlot || ''}
                                    onChange={(e) => {
                                      const slot = e.target.value
                                      const selected = variantImageOptions.find((opt) => opt.slot === slot)
                                      const v = [...bulkOptions]
                                      v[idx] = {
                                        ...b,
                                        imageSlot: slot,
                                        image: selected?.persistentUrl || (slot ? b.image : ''),
                                      }
                                      if (!slot) {
                                        v[idx].image = ''
                                      }
                                      setBulkOptions(v)
                                    }}
                                  >
                                    <option value="">Media</option>
                                    {variantImageOptions.map((opt) => (
                                      <option key={opt.slot} value={opt.slot}>#{opt.slot}</option>
                                    ))}
                                  </select>
                                </div>
                                <input className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white" placeholder={hasVariants ? 'Pack of 1' : 'Buy 1 / Bundle of 2'} value={b.title || ''}
                                  onChange={(e) => { const v = [...bulkOptions]; v[idx] = { ...b, title: e.target.value }; setBulkOptions(v) }} />
                                <input className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white" type="number" min={1} value={b.qty}
                                  onChange={(e) => { const v = [...bulkOptions]; v[idx] = { ...b, qty: Number(e.target.value) }; setBulkOptions(v) }} />
                                <input className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed" type="number" step="0.01" placeholder="0.00" value={b.price}
                                  disabled={!canEditPricing}
                                  onChange={(e) => { markDirty(); const v = [...bulkOptions]; v[idx] = { ...b, price: parseOptionalPriceInput(e.target.value) }; setBulkOptions(v) }} />
                                <input className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed" type="number" step="0.01" placeholder="0.00" value={b.AED}
                                  disabled={!canEditPricing}
                                  onChange={(e) => { markDirty(); const v = [...bulkOptions]; v[idx] = { ...b, AED: parseOptionalPriceInput(e.target.value) }; setBulkOptions(v) }} />
                                <input className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white" type="number" placeholder="0" value={b.stock}
                                  onChange={(e) => { const v = [...bulkOptions]; v[idx] = { ...b, stock: Number(e.target.value) }; setBulkOptions(v) }} />
                                <select className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white" value={b.tag}
                                  onChange={(e) => { const v = [...bulkOptions]; v[idx] = { ...b, tag: e.target.value }; setBulkOptions(v) }}>
                                  <option value="">None</option>
                                  <option value="MOST_POPULAR">Most Popular</option>
                                  <option value="BEST_VALUE">Best Value</option>
                                </select>
                                <button type="button" className="text-xs font-medium text-red-600 hover:text-red-800 px-2" onClick={() => setBulkOptions(bulkOptions.filter((_, i) => i !== idx))}>Remove</button>
                              </div>
                            )})}
                          </div>
                          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50" onClick={() => {
                            const nextQty = bulkOptions.length
                              ? Math.max(...bulkOptions.map((b) => Number(b.qty) || 1)) + 1
                              : 1
                            setBulkOptions([...bulkOptions, buildBulkRow(nextQty, '', variantBundleMode === 'matrix')])
                          }}>+ Add bundle row</button>
                        </div>
                      </div>
                    )}

                    {hasVariants && (
                      <div className="space-y-4">
                        {bulkEnabled && (
                          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-2.5 text-xs text-violet-800">
                            Both <strong>Product variants</strong> and <strong>Bulk bundles</strong> are on. Define your color/size variants below and bundle tiers above, then set the price &amp; stock for each combination in the matrix at the bottom.
                          </div>
                        )}
                        {variants.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center">
                            <p className="text-sm text-slate-600">No variants yet. Add a variant title, a custom option (e.g. Storage → 128GB), and/or color and size.</p>
                          </div>
                        ) : null}

                        <div className="space-y-4">
                          {variants.map((v, idx) => (
                            <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">{idx + 1}</span>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-semibold text-slate-800 truncate">
                                      {getVariantCardLabel(v, idx)}
                                    </h4>
                                    {v.sku ? <p className="text-xs text-slate-500 truncate">SKU: {v.sku}</p> : null}
                                  </div>
                                </div>
                                <button type="button" className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100" onClick={() => setVariants(variants.filter((_, i) => i !== idx))}>Remove</button>
                              </div>

                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Variant title</label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g., Black - Large (optional display name)"
                                      value={v.options?.title || ''}
                                      onChange={(e) => { const nv = [...variants]; nv[idx] = { ...v, options: { ...(v.options || {}), title: e.target.value } }; setVariants(nv) }} />
                                    <p className="mt-1 text-[11px] text-slate-500">Optional label shown on the product page. You can also use the custom option fields below.</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">SKU</label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Optional"
                                      value={v.sku || ''}
                                      onChange={(e) => { const nv = [...variants]; nv[idx] = { ...v, sku: e.target.value }; setVariants(nv) }} />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Stock</label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0" type="number"
                                      value={v.stock ?? 0}
                                      onChange={(e) => { const nv = [...variants]; nv[idx] = { ...v, stock: Number(e.target.value) }; setVariants(nv) }} />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Group name</label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g., Battery, Storage, Model"
                                      value={v.options?.optionLabel || ''}
                                      onChange={(e) => updateVariantOptionField(idx, 'optionLabel', e.target.value)} />
                                    <p className="mt-1 text-[11px] text-slate-400">Heading above the buttons (same for all variants).</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Choice shown to customer</label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g., Single Battery, Double Battery"
                                      value={v.options?.option || ''}
                                      onChange={(e) => updateVariantOptionField(idx, 'option', e.target.value)} />
                                    <p className="mt-1 text-[11px] text-slate-400">This is what appears as the selectable option on the product page.</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Color <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Black, White..."
                                      value={v.options?.color || ''}
                                      onChange={(e) => updateVariantOptionField(idx, 'color', e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Size <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" placeholder="S, M, L..."
                                      value={v.options?.size || ''}
                                      onChange={(e) => updateVariantOptionField(idx, 'size', e.target.value)} />
                                  </div>
                                </div>

                                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-3">
                                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Variant image</label>
                                  <div className="flex flex-col sm:flex-row gap-3">
                                    <select
                                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                                      value={v.options?.imageSlot || ''}
                                      onChange={(e) => {
                                        const slot = e.target.value
                                        const selected = variantImageOptions.find(opt => opt.slot === slot)
                                        const nextOptions = { ...(v.options || {}), imageSlot: slot }
                                        if (selected?.persistentUrl) {
                                          nextOptions.image = selected.persistentUrl
                                        } else if (!slot) {
                                          delete nextOptions.image
                                        }
                                        const nv = [...variants]
                                        nv[idx] = { ...v, options: nextOptions }
                                        setVariants(nv)
                                      }}
                                    >
                                      <option value="">Select from uploaded media</option>
                                      {variantImageOptions.map((opt) => (
                                        <option key={opt.slot} value={opt.slot}>Media {opt.slot}</option>
                                      ))}
                                    </select>
                                    {v.options?.imageSlot ? (
                                      <div className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-white">
                                        <Image
                                          src={variantImageOptions.find(opt => opt.slot === v.options?.imageSlot)?.preview || 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'}
                                          alt={`Variant ${idx + 1} preview`}
                                          width={64}
                                          height={64}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Or paste image URL (optional)"
                                    value={v.options?.image || ''}
                                    onChange={(e) => { const nv = [...variants]; nv[idx] = { ...v, options: { ...(v.options || {}), image: e.target.value } }; setVariants(nv) }} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Sale price (AED)</label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">AED</span>
                                      <input className="w-full border border-gray-200 rounded-lg pl-12 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:cursor-not-allowed" placeholder="0.00" type="number" step="0.01"
                                        value={v.price === '' || v.price == null ? '' : v.price}
                                        disabled={!canEditPricing}
                                        onChange={(e) => { markDirty(); const nv = [...variants]; nv[idx] = { ...v, price: parseOptionalPriceInput(e.target.value) }; setVariants(nv) }} />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-500 uppercase tracking-wide">Regular price (AED)</label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">AED</span>
                                      <input className="w-full border border-gray-200 rounded-lg pl-12 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 disabled:cursor-not-allowed" placeholder="0.00" type="number" step="0.01"
                                        value={v.AED === '' || v.AED == null ? '' : v.AED}
                                        disabled={!canEditPricing}
                                        onChange={(e) => { markDirty(); const nv = [...variants]; nv[idx] = { ...v, AED: parseOptionalPriceInput(e.target.value) }; setVariants(nv) }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition" onClick={() => setVariants([...variants, { options: {}, price: 0, AED: 0, stock: 0, sku: '' }])}>
                          <span className="text-lg leading-none">+</span> Add variant
                        </button>
                      </div>
                    )}

                    {hasVariants && bulkEnabled && (() => {
                      const baseRows = variants.filter((v) => VARIANT_MATRIX_SELECTION_FIELDS.some((f) => String(v?.options?.[f] || '').trim()))
                      const tiers = bulkOptions.filter((b) => Number(b.qty) > 0)
                      if (!baseRows.length || !tiers.length) return null
                      const setCell = (opts, qty, field, value) => {
                        markDirty()
                        const key = buildMatrixCellKey(opts, qty)
                        setMatrixCells((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
                      }
                      return (
                        <div className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
                          <div className="px-4 py-3 border-b border-violet-100 bg-white/80">
                            <h4 className="text-sm font-semibold text-slate-800">Bundle pricing per variant</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Each block is a product option (e.g. Buy 1, Buy 2). Inside it, set prices for <strong>Pack of 1</strong>, <strong>Pack of 2</strong>, etc. — how many units the customer gets per pack.</p>
                          </div>
                          <div className="p-4 space-y-3">
                            {baseRows.map((v, vi) => (
                              <div key={vi} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-700">
                                  Option: {getVariantCardLabel(v, vi)}
                                </div>
                                <div className="p-3 space-y-2">
                                  <div className="grid grid-cols-[minmax(90px,1fr)_100px_100px_84px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    <div>Pack size</div>
                                    <div>Sale (AED)</div>
                                    <div>Regular (AED)</div>
                                    <div>Stock</div>
                                  </div>
                                  {tiers.map((b, bi) => {
                                    const cell = matrixCells[buildMatrixCellKey(v.options, b.qty)] || {}
                                    const fallbackPrice = pickMatrixNumber(v.price, b.price)
                                    const fallbackAED = pickMatrixNumber(v.AED, b.AED, fallbackPrice)
                                    const fallbackStock = pickMatrixNumber(v.stock, b.stock, Number(productInfo.stockQuantity) || 0)
                                    return (
                                      <div key={bi} className="grid grid-cols-[minmax(90px,1fr)_100px_100px_84px] gap-2 items-center">
                                        <div className="text-xs font-medium text-slate-600 truncate">
                                          {formatMatrixPackSizeLabel(b.qty)}
                                          <span className="text-slate-400"> ({b.qty} unit{b.qty > 1 ? 's' : ''} each)</span>
                                        </div>
                                        <input type="number" step="0.01" placeholder="Sale" title={fallbackPrice > 0 ? `Inherits ${fallbackPrice} if blank` : undefined} className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white" value={cell.price ?? ''} onChange={(e) => setCell(v.options, b.qty, 'price', parseOptionalPriceInput(e.target.value))} />
                                        <input type="number" step="0.01" placeholder="Regular" title={fallbackAED > 0 ? `Inherits ${fallbackAED} if blank` : undefined} className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white" value={cell.AED ?? ''} onChange={(e) => setCell(v.options, b.qty, 'AED', parseOptionalPriceInput(e.target.value))} />
                                        <input type="number" placeholder={fallbackStock > 0 ? String(fallbackStock) : 'Stock'} className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white" value={cell.stock ?? ''} onChange={(e) => setCell(v.options, b.qty, 'stock', e.target.value === '' ? '' : Number(e.target.value))} />
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </FormSection>

                    <div className={`${isModal ? 'sticky bottom-0' : 'mt-2'} -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-white border-t border-slate-200 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end`}>
                        <button 
                            type="button" 
                            onClick={() => onClose ? onClose() : router.back()} 
                            className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                        >
                            Cancel
                        </button>
                        <button disabled={loading} className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition">
                            {loading ? 'Saving...' : (product ? 'Update Product' : 'Add Product')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
