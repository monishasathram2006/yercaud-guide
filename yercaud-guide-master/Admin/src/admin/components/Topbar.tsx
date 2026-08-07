import { Menu, Bell, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./GlobalSearch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

export function Topbar({
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
}: {
  onOpenMobileSidebar: () => void;
  onToggleDesktopSidebar: () => void;
}) {
  const { user, isImpersonating, exitImpersonation, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 flex items-center gap-3 px-4 md:px-6">
      {/* Same icon, different jobs: on mobile it opens the drawer; on desktop
          it collapses the always-visible sidebar to give the content full width. */}
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={onOpenMobileSidebar}>
        <Menu className="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex text-slate-600" aria-label="Toggle sidebar" onClick={onToggleDesktopSidebar}>
        <Menu className="w-5 h-5" />
      </Button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {/*
          This was a "View as: Super Admin / Business Owner" dropdown that
          switched a client-side flag — unknowingly imitating FR160, which is
          specified, implemented, and was never called.
          Real impersonation targets a *person*, not a role, so it starts from a
          User's row on the Users page. All that belongs here is the banner
          saying you're in one, and the way out.
        */}
        {isImpersonating && (
          <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
            <Eye className="h-3.5 w-3.5" />
            Viewing as {user?.name}
            <button onClick={() => void exitImpersonation()} className="ml-1 rounded bg-amber-900 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-800">
              Exit
            </button>
          </div>
        )}

        {/* The mock showed a hardcoded "5" badge on a dead button. There is no
            notifications backend yet, so the honest version is an empty tray. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Notifications" className="relative h-9 w-9 rounded-full hover:bg-slate-100 inline-flex items-center justify-center">
              <Bell className="w-5 h-5 text-slate-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No notifications yet.
              <div className="mt-1 text-[11px] text-slate-400">A notifications backend hasn't been built.</div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 rounded-full bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div>{user?.name ?? "Not signed in"}</div>
              <div className="text-[11px] font-normal text-slate-500">{user?.roles?.join(", ") || "No roles"}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
