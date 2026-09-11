'use client';

import { Loader2 } from 'lucide-react';

/** Keep spinner + idle icon mounted so React never insertBefore-swaps SVGs. */
export default function BusyButtonIcon({
  busy = false,
  icon: IdleIcon,
  size = 16,
  className = '',
}) {
  if (!IdleIcon) return null;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Loader2
        size={size}
        className={`absolute animate-spin ${busy ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!busy}
      />
      <IdleIcon
        size={size}
        className={busy ? 'pointer-events-none opacity-0' : 'opacity-100'}
        aria-hidden={busy}
      />
    </span>
  );
}
