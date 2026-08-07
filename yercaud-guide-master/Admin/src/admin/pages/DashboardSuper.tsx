import { Building2, Users, MessageSquare, Eye, Star, Store, Layers, UserPlus, ShieldCheck, ListChecks, ClipboardCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KPICard, PageHeader, SectionCard, StatusBadge, SkeletonList, EmptyState, ViewAll, fmtDate } from "../components/primitives";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * The platform-wide dashboard, on real numbers.
 *
 * Sections the mock version had that no data can back are gone rather than
 * faked: the month-by-month "Business Overview" area chart (no time-series
 * endpoint), "Recent Bookings" (ADR 0001 — there are no bookings) and "User
 * Statistics" growth percentages (no comparison period). KPI cards render
 * without trend arrows for the same reason.
 */

// categories.color is nullable; charts still need a colour.
const FALLBACK_COLOR = "#64748b";

export function DashboardSuper() {
  const { user } = useAuth();

  const { data: kpis } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: ({ signal }) => api.admin.dashboard(signal),
  });

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["admin", "approval-queue"],
    queryFn: ({ signal }) => api.admin.approvalQueue(signal),
  });

  const { data: enquiries, isLoading: enquiriesLoading } = useQuery({
    queryKey: ["enquiries", {}],
    queryFn: ({ signal }) => api.enquiries.list({}, signal),
  });

  // No "views" tracking exists, so "top performing" means best-rated.
  const { data: topListings, isLoading: topLoading } = useQuery({
    queryKey: ["listings", "top-rated"],
    queryFn: ({ signal }) => api.listings.search({ pageSize: 100 }, signal),
    select: (d) =>
      [...d.items]
        .filter((l) => l.averageRating !== null)
        .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))
        .slice(0, 5),
  });

  // There is no per-category count endpoint; one cheap pageSize=1 search per
  // category reads the exact totals off the counts the API already computes.
  const { data: byCategory } = useQuery({
    queryKey: ["listings", "by-category"],
    queryFn: async ({ signal }) => {
      const categories = await api.taxonomies.categories(signal);
      const totals = await Promise.all(
        categories.map((c) => api.listings.search({ category: c.slug, pageSize: 1 }, signal).then((r) => r.total)),
      );
      return categories
        .map((c, i) => ({ name: c.name, count: totals[i], color: c.color ?? FALLBACK_COLOR }))
        .filter((c) => c.count > 0);
    },
  });

  const categoryTotal = byCategory?.reduce((sum, c) => sum + c.count, 0) ?? 0;

  const kpiCards = [
    { label: "Businesses", value: kpis?.totalBusinesses, icon: Building2, tint: "emerald" as const },
    { label: "Listings", value: kpis?.totalListings, icon: ListChecks, tint: "amber" as const },
    { label: "Users", value: kpis?.totalUsers, icon: Users, tint: "blue" as const },
    { label: "Enquiries", value: kpis?.totalEnquiries, icon: MessageSquare, tint: "purple" as const },
    { label: "Views", value: kpis?.totalViews, icon: Eye, tint: "pink" as const },
    { label: "Avg Rating", value: kpis?.averageRating?.toFixed(1), icon: Star, tint: "slate" as const },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name ?? "Admin"}! Here's what's happening in your directory.`}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {kpiCards.map((k) => (
          <KPICard key={k.label} icon={<k.icon className="w-5 h-5" />} value={String(k.value ?? "—")} label={k.label} tint={k.tint} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <SectionCard title="Pending Approvals" className="lg:col-span-2" action={
          <ViewAll to="/approvals" />
        }>
          {queueLoading ? (
            <SkeletonList rows={4} />
          ) : !queue || queue.length === 0 ? (
            <EmptyState title="Nothing waiting" subtitle="New Businesses, Listings, Reviews and comments land here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.slice(0, 6).map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{item.subject}</div>
                    <div className="text-xs text-slate-500 capitalize">{item.kind?.replace("_", " ")}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status="pending" />
                    <div className="text-[11px] text-slate-400">{fmtDate(item.submittedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Listings by Category">
          {!byCategory ? (
            <SkeletonList rows={4} />
          ) : byCategory.length === 0 ? (
            <EmptyState title="No listings yet" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={200}>
                <PieChart>
                  <Pie data={byCategory} dataKey="count" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 text-sm space-y-1.5">
                {byCategory.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="font-semibold text-slate-900">{c.count}</span>
                    <span className="text-slate-400 text-xs w-10 text-right">
                      ({categoryTotal ? Math.round((c.count / categoryTotal) * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Recent Enquiries" action={
          <ViewAll to="/enquiries" />
        }>
          {enquiriesLoading ? (
            <SkeletonList rows={4} />
          ) : !enquiries || enquiries.length === 0 ? (
            <EmptyState title="No enquiries yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {enquiries.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
                    {e.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{e.name}</div>
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

        <SectionCard title="Top Rated Listings" action={
          <ViewAll to="/listings" />
        }>
          {topLoading ? (
            <SkeletonList rows={4} />
          ) : !topListings || topListings.length === 0 ? (
            <EmptyState title="No rated listings yet" subtitle="Ratings appear once Reviews are approved." />
          ) : (
            <ul className="space-y-2.5">
              {topListings.map((l, i) => (
                <li key={l.id} className="flex items-center gap-3">
                  <div className="w-6 text-slate-400 text-sm font-bold">{i + 1}</div>
                  {l.primaryImageUrl && <img src={l.primaryImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{l.name}</div>
                    <div className="text-xs text-slate-500 truncate">{l.categoryName}{l.locationName ? ` · ${l.locationName}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-amber-600 inline-flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />{l.averageRating?.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-slate-500">{l.reviewCount} review{l.reviewCount === 1 ? "" : "s"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-3 mt-2">
            <QuickAction icon={<Store className="w-5 h-5" />} label="Businesses" to="/businesses" />
            <QuickAction icon={<Layers className="w-5 h-5" />} label="Categories" to="/categories" />
            <QuickAction icon={<UserPlus className="w-5 h-5" />} label="Users" to="/users" />
            <QuickAction icon={<ShieldCheck className="w-5 h-5" />} label="Roles" to="/roles" />
            <QuickAction icon={<ClipboardCheck className="w-5 h-5" />} label="Approvals" to="/approvals" />
            <QuickAction icon={<Star className="w-5 h-5" />} label="Reviews" to="/reviews" />
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function QuickAction({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2 hover:bg-slate-50 transition-colors">
      <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">{icon}</span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </Link>
  );
}
