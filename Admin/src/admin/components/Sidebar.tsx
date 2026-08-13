import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Building2, Layers, MapPin, ListChecks, Star,
  MessageSquare, Users, UserCog, ShieldCheck,
  Megaphone, Sparkles, Image as ImageIcon, FileText, MessageCircle,
  HelpCircle, FileEdit, Mail, Settings, Bell, ScrollText, ClipboardCheck,
  Calendar, BarChart3, Users2, Inbox, Award, ChevronDown,
} from "lucide-react";

/**
 * One navigation tree, filtered by what the caller may actually do.
 *
 * This replaced two hardcoded trees (SUPER_NAV / OWNER_NAV) selected by a
 * `role: "super" | "owner"` toggle that defaulted to Super Admin and
 * authenticated nobody. Branching on role names can't express a
 * Super-Admin-created custom Role: a "Content Moderator" would have seen the
 * Business Owner's tree or nothing.
 *
 * `module` is the permission module each item needs — the same vocabulary the
 * backend guards with, so the nav and the API can't disagree about who sees what.
 * Advisory only: every endpoint still enforces its own permission.
 *
 * Deliberately absent, and worth stating plainly: Bookings, Best Deals,
 * Transactions, Commissions, Payouts, Payment Settings, Channels, Channel
 * Mapping, Sync Status and Rate & Availability. Those aren't unbuilt — they're
 * features this platform has decided not to have. ADR 0001: no in-platform
 * booking or payments ("a visitor enquires, then arranges things directly with
 * the business off-platform"). ADR 0002: OTA/aggregator channel integration
 * (FR192-200) is deferred indefinitely. Linking to them advertised a product
 * that does not exist; their page stubs remain in Pages.tsx and are now
 * unreachable, pending a decision to delete them.
 */
type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission module gating this item; omitted means "any signed-in caller". */
  module?: string;
  /** Own-Business pages: shown to callers who are NOT platform admins. An owner
   * holds no module for their own Business — the backend authorises by
   * ownership — so a module can't express these. */
  ownerOnly?: boolean;
  /** Marks a page still backed by static/mock data (see Pages.tsx's MockPageBanner) rather than the API. */
  mock?: boolean;
};
type NavGroup = { label?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Manage Directory",
    items: [
      { title: "Businesses", url: "/businesses", icon: Building2, module: "Businesses" },
      { title: "Listings", url: "/listings", icon: ListChecks, module: "Listings" },
      { title: "Availability & Pricing", url: "/availability", icon: Calendar, module: "Listings", mock: true },
      { title: "Reviews", url: "/reviews", icon: Star, module: "Reviews" },
    ],
  },
  {
    label: "Taxonomies",
    items: [
      { title: "Categories", url: "/categories", icon: Layers, module: "Categories" },
      { title: "Locations", url: "/locations", icon: MapPin, module: "Categories" },
      { title: "Badges", url: "/badges", icon: Award, module: "Categories" },
    ],
  },
  {
    label: "Enquiries",
    items: [
      { title: "Enquiries", url: "/enquiries", icon: MessageSquare, module: "Enquiries" },
      { title: "Contact Messages", url: "/contact-messages", icon: Inbox, module: "Content" },
    ],
  },
  {
    label: "Users & Admins",
    items: [
      { title: "Users", url: "/users", icon: Users, module: "Users" },
      { title: "Business Owners", url: "/owners", icon: Building2, module: "Users" },
      { title: "Admins", url: "/admins", icon: UserCog, module: "Admins" },
      { title: "Roles & Permissions", url: "/roles", icon: ShieldCheck, module: "Admins" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Promotions", url: "/promotions", icon: Megaphone, module: "Marketing" },
      { title: "Sponsored Placements", url: "/featured", icon: Sparkles, module: "Marketing" },
      { title: "Banner Management", url: "/banners", icon: ImageIcon, module: "Marketing" },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Blog", url: "/blog", icon: FileText, module: "Content" },
      { title: "Blog Comments", url: "/blog-comments", icon: MessageCircle, module: "Content" },
      { title: "FAQ", url: "/faq", icon: HelpCircle, module: "Content" },
      { title: "Static Pages", url: "/pages", icon: FileEdit, module: "Content" },
      { title: "Newsletter", url: "/newsletter", icon: Mail, module: "Content" },
    ],
  },
  {
    label: "Moderation",
    items: [
      { title: "Approval Queue", url: "/approvals", icon: ClipboardCheck, module: "Listings" },
      { title: "Reported Content", url: "/reported", icon: Star, module: "Reviews", mock: true },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Business Profile", url: "/profile", icon: Building2, ownerOnly: true },
      { title: "Team", url: "/team", icon: Users2, ownerOnly: true },
      { title: "Analytics", url: "/analytics", icon: BarChart3, module: "Listings", mock: true },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "General Settings", url: "/settings", icon: Settings, module: "Settings", mock: true },
      { title: "Notifications", url: "/notifications", icon: Bell, mock: true },
      { title: "Audit Log", url: "/audit-log", icon: ScrollText, module: "Admins" },
    ],
  },
];

export function AdminSidebar({
  mobileOpen,
  desktopHidden,
  onClose,
}: {
  mobileOpen: boolean;
  desktopHidden: boolean;
  onClose: () => void;
}) {
  const { user, canAccess, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (url: string) => pathname === url || (url !== "/dashboard" && pathname.startsWith(url));

  // An empty group after filtering renders nothing — no orphan headings.
  const isPlatformAdmin = canAccess("Admins");
  const nav = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.module || canAccess(i.module)) && (!i.ownerOnly || !isPlatformAdmin)),
  })).filter(
    (g) => g.items.length > 0,
  );

  const roleLabel = user?.roles?.[0] ?? "Signed in";
  const hasMockItems = nav.some((g) => g.items.some((i) => i.mock));

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0 text-slate-200 flex flex-col transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          desktopHidden ? "lg:hidden" : "lg:translate-x-0",
        )}
        style={{ background: "linear-gradient(180deg, #0e2a3b 0%, #0b1f2e 100%)" }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Yercaud Guide" className="w-14 h-14 rounded-full object-cover border border-emerald-500/30" />
            <div>
              <div className="font-extrabold tracking-wide text-emerald-400 leading-none">YERCAUD</div>
              <div className="text-[11px] text-slate-400 mt-1">Business Directory</div>
            </div>
          </div>
          <div className="mt-3 inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 font-medium">
            {roleLabel}
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {nav.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                  {group.label}
                </div>
              )}
              <ul className="space-y-1">
                {group.items.map((it) => {
                  const isActive = active(it.url);
                  const Icon = it.icon;
                  return (
                    <li key={it.url}>
                      <Link
                        to={it.url}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-emerald-600 text-white font-semibold shadow-sm"
                            : "text-slate-300 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate flex items-center gap-1">
                          {it.title}
                          {it.mock && (
                            <span title="Static/mock data — not yet wired to the backend">
                              <Star className="w-3 h-3 shrink-0 fill-yellow-400 text-yellow-400" />
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {hasMockItems && (
            <div className="px-3 pt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <Star className="w-2.5 h-2.5 shrink-0 fill-yellow-400 text-yellow-400" />
              Static/mock data, not yet wired to the backend
            </div>
          )}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-white/5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left hover:bg-white/10">
                <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-semibold">
                  {user?.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  {/* The real signed-in User, not "Admin User" / "Ravi Kumar". */}
                  <div className="text-sm font-semibold text-white truncate">{user?.name ?? "Not signed in"}</div>
                  <div className="text-[11px] text-slate-400 truncate">{user?.roles?.join(", ") || "No roles"}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel>
                <div>{user?.name ?? "Not signed in"}</div>
                <div className="text-[11px] font-normal text-slate-500">{user?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
