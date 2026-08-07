import type { ReactNode } from "react";

/**
 * Dev-time overlay marking UI that is NOT wired to the backend — static data
 * from lib/data.ts, forms that fake success, dead buttons. Hover the badge to
 * see what's missing and which backend endpoint (if any) is ready for it.
 *
 * Hidden in production builds; set VITE_SHOW_MOCK_BADGES=true to force it on.
 */
const SHOW = import.meta.env.DEV || import.meta.env.VITE_SHOW_MOCK_BADGES === "true";

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
