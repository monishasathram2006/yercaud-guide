import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Phone,
  Mail,
  Globe,
  MapPin,
  Facebook,
  Instagram,
  MessageCircle,
  Twitter,
  type LucideIcon,
} from "lucide-react";
import { api, type Category, type ListingSummary, type OpeningHour, type Review } from "@/lib/api";
import type { ContactDetails } from "@/lib/listing-detail";
import { useAuth } from "@/lib/auth";
import { ContactGateOverlay, useContactReveal, useListingView } from "./ContactGate";
import { BusinessCardGrid } from "./BusinessCard";

/**
 * The blocks every Listing detail page shares, rendered from real data.
 *
 * Several of the mock's sections had no source at all and are gone rather than
 * faked — see LocationBlock and ReviewsBlock below. Inventing content is what
 * made the mock look finished while the backend had nothing behind it.
 */

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#1E7A46]" />
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        {href ? (
          <a
            href={href}
            className="text-sm text-gray-800 hover:text-[#1E7A46]"
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
          >
            {value}
          </a>
        ) : (
          <div className="text-sm">{value}</div>
        )}
      </div>
    </div>
  );
}

/** socialLinks is a free-form map on the Business, so only what an owner filled in is rendered. */
const SOCIAL_ICONS: Record<string, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  whatsapp: MessageCircle,
  twitter: Twitter,
  x: Twitter,
};

/**
 * Contact info (issue #15) is only shown to signed-in visitors — a
 * signed-out visitor sees the icons/labels but the values are blurred behind
 * a sign-in prompt. `useContactReveal` logs the lead signal once real values
 * are actually shown.
 */
export function ContactCard({
  contact,
  listingId,
}: {
  contact: ContactDetails;
  listingId: string;
}) {
  const { isSignedIn } = useAuth();
  useContactReveal(listingId);
  // Fires once per Listing detail-page mount (issue #16) — ContactCard is
  // rendered exactly once on every Hotel/Restaurant/Activity/Tour detail
  // page, so this is the shared mount point, same as useContactReveal above.
  useListingView(listingId);
  const socials = Object.entries(contact.socialLinks).filter(([, url]) => Boolean(url));
  return (
    <Card title="Contact Information 🍃">
      <div className="relative">
        <div
          className={
            isSignedIn
              ? "space-y-3 text-sm text-gray-700"
              : "space-y-3 text-sm text-gray-700 blur-sm select-none"
          }
        >
          {contact.phone && (
            <Row
              icon={Phone}
              label="Phone"
              value={contact.phone}
              href={isSignedIn ? `tel:${contact.phone}` : undefined}
            />
          )}
          {contact.email && (
            <Row
              icon={Mail}
              label="Email"
              value={contact.email}
              href={isSignedIn ? `mailto:${contact.email}` : undefined}
            />
          )}
          {contact.website && (
            <Row
              icon={Globe}
              label="Website"
              value={contact.website}
              href={
                isSignedIn ? `https://${contact.website.replace(/^https?:\/\//, "")}` : undefined
              }
            />
          )}
          {contact.address && <Row icon={MapPin} label="Address" value={contact.address} />}
        </div>
        {!isSignedIn && <ContactGateOverlay />}
      </div>
      {/* The mock rendered four icons pointing at "#" whether or not the owner
          had any accounts. These are the ones they actually gave us. Social
          links aren't gated (issue #15) — they're public profiles, not the
          private contact channels the gate is about. */}
      {socials.length > 0 && (
        <div className="mt-4 flex gap-2">
          {socials.map(([name, url]) => {
            const Icon = SOCIAL_ICONS[name.toLowerCase()] ?? Globe;
            return (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={name}
                className="grid h-9 w-9 place-items-center rounded-full bg-[#1E7A46]/10 text-[#1E7A46] hover:bg-[#1E7A46] hover:text-white"
              >
                <Icon className="h-4 w-4" />
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function OpeningHoursCard({ hours }: { hours: OpeningHour[] }) {
  if (hours.length === 0) return null;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <Card title="Opening Hours 🍃">
      <div className="space-y-2 text-sm">
        {[...hours]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map((h) => (
            <div key={h.dayOfWeek} className="flex justify-between">
              <span className="text-gray-700">{DAYS[h.dayOfWeek] ?? `Day ${h.dayOfWeek}`}</span>
              <span className="text-gray-600">
                {h.isClosed || !h.openTime ? "Closed" : `${h.openTime} – ${h.closeTime ?? ""}`}
              </span>
            </div>
          ))}
      </div>
    </Card>
  );
}

/**
 * Reviews, and submitting one.
 *
 * A Review is held `pending` and invisible until a Super Admin approves it (ADR
 * 0006), so the form says so rather than implying the review is live.
 *
 * Two things the mock showed that the API has no source for: the reviewer's name
 * and avatar (a Review carries userId and nothing else identifying), and a
 * "Helpful" count (FR117's engagement counters have no columns). Both are gone
 * rather than invented — the reviewer shows as "A visitor" until the backend can
 * say who they were.
 */
export function ReviewsBlock({
  listingId,
  reviews,
  rating,
  total,
}: {
  listingId: string;
  reviews: Review[];
  rating: number | null;
  total: number;
}) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stars, setStars] = useState(5);

  const submit = useMutation({
    mutationFn: () => api.listings.submitReview(listingId, { rating: stars, text: text.trim() }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries();
    },
  });

  return (
    <Card title="Reviews & Ratings 🍃">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-4xl font-bold text-gray-900">{rating?.toFixed(1) ?? "—"}</div>
          <div className="flex text-yellow-500">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${i < Math.round(rating ?? 0) ? "fill-yellow-500" : ""}`}
              />
            ))}
          </div>
          <div className="text-xs text-gray-500">
            {total === 0 ? "No reviews yet" : `Based on ${total} review${total === 1 ? "" : "s"}`}
          </div>
        </div>
        {isSignedIn ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-[#1E7A46] px-4 py-2 text-sm text-white hover:bg-[#186238]"
          >
            Write a Review
          </button>
        ) : (
          <a
            href="/login"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:border-[#1E7A46]"
          >
            Sign in to review
          </a>
        )}
      </div>

      {open && (
        <div className="mt-4 rounded-lg border border-gray-100 p-3">
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button
                key={i}
                onClick={() => setStars(i + 1)}
                aria-label={`${i + 1} star${i ? "s" : ""}`}
              >
                <Star
                  className={`h-5 w-5 ${i < stars ? "fill-yellow-500 text-yellow-500" : "text-gray-300"}`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="What was your experience?"
            className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-[#1E7A46] focus:outline-none"
          />
          {submit.isError && (
            <p className="mt-2 text-xs text-red-600">
              {submit.error instanceof Error
                ? submit.error.message
                : "Could not submit your review."}
            </p>
          )}
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || text.trim().length < 3}
            className="mt-2 rounded-lg bg-[#1E7A46] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {submit.isPending ? "Submitting…" : "Submit review"}
          </button>
          {/* ADR 0006: held pending until a Super Admin approves it. Saying so
              beats leaving someone to wonder why their review vanished. */}
          <p className="mt-2 text-xs text-gray-500">Reviews appear once approved by our team.</p>
        </div>
      )}

      {submit.isSuccess && (
        <div className="mt-3 rounded-lg bg-[#1E7A46]/10 p-3 text-sm text-[#1E7A46]">
          Your review has been submitted and is pending approval.
        </div>
      )}

      <div className="mt-6 space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 text-sm">
              {/* No name: a Review carries userId and nothing else identifying. */}
              <span className="font-semibold text-gray-900">A visitor</span>
              <span className="text-xs text-gray-500">
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : ""}
              </span>
            </div>
            <div className="flex text-yellow-500">
              {Array.from({ length: r.rating }).map((_, j) => (
                <Star key={j} className="h-3.5 w-3.5 fill-yellow-500" />
              ))}
            </div>
            {r.text && <p className="mt-1 text-sm text-gray-700">{r.text}</p>}
            {r.ownerReply && (
              <div className="mt-2 rounded-md bg-[#F7F9F8] p-3 text-sm text-gray-700">
                <div className="text-xs font-semibold text-gray-500">Response from the owner</div>
                {r.ownerReply}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Location.
 *
 * The mock's "What's Nearby" list is gone: nothing in the schema stores nearby
 * landmarks or distances, so every entry it showed was invented. The map is a
 * stock photo for the same reason — FR129 asks for a real map, and no
 * coordinates exist to render one.
 */
export function LocationBlock({
  address,
  locationName,
}: {
  address: string | null;
  locationName: string | null;
}) {
  const { isSignedIn } = useAuth();
  if (!address && !locationName) return null;
  return (
    <Card title="Location 🍃">
      <div className="space-y-2">
        {/* locationName is a coarse locality tag (e.g. "Yercaud town"), not
            gated (issue #15) — only the street address is. address also
            appears in ContactCard above, which is where the sign-in CTA
            lives; here it's just blurred without repeating the CTA. */}
        {locationName && (
          <div className="text-sm font-semibold text-gray-900">{locationName}, Yercaud</div>
        )}
        {address && (
          <div className="relative inline-block">
            <div className={isSignedIn ? "" : "blur-sm select-none"}>
              <div className="text-sm text-gray-600">{address}</div>
              <a
                href={
                  isSignedIn
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-medium text-[#1E7A46] hover:underline"
              >
                Open in Maps →
              </a>
            </div>
            {!isSignedIn && (
              <div className="absolute inset-0 grid place-items-center rounded-md bg-white/40 backdrop-blur-md">
                <span className="text-xs font-medium text-[#1E7A46]">Sign in to view</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * "Similar Listings" (CONTEXT.md): full-width, so unlike the Cards above it
 * sits outside the two-column grid — pass it a boolean gate at the call site
 * (`similarListings.length > 0`), not here, so a page can decide its own layout.
 */
export function SimilarListingsSection({
  category,
  listings,
  categoryColor,
}: {
  category: Category | undefined;
  listings: ListingSummary[];
  categoryColor: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-10">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Similar {category?.name ?? "Listings"}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {listings.map((l) => (
          <BusinessCardGrid key={l.id} listing={l} categoryColor={categoryColor} />
        ))}
      </div>
    </section>
  );
}
