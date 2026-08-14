import type { ReactElement } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { DashboardSuper } from "./pages/DashboardSuper";
import { DashboardOwner } from "./pages/DashboardOwner";
import { BusinessesPage } from "./pages/Businesses";
import { ApprovalsPage } from "./pages/Moderation";
import { ListingsPage } from "./pages/Listings";
import { ReviewsPage } from "./pages/Reviews";
import { EnquiriesPage, ContactMessagesPage } from "./pages/Enquiries";
import { UsersPage, OwnersPage, AdminsPage, RolesPage } from "./pages/People";
import { CategoriesPage, LocationsPage, BadgesPage } from "./pages/Taxonomies";
import { PromotionsPage, SponsoredPage, BannersPage } from "./pages/Marketing";
import { BlogPage, BlogCommentsPage, FAQPage, StaticPagesPage, NewsletterPage } from "./pages/Content";
import { BlogPostEditor } from "./pages/BlogPostEditor";
import { BusinessProfilePage, TeamPage } from "./pages/Business";
import { AuditLogPage } from "./pages/AuditLog";
import {
  ReportedContentPage,
  SettingsPage, NotificationsPage,
  AvailabilityPage, AnalyticsPage,
} from "./pages/Pages";

/**
 * Which page a path renders, and whether the caller may see it.
 *
 * This was two switch statements chosen by a `role: "super" | "owner"` toggle. It
 * is now one table keyed by path, each entry naming the permission module it
 * needs — the same vocabulary the backend guards with, so the router and the API
 * can't disagree. Advisory: every endpoint still enforces its own permission;
 * this only stops us rendering a page whose every request would 403.
 *
 * The dashboard still forks on role, because there genuinely are two of them:
 * a Super Admin's platform-wide KPIs and an owner's own-business view. A caller
 * who can see every Business gets the platform one.
 *
 * Absent by design — Bookings, Deals, Transactions, Commissions, Payouts,
 * Payment Settings, Channels, Channel Mapping, Sync Status, Rate & Availability.
 * ADR 0001 rules out in-platform booking and payments; ADR 0002 defers channel
 * integration (FR192-200). Their stubs remain in Pages.tsx, now unreachable.
 */
const ROUTES: Record<string, { render: () => ReactElement; module?: string }> = {
  "/businesses": { render: () => <BusinessesPage />, module: "Businesses" },
  "/listings": { render: () => <ListingsPage />, module: "Listings" },
  "/my-listings": { render: () => <ListingsPage ownerScoped />, module: "Listings" },
  "/availability": { render: () => <AvailabilityPage />, module: "Listings" },
  "/reviews": { render: () => <ReviewsPage />, module: "Reviews" },
  "/categories": { render: () => <CategoriesPage />, module: "Categories" },
  "/locations": { render: () => <LocationsPage />, module: "Categories" },
  "/badges": { render: () => <BadgesPage />, module: "Categories" },
  "/enquiries": { render: () => <EnquiriesPage />, module: "Enquiries" },
  "/contact-messages": { render: () => <ContactMessagesPage />, module: "Content" },
  "/users": { render: () => <UsersPage />, module: "Users" },
  "/owners": { render: () => <OwnersPage />, module: "Users" },
  "/admins": { render: () => <AdminsPage />, module: "Admins" },
  "/roles": { render: () => <RolesPage />, module: "Admins" },
  "/promotions": { render: () => <PromotionsPage />, module: "Marketing" },
  "/featured": { render: () => <SponsoredPage />, module: "Marketing" },
  "/banners": { render: () => <BannersPage />, module: "Marketing" },
  "/blog": { render: () => <BlogPage />, module: "Content" },
  "/blog/new": { render: () => <BlogPostEditor />, module: "Content" },
  "/blog-comments": { render: () => <BlogCommentsPage />, module: "Content" },
  "/faq": { render: () => <FAQPage />, module: "Content" },
  "/pages": { render: () => <StaticPagesPage />, module: "Content" },
  "/newsletter": { render: () => <NewsletterPage />, module: "Content" },
  "/approvals": { render: () => <ApprovalsPage />, module: "Listings" },
  "/reported": { render: () => <ReportedContentPage />, module: "Reviews" },
  "/profile": { render: () => <BusinessProfilePage /> },
  "/team": { render: () => <TeamPage /> },
  "/analytics": { render: () => <AnalyticsPage />, module: "Listings" },
  "/settings": { render: () => <SettingsPage />, module: "Settings" },
  "/notifications": { render: () => <NotificationsPage /> },
  "/audit-log": { render: () => <AuditLogPage />, module: "Admins" },
};

export function AdminRouter({ path: fallback }: { path?: string }) {
  const { canAccess } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname === "/" ? fallback || "/dashboard" : pathname;

  // "Sees every Business" is what makes a dashboard platform-wide rather than
  // own-business — a distinction a role name can't make for a custom Role.
  const isPlatformAdmin = canAccess("Admins");

  if (path === "/dashboard") return isPlatformAdmin ? <DashboardSuper /> : <DashboardOwner />;

  // /blog/:id/edit carries a dynamic id, so it can't be a static ROUTES key
  // like /blog/new — matched here instead, same module gate as /blog itself.
  const editMatch = path.match(/^\/blog\/([^/]+)\/edit$/);
  if (editMatch) {
    if (!canAccess("Content")) return <NoAccess />;
    return <BlogPostEditor postId={editMatch[1]} />;
  }

  const route = ROUTES[path];
  if (!route) return isPlatformAdmin ? <DashboardSuper /> : <DashboardOwner />;
  if (route.module && !canAccess(route.module)) return <NoAccess />;
  return route.render();
}

function NoAccess() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-900">You don't have access to this page</h2>
        <p className="mt-2 text-sm text-slate-600">Ask a Super Admin if you think you should.</p>
      </div>
    </div>
  );
}
