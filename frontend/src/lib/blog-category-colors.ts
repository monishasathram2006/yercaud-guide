// Blog categories carry no color of their own (schema is just {id, name, slug}),
// but the reference design gives each one a distinct label color. Deterministic
// by id, so a category always renders the same color everywhere it appears —
// no color column, no admin UI to manage one, just a stable hash into a fixed
// palette. Full class strings, not composed at runtime — Tailwind only picks
// up classes it can see literally in source.
const PALETTE = [
  { text: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  { text: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" },
  { text: "text-teal-700", bg: "bg-teal-50", dot: "bg-teal-500" },
  { text: "text-rose-700", bg: "bg-rose-50", dot: "bg-rose-500" },
  { text: "text-purple-700", bg: "bg-purple-50", dot: "bg-purple-500" },
  { text: "text-lime-700", bg: "bg-lime-50", dot: "bg-lime-500" },
  { text: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-500" },
  { text: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
] as const;

export function categoryColor(id: string): (typeof PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
