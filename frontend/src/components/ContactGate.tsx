import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/**
 * The contact-info gate (issue #15): a signed-out visitor sees
 * phone/email/website/address blurred, with a prompt to sign in to reveal
 * them. Two treatments share this file:
 *
 * - `ContactGateOverlay` — the full glass panel + Sign In/Create Account
 *   buttons, for the Listing detail page's contact card.
 * - `CardGateOverlay` — a lighter, single-link version for search/grid
 *   cards, where a full two-button panel repeated across a whole grid would
 *   be repetitive rather than helpful.
 *
 * Both link back through `redirect`, so signing in returns the visitor to
 * this exact page rather than dropping them on the home page.
 */

function useRedirectBack(): string {
  return useRouterState({ select: (s) => s.location.href });
}

export function ContactGateOverlay() {
  const redirect = useRedirectBack();
  return (
    <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/40 backdrop-blur-md">
      <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-5 text-center shadow-lg backdrop-blur-sm">
        <Lock className="h-5 w-5 text-[#1E7A46]" />
        <p className="text-sm font-medium text-gray-800">Sign in to reveal contact info</p>
        <div className="flex gap-2">
          <Link
            to="/login"
            search={{ redirect }}
            className="rounded-lg bg-[#1E7A46] px-4 py-2 text-xs font-medium text-white hover:bg-[#186238]"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            search={{ redirect }}
            className="rounded-lg border border-[#1E7A46] px-4 py-2 text-xs font-medium text-[#1E7A46] hover:bg-[#1E7A46]/5"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CardGateOverlay() {
  const redirect = useRedirectBack();
  return (
    <div className="absolute inset-0 grid place-items-center rounded-md bg-white/40 backdrop-blur-md">
      <Link
        to="/login"
        search={{ redirect }}
        className="inline-flex items-center gap-1 rounded-md border border-white/60 bg-white/70 px-2 py-1 text-[11px] font-medium text-[#1E7A46] backdrop-blur-sm hover:bg-white/90"
      >
        <Lock className="h-3 w-3" /> Sign in to view
      </Link>
    </div>
  );
}

/**
 * Logs the lead signal once real contact info is actually shown to a
 * signed-in visitor — detail-page views only (see contact-reveal-routes.ts's
 * doc comment for why cards don't call this). Fire-and-forget: a failure here
 * must never affect the page that's already showing the contact info.
 */
export function useContactReveal(listingId: string) {
  const { isSignedIn } = useAuth();
  const logged = useRef<string | null>(null);
  const reveal = useMutation({ mutationFn: (id: string) => api.listings.logContactReveal(id) });

  useEffect(() => {
    if (!isSignedIn || logged.current === listingId) return;
    logged.current = listingId;
    reveal.mutate(listingId);
    // reveal is a fresh useMutation object every render; only isSignedIn/listingId should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, listingId]);
}

/**
 * Anonymous-friendly page View tracking (issue #16): fired once per mount of
 * a Listing's detail page, regardless of sign-in state — unlike
 * useContactReveal above, which only logs for signed-in visitors. The
 * backend reads/mints its own visitor_id cookie and does the dedup and
 * owner-skip work; this hook just has to fire the request once.
 */
export function useListingView(listingId: string) {
  const logged = useRef<string | null>(null);
  const view = useMutation({ mutationFn: (id: string) => api.listings.logView(id) });

  useEffect(() => {
    if (logged.current === listingId) return;
    logged.current = listingId;
    view.mutate(listingId);
    // view is a fresh useMutation object every render; only listingId should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);
}
