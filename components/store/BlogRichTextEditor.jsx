'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Pilcrow,
  Strikethrough,
} from 'lucide-react'
import { compressImageForUpload } from '@/lib/compressImageForUpload'

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Poppins', value: 'var(--font-poppins), system-ui, sans-serif' },
  { label: 'Montserrat', value: 'var(--font-montserrat), system-ui, sans-serif' },
  { label: 'Shadows Into Light', value: 'var(--font-shadows-into-light), cursive' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", serif' },
  { label: 'Garamond', value: 'Garamond, Baskerville, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
]

const FONT_SIZES = ['', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px']

const FONT_WEIGHTS = [
  { label: 'Weight', value: '' },
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semi Bold', value: '600' },
  { label: 'Bold', value: '700' },
  { label: 'Extra Bold', value: '800' },
]

const FontFamily = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontFamily: {
        default: null,
        parseHTML: (element) => {
          const raw = element.style?.fontFamily || ''
          return raw.trim() || null
        },
        renderHTML: (attributes) => {
          if (!attributes.fontFamily) return {}
          return { style: `font-family: ${attributes.fontFamily}` }
        },
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style?.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {}
          return { style: `font-size: ${attributes.fontSize}` }
        },
      },
      fontWeight: {
        default: null,
        parseHTML: (element) => {
          const raw = element.style?.fontWeight || ''
          return raw.trim() || null
        },
        renderHTML: (attributes) => {
          if (!attributes.fontWeight) return {}
          return { style: `font-weight: ${attributes.fontWeight}` }
        },
      },
    }
  },
})

function patchTextStyle(editor, patch = {}, selection = null) {
  if (!editor) return

  // Restore the text range before applying — <select>/color steal focus and clear selection.
  if (selection && typeof selection.from === 'number' && typeof selection.to === 'number') {
    editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).run()
  } else {
    editor.chain().focus().run()
  }

  const { empty } = editor.state.selection
  // Inline styles need a highlighted word/range; empty caret only sets "next typed" style.
  if (empty && (patch.fontFamily !== undefined || patch.fontSize !== undefined || patch.fontWeight !== undefined)) {
    // Still allow stored marks for typing; do not expand to whole document.
  }

  const current = { ...(editor.getAttributes('textStyle') || {}) }
  Object.entries(patch).forEach(([key, value]) => {
    if (value == null || value === '') {
      delete current[key]
    } else {
      current[key] = value
    }
  })
  const keys = Object.keys(current).filter((key) => current[key] != null && current[key] !== '')
  if (!keys.length) {
    editor.chain().focus().unsetMark('textStyle').run()
    return
  }
  const next = {}
  keys.forEach((key) => {
    next[key] = current[key]
  })
  editor.chain().focus().setMark('textStyle', next).run()
}

const ALIGN_MARGIN = {
  left: 'margin-left: 0; margin-right: auto;',
  center: 'margin-left: auto; margin-right: auto;',
  right: 'margin-left: auto; margin-right: 0;',
}

function buildImageStyle(widthMode = 'full', align = 'left') {
  const mode = widthMode || 'full'
  const widthCss = mode === 'half'
    ? 'max-width: 50%; width: 50%;'
    : mode === 'third'
      ? 'max-width: 33.333%; width: 33.333%;'
      : 'max-width: 100%; width: 100%;'
  const alignKey = align === 'center' || align === 'right' ? align : 'left'
  // Full-width images always span the row; align only matters for half/third.
  const marginCss = mode === 'full' ? 'margin-left: 0; margin-right: 0;' : ALIGN_MARGIN[alignKey]
  return `${widthCss} height: auto; cursor: grab; display: block; ${marginCss}`
}

const BlogImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      widthMode: {
        default: 'full',
        parseHTML: (element) => {
          const data = element.getAttribute('data-width')
          if (data === 'half' || data === 'third' || data === 'full') return data
          const cls = String(element.getAttribute('class') || '')
          if (cls.includes('blog-img-half')) return 'half'
          if (cls.includes('blog-img-third')) return 'third'
          return 'full'
        },
        renderHTML: (attributes) => {
          const mode = attributes.widthMode || 'full'
          const align = attributes.align || 'left'
          return {
            'data-width': mode,
            'data-align': align,
            class: `blog-editor-image blog-img-${mode} blog-img-align-${align} rounded-lg h-auto my-3`,
            style: buildImageStyle(mode, align),
          }
        },
      },
      align: {
        default: 'left',
        parseHTML: (element) => {
          const data = element.getAttribute('data-align')
          if (data === 'left' || data === 'center' || data === 'right') return data
          const cls = String(element.getAttribute('class') || '')
          if (cls.includes('blog-img-align-center')) return 'center'
          if (cls.includes('blog-img-align-right')) return 'right'
          return 'left'
        },
        renderHTML: () => ({}),
      },
    }
  },
})

function applyImageLayout(editor, patch = {}) {
  if (!editor?.isActive('image')) return
  const current = editor.getAttributes('image') || {}
  const widthMode = patch.widthMode || current.widthMode || 'full'
  const align = patch.align || current.align || 'left'
  editor.chain().focus().updateAttributes('image', {
    widthMode,
    align,
  }).run()
}

async function uploadBlogImage(file, getToken) {
  const token = await getToken()
  if (!token) throw new Error('Please sign in again to upload')
  const compressed = await compressImageForUpload(file, {
    maxBytes: 4 * 1024 * 1024,
    preserveTransparency: true,
  })
  const formData = new FormData()
  formData.append('image', compressed)
  formData.append('type', 'blog')
  const response = await fetch('/api/store/upload-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || 'Image upload failed')
  }
  return data.url
}

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || !onClick}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
        active
          ? 'bg-sky-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

/**
 * TipTap blog body editor: headings, fonts, color, align, lists, links,
 * S3 image upload, and drag-to-reorder images inside the description.
 */
export default function BlogRichTextEditor({
  value = '',
  onChange,
  placeholder = 'Write your blog post…',
  getToken,
  dir = 'ltr',
  minHeightClass = 'min-h-[280px]',
}) {
  const fileInputRef = useRef(null)
  const savedSelectionRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      FontFamily,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      BlogImage.configure({
        allowBase64: false,
        inline: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `prose prose-slate max-w-none focus:outline-none ${minHeightClass} px-3 py-3`,
        dir,
      },
      handleDrop: (view, event, _slice, moved) => {
        // Allow native node drag (images) to reorder; only intercept file drops for upload.
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
        if (!files.length || !getToken) return false
        event.preventDefault()
        ;(async () => {
          try {
            setUploading(true)
            const url = await uploadBlogImage(files[0], getToken)
            const { schema } = view.state
            const node = schema.nodes.image.create({
              src: url,
              alt: files[0].name,
              widthMode: 'full',
            })
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            if (pos == null) return
            const tr = view.state.tr.insert(pos, node)
            view.dispatch(tr)
          } catch (error) {
            console.error(error)
          } finally {
            setUploading(false)
          }
        })()
        return true
      },
    },
    onUpdate: ({ editor: active }) => {
      onChange?.(active.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    // Don't reset content while the user is editing — that wipes selection
    // and makes font/heading tools appear to restyle the whole description.
    if (editor.isFocused) return
    const next = value || ''
    const current = editor.getHTML()
    if (next && current !== next) {
      editor.commands.setContent(next, { emitUpdate: false })
    } else if (!next && current !== '<p></p>' && current !== '') {
      editor.commands.clearContent(false)
    }
  }, [value, editor])

  const rememberSelection = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    savedSelectionRef.current = { from, to }
  }, [editor])

  const runWithSelection = useCallback((commandFn) => {
    if (!editor) return
    const saved = savedSelectionRef.current
    if (saved && typeof saved.from === 'number' && typeof saved.to === 'number') {
      editor.chain().focus().setTextSelection({ from: saved.from, to: saved.to }).run()
    } else {
      editor.chain().focus().run()
    }
    commandFn(editor)
  }, [editor])

  const insertImage = useCallback(async (file) => {
    if (!file || !editor || !getToken) return
    try {
      setUploading(true)
      const url = await uploadBlogImage(file, getToken)
      editor.chain().focus().setImage({
        src: url,
        alt: file.name || 'Blog image',
        widthMode: 'full',
      }).run()
    } catch (error) {
      console.error(error)
      window.alert(error?.message || 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }, [editor, getToken])

  if (!editor) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 p-2">
        <ToolbarButton
          title="Paragraph (whole line)"
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 1 (whole line)"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2 (whole line)"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3 (whole line)"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <ToolbarButton
          title="Bold (selected text)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (selected text)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough (selected text)"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <select
          className="h-8 max-w-[150px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          title="Font family (select a word first)"
          value={editor.getAttributes('textStyle').fontFamily || ''}
          onMouseDown={rememberSelection}
          onFocus={rememberSelection}
          onChange={(e) => {
            const next = e.target.value
            patchTextStyle(editor, { fontFamily: next }, savedSelectionRef.current)
          }}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.label} value={font.value} style={font.value ? { fontFamily: font.value } : undefined}>
              {font.label}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          title="Font weight (select a word first)"
          value={String(editor.getAttributes('textStyle').fontWeight || '')}
          onMouseDown={rememberSelection}
          onFocus={rememberSelection}
          onChange={(e) => {
            patchTextStyle(editor, { fontWeight: e.target.value }, savedSelectionRef.current)
          }}
        >
          {FONT_WEIGHTS.map((weight) => (
            <option key={weight.label} value={weight.value} style={weight.value ? { fontWeight: weight.value } : undefined}>
              {weight.label}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          title="Font size (select a word first)"
          value={editor.getAttributes('textStyle').fontSize || ''}
          onMouseDown={rememberSelection}
          onFocus={rememberSelection}
          onChange={(e) => {
            patchTextStyle(editor, { fontSize: e.target.value }, savedSelectionRef.current)
          }}
        >
          {FONT_SIZES.map((size) => (
            <option key={size || 'default'} value={size}>{size || 'Size'}</option>
          ))}
        </select>

        <label
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          onMouseDown={rememberSelection}
        >
          Color
          <input
            type="color"
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            value={editor.getAttributes('textStyle').color || '#0f172a'}
            onFocus={rememberSelection}
            onChange={(e) => {
              runWithSelection((ed) => {
                ed.chain().focus().setColor(e.target.value).run()
              })
            }}
          />
        </label>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <ToolbarButton
          title="Align left"
          active={
            editor.isActive('image')
              ? (editor.getAttributes('image').align || 'left') === 'left'
              : editor.isActive({ textAlign: 'left' })
          }
          onClick={() => {
            if (editor.isActive('image')) {
              applyImageLayout(editor, { align: 'left' })
              return
            }
            editor.chain().focus().setTextAlign('left').run()
          }}
        >
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          active={
            editor.isActive('image')
              ? editor.getAttributes('image').align === 'center'
              : editor.isActive({ textAlign: 'center' })
          }
          onClick={() => {
            if (editor.isActive('image')) {
              // Half/third can float to center; full stays full-row
              const mode = editor.getAttributes('image').widthMode || 'full'
              if (mode === 'full') {
                applyImageLayout(editor, { widthMode: 'half', align: 'center' })
              } else {
                applyImageLayout(editor, { align: 'center' })
              }
              return
            }
            editor.chain().focus().setTextAlign('center').run()
          }}
        >
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={
            editor.isActive('image')
              ? editor.getAttributes('image').align === 'right'
              : editor.isActive({ textAlign: 'right' })
          }
          onClick={() => {
            if (editor.isActive('image')) {
              const mode = editor.getAttributes('image').widthMode || 'full'
              if (mode === 'full') {
                applyImageLayout(editor, { widthMode: 'half', align: 'right' })
              } else {
                applyImageLayout(editor, { align: 'right' })
              }
              return
            }
            editor.chain().focus().setTextAlign('right').run()
          }}
        >
          <AlignRight size={14} />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-300" />

        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive('link')}
          onClick={() => {
            const previous = editor.getAttributes('link').href
            const url = window.prompt('Link URL', previous || 'https://')
            if (url === null) return
            if (!url) {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
        >
          <Link2 size={14} />
        </ToolbarButton>

        <ToolbarButton
          title="Upload image to S3"
          disabled={uploading || !getToken}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) insertImage(file)
          }}
        />

        {editor.isActive('image') ? (
          <>
            <span className="mx-1 h-5 w-px bg-slate-300" />
            <span className="px-1 text-[10px] font-semibold uppercase text-slate-500">Image</span>
            {[
              { mode: 'full', label: 'Full' },
              { mode: 'half', label: '½' },
              { mode: 'third', label: '⅓' },
            ].map(({ mode, label }) => (
              <ToolbarButton
                key={mode}
                title={`${label} width`}
                active={editor.getAttributes('image').widthMode === mode
                  || (!editor.getAttributes('image').widthMode && mode === 'full')}
                onClick={() => applyImageLayout(editor, { widthMode: mode })}
              >
                {label}
              </ToolbarButton>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-300" />
            {[
              { align: 'left', Icon: AlignLeft, title: 'Image left' },
              { align: 'center', Icon: AlignCenter, title: 'Image center' },
              { align: 'right', Icon: AlignRight, title: 'Image right' },
            ].map(({ align, Icon, title }) => (
              <ToolbarButton
                key={align}
                title={title}
                active={(editor.getAttributes('image').align || 'left') === align}
                onClick={() => {
                  const mode = editor.getAttributes('image').widthMode || 'full'
                  if (mode === 'full' && align !== 'left') {
                    applyImageLayout(editor, { widthMode: 'half', align })
                  } else {
                    applyImageLayout(editor, { align })
                  }
                }}
              >
                <Icon size={14} />
              </ToolbarButton>
            ))}
          </>
        ) : null}
      </div>

      <EditorContent editor={editor} />
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        Select a word for font family / weight / size / color. H1–H3 apply to the whole line.
        Select an image → set Full / ½ / ⅓ width, then Left / Center / Right. (Center/Right need ½ or ⅓ width.)
        Drag to reorder. Drop a file to upload to S3.
      </p>
    </div>
  )
}
