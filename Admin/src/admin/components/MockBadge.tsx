import type { ReactNode } from "react";

/**
 * Dev-time markers for UI that is NOT wired to the backend — the Admin twin of
 * frontend/src/components/MockBadge.tsx. Pages.tsx holds whole pages of static
 * demo data (kept by ADR-0001/0002); those get the full-width MockPageBanner,
 * while Mock/MockBadge overlay individual sections on otherwise-wired pages.
 *
 * Hidden in production builds; set VITE_SHOW_MOCK_BADGES=true to force it on.
 */
const SHOW = import.meta.env.DEV || import.meta.env.VITE_SHOW_MOCK_BADGES === "true";

/** Full-width strip for pages that are entirely demo data. Place after PageHeader. */
export function MockPageBanner({ note }: { note: string }) {
  if (!SHOW) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">Mock</span>
      <span>{note}</span>
    </div>
  );
}

/** Drop inside any `relative` container to badge it without changing layout. */
export function MockBadge({ note, className = "" }: { note?: string; className?: string }) {
  if (!SHOW) return null;
  return (
    <span
      title={note ?? "Mock — not wired to the backend yet"}
      className={`absolute right-2 top-2 z-40 cursor-help rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-md ${className}`}
    >
      Mock
    </span>
  );
}

/** Wraps a section in a relative div with the badge and a dashed red outline. */
export function Mock({ children, note, className = "" }: { children: ReactNode; note?: string; className?: string }) {
  if (!SHOW) return <>{children}</>;
  return (
    <div className={`relative ${className}`}>
      {children}
      <MockBadge note={note} />
      <div className="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-red-400/60" />
    </div>
  );
}
