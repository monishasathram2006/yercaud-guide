import { MessageSquare, Star, Plus, MessagesSquare, Building2, ListChecks, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KPICard, PageHeader, SectionCard, StatusBadge, SkeletonList, EmptyState, ViewAll, fmtDate } from "../components/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOwnBusinesses, useOwnListings } from "../queries";

/**
 * The Business Owner's dashboard, on the owner's real data.
 *
 * The mock version was built around bookings: a bookings trend chart, a
 * channel-mix donut, OTA sync tiles. ADR 0001 (no in-platform booking) and
 * ADR 0002 (channels deferred) rule all of that out, so what remains is what
 * the platform actually gives an owner — their Listings, the Enquiries those
 * generate, and the ratings visitors leave.
 */
export function DashboardOwner() {
  const { user } = useAuth();
  const { data: businesses, isLoading: businessesLoading } = useOwnBusinesses();
  const { data: listings, isLoading: listingsLoading } = useOwnListings(businesses);

  const { data: enquiries, isLoading: enquiriesLoading } = useQuery({
    queryKey: ["enquiries", {}],
    queryFn: ({ signal }) => api.enquiries.list({}, signal),
  });

  if (businessesLoading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <SkeletonList rows={6} />
      </>
    );
  }

  if (!businesses || businesses.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${user?.name ?? ""}`} subtitle="You don't have a Business yet." />
        <SectionCard>
          <EmptyState title="No Business on this account" subtitle="Apply as a Business Owner on the public site to get started." />
        </SectionCard>
      </>
    );
  }

  const pendingListings = listings?.filter((l) => l.status === "pending").length ?? 0;
  const newEnquiries = enquiries?.filter((e) => e.status === "sent").length ?? 0;
  const reviewCount = listings?.reduce((sum, l) => sum + l.reviewCount, 0) ?? 0;
  const rated = listings?.filter((l) => l.averageRating !== null) ?? [];
  const avgRating = rated.length > 0 ? rated.reduce((sum, l) => sum + (l.averageRating ?? 0), 0) / rated.length : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${businesses[0].name}`}
        subtitle="Here's how your business is doing."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <KPICard icon={<ListChecks className="w-5 h-5" />} value={String(listings?.length ?? "—")} label="Listings" tint="emerald" />
        <KPICard icon={<Clock className="w-5 h-5" />} value={String(pendingListings)} label="Awaiting Approval" tint="amber" />
        <KPICard icon={<MessageSquare className="w-5 h-5" />} value={String(enquiries?.length ?? "—")} label="Enquiries" tint="blue" />
        <KPICard icon={<MessagesSquare className="w-5 h-5" />} value={String(newEnquiries)} label="Unanswered" tint="purple" />
        <KPICard icon={<Star className="w-5 h-5" />} value={avgRating !== null ? `${avgRating.toFixed(1)} (${reviewCount})` : "—"} label="Avg Rating (Reviews)" tint="pink" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="My Listings" className="lg:col-span-2" action={
          <ViewAll to="/my-listings" />
        }>
          {listingsLoading ? (
            <SkeletonList rows={4} />
          ) : !listings || listings.length === 0 ? (
            <EmptyState title="No listings yet" subtitle="Create your first Listing to appear in the directory." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {listings.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  {l.primaryImageUrl && <img src={l.primaryImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{l.name}</div>
                    <div className="text-xs text-slate-500 truncate">{l.categoryName}{l.locationName ? ` · ${l.locationName}` : ""}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status={l.status} />
                    {l.averageRating !== null && (
                      <div className="text-xs text-amber-600 inline-flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />{l.averageRating.toFixed(1)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Recent Enquiries" action={
            <ViewAll to="/enquiries" />
          }>
            {enquiriesLoading ? (
              <SkeletonList rows={3} />
            ) : !enquiries || enquiries.length === 0 ? (
              <EmptyState title="No enquiries yet" />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {enquiries.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{e.name}</div>
                      <div className="text-xs text-slate-500 truncate">{e.message}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <StatusBadge status={e.status} />
                      <div className="text-[11px] text-slate-400">{fmtDate(e.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-3 gap-3">
              <QuickAction icon={<Plus />} label="Listings" to="/my-listings" />
              <QuickAction icon={<MessagesSquare />} label="Enquiries" to="/enquiries" />
              <QuickAction icon={<Building2 />} label="Profile" to="/profile" />
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function QuickAction({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2 hover:bg-slate-50">
      <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">{icon}</span>
      <span className="text-xs font-medium text-slate-700 text-center">{label}</span>
    </Link>
  );
}
