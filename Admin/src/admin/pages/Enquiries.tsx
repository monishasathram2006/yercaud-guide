import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Reply, CheckCircle2 } from "lucide-react";
import { PageHeader, StatusBadge, SkeletonList, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Enquiry } from "@/lib/api";
import { onApiError, useListingNames } from "../queries";

/**
 * The Enquiry inbox — the platform's sole conversion mechanism (ADR 0001),
 * so this is the page a Business Owner lives in. The backend scopes the list:
 * owners see their own Listings' Enquiries, a Super Admin sees all.
 */

const STATUS_FILTERS = ["All", "sent", "responded", "closed"];

export function EnquiriesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("All");
  const [replying, setReplying] = useState<Enquiry | null>(null);
  const [response, setResponse] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["enquiries", status],
    queryFn: ({ signal }) => api.enquiries.list(status === "All" ? {} : { status }, signal),
  });
  const { data: listingNames } = useListingNames();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["enquiries"] });

  const respond = useMutation({
    mutationFn: (vars: { id: string; response: string }) => api.enquiries.respond(vars.id, vars.response),
    onSuccess: (e) => { toast.success(`Replied to ${e.name}`); refresh(); },
    onError: onApiError,
  });
  const close = useMutation({
    mutationFn: (id: string) => api.enquiries.setStatus(id, "closed"),
    onSuccess: () => { toast.success("Enquiry closed"); refresh(); },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Visitor enquiries to your Listings — respond and close." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={data ?? []}
          filters={[{ label: "Status", key: "status", options: STATUS_FILTERS, value: status, onChange: setStatus }]}
          emptyTitle="No enquiries"
          columns={[
            { key: "name", header: "From", render: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
              </div>
            ) },
            { key: "listing", header: "Listing", render: (r) => listingNames?.get(r.listingId) ?? "—" },
            { key: "message", header: "Message", render: (r) => (
              <div className="max-w-xs">
                <div className="line-clamp-1">{r.message}</div>
                {r.ownerResponse && <div className="line-clamp-1 text-xs text-slate-500">↳ {r.ownerResponse}</div>}
              </div>
            ) },
            { key: "date", header: "Received", sortable: true, accessor: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rowActions={(r) => (
            <>
              <button
                onClick={() => { setReplying(r); setResponse(r.ownerResponse ?? ""); }}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center"
              >
                <Reply className="w-3 h-3 mr-2" />Reply
              </button>
              {r.status !== "closed" && (
                <button onClick={() => close.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-2" />Close
                </button>
              )}
            </>
          )}
        />
      )}

      <FormDrawer
        open={replying !== null}
        onOpenChange={(v) => { if (!v) setReplying(null); }}
        title={`Reply to ${replying?.name ?? ""}`}
        saveLabel="Send Reply"
        onSave={() => {
          if (!replying) return;
          if (!response.trim()) { toast.error("Write a reply first"); return; }
          respond.mutate({ id: replying.id, response: response.trim() });
        }}
      >
        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">{replying?.message}</div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Your Reply</Label>
          <Textarea rows={6} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Type your response..." />
        </div>
      </FormDrawer>
    </>
  );
}

/**
 * FR128's contact-form inbox — messages to the platform itself, not to a
 * Business, which is why they are not Enquiries (that word is reserved for
 * the Business conversion flow). Status is the whole workflow: sent →
 * responded → closed, advanced here; the actual reply happens over email.
 */
const MESSAGE_FILTERS = ["All", "sent", "responded", "closed"];

export function ContactMessagesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["contact-messages", status],
    queryFn: ({ signal }) => api.content.contactMessages(status === "All" ? {} : { status }, signal),
  });

  const setMessageStatus = useMutation({
    mutationFn: (vars: { id: string; status: string }) => api.content.setContactMessageStatus(vars.id, vars.status),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["contact-messages"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Contact Messages" subtitle="Messages sent to the platform through the contact page." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={(data ?? []).map((m) => ({ ...m, id: m.id ?? "" }))}
          filters={[{ label: "Status", key: "status", options: MESSAGE_FILTERS, value: status, onChange: setStatus }]}
          emptyTitle="No messages"
          columns={[
            { key: "name", header: "From", render: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
              </div>
            ) },
            { key: "subject", header: "Subject" },
            { key: "message", header: "Message", render: (r) => <span className="line-clamp-1 max-w-xs inline-block">{r.message}</span> },
            { key: "date", header: "Received", render: (r) => fmtDate(r.createdAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "sent"} /> },
          ]}
          rowActions={(r) => (
            <>
              {r.status !== "responded" && (
                <button onClick={() => setMessageStatus.mutate({ id: r.id, status: "responded" })} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100">
                  Mark responded
                </button>
              )}
              {r.status !== "closed" && (
                <button onClick={() => setMessageStatus.mutate({ id: r.id, status: "closed" })} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100">
                  Close
                </button>
              )}
            </>
          )}
        />
      )}
    </>
  );
}
