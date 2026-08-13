import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { ListingThumb } from "@/components/ListingThumb";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { detailPath } from "@/lib/listing-display";
import { MY_ENQUIRIES_KEY, ENQUIRY_STATUS_STYLES } from "@/lib/my-activity";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/my-enquiries")({
  head: () => ({ meta: [{ title: "My Enquiries — Yercaud Business Directory" }, { name: "description", content: "Every Enquiry you've sent to a Yercaud business." }] }),
  component: MyEnquiriesPage,
});

function MyEnquiriesPage() {
  const { isSignedIn } = useAuth();
  const { data: enquiries, isLoading } = useQuery({
    queryKey: MY_ENQUIRIES_KEY,
    queryFn: () => api.me.enquiries(),
    enabled: isSignedIn,
  });

  if (!isSignedIn) return <PageShell><SignInPrompt title="Sign in to see your Enquiries" sub="Track every message you've sent to a Yercaud business." /></PageShell>;

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Profile", to: "/profile" }, { label: "My Enquiries" }]} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900">My Enquiries</h1>
        <p className="mt-1 text-sm text-gray-600">Every message you've sent to a business on Yercaud Guide.</p>

        {isLoading && <p className="mt-8 text-sm text-gray-500">Loading…</p>}

        {!isLoading && enquiries?.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-[#F7F9F8] p-12 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-[#1E7A46]" />
            <div className="mt-3 font-semibold text-gray-900">No Enquiries yet</div>
            <p className="mt-1 text-sm text-gray-600">When you contact a business, it'll show up here.</p>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {enquiries?.map((e) => (
            <Link key={e.id} to={e.listing ? detailPath(e.listing) : "/profile"} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-[#1E7A46]/40">
              <ListingThumb src={e.listing?.primaryImageUrl ?? null} alt={e.listing?.name ?? ""} className="h-16 w-24 rounded-lg" />
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{e.listing?.name ?? "Listing"}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ENQUIRY_STATUS_STYLES[e.status]}`}>{e.status}</span>
                </div>
                <div className="text-xs text-gray-500">
                  Sent on {new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {e.message}
                </div>
                {e.ownerResponse && <div className="mt-1 text-xs text-gray-600"><span className="font-medium text-gray-700">Reply:</span> {e.ownerResponse}</div>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
