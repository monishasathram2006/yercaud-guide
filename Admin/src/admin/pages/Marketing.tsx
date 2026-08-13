import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, EmptyState, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Schemas } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError, useListingNames } from "../queries";

type Promotion = Schemas["Promotion"];
/** The wire schema is still named FeaturedListing (unchanged URL/shape, issue #22) — aliased here to read as the domain does. */
type SponsoredPlacement = Schemas["FeaturedListing"];
type Banner = Schemas["Banner"];

/**
 * Marketing: Promotions (owner campaigns with an approval flow), Featured
 * Listings (purely editorial curation) and Banners.
 *
 * These tables carry only listingId; names resolve through the shared
 * client-side map (same known gap as Reviews/Enquiries — the join belongs in
 * the API eventually).
 */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

/** Plain <select> over the caller-visible Listings — enough at this scale. */
function ListingSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ["listings", "select"],
    queryFn: ({ signal }) => api.listings.search({ pageSize: 100 }, signal),
    select: (d) => d.items,
  });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
    >
      <option value="">Choose a Listing…</option>
      {(data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
}

/* -------------------------------- PROMOTIONS ------------------------------- */

const PROMOTION_STATUSES = ["draft", "pending", "active", "expired"] as const;

export function PromotionsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: ({ signal }) => api.marketing.promotions(signal),
  });
  const { data: listingNames } = useListingNames();

  const remove = useMutation({
    mutationFn: (id: string) => api.marketing.deletePromotion(id),
    onSuccess: () => {
      toast.success("Promotion deleted");
      void queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Owner campaigns. New promotions start as drafts; a Super Admin activates them."
        actions={can("Marketing", "create") || can("Listings", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Promotion
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={(data ?? []).map((p) => ({ ...p, id: p.id ?? "" }))}
          emptyTitle="No promotions"
          columns={[
            { key: "title", header: "Title", render: (r) => (
              <div className="flex items-center gap-3">
                {r.imageUrl && <img src={r.imageUrl} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                <span className="font-medium">{r.title}</span>
              </div>
            ) },
            { key: "listing", header: "Listing", render: (r) => listingNames?.get(r.listingId ?? "") ?? "—" },
            { key: "discount", header: "Discount", render: (r) => (r.discountPercent != null ? `${r.discountPercent}%` : "—") },
            { key: "start", header: "Start", render: (r) => fmtDate(r.startDate) },
            { key: "end", header: "End", render: (r) => fmtDate(r.endDate) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "draft"} /> },
          ]}
          onEdit={(r) => setEditing(r)}
          onDelete={(r) => remove.mutate(r.id)}
        />
      )}
      {(creating || editing) && <PromotionDrawer promotion={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </>
  );
}

function PromotionDrawer({ promotion, onClose }: { promotion: Promotion | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [listingId, setListingId] = useState(promotion?.listingId ?? "");
  const [title, setTitle] = useState(promotion?.title ?? "");
  const [discount, setDiscount] = useState(promotion?.discountPercent != null ? String(promotion.discountPercent) : "");
  const [startDate, setStartDate] = useState(promotion?.startDate ?? "");
  const [endDate, setEndDate] = useState(promotion?.endDate ?? "");
  const [status, setStatus] = useState(promotion?.status ?? "draft");

  const save = useMutation({
    mutationFn: () => {
      if (promotion) {
        return api.marketing.updatePromotion(promotion.id!, {
          title: title.trim(),
          discountPercent: discount === "" ? null : Number(discount),
          startDate,
          endDate,
          // Status changes are the Super Admin's approval lever; owners edit content only.
          ...(can("Marketing", "approve") ? { status } : {}),
        });
      }
      return api.marketing.createPromotion({
        listingId,
        title: title.trim(),
        discountPercent: discount === "" ? undefined : Number(discount),
        startDate,
        endDate,
      });
    },
    onSuccess: () => {
      toast.success(promotion ? "Promotion updated" : "Promotion created as draft");
      void queryClient.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={promotion ? `Edit ${promotion.title}` : "Add Promotion"}
      onSave={() => {
        if (!promotion && !listingId) { toast.error("Pick the Listing to promote"); return; }
        if (!title.trim() || !startDate || !endDate) { toast.error("Title, start and end dates are required"); return; }
        save.mutate();
      }}
    >
      {!promotion && <FormField label="Listing"><ListingSelect value={listingId} onChange={setListingId} /></FormField>}
      <FormField label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start Date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></FormField>
        <FormField label="End Date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></FormField>
      </div>
      <FormField label="Discount %"><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></FormField>
      {promotion && can("Marketing", "approve") && (
        <FormField label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof PROMOTION_STATUSES)[number])}
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            {PROMOTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
      )}
    </FormDrawer>
  );
}

/* ---------------------------- SPONSORED PLACEMENTS ---------------------------- */
/* (issue #22/#23 — repurposes the same featured_listings table/routes as the old
   flat "Featured Listings" editorial shelf, ADR-0012: paid, off-platform-arranged,
   capped per category, still only a Super Admin can apply it.) */

export function SponsoredPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<SponsoredPlacement | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["featured-listings"],
    queryFn: ({ signal }) => api.marketing.featuredListings(signal),
  });
  const { data: listingNames } = useListingNames();

  const remove = useMutation({
    mutationFn: (id: string) => api.marketing.deleteFeatured(id),
    onSuccess: () => {
      toast.success("Sponsored placement removed");
      void queryClient.invalidateQueries({ queryKey: ["featured-listings"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader
        title="Sponsored Placements"
        subtitle="Paid visibility, arranged off-platform — capped per category, applied only by a Super Admin."
        actions={can("Marketing", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Sponsor a Listing
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <DataTable
          data={data ?? []}
          searchable={false}
          emptyTitle="No Sponsored placements"
          columns={[
            { key: "listing", header: "Listing", render: (r) => <span className="font-medium">{listingNames?.get(r.listingId) ?? "—"}</span> },
            { key: "start", header: "From", render: (r) => fmtDate(r.startDate) },
            { key: "end", header: "Until", render: (r) => (r.endDate ? fmtDate(r.endDate) : "Open-ended") },
            { key: "sortOrder", header: "Order", sortable: true, accessor: (r) => r.sortOrder },
          ]}
          onEdit={can("Marketing", "edit") ? (r) => setEditing(r) : undefined}
          onDelete={can("Marketing", "delete") ? (r) => remove.mutate(r.id) : undefined}
        />
      )}
      {(creating || editing) && <SponsoredDrawer sponsored={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </>
  );
}

function SponsoredDrawer({ sponsored, onClose }: { sponsored: SponsoredPlacement | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState(sponsored?.listingId ?? "");
  const [startDate, setStartDate] = useState(sponsored?.startDate ?? "");
  const [endDate, setEndDate] = useState(sponsored?.endDate ?? "");
  const [sortOrder, setSortOrder] = useState(String(sponsored?.sortOrder ?? 0));
  // Shown inline in the drawer rather than as a toast (issue #23) — a cap
  // rejection is about *this* form's inputs, not a fire-and-forget failure.
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const schedule = { startDate, endDate: endDate || null, sortOrder: Number(sortOrder) || 0 };
      return sponsored
        ? api.marketing.updateFeatured(sponsored.id, schedule)
        : api.marketing.createFeatured({ listingId, ...schedule });
    },
    onSuccess: () => {
      toast.success(sponsored ? "Sponsored placement updated" : "Listing sponsored");
      void queryClient.invalidateQueries({ queryKey: ["featured-listings"] });
    },
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={sponsored ? "Edit Sponsored placement" : "Sponsor a Listing"}
      description="Payment is arranged off-platform — this only records the agreed date range."
      onSave={async () => {
        setFormError(null);
        if (!sponsored && !listingId) { toast.error("Pick the Listing to sponsor"); return false; }
        if (!startDate) { toast.error("A start date is required"); return false; }
        try {
          await save.mutateAsync();
          return true;
        } catch (error) {
          // The cap rejection (and any other server validation) surfaces here,
          // inline, instead of a generic toast — the drawer stays open so the
          // admin can adjust the dates and retry.
          setFormError(error instanceof Error ? error.message : "Request failed");
          return false;
        }
      }}
    >
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
      )}
      {!sponsored && <FormField label="Listing"><ListingSelect value={listingId} onChange={setListingId} /></FormField>}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="From"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></FormField>
        <FormField label="Until (optional)"><Input type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} /></FormField>
      </div>
      <FormField label="Sort Order"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></FormField>
    </FormDrawer>
  );
}

/* ---------------------------------- BANNERS -------------------------------- */

const BANNER_STATUSES = ["draft", "active", "expired"] as const;

export function BannersPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["banners"],
    queryFn: ({ signal }) => api.marketing.banners(signal),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.marketing.deleteBanner(id),
    onSuccess: () => {
      toast.success("Banner deleted");
      void queryClient.invalidateQueries({ queryKey: ["banners"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader
        title="Banner Management"
        subtitle="Homepage and promotional banners, by placement."
        actions={can("Marketing", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Banner
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : !data || data.length === 0 ? (
        <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-4">
          <EmptyState title="No banners yet" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((b) => (
            <Card key={b.id} className="overflow-hidden rounded-2xl shadow-sm gap-0 p-0">
              {b.imageUrl && <img src={b.imageUrl} className="h-32 w-full object-cover" alt="" />}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{b.title}</div>
                  <StatusBadge status={b.status ?? "draft"} />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {b.placement} · {fmtDate(b.startDate)} → {b.endDate ? fmtDate(b.endDate) : "open-ended"}
                </div>
                <div className="flex gap-2 mt-3">
                  {can("Marketing", "edit") && <Button size="sm" variant="outline" onClick={() => setEditing(b)}>Edit</Button>}
                  {can("Marketing", "delete") && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove.mutate(b.id!)}>Delete</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {(creating || editing) && <BannerDrawer banner={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </>
  );
}

function BannerDrawer({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(banner?.title ?? "");
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
  const [placement, setPlacement] = useState(banner?.placement ?? "home");
  const [status, setStatus] = useState(banner?.status ?? "draft");
  const [startDate, setStartDate] = useState(banner?.startDate ?? "");
  const [endDate, setEndDate] = useState(banner?.endDate ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        linkUrl: linkUrl.trim() || null,
        placement: placement.trim(),
        status,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      return banner ? api.marketing.updateBanner(banner.id!, body) : api.marketing.createBanner(body);
    },
    onSuccess: () => {
      toast.success(banner ? "Banner updated" : "Banner created");
      void queryClient.invalidateQueries({ queryKey: ["banners"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={banner ? `Edit ${banner.title}` : "Add Banner"}
      onSave={() => {
        if (!title.trim() || !imageUrl.trim()) { toast.error("A banner needs a title and an image URL"); return; }
        save.mutate();
      }}
    >
      <FormField label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FormField label="Image URL"><Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></FormField>
      <FormField label="Link URL (optional)"><Input value={linkUrl ?? ""} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Placement"><Input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="home" /></FormField>
        <FormField label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof BANNER_STATUSES)[number])}
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            {BANNER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start (optional)"><Input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} /></FormField>
        <FormField label="End (optional)"><Input type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} /></FormField>
      </div>
    </FormDrawer>
  );
}
