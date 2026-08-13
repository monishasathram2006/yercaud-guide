import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Check, X, Award, BarChart3, Eye, Heart, Phone, MessageSquare, BedDouble } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, KPICard, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type ListingSummary, type PriceUnit } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError, useOwnBusinesses, useOwnListings } from "../queries";

/**
 * Listings, platform-wide or scoped to the caller's own Businesses.
 *
 * No "Add Listing" here yet: creating one is a category-specific, multi-step
 * affair (detail tables per ADR 0003) with no client methods behind it — a
 * form that pretended otherwise would be the mock all over again.
 *
 * DataTable pages client-side, so the admin view fetches at the API's
 * pageSize ceiling (100). Fine at this directory's scale; server-driven
 * paging is the upgrade path when it stops being fine.
 */

const STATUS_FILTERS = ["All", "pending", "approved", "rejected", "suspended", "archived"];

const UNIT_LABELS: Record<PriceUnit, string> = {
  per_night: "/night",
  for_two: "for two",
  per_person: "/person",
  from: "from",
};

function price(l: ListingSummary): string {
  if (l.priceFrom === null) return "—";
  const amount = `₹${l.priceFrom.toLocaleString("en-IN")}`;
  return l.priceUnit ? `${amount} ${UNIT_LABELS[l.priceUnit]}` : amount;
}

export function ListingsPage({ ownerScoped = false }: { ownerScoped?: boolean }) {
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => api.taxonomies.categories(signal),
  });

  // Two shapes of the same list: the platform view is one server-filtered
  // search; the owner view unions per-Business searches (an owner may hold
  // several) and filters the small result locally.
  const { data: ownBusinesses } = useOwnBusinesses();
  const own = useOwnListings(ownerScoped ? ownBusinesses : undefined);
  const platform = useQuery({
    queryKey: ["listings", "admin", category, status],
    enabled: !ownerScoped,
    queryFn: ({ signal }) =>
      api.listings.search(
        {
          pageSize: 100,
          category: category === "All" ? undefined : category,
          status: status === "All" ? undefined : status,
        },
        signal,
      ),
    select: (d) => d.items,
  });

  const isLoading = ownerScoped ? own.isLoading : platform.isLoading;
  let listings = (ownerScoped ? own.data : platform.data) ?? [];
  if (ownerScoped) {
    if (category !== "All") listings = listings.filter((l) => l.categorySlug === category);
    if (status !== "All") listings = listings.filter((l) => l.status === status);
  }

  // The Businesses column needs names. GET /businesses self-scopes (admins see
  // all, owners their own), so the one query already fetched serves both modes.
  const businessName = (id: string) => ownBusinesses?.find((b) => b.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title={ownerScoped ? "My Listings" : "Listings"}
        subtitle={
          ownerScoped
            ? "Your Listings. A new Listing goes live once approved; edits after that apply immediately."
            : "All Listings across the platform."
        }
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={listings}
          filters={[
            {
              label: "Category",
              key: "category",
              options: ["All", ...(categories?.map((c) => c.slug ?? c.name) ?? [])],
              value: category,
              onChange: setCategory,
            },
            { label: "Status", key: "status", options: STATUS_FILTERS, value: status, onChange: setStatus },
          ]}
          columns={[
            { key: "name", header: "Listing", sortable: true, accessor: (r) => r.name, render: (r) => (
              <div className="flex items-center gap-3">
                {r.primaryImageUrl && <img src={r.primaryImageUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />}
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.locationName ?? "No location"}</div>
                </div>
              </div>
            ) },
            { key: "category", header: "Category", render: (r) => r.categoryName },
            { key: "business", header: "Business", render: (r) => businessName(r.businessId) },
            { key: "price", header: "Price", render: (r) => price(r) },
            { key: "rating", header: "Rating", render: (r) =>
              r.averageRating !== null ? (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  {r.averageRating.toFixed(1)}
                  <span className="text-slate-400">({r.reviewCount})</span>
                </span>
              ) : "—" },
            { key: "badge", header: "Badge", render: (r) =>
              r.badge ? (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium border"
                  style={r.badge.color ? { backgroundColor: `${r.badge.color}20`, borderColor: r.badge.color, color: r.badge.color } : undefined}
                >
                  {r.badge.label}
                </span>
              ) : "—" },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rowActions={(r) => <ListingActions listing={r} ownerScoped={ownerScoped} />}
        />
      )}
    </>
  );
}

/** Row actions split out so each row's drawers get their own state. */
function ListingActions({ listing, ownerScoped }: { listing: ListingSummary; ownerScoped: boolean }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [hotelDetailsOpen, setHotelDetailsOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "approval-queue"] });
  };

  const approve = useMutation({
    mutationFn: () => api.listings.approve(listing.id),
    onSuccess: () => { toast.success(`Approved ${listing.name}`); refresh(); },
    onError: onApiError,
  });
  const reject = useMutation({
    mutationFn: (why: string) => api.listings.reject(listing.id, why),
    onSuccess: () => { toast.success(`Rejected ${listing.name}`); refresh(); },
    onError: onApiError,
  });

  return (
    <>
      {can("Listings", "approve") && listing.status !== "approved" && (
        <button onClick={() => approve.mutate()} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
          <Check className="w-3 h-3 mr-2" />Approve
        </button>
      )}
      {can("Listings", "approve") && (listing.status === "pending" || listing.status === "approved") && (
        <button onClick={() => { setReason(""); setRejectOpen(true); }} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
          <X className="w-3 h-3 mr-2" />Reject…
        </button>
      )}
      {can("Marketing", "edit") && (
        <button onClick={() => setBadgeOpen(true)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
          <Award className="w-3 h-3 mr-2" />Badge…
        </button>
      )}
      {ownerScoped && (
        <button onClick={() => setStatsOpen(true)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
          <BarChart3 className="w-3 h-3 mr-2" />Stats…
        </button>
      )}
      {listing.categorySlug === "hotel" && (ownerScoped || can("Listings", "edit")) && (
        <button onClick={() => setHotelDetailsOpen(true)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
          <BedDouble className="w-3 h-3 mr-2" />Hotel Details…
        </button>
      )}

      <FormDrawer
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ${listing.name}`}
        saveLabel="Reject"
        onSave={() => {
          if (!reason.trim()) { toast.error("A rejection needs a reason the owner will see"); return; }
          reject.mutate(reason.trim());
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Reason</Label>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to the Business Owner." />
        </div>
      </FormDrawer>

      {badgeOpen && <BadgeDrawer listing={listing} onClose={() => setBadgeOpen(false)} />}
      {statsOpen && <ListingStatsDrawer listing={listing} onClose={() => setStatsOpen(false)} />}
      {hotelDetailsOpen && <HotelDetailsDrawer listing={listing} onClose={() => setHotelDetailsOpen(false)} />}
    </>
  );
}

/** FR30 — assign one of the badge vocabulary to a Listing, or clear it. */
function BadgeDrawer({ listing, onClose }: { listing: ListingSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(listing.badge?.id ?? null);

  const { data: badges } = useQuery({
    queryKey: ["badges"],
    queryFn: ({ signal }) => api.taxonomies.badges(signal),
  });

  const save = useMutation({
    mutationFn: () => api.listings.setBadge(listing.id, selected),
    onSuccess: () => {
      toast.success(selected ? `Badge set on ${listing.name}` : `Badge cleared on ${listing.name}`);
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer open onOpenChange={(v) => { if (!v) onClose(); }} title={`Badge — ${listing.name}`} onSave={() => save.mutate()}>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="badge" checked={selected === null} onChange={() => setSelected(null)} />
          No badge
        </label>
        {(badges ?? []).map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name="badge" checked={selected === b.id} onChange={() => setSelected(b.id)} />
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium border"
              style={b.color ? { backgroundColor: `${b.color}20`, borderColor: b.color, color: b.color } : undefined}
            >
              {b.label}
            </span>
          </label>
        ))}
      </div>
    </FormDrawer>
  );
}

/**
 * Property Type + Star Rating — the two hotel_details fields the category-page
 * filter sidebar needs (Hotel Listings only, ADR 0003). The PUT endpoint is a
 * full replace (same convention as updateListing), so the other scalar fields
 * fetched here round-trip unchanged rather than being edited by this drawer.
 */
function HotelDetailsDrawer({ listing, onClose }: { listing: ListingSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["listings", listing.id, "hotel-details"],
    queryFn: ({ signal }) => api.listings.hotelDetails(listing.id, signal),
  });
  const { data: propertyTypes } = useQuery({
    queryKey: ["property-types"],
    queryFn: ({ signal }) => api.taxonomies.propertyTypes(signal),
  });
  const [propertyTypeId, setPropertyTypeId] = useState<string | null>(null);
  const [starRating, setStarRating] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    setPropertyTypeId(data.propertyTypeId);
    setStarRating(data.starRating);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.listings.setHotelDetails(listing.id, {
        propertyTypeId,
        starRating,
        checkInTime: data?.checkInTime ?? null,
        checkOutTime: data?.checkOutTime ?? null,
        guestsCapacityNote: data?.guestsCapacityNote ?? null,
        cancellationPolicy: data?.cancellationPolicy ?? null,
      }),
    onSuccess: () => {
      toast.success(`Hotel details updated for ${listing.name}`);
      void queryClient.invalidateQueries({ queryKey: ["listings", listing.id, "hotel-details"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={`Hotel Details — ${listing.name}`}
      onSave={() => save.mutate()}
      saveDisabled={isLoading || !data}
    >
      {isLoading ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Property Type</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={propertyTypeId ?? ""}
              onChange={(e) => setPropertyTypeId(e.target.value || null)}
            >
              <option value="">Not set</option>
              {(propertyTypes ?? []).map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Star Rating</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={starRating ?? ""}
              onChange={(e) => setStarRating(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Not set</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} star{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </FormDrawer>
  );
}

/**
 * A Business Owner's own view of what's driving this Listing's Featured
 * eligibility (issue #24) — read-only, so "Save" just closes it.
 */
function ListingStatsDrawer({ listing, onClose }: { listing: ListingSummary; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["listings", listing.id, "stats"],
    queryFn: ({ signal }) => api.listings.stats(listing.id, signal),
  });

  return (
    <FormDrawer open onOpenChange={(v) => { if (!v) onClose(); }} title={`Stats — ${listing.name}`} saveLabel="Close" onSave={() => true}>
      {isLoading || !data ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <KPICard icon={<Eye className="w-5 h-5" />} value={String(data.views)} label="Views" tint="blue" />
            <KPICard icon={<Heart className="w-5 h-5" />} value={String(data.favorites)} label="Favorites" tint="pink" />
            <KPICard icon={<Phone className="w-5 h-5" />} value={String(data.contactReveals)} label="Contact Reveals" tint="amber" />
            <KPICard icon={<MessageSquare className="w-5 h-5" />} value={String(data.enquiries)} label="Enquiries" tint="emerald" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Featured status</Label>
            {data.sponsored ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Sponsored — a paid placement is currently active for this Listing.
              </div>
            ) : data.featured ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Featured — currently shown in its category's shelf on the home page.
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Not currently Featured or Sponsored.
              </div>
            )}
          </div>
        </div>
      )}
    </FormDrawer>
  );
}
