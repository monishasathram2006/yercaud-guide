import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, ListChecks, Building2, Users, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api, type Business, type ListingSummary, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * The topbar's global search. Fans out to the list endpoints the caller may
 * see — /listings?q=, /users?q=, and /businesses (no q in the contract, so
 * those filter client-side over the admin-sized list) — and groups the hits.
 * Clicking a hit goes to that record's section page.
 */

interface Results {
  listings: ListingSummary[];
  businesses: Business[];
  users: User[];
}

export function GlobalSearch() {
  const { canAccess } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounce keystrokes into the actual query.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  // Close when clicking anywhere outside.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const enabled = q.length >= 2;
  const { data, isFetching } = useQuery<Results>({
    queryKey: ["global-search", q],
    enabled,
    queryFn: async ({ signal }) => {
      const needle = q.toLowerCase();
      const [listings, businesses, users] = await Promise.all([
        canAccess("Listings")
          ? api.listings.search({ q, pageSize: 5 }, signal).then((r) => r.items)
          : Promise.resolve([]),
        canAccess("Businesses")
          ? api.businesses
              .list({}, signal)
              .then((all) => all.filter((b) => b.name.toLowerCase().includes(needle)).slice(0, 5))
          : Promise.resolve([]),
        canAccess("Users")
          ? api.users.list({ q }, signal).then((r) => r.slice(0, 5))
          : Promise.resolve([]),
      ]);
      return { listings, businesses, users };
    },
  });

  const total = (data?.listings.length ?? 0) + (data?.businesses.length ?? 0) + (data?.users.length ?? 0);

  function go(to: string) {
    setOpen(false);
    setText("");
    void navigate({ to });
  }

  return (
    <div ref={rootRef} className="relative hidden md:block flex-1 max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        placeholder="Search businesses, listings, users..."
        className="pl-9 h-9 bg-slate-50 border-slate-200"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      {isFetching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}

      {open && enabled && data && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {total === 0 && !isFetching && (
            <div className="px-3 py-4 text-center text-xs text-slate-500">No matches for “{q}”</div>
          )}
          <ResultGroup
            title="Listings"
            icon={<ListChecks className="w-3.5 h-3.5" />}
            items={data.listings.map((l) => ({ key: l.id, label: l.name, sub: l.status }))}
            onPick={() => go("/listings")}
          />
          <ResultGroup
            title="Businesses"
            icon={<Building2 className="w-3.5 h-3.5" />}
            items={data.businesses.map((b) => ({ key: b.id, label: b.name, sub: b.status }))}
            onPick={() => go("/businesses")}
          />
          <ResultGroup
            title="Users"
            icon={<Users className="w-3.5 h-3.5" />}
            items={data.users.map((u) => ({ key: u.id, label: u.name, sub: u.email }))}
            onPick={() => go("/users")}
          />
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  title, icon, items, onPick,
}: {
  title: string;
  icon: React.ReactNode;
  items: { key: string; label: string; sub?: string | null }[];
  onPick: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon} {title}
      </div>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={onPick}
          className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
        >
          <span className="truncate font-medium text-slate-800">{it.label}</span>
          {it.sub && <span className="shrink-0 text-[11px] text-slate-400">{it.sub}</span>}
        </button>
      ))}
    </div>
  );
}
