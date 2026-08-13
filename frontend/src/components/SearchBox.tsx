import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { api, type SearchResult } from "@/lib/api";
import { detailPath } from "@/lib/listing-display";

/**
 * "Search for " stays fixed; one word at a time types out after it, pauses,
 * deletes, and moves to the next — a typewriter-style placeholder cycling
 * through `words`. Runs entirely as the input's `placeholder` string (no
 * overlay element), so it's just the browser's normal muted placeholder
 * styling, updating on a timer.
 */
function useTypewriterPlaceholder(words: string[], prefix = "Search for "): string {
  const [wordIndex, setWordIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (words.length === 0) return;
    const currentWord = words[wordIndex % words.length];
    const TYPING_MS = 90;
    const DELETING_MS = 45;
    const PAUSE_MS = 1400;

    let delay = deleting ? DELETING_MS : TYPING_MS;
    if (!deleting && charCount === currentWord.length) delay = PAUSE_MS;

    const timer = window.setTimeout(() => {
      if (!deleting && charCount === currentWord.length) {
        setDeleting(true);
      } else if (deleting && charCount === 0) {
        setDeleting(false);
        setWordIndex((i) => (i + 1) % words.length);
      } else {
        setCharCount((c) => c + (deleting ? -1 : 1));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [charCount, deleting, wordIndex, words]);

  if (words.length === 0) return prefix.trim();
  const typed = words[wordIndex % words.length].slice(0, charCount);
  return `${prefix}${typed}|`;
}

/**
 * The live hero search (issue #11). Two behaviours in one control:
 *
 *  - Type-ahead: as you type (debounced), it hits /search?mode=quick — the
 *    lexical-only fast path — and shows a jump-to dropdown. Quick mode makes no
 *    embedding call, so per-keystroke latency and cost stay low.
 *  - Submit: Enter or the button navigates to the full /search results page,
 *    which runs the complete hybrid ranking.
 *
 * `category` scopes both to one category — a category page's hero passes its
 * slug so "Lake" on the Hotels page searches hotels.
 *
 * `animatedWords`, when given, overrides `placeholder` with the typewriter
 * effect above ("Search for " + a cycling word) instead of a static string.
 */
export function SearchBox({
  category,
  placeholder = "Search hotels, restaurants, activities…",
  animatedWords,
  className = "",
}: {
  category?: string;
  placeholder?: string;
  animatedWords?: string[];
  className?: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const typedPlaceholder = useTypewriterPlaceholder(animatedWords ?? []);
  const effectivePlaceholder = animatedWords && animatedWords.length > 0 ? typedPlaceholder : placeholder;

  // Debounced type-ahead. Aborts the in-flight request on each keystroke so a
  // slow response can't overwrite a newer one.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search({ q: query, category, mode: "quick", pageSize: 6 }, controller.signal)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => {
          /* aborted or failed — leave the last results in place */
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, category]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit() {
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    navigate({ to: "/search", search: { q: query, ...(category ? { category } : {}) } });
  }

  const listings = results?.listings ?? [];
  const businesses = results?.businesses ?? [];
  const hasResults = listings.length > 0 || businesses.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-full bg-white p-2 pl-5 shadow-xl"
      >
        <Search className="h-5 w-5 shrink-0 text-[#1E7A46]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={effectivePlaceholder}
          aria-label="Search the directory"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-full bg-[#1E7A46] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#186238]"
        >
          <Search className="h-4 w-4" /> <span className="hidden sm:inline">Search</span>
        </button>
      </form>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-2xl">
          {!hasResults ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No quick matches. Press Enter to search everything.
            </div>
          ) : (
            <>
              {listings.length > 0 && (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {listings.map((l) => (
                    <li key={l.id}>
                      <Link
                        to={detailPath(l)}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-100">
                          {l.primaryImageUrl ? (
                            <img src={l.primaryImageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Search className="h-4 w-4 text-gray-400" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{l.name}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {l.categoryName}
                            {l.locationName ? ` · ${l.locationName}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {businesses.length > 0 && (
                <ul className="border-t border-gray-100 py-1">
                  {businesses.slice(0, 3).map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate({ to: "/search", search: { q: b.name } });
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Business</span>
                        <span className="min-w-0 truncate text-sm text-gray-800">{b.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-gray-400">{b.listingCount} listings</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button
            type="button"
            onClick={submit}
            className="block w-full border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-center text-sm font-medium text-[#1E7A46] hover:bg-gray-100"
          >
            Search for “{q.trim()}” →
          </button>
        </div>
      )}
    </div>
  );
}
