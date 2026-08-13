import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { useAuth } from "@/lib/auth";
import { useFavorites } from "@/lib/favorites";
import { UserAvatar } from "@/components/UserAvatar";
import { ListingThumb } from "@/components/ListingThumb";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/AccountSettingsForms";
import { api } from "@/lib/api";
import { detailPath } from "@/lib/listing-display";
import { MY_ENQUIRIES_KEY, MY_REVIEWS_KEY, MY_STATS_KEY, ENQUIRY_STATUS_STYLES } from "@/lib/my-activity";
import { Camera, Edit3, Star, ClipboardList, MessageSquare, Heart, Building2, User, Lock, Trash2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Yercaud Business Directory" },
      { name: "description", content: "Manage your Yercaud Guide profile, enquiries, reviews and favorites." },
    ],
  }),
  component: ProfilePage,
});

const tabs = ["Overview", "My Enquiries", "Reviews", "Favorites", "My Listings", "Account Settings"] as const;

function ProfilePage() {
  const { user, isSignedIn } = useAuth();
  const [tab, setTab] = useState<typeof tabs[number]>("Overview");

  const { data: enquiries } = useQuery({ queryKey: MY_ENQUIRIES_KEY, queryFn: () => api.me.enquiries(), enabled: isSignedIn });
  const { data: reviews } = useQuery({ queryKey: MY_REVIEWS_KEY, queryFn: () => api.me.reviews(), enabled: isSignedIn });
  const { data: favorites } = useFavorites();
  const { data: stats } = useQuery({ queryKey: MY_STATS_KEY, queryFn: () => api.me.stats(), enabled: isSignedIn });

  if (!isSignedIn || !user) return <PageShell><SignInPrompt title="Sign in to view your profile" sub="Track your enquiries, reviews and favorites in one place." /></PageShell>;

  const completion = [
    { l: "Basic Information", d: Boolean(user.name) },
    { l: "Contact Details", d: Boolean(user.phone) },
    { l: "Profile Photo", d: Boolean(user.avatarUrl) },
    { l: "About Me", d: Boolean(user.bio) },
    { l: "Email Verification", d: Boolean(user.emailVerifiedAt) },
  ];
  const completionPct = Math.round((completion.filter((c) => c.d).length / completion.length) * 100);
  const isBusinessOwner = user.roles.includes("Business Owner");

  return (
    <PageShell>
      <div className="relative">
        {/* users has no cover image column — a flat banner beats a fake photo. */}
        <div className="h-56 w-full bg-[#0f1a12]" />
        <div className="absolute inset-0 bg-black/20" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-7xl items-end gap-4 px-6 pb-6 text-white">
            <div className="relative">
              <UserAvatar
                src={user.avatarUrl}
                name={user.name}
                className="h-24 w-24 rounded-full border-4 border-white"
                fallbackClassName="bg-[#1E7A46] text-2xl font-bold text-white"
              />
              <button className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-[#1E7A46] text-white"><Camera className="h-3.5 w-3.5" /></button>
            </div>
            <div>
              <div className="flex items-center gap-2 text-2xl font-bold">Hello, {user.name}!</div>
              <div className="text-sm text-white/80">Member since {new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
            </div>
          </div>
        </div>
      </div>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Profile" }]} />
      <section className="border-b border-gray-100">
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-6">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-4 text-sm font-medium ${tab === t ? "border-[#1E7A46] text-[#1E7A46]" : "border-transparent text-gray-600 hover:text-[#1E7A46]"}`}>{t}</button>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">About Me</h2>
              <Link to="/profile/edit" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700"><Edit3 className="h-3.5 w-3.5" /> Edit Profile</Link>
            </div>
            <p className="text-sm text-gray-600">{user.bio ?? "No bio yet."}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm text-gray-700">
              <div>✉️ {user.email}</div>
              <div>📞 {user.phone}</div>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">My Enquiries</h2>
              <Link to="/my-enquiries" className="text-sm font-medium text-[#1E7A46]">View All Enquiries →</Link>
            </div>
            {enquiries?.length === 0 && <p className="text-sm text-gray-500">No Enquiries sent yet.</p>}
            <div className="space-y-3">
              {enquiries?.slice(0, 3).map((e) => (
                <Link key={e.id} to={e.listing ? detailPath(e.listing) : "/profile"} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-[#1E7A46]/40">
                  <ListingThumb src={e.listing?.primaryImageUrl ?? null} alt={e.listing?.name ?? ""} className="h-16 w-24 rounded-lg" />
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2"><span className="font-semibold text-gray-900">{e.listing?.name ?? "Listing"}</span> <span className={`rounded px-2 py-0.5 text-xs font-medium ${ENQUIRY_STATUS_STYLES[e.status]}`}>{e.status}</span></div>
                    <div className="text-xs text-gray-500">Sent on {new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {e.message}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">My Reviews</h2>
              <Link to="/my-reviews" className="text-sm font-medium text-[#1E7A46]">View All Reviews →</Link>
            </div>
            {reviews?.length === 0 && <p className="text-sm text-gray-500">No Reviews written yet.</p>}
            <div className="space-y-3">
              {reviews?.slice(0, 3).map((r) => (
                <Link key={r.id} to={r.listing ? detailPath(r.listing) : "/profile"} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-[#1E7A46]/40">
                  <ListingThumb src={r.listing?.primaryImageUrl ?? null} alt={r.listing?.name ?? ""} className="h-14 w-20 rounded-lg" />
                  <div className="flex-1"><div className="font-semibold text-gray-900">{r.listing?.name ?? "Listing"}</div><div className="text-xs text-gray-500">{r.listing?.categoryName}</div></div>
                  <div className="text-right"><div className="flex text-yellow-500">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-500" />)}</div><div className="text-xs text-gray-500">Reviewed on {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div></div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">My Favorites</h2>
              <Link to="/favorites" className="text-sm font-medium text-[#1E7A46]">View All Favorites →</Link>
            </div>
            {favorites?.length === 0 && <p className="text-sm text-gray-500">No Favorites saved yet.</p>}
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {favorites?.slice(0, 5).map((l) => (
                <Link key={l.id} to={detailPath(l)} className="overflow-hidden rounded-xl border border-gray-100 hover:border-[#1E7A46]/40">
                  <ListingThumb src={l.primaryImageUrl} alt={l.name} className="h-24 w-full" />
                  <div className="p-2 text-xs"><div className="font-semibold text-gray-900">{l.name}</div><div className="text-gray-500">{l.categoryName}</div></div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h3 className="mb-3 text-base font-bold text-gray-900">Profile Completion</h3>
            <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-8 border-[#1E7A46] text-2xl font-bold text-gray-900">{completionPct}%</div>
            <p className="mt-3 text-center text-xs text-gray-600">Complete your profile to get better recommendations and offers.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {completion.map((x) => (
                <li key={x.l} className="flex items-center gap-2"><span className={`h-4 w-4 rounded-full ${x.d ? "bg-[#1E7A46]" : "border border-gray-300"}`}></span> {x.l}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="mb-3 text-base font-bold text-gray-900">My Statistics</h3>
            <div className="space-y-2 text-sm">
              {[
                { i: ClipboardList, l: "Enquiries", n: stats?.enquiries },
                { i: MessageSquare, l: "Reviews", n: stats?.reviews },
                { i: Heart, l: "Favorites", n: stats?.favorites },
                ...(isBusinessOwner ? [{ i: Building2, l: "Listings", n: stats?.listings }] : []),
              ].map((s) => (
                <div key={s.l} className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-700"><s.i className="h-4 w-4 text-[#1E7A46]" /> {s.l}</span><span className="font-semibold text-gray-900">{s.n ?? "—"}</span></div>
              ))}
            </div>
          </Card>

          <AccountSettingsCard hasPassword={user.hasPassword} userId={user.id} />
        </aside>
      </section>
    </PageShell>
  );
}

function AccountSettingsCard({ hasPassword, userId }: { hasPassword: boolean; userId: string }) {
  const [panel, setPanel] = useState<"password" | "delete" | null>(null);

  return (
    <Card>
      <h3 className="mb-3 text-base font-bold text-gray-900">Account Settings</h3>
      {panel === null && (
        <div className="space-y-1 text-sm">
          <Link to="/profile/edit" className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-gray-700 hover:bg-gray-50">
            <span className="flex items-center gap-2"><User className="h-4 w-4 text-[#1E7A46]" /> Personal Information</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
          <button onClick={() => setPanel("password")} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-gray-700 hover:bg-gray-50">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-[#1E7A46]" /> {hasPassword ? "Change Password" : "Set Password"}</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
          <button onClick={() => setPanel("delete")} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-red-600 hover:bg-red-50">
            <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete Account</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      )}
      {panel === "password" && (
        <div>
          <button onClick={() => setPanel(null)} className="mb-3 text-xs font-medium text-gray-500">← Back</button>
          <ChangePasswordForm hasPassword={hasPassword} onDone={() => setPanel(null)} />
        </div>
      )}
      {panel === "delete" && (
        <div>
          <button onClick={() => setPanel(null)} className="mb-3 text-xs font-medium text-gray-500">← Back</button>
          <DeleteAccountForm userId={userId} onCancel={() => setPanel(null)} />
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">{children}</div>;
}
