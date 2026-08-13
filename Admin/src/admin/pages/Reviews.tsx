import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, Check, X } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError, useListingNames } from "../queries";

/**
 * The Review moderation queue (ADR 0006: everything lands pending and
 * invisible until approved here).
 *
 * Reviewers show as "Visitor": the Review schema carries only userId — a
 * known gap shared with the public site, to be fixed in the contract rather
 * than by a page-local join. The mock's "Reported" filter is gone: reports
 * are filed (POST /reviews/{id}/report) but no endpoint reads them back yet.
 */

const STATUS_FILTERS = ["All", "pending", "approved", "rejected"];

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", status],
    queryFn: ({ signal }) => api.reviews.list(status === "All" ? {} : { status }, signal),
  });
  const { data: listingNames } = useListingNames();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "approval-queue"] });
    // Approving a Review changes the listing's averageRating/reviewCount too.
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.reviews.approve(id),
    onSuccess: () => { toast.success("Review approved"); refresh(); },
    onError: onApiError,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.reviews.reject(id),
    onSuccess: () => { toast.success("Review rejected"); refresh(); },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Reviews" subtitle="Every Review starts pending and goes public only once approved here." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={data ?? []}
          filters={[{ label: "Status", key: "status", options: STATUS_FILTERS, value: status, onChange: setStatus }]}
          emptyTitle="No reviews"
          columns={[
            { key: "listing", header: "Listing", render: (r) => listingNames?.get(r.listingId) ?? "—" },
            { key: "rating", header: "Rating", render: (r) => (
              <div className="inline-flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-3 h-3 ${i < r.rating ? "fill-amber-500" : "text-slate-300"}`} />
                ))}
              </div>
            ) },
            { key: "text", header: "Review", render: (r) => (
              <div className="max-w-xs">
                <div className="line-clamp-1">{r.text ?? "(no text)"}</div>
                {r.ownerReply && <div className="line-clamp-1 text-xs text-slate-500">↳ {r.ownerReply}</div>}
              </div>
            ) },
            { key: "date", header: "Date", sortable: true, accessor: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rowActions={can("Reviews", "approve") ? (r) => (
            <>
              {r.status !== "approved" && (
                <button onClick={() => approve.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <Check className="w-3 h-3 mr-2" />Approve
                </button>
              )}
              {r.status !== "rejected" && (
                <button onClick={() => reject.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <X className="w-3 h-3 mr-2" />Reject
                </button>
              )}
            </>
          ) : undefined}
        />
      )}
    </>
  );
}
