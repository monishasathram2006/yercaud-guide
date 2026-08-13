import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type ApprovalQueueItem } from "@/lib/api";
import { onApiError } from "../queries";

/**
 * One inbox for everything gated on approval: Business applications, Listing
 * first-publishes (ADR 0005), Reviews (ADR 0006) and blog comments. The queue
 * endpoint names the kind; approving dispatches to that kind's own endpoint,
 * so this page holds no approval logic of its own.
 *
 * A Business or Listing rejection carries a reason the owner reads; Reviews
 * and comments are moderated flatly and don't.
 */

type Kind = NonNullable<ApprovalQueueItem["kind"]>;

const approveByKind: Record<Kind, (id: string) => Promise<unknown>> = {
  business: (id) => api.businesses.approve(id),
  listing: (id) => api.listings.approve(id),
  review: (id) => api.reviews.approve(id),
  blog_comment: (id) => api.blog.approveComment(id),
};

const rejectByKind: Record<Kind, (id: string, reason: string) => Promise<unknown>> = {
  business: (id, reason) => api.businesses.reject(id, reason),
  listing: (id, reason) => api.listings.reject(id, reason),
  review: (id) => api.reviews.reject(id),
  blog_comment: (id) => api.blog.rejectComment(id),
};

const needsReason = (kind: Kind) => kind === "business" || kind === "listing";

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<ApprovalQueueItem | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "approval-queue"],
    queryFn: ({ signal }) => api.admin.approvalQueue(signal),
  });

  // Approving a queue item changes whichever list it came from too.
  const refresh = () => void queryClient.invalidateQueries();

  const approve = useMutation({
    mutationFn: (item: ApprovalQueueItem) => approveByKind[item.kind!](item.id!),
    onSuccess: (_, item) => { toast.success(`Approved ${item.subject}`); refresh(); },
    onError: onApiError,
  });

  const reject = useMutation({
    mutationFn: (vars: { item: ApprovalQueueItem; reason: string }) =>
      rejectByKind[vars.item.kind!](vars.item.id!, vars.reason),
    onSuccess: (_, vars) => { toast.success(`Rejected ${vars.item.subject}`); refresh(); },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Approval Queue" subtitle="Everything waiting on a Super Admin, oldest first." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={(data ?? []).map((item) => ({ ...item, id: `${item.kind}:${item.id}` }))}
          bulk={false}
          emptyTitle="Nothing waiting for approval"
          columns={[
            { key: "kind", header: "Type", render: (r) => <span className="capitalize">{r.kind?.replace("_", " ")}</span> },
            { key: "subject", header: "Subject", render: (r) => <span className="font-medium">{r.subject}</span> },
            { key: "submitted", header: "Submitted", render: (r) => fmtDate(r.submittedAt) },
            { key: "status", header: "Status", render: () => <StatusBadge status="pending" /> },
          ]}
          rowActions={(r) => {
            const item: ApprovalQueueItem = { ...r, id: r.id.split(":")[1] };
            return (
              <>
                <button onClick={() => approve.mutate(item)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <Check className="w-3 h-3 mr-2" />Approve
                </button>
                <button
                  onClick={() => {
                    if (needsReason(item.kind!)) { setRejecting(item); setReason(""); }
                    else reject.mutate({ item, reason: "" });
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center"
                >
                  <X className="w-3 h-3 mr-2" />{needsReason(item.kind!) ? "Reject…" : "Reject"}
                </button>
              </>
            );
          }}
        />
      )}

      <FormDrawer
        open={rejecting !== null}
        onOpenChange={(v) => { if (!v) setRejecting(null); }}
        title={`Reject ${rejecting?.subject ?? ""}`}
        saveLabel="Reject"
        onSave={() => {
          if (!rejecting) return;
          if (!reason.trim()) { toast.error("A rejection needs a reason the owner will see"); return; }
          reject.mutate({ item: rejecting, reason: reason.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Reason</Label>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to the owner." />
        </div>
      </FormDrawer>
    </>
  );
}
