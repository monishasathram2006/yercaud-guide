import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useListingNames } from "../queries";

/**
 * Search-and-select multi-picker over every Listing, backed by the same
 * useListingNames() map the admin already uses to resolve Listing names for
 * display (queries.ts) — no new endpoint, this is UI-only. Writes into
 * whichever id array the caller owns (placeListingIds on a Blog Post).
 */
export function RelatedListingsPicker({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const { data: names, isLoading } = useListingNames();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    if (!names) return [];
    const q = query.trim().toLowerCase();
    return Array.from(names.entries())
      .filter(([id, name]) => !selectedIds.includes(id) && (q === "" || name.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [names, query, selectedIds]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
              {names?.get(id) ?? "…"}
              <button
                type="button"
                onClick={() => toggle(id)}
                className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-red-600"
                aria-label={`Remove ${names?.get(id) ?? "listing"}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search listings…"
          className="text-sm"
        />
        {open && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {isLoading ? (
              <div className="p-2 text-xs text-slate-400">Loading…</div>
            ) : options.length === 0 ? (
              <div className="p-2 text-xs text-slate-400">No matches</div>
            ) : (
              options.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // keeps the input's blur from closing the list before the click registers
                  onClick={() => { toggle(id); setQuery(""); }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
