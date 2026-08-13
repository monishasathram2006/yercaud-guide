import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";
import type { Status } from "@/mock/data";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("rounded-2xl border border-slate-200 shadow-sm p-5 bg-white gap-3", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

const statusStyles: Record<string, string> = {
  Confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Connected: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Synced: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Responded: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Pending: "bg-amber-100 text-amber-700 border-amber-200",
  Sent: "bg-blue-100 text-blue-700 border-blue-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
  Suspended: "bg-red-100 text-red-700 border-red-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
  Deleted: "bg-red-100 text-red-700 border-red-200",
  "Sync Error": "bg-red-100 text-red-700 border-red-200",
  Disconnected: "bg-slate-100 text-slate-600 border-slate-200",
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Closed: "bg-slate-100 text-slate-600 border-slate-200",
  Expired: "bg-slate-100 text-slate-600 border-slate-200",
  Archived: "bg-slate-100 text-slate-600 border-slate-200",
  Unsubscribed: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusBadge({ status }: { status: Status | string }) {
  // The API speaks lowercase snake_case ("pending", "sync_error"); the mock data
  // spoke Title Case. Normalise for display and let either form hit the style map.
  const label = status ? status[0].toUpperCase() + status.slice(1).replace(/_/g, " ") : status;
  return (
    <Badge
      variant="outline"
      className={cn("font-medium rounded-full px-2.5 py-0.5 text-xs", statusStyles[status] || statusStyles[label] || "bg-slate-100 text-slate-700")}
    >
      {label}
    </Badge>
  );
}

/**
 * A "View All" link into another admin page. The `to: string` prop is what
 * keeps the router's literal-route typing out of the way — this app's real
 * routing is AdminRouter's own table, and the route tree only knows "/" and
 * the catch-all (the same reason Sidebar types its urls as plain strings).
 */
export function ViewAll({ to, label = "View All" }: { to: string; label?: string }) {
  return (
    <Link to={to} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
      {label}
    </Link>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function KPICard({
  icon,
  value,
  label,
  change,
  compare = "vs last period",
  tint = "emerald",
}: {
  icon: ReactNode;
  value: string;
  label: string;
  /** Omit when there is no comparison series — a fabricated trend is worse than none. */
  change?: number;
  compare?: string;
  tint?: "emerald" | "amber" | "blue" | "purple" | "pink" | "slate";
}) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    pink: "bg-pink-50 text-pink-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const positive = (change ?? 0) >= 0;
  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm p-4 bg-white gap-2">
      <div className="flex items-center gap-3">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", tints[tint])}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-slate-900 leading-tight">{value}</div>
          <div className="text-xs text-slate-500 truncate">{label}</div>
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1.5 text-xs mt-1">
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change)}%
          </span>
          <span className="text-slate-400">{compare}</span>
        </div>
      )}
    </Card>
  );
}

export function EmptyState({ title = "No data yet", subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Inbox className="w-6 h-6 text-slate-400" />
      </div>
      <div className="font-semibold text-slate-800">{title}</div>
      {subtitle && <div className="text-sm text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
