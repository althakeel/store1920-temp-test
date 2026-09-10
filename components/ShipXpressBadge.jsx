'use client';

import Link from 'next/link';

export default function ShipXpressBadge({
  href,
  interactive = false,
}) {
  const button = (
    <span className="shipxpress-link">
      <span className="shipxpress-brand">ShipXpress</span>
    </span>
  );

  if (interactive && href) {
    return (
      <Link href={href} className="shipxpress-wrap shipxpress-link-anchor group shrink-0" aria-label="ShipXpress">
        {button}
      </Link>
    );
  }

  return (
    <span className="shipxpress-wrap shipxpress-link-anchor pointer-events-none shrink-0">
      {button}
    </span>
  );
}
