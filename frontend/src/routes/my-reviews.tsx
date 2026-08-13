import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { ListingThumb } from "@/components/ListingThumb";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { detailPath } from "@/lib/listing-display";
import { MY_REVIEWS_KEY, REVIEW_STATUS_STYLES } from "@/lib/my-activity";
import { MessageSquare, Star } from "lucide-react";

export const Route = createFileRoute("/my-reviews")({
  head: () => ({ meta: [{ title: "My Reviews — Yercaud Business Directory" }, { name: "description", content: "Every Review you've written on Yercaud Guide." }] }),
  component: MyReviewsPage,
});

function MyReviewsPage() {
  const { isSignedIn } = useAuth();
  const { data: reviews, isLoading } = useQuery({
    queryKey: MY_REVIEWS_KEY,
    queryFn: () => api.me.reviews(),
    enabled: isSignedIn,
  });

  if (!isSignedIn) return <PageShell><SignInPrompt title="Sign in to see your Reviews" sub="Track every Review you've written, including ones awaiting approval." /></PageShell>;

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Profile", to: "/profile" }, { label: "My Reviews" }]} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900">My Reviews</h1>
        <p className="mt-1 text-sm text-gray-600">Every Review you've written, including ones still awaiting approval.</p>

        {isLoading && <p className="mt-8 text-sm text-gray-500">Loading…</p>}

        {!isLoading && reviews?.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-[#F7F9F8] p-12 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-[#1E7A46]" />
            <div className="mt-3 font-semibold text-gray-900">No Reviews yet</div>
            <p className="mt-1 text-sm text-gray-600">When you review a business, it'll show up here.</p>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {reviews?.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-100 p-3">
              <Link to={r.listing ? detailPath(r.listing) : "/profile"} className="flex items-center gap-3">
                <ListingThumb src={r.listing?.primaryImageUrl ?? null} alt={r.listing?.name ?? ""} className="h-14 w-20 rounded-lg" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{r.listing?.name ?? "Listing"}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${REVIEW_STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">{r.listing?.categoryName}</div>
                </div>
                <div className="text-right">
                  <div className="flex justify-end text-yellow-500">
                    {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-500" />)}
                  </div>
                  <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              </Link>
              <p className="mt-2 text-sm text-gray-700">{r.text}</p>
              {r.ownerReply && (
                <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                  <span className="font-medium text-gray-800">Owner's reply:</span> {r.ownerReply}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
