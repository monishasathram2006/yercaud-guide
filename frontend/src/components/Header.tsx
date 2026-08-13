import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Heart, User, ChevronDown, LogOut, ClipboardList, Settings, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/hotels", label: "Hotels" },
  { to: "/restaurants", label: "Restaurants" },
  { to: "/activities", label: "Activities" },
  { to: "/tours", label: "Tours & Travels" },
  { to: "/directory", label: "Directory" },
  { to: "/blog", label: "Blog" },
  { to: "/faq", label: "FAQ" },
] as const;

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isSignedIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Yercaud Guide" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <div className="min-w-0 leading-tight">
            <div className="text-lg font-extrabold tracking-wide text-[#1E7A46]">YERCAUD</div>
            <div className="-mt-0.5 text-[11px] text-gray-500">Business Directory</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {navLinks.map((l) => {
            const active = pathname === l.to || (l.to !== "/" && pathname.startsWith(l.to));
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`relative py-1 text-sm font-medium transition ${
                  active ? "text-[#1E7A46]" : "text-gray-700 hover:text-[#1E7A46]"
                }`}
              >
                {l.label}
                {active && <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-[#1E7A46]" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/favorites" className="hidden items-center gap-1.5 text-sm text-gray-700 hover:text-[#1E7A46] sm:flex">
            <Heart className="h-4 w-4" /> Favorites
          </Link>
          {isSignedIn && user ? (
            <div className="relative">
              <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-3 text-sm hover:border-[#1E7A46]">
                <UserAvatar
                  src={user.avatarUrl}
                  name={user.name}
                  className="h-7 w-7 rounded-full"
                  fallbackClassName="bg-[#1E7A46]/10 text-xs font-semibold text-[#1E7A46]"
                />
                <span className="hidden font-medium text-gray-800 sm:inline">Hi, {user.name.split(" ")[0]}</span>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
                  <MenuLink to="/profile" icon={User} onClick={() => setOpen(false)}>My Profile</MenuLink>
                  <MenuLink to="/profile" icon={ClipboardList} onClick={() => setOpen(false)}>My Enquiries</MenuLink>
                  <MenuLink to="/favorites" icon={Heart} onClick={() => setOpen(false)}>Favorites</MenuLink>
                  <MenuLink to="/profile/edit" icon={Settings} onClick={() => setOpen(false)}>Account Settings</MenuLink>
                  <button
                    onClick={() => { void signOut(); setOpen(false); navigate({ to: "/" }); }}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-full border border-[#1E7A46] px-4 py-1.5 text-sm font-medium text-[#1E7A46] transition hover:bg-[#1E7A46] hover:text-white">
              <User className="h-4 w-4" /> Sign In
            </Link>
          )}

          {/* The nav above is lg:flex only, so without this there is no
              navigation at all below 1024px. */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-gray-200 text-gray-700 hover:border-[#1E7A46] hover:text-[#1E7A46] lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-gray-100 bg-white lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col px-6 py-2">
            {navLinks.map((l) => {
              const active = pathname === l.to || (l.to !== "/" && pathname.startsWith(l.to));
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileOpen(false)}
                  className={`border-b border-gray-50 py-3 text-sm font-medium last:border-0 ${
                    active ? "text-[#1E7A46]" : "text-gray-700 hover:text-[#1E7A46]"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
            {/* Favorites is sm:flex in the bar above — it'd be unreachable on a phone otherwise. */}
            <Link
              to="/favorites"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-1.5 border-t border-gray-100 py-3 text-sm font-medium text-gray-700 hover:text-[#1E7A46] sm:hidden"
            >
              <Heart className="h-4 w-4" /> Favorites
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function MenuLink({ to, icon: Icon, children, onClick }: { to: string; icon: typeof User; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
