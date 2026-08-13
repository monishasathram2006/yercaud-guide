import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Ban, Archive } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Business } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError } from "../queries";

/**
 * The platform's Business register — FR161's approval gate lives here.
 *
 * No "Add Business" button: POST /businesses is the owner's own application
 * (it records the caller as owner), so an admin creating one here would end up
 * owning it. Admins approve, reject, suspend and archive what owners submit.
 */

const STATUS_FILTERS = ["All", "pending", "approved", "rejected", "suspended", "archived"];

export function BusinessesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState("All");
  const [rejecting, setRejecting] = useState<Business | null>(null);
  const [reason, setReason] = useState("");
  const [viewing, setViewing] = useState<Business | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["businesses", status],
    queryFn: ({ signal }) => api.businesses.list(status === "All" ? {} : { status }, signal),
  });

  // Business carries only ownerId; the Users list resolves it to a person.
  const { data: users } = useQuery({
    queryKey: ["users", {}],
    queryFn: ({ signal }) => api.users.list({}, signal),
    enabled: can("Users", "view"),
  });
  const ownerName = (id: string) => users?.find((u) => u.id === id)?.name ?? "—";

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["businesses"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "approval-queue"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.businesses.approve(id),
    onSuccess: (b) => { toast.success(`Approved ${b.name}`); refresh(); },
    onError: onApiError,
  });
  const reject = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => api.businesses.reject(vars.id, vars.reason),
    onSuccess: (b) => { toast.success(`Rejected ${b.name}`); refresh(); },
    onError: onApiError,
  });
  const suspend = useMutation({
    mutationFn: (id: string) => api.businesses.suspend(id),
    onSuccess: (b) => { toast.success(`Suspended ${b.name}`); refresh(); },
    onError: onApiError,
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.businesses.archive(id),
    onSuccess: (b) => { toast.success(`Archived ${b.name}`); refresh(); },
    onError: onApiError,
  });

  const canApprove = can("Businesses", "approve");

  return (
    <>
      <PageHeader title="Businesses" subtitle="Approve and manage the Businesses owners have registered." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={data ?? []}
          filters={[{ label: "Status", key: "status", options: STATUS_FILTERS, value: status, onChange: setStatus }]}
          columns={[
            { key: "name", header: "Business", sortable: true, accessor: (r) => r.name, render: (r) => (
              <div className="flex items-center gap-3">
                {r.logoUrl && <img src={r.logoUrl} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                <div>
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.address ?? "No address"}</div>
                </div>
              </div>
            ) },
            { key: "owner", header: "Owner", render: (r) => ownerName(r.ownerId) },
            { key: "contact", header: "Contact", render: (r) => (
              <div className="text-xs">
                <div>{r.contactPhone ?? "—"}</div>
                <div className="text-slate-500">{r.contactEmail ?? ""}</div>
              </div>
            ) },
            { key: "createdAt", header: "Registered", sortable: true, accessor: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          onView={(r) => setViewing(r)}
          rowActions={canApprove ? (r) => (
            <>
              {r.status !== "approved" && (
                <button onClick={() => approve.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <Check className="w-3 h-3 mr-2" />Approve
                </button>
              )}
              {(r.status === "pending" || r.status === "approved") && (
                <button onClick={() => { setRejecting(r); setReason(""); }} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <X className="w-3 h-3 mr-2" />Reject…
                </button>
              )}
              {r.status === "approved" && (
                <button onClick={() => suspend.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <Ban className="w-3 h-3 mr-2" />Suspend
                </button>
              )}
              {r.status !== "archived" && (
                <button onClick={() => archive.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <Archive className="w-3 h-3 mr-2" />Archive
                </button>
              )}
            </>
          ) : undefined}
        />
      )}

      <FormDrawer
        open={rejecting !== null}
        onOpenChange={(v) => { if (!v) setRejecting(null); }}
        title={`Reject ${rejecting?.name ?? ""}`}
        saveLabel="Reject"
        onSave={() => {
          if (!rejecting) return;
          if (!reason.trim()) { toast.error("A rejection needs a reason the owner will see"); return; }
          reject.mutate({ id: rejecting.id, reason: reason.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Reason</Label>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to the Business Owner." />
        </div>
      </FormDrawer>

      <FormDrawer
        open={viewing !== null}
        onOpenChange={(v) => { if (!v) setViewing(null); }}
        title={viewing?.name ?? ""}
        saveLabel="Close"
      >
        {viewing && (
          <dl className="space-y-3 text-sm">
            <Detail label="Status"><StatusBadge status={viewing.status} /></Detail>
            <Detail label="Owner">{ownerName(viewing.ownerId)}</Detail>
            <Detail label="Description">{viewing.description ?? "—"}</Detail>
            <Detail label="Phone">{viewing.contactPhone ?? "—"}</Detail>
            <Detail label="Email">{viewing.contactEmail ?? "—"}</Detail>
            <Detail label="Website">{viewing.website ?? "—"}</Detail>
            <Detail label="Address">{viewing.address ?? "—"}</Detail>
            <Detail label="Registered">{fmtDate(viewing.createdAt)}</Detail>
            {viewing.rejectionReason && <Detail label="Rejection reason">{viewing.rejectionReason}</Detail>}
          </dl>
        )}
      </FormDrawer>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}
