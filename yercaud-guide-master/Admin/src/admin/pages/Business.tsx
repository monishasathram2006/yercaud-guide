import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, SkeletonList, EmptyState } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Business } from "@/lib/api";
import { onApiError, useOwnBusinesses } from "../queries";

/**
 * The owner's own-Business pages: Profile (FR161's record, edited in place)
 * and Team (FR163's staff invitations).
 *
 * Neither is gated on the Businesses permission module — an owner holds no
 * module for their own Business; the backend authorises by ownership
 * (requireOwnerOrPermission). The pages scope themselves to GET /businesses,
 * which returns the caller's own unless they hold the admin override.
 */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

/** Multi-Business owners pick which one they're editing. */
function BusinessPicker({ businesses, value, onChange }: { businesses: Business[]; value: string; onChange: (id: string) => void }) {
  if (businesses.length < 2) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
    >
      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

export function BusinessProfilePage() {
  const { data: businesses, isLoading } = useOwnBusinesses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const business = businesses?.find((b) => b.id === selectedId) ?? businesses?.[0];

  if (isLoading) return <><PageHeader title="Business Profile" /><SkeletonList rows={6} /></>;
  if (!business) {
    return (
      <>
        <PageHeader title="Business Profile" />
        <SectionCard><EmptyState title="No Business on this account" subtitle="Apply as a Business Owner on the public site first." /></SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Business Profile"
        subtitle="Your Business's public record. Edits apply immediately."
        actions={<BusinessPicker businesses={businesses ?? []} value={business.id} onChange={setSelectedId} />}
      />
      {/* Keyed so switching Business resets the form to that row's values. */}
      <ProfileForm key={business.id} business={business} />
    </>
  );
}

function ProfileForm({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: business.name,
    description: business.description ?? "",
    contactPhone: business.contactPhone ?? "",
    contactEmail: business.contactEmail ?? "",
    website: business.website ?? "",
    address: business.address ?? "",
    logoUrl: business.logoUrl ?? "",
    coverUrl: business.coverUrl ?? "",
    instagram: business.socialLinks.instagram ?? "",
    facebook: business.socialLinks.facebook ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = useMutation({
    mutationFn: () => {
      const socialLinks: Record<string, string> = {};
      if (form.instagram.trim()) socialLinks.instagram = form.instagram.trim();
      if (form.facebook.trim()) socialLinks.facebook = form.facebook.trim();
      return api.businesses.update(business.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        website: form.website.trim() || undefined,
        address: form.address.trim() || undefined,
        logoUrl: form.logoUrl.trim() || undefined,
        coverUrl: form.coverUrl.trim() || undefined,
        socialLinks,
      });
    },
    onSuccess: (b) => {
      toast.success(`Saved ${b.name}`);
      void queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
    onError: onApiError,
  });

  return (
    <SectionCard
      action={
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={save.isPending}
          onClick={() => {
            if (!form.name.trim()) { toast.error("The Business needs a name"); return; }
            save.mutate();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="flex items-center gap-3 mb-2">
        <StatusBadge status={business.status} />
        {business.rejectionReason && <span className="text-xs text-red-600">Rejected: {business.rejectionReason}</span>}
      </div>
      <div className="space-y-4">
        <FormField label="Business Name"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></FormField>
        <FormField label="Description"><Textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone"><Input value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></FormField>
          <FormField label="Email"><Input value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></FormField>
        </div>
        <FormField label="Address"><Textarea rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} /></FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Website"><Input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></FormField>
          <FormField label="Instagram"><Input value={form.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@handle" /></FormField>
          <FormField label="Facebook"><Input value={form.facebook} onChange={(e) => set({ facebook: e.target.value })} placeholder="/page" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Logo URL"><Input value={form.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://…" /></FormField>
          <FormField label="Cover URL"><Input value={form.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} placeholder="https://…" /></FormField>
        </div>
      </div>
    </SectionCard>
  );
}

/* ----------------------------------- TEAM ---------------------------------- */

// FR163's per-staff grants — free-form booleans on the API; one shared
// vocabulary here so invitations stay consistent.
const STAFF_PERMISSIONS = [
  { key: "manage_listings", label: "Manage listings" },
  { key: "reply_enquiries", label: "Reply to enquiries" },
  { key: "respond_reviews", label: "Respond to reviews" },
];

export function TeamPage() {
  const queryClient = useQueryClient();
  const { data: businesses, isLoading } = useOwnBusinesses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const business = businesses?.find((b) => b.id === selectedId) ?? businesses?.[0];
  const [inviting, setInviting] = useState(false);

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ["staff", business?.id],
    enabled: business !== undefined,
    queryFn: ({ signal }) => api.businesses.staff(business!.id, signal),
  });

  const revoke = useMutation({
    mutationFn: (staffId: string) => api.businesses.revokeStaff(business!.id, staffId),
    onSuccess: () => {
      toast.success("Team member revoked");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: onApiError,
  });

  if (isLoading) return <><PageHeader title="Team" /><SkeletonList rows={4} /></>;
  if (!business) {
    return (
      <>
        <PageHeader title="Team" />
        <SectionCard><EmptyState title="No Business on this account" /></SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`Staff invited to ${business.name}.`}
        actions={
          <div className="flex items-center gap-2">
            <BusinessPicker businesses={businesses ?? []} value={business.id} onChange={setSelectedId} />
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setInviting(true)}>
              <Plus className="w-4 h-4 mr-1" /> Invite Member
            </Button>
          </div>
        }
      />
      {staffLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <DataTable
          data={(staff ?? []).map((s) => ({ ...s, id: s.id ?? "" }))}
          searchable={false}
          emptyTitle="No team members yet"
          columns={[
            { key: "email", header: "Email", render: (r) => <span className="font-medium">{r.email}</span> },
            { key: "permissions", header: "Permissions", render: (r) => {
              const granted = Object.entries(r.permissions ?? {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, " "));
              return granted.length ? <span className="text-xs">{granted.join(", ")}</span> : <span className="text-slate-400 text-xs">None</span>;
            } },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "pending"} /> },
          ]}
          rowActions={(r) => r.status !== "revoked" ? (
            <button onClick={() => revoke.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 text-red-600">
              Revoke
            </button>
          ) : null}
        />
      )}
      {inviting && <InviteDrawer businessId={business.id} onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteDrawer({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<Set<string>>(new Set(STAFF_PERMISSIONS.map((p) => p.key)));

  const invite = useMutation({
    mutationFn: () =>
      api.businesses.inviteStaff(businessId, email.trim(), Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, grants.has(p.key)]))),
    onSuccess: () => {
      toast.success(`Invited ${email.trim()}`);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Invite Team Member"
      saveLabel="Invite"
      onSave={() => {
        if (!email.trim()) { toast.error("An invitation needs an email"); return; }
        invite.mutate();
      }}
    >
      <FormField label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
      <div className="space-y-2 pt-2">
        <Label className="text-xs font-semibold text-slate-700">Permissions</Label>
        {STAFF_PERMISSIONS.map((p) => (
          <label key={p.key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={grants.has(p.key)}
              onCheckedChange={(v) => {
                const next = new Set(grants);
                if (v) next.add(p.key); else next.delete(p.key);
                setGrants(next);
              }}
            />
            {p.label}
          </label>
        ))}
      </div>
    </FormDrawer>
  );
}
