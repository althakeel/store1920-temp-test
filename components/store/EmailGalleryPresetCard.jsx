'use client';

import { Eye, Mail, Sparkles, Calendar, Smartphone, Heart, RefreshCw, BookOpen, Scissors, MapPin, Gift, Bell, Package, PenLine } from 'lucide-react';
import { GALLERY_UI_LABELS, resolveGalleryUiStyle } from '@/lib/emailGalleryCardStyles';

function Media({ src, color, alt = '', className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling;
          if (fallback) fallback.classList.remove('hidden');
        }}
      />
    );
  }
  return null;
}

function ColorFallback({ color, name, className = '' }) {
  return (
    <div
      className={`hidden absolute inset-0 flex items-end p-3 ${className}`}
      style={{ background: `linear-gradient(145deg, ${color || '#0f766e'}, #0f172a)` }}
      data-fallback
    >
      <span className="text-sm font-bold text-white">{name}</span>
    </div>
  );
}

function ActionOverlay({ onCreate, onCustomize, onPreview }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/60 opacity-0 transition group-hover:opacity-100">
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow"
      >
        Create email
      </button>
      <button type="button" onClick={onCustomize} className="text-sm font-medium text-white underline">
        Customize
      </button>
      <button
        type="button"
        onClick={onPreview}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/30"
      >
        <Eye className="h-3.5 w-3.5" /> Preview
      </button>
    </div>
  );
}

function MetaRow({ styleKey, category }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-800 ring-1 ring-teal-100">
        {GALLERY_UI_LABELS[styleKey] || 'Email'}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{category}</span>
    </div>
  );
}

export default function EmailGalleryPresetCard({
  preset,
  onCreate,
  onCustomize,
  onPreview,
}) {
  const style = preset.uiStyle || resolveGalleryUiStyle(preset);
  const color = preset.thumbnailColor || '#0f766e';
  const image = preset.thumbnailImage || '';
  const name = preset.name || 'Template';
  const subject = preset.subject || '';

  const actions = {
    onCreate,
    onCustomize,
    onPreview,
  };

  if (style === 'sale') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
        <div className="relative h-52 overflow-hidden bg-red-950">
          <Media src={image} className="absolute inset-0 h-full w-full object-cover opacity-80" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute inset-0 bg-gradient-to-t from-red-950 via-red-900/40 to-transparent" />
          <div className="absolute start-3 top-3 rounded-md bg-amber-400 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-950">
            Limited
          </div>
          <div className="absolute bottom-3 start-3 end-3 text-white">
            <div className="text-3xl font-black tracking-tight drop-shadow">SALE</div>
            <div className="mt-0.5 text-sm font-semibold">{name}</div>
            <div className="mt-1 line-clamp-1 text-[11px] text-white/80">{subject}</div>
          </div>
          <ActionOverlay {...actions} />
        </div>
        <div className="flex items-center justify-between gap-2 bg-red-600 px-3 py-2 text-white">
          <span className="text-xs font-bold uppercase tracking-wide">Shop the deal</span>
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  if (style === 'welcome') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-sm">
        <div className="grid grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-between p-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Welcome</div>
              <div className="mt-2 text-lg font-bold leading-tight text-slate-900">{name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-600">{subject}</div>
            </div>
            <MetaRow styleKey={style} category={preset.category} />
          </div>
          <div className="relative min-h-[180px]">
            <Media src={image} className="absolute inset-0 h-full w-full object-cover" />
            <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
            <ActionOverlay {...actions} />
          </div>
        </div>
      </div>
    );
  }

  if (style === 'invite') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-violet-200 bg-slate-950 text-white shadow-sm">
        <div className="relative h-44">
          <Media src={image} className="absolute inset-0 h-full w-full object-cover opacity-50" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute inset-0 bg-gradient-to-b from-violet-950/30 via-transparent to-slate-950" />
          <ActionOverlay {...actions} />
        </div>
        <div className="space-y-2 px-4 pb-4 pt-1 text-center">
          <Calendar className="mx-auto h-4 w-4 text-violet-300" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">You are invited</div>
          <div className="font-serif text-xl font-semibold tracking-tight">{name}</div>
          <div className="line-clamp-2 text-xs text-slate-300">{subject}</div>
          <div className="pt-1 text-[10px] text-slate-400">{preset.category}</div>
        </div>
      </div>
    );
  }

  if (style === 'sms') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-teal-200 bg-teal-950 p-3 shadow-sm">
        <div className="relative mx-auto max-w-[200px] overflow-hidden rounded-[1.4rem] border-[3px] border-slate-800 bg-white shadow-lg">
          <div className="flex items-center justify-between bg-teal-700 px-3 py-2 text-[10px] font-semibold text-white">
            <Smartphone className="h-3 w-3" />
            SMS alert
          </div>
          <div className="relative h-28">
            <Media src={image} className="h-full w-full object-cover" />
            <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          </div>
          <div className="space-y-1 p-3">
            <div className="text-sm font-bold text-slate-900">{name}</div>
            <div className="line-clamp-2 text-[11px] text-slate-500">{subject}</div>
          </div>
          <ActionOverlay {...actions} />
        </div>
        <div className="mt-2 text-center text-[10px] font-medium text-teal-100/80">{preset.category}</div>
      </div>
    );
  }

  if (style === 'editorial') {
    return (
      <div className="group relative overflow-hidden rounded-none border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-900 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-900">Lookbook</span>
            <BookOpen className="h-3.5 w-3.5 text-slate-500" />
          </div>
        </div>
        <div className="relative h-40 overflow-hidden bg-slate-100">
          <Media src={image} className="h-full w-full object-cover grayscale-[20%] transition duration-500 group-hover:scale-105 group-hover:grayscale-0" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <ActionOverlay {...actions} />
        </div>
        <div className="space-y-1.5 border-t border-slate-200 p-3">
          <div className="font-serif text-lg leading-tight text-slate-900">{name}</div>
          <div className="line-clamp-2 text-xs leading-relaxed text-slate-500">{subject}</div>
          <MetaRow styleKey={style} category={preset.category} />
        </div>
      </div>
    );
  }

  if (style === 'thanks') {
    return (
      <div className="group relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 text-center shadow-sm">
        <Heart className="mx-auto h-5 w-5 text-rose-500" />
        <div className="relative mx-auto mt-3 h-28 w-28 overflow-hidden rounded-full ring-4 ring-white shadow">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
        </div>
        <div className="mt-3 text-base font-bold text-slate-900">{name}</div>
        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{subject}</div>
        <div className="mt-3">
          <MetaRow styleKey={style} category={preset.category} />
        </div>
        <ActionOverlay {...actions} />
      </div>
    );
  }

  if (style === 'txn') {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
          <RefreshCw className="h-3.5 w-3.5 text-teal-700" />
          <span className="text-[11px] font-semibold text-slate-700">Customer nudge</span>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-3 p-3">
          <div className="relative h-20 overflow-hidden rounded-lg bg-slate-100">
            <Media src={image} className="h-full w-full object-cover" />
            <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">{name}</div>
            <div className="mt-1 line-clamp-2 text-xs text-slate-500">{subject}</div>
            <div className="mt-2">
              <MetaRow styleKey={style} category={preset.category} />
            </div>
          </div>
        </div>
        <ActionOverlay {...actions} />
      </div>
    );
  }

  if (style === 'service') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
        <div className="relative h-36">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute inset-0 bg-indigo-950/35" />
          <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-indigo-800">
            <Scissors className="h-3 w-3" /> Bookable
          </div>
          <ActionOverlay {...actions} />
        </div>
        <div className="space-y-1 p-3">
          <div className="text-sm font-bold text-slate-900">{name}</div>
          <div className="line-clamp-2 text-xs text-slate-500">{subject}</div>
          <div className="pt-1 text-[11px] font-semibold text-indigo-700">Reserve a session →</div>
        </div>
      </div>
    );
  }

  if (style === 'locale') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm">
        <div className="relative h-48">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/80 via-transparent to-transparent" />
          <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-cyan-900">
            <MapPin className="h-3 w-3" /> UAE
          </div>
          <div className="absolute bottom-3 start-3 end-3 text-white">
            <div className="text-base font-bold">{name}</div>
            <div className="line-clamp-1 text-xs text-white/80">{subject}</div>
          </div>
          <ActionOverlay {...actions} />
        </div>
      </div>
    );
  }

  if (style === 'bundle') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 shadow-sm">
        <div className="relative h-40 overflow-hidden">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute end-3 top-3 rounded-full bg-fuchsia-600 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            Bundle
          </div>
          <ActionOverlay {...actions} />
        </div>
        <div className="flex items-start gap-2 p-3">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-700" />
          <div>
            <div className="text-sm font-bold text-slate-900">{name}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subject}</div>
          </div>
        </div>
      </div>
    );
  }

  if (style === 'restock') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm">
        <div className="relative h-44">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <div className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[10px] font-black uppercase text-white">
            <Bell className="h-3 w-3" /> Back
          </div>
          <ActionOverlay {...actions} />
        </div>
        <div className="border-t-4 border-green-500 p-3">
          <div className="text-sm font-bold text-slate-900">{name}</div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-500">{subject}</div>
        </div>
      </div>
    );
  }

  if (style === 'product') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
        <div className="relative h-40 bg-slate-100">
          <Media src={image} className="h-full w-full object-cover" />
          <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
          <ActionOverlay {...actions} />
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{name}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subject}</div>
            </div>
            <Package className="h-4 w-4 shrink-0 text-blue-600" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px]">
            <span className="font-medium text-blue-900">Merchandising</span>
            <span className="font-bold text-blue-700">Shop →</span>
          </div>
        </div>
      </div>
    );
  }

  if (style === 'blank') {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 shadow-sm">
        <div className="flex h-52 flex-col items-center justify-center gap-2 p-4 text-center">
          <PenLine className="h-8 w-8 text-slate-400" />
          <div className="text-sm font-bold text-slate-800">{name}</div>
          <div className="text-xs text-slate-500">Empty canvas — design your own</div>
          <button
            type="button"
            onClick={onCustomize}
            className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Start building
          </button>
          <button type="button" onClick={onPreview} className="text-[11px] font-medium text-slate-500 underline">
            Preview structure
          </button>
        </div>
      </div>
    );
  }

  // default
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-44 overflow-hidden bg-slate-200">
        <Media src={image} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <ColorFallback color={color} name={name} className={!image ? '!flex' : ''} />
        <ActionOverlay {...actions} />
      </div>
      <div className="space-y-2 p-3">
        <div className="font-semibold text-slate-900">{name}</div>
        <div className="line-clamp-1 text-xs text-slate-500">{subject}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5">
            <Mail className="h-3 w-3" /> Email
          </span>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800">Free</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{preset.category}</span>
        </div>
      </div>
    </div>
  );
}
