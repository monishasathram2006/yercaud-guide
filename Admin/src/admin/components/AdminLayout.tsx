import { useState, type ReactNode } from "react";
import { AdminSidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Toaster } from "@/components/ui/sonner";
import { AuthGate } from "./AuthGate";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop-only: the topbar hamburger collapses the sidebar to full-width content.
  const [desktopHidden, setDesktopHidden] = useState(false);
  // Every page in this app is behind the gate — there is no public Admin surface.
  return (
    <AuthGate>
    <div className="min-h-screen w-full bg-slate-50 flex">
      <AdminSidebar mobileOpen={mobileOpen} desktopHidden={desktopHidden} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          onOpenMobileSidebar={() => setMobileOpen((v) => !v)}
          onToggleDesktopSidebar={() => setDesktopHidden((v) => !v)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
      <Toaster />
    </div>
    </AuthGate>
  );
}
