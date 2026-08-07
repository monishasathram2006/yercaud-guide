import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Ban, ShieldCheck, Plus, UserCheck } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, SkeletonList, EmptyState, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Permission, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError } from "../queries";

/**
 * People: Users, Business Owners, Admins — three views over GET /users.
 *
 * "Owners" means owns-a-Business (joined from /businesses, data the register
 * already holds), and "Admins" means holds-any-Role — both derived from data,
 * not from hardcoded role names, so a Super-Admin-created custom Role lands
 * in the right list without a frontend change. The one deliberate exception:
 * the Impersonate button shows for Business Owner targets only, because
 * FR160's backend enforces exactly that rule and offering the button anywhere
 * else would offer a guaranteed 403.
 */

function useUsers(status: string) {
  return useQuery({
    queryKey: ["users", status],
    queryFn: ({ signal }) => api.users.list(status === "All" ? {} : { status }, signal),
  });
}

const STATUS_FILTERS = ["All", "active", "suspended"];

function UserTable({
  data,
  extraColumns = [],
  filters,
}: {
  data: User[];
  extraColumns?: { key: string; header: string; render: (u: User) => React.ReactNode }[];
  filters?: { label: string; key: string; options: string[]; value: string; onChange: (v: string) => void }[];
}) {
  const { can, impersonate } = useAuth();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState<User | null>(null);

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "suspended" }) => api.users.setStatus(vars.id, vars.status),
    onSuccess: (u) => {
      toast.success(u.status === "suspended" ? `Suspended ${u.name}` : `Reactivated ${u.name}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <DataTable
        data={data}
        filters={filters}
        emptyTitle="No users"
        columns={[
          { key: "name", header: "Name", sortable: true, accessor: (r) => r.name, render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-500">{r.email}</div>
            </div>
          ) },
          { key: "roles", header: "Roles", render: (r) => r.roles.length ? r.roles.join(", ") : <span className="text-slate-400">None</span> },
          ...extraColumns,
          { key: "joined", header: "Joined", sortable: true, accessor: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rowActions={(r) => (
          <>
            {/* FR160: the backend allows impersonating Business Owners only. */}
            {can("Users", "edit") && r.roles.includes("Business Owner") && !r.roles.includes("Super Admin") && (
              <button
                onClick={() => impersonate(r.id).then(() => toast.success(`Viewing as ${r.name}`)).catch(onApiError)}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center"
              >
                <Eye className="w-3 h-3 mr-2" />View as owner
              </button>
            )}
            {can("Users", "edit") && (
              <button onClick={() => setAssigning(r)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                <ShieldCheck className="w-3 h-3 mr-2" />Roles…
              </button>
            )}
            {can("Users", "edit") && r.status === "active" && (
              <button onClick={() => setStatus.mutate({ id: r.id, status: "suspended" })} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                <Ban className="w-3 h-3 mr-2" />Suspend
              </button>
            )}
            {can("Users", "edit") && r.status === "suspended" && (
              <button onClick={() => setStatus.mutate({ id: r.id, status: "active" })} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                <UserCheck className="w-3 h-3 mr-2" />Reactivate
              </button>
            )}
          </>
        )}
      />
      {assigning && <AssignRolesDrawer user={assigning} onClose={() => setAssigning(null)} />}
    </>
  );
}

/** Role checkboxes for one User. Needs Admins:view to read the Role list. */
function AssignRolesDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: ({ signal }) => api.roles.list(signal),
  });
  // user.roles is names; the PUT wants ids. Seed selection once roles arrive.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selection = selected ?? new Set(roles?.filter((r) => user.roles.includes(r.name)).map((r) => r.id) ?? []);

  const save = useMutation({
    mutationFn: () => api.users.setRoles(user.id, [...selection]),
    onSuccess: () => {
      toast.success(`Roles updated for ${user.name}`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer open onOpenChange={(v) => { if (!v) onClose(); }} title={`Roles — ${user.name}`} onSave={() => save.mutate()}>
      {!roles ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="space-y-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selection.has(r.id)}
                onCheckedChange={(v) => {
                  const next = new Set(selection);
                  if (v) next.add(r.id); else next.delete(r.id);
                  setSelected(next);
                }}
              />
              {r.name}
              {r.isSystem && <span className="text-xs text-slate-400">(system)</span>}
            </label>
          ))}
        </div>
      )}
    </FormDrawer>
  );
}

export function UsersPage() {
  const [status, setStatus] = useState("All");
  const { data, isLoading } = useUsers(status);
  return (
    <>
      <PageHeader title="Users" subtitle="Every account on the platform — visitors, owners and staff alike." />
      {isLoading ? <SkeletonList rows={6} /> : (
        <UserTable
          data={data ?? []}
          filters={[{ label: "Status", key: "status", options: STATUS_FILTERS, value: status, onChange: setStatus }]}
        />
      )}
    </>
  );
}

export function OwnersPage() {
  const { data: users, isLoading } = useUsers("All");
  const { data: businesses } = useQuery({
    queryKey: ["businesses", "All"],
    queryFn: ({ signal }) => api.businesses.list({}, signal),
  });

  const owners = (users ?? []).filter((u) => businesses?.some((b) => b.ownerId === u.id));
  const ownedBy = (userId: string) => businesses?.filter((b) => b.ownerId === userId) ?? [];

  return (
    <>
      <PageHeader title="Business Owners" subtitle="Users who own a Business. Approvals happen on the Businesses page." />
      {isLoading ? <SkeletonList rows={6} /> : (
        <UserTable
          data={owners}
          extraColumns={[{
            key: "businesses",
            header: "Businesses",
            render: (u) => (
              <div className="space-y-0.5">
                {ownedBy(u.id).map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs">
                    <span>{b.name}</span>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            ),
          }]}
        />
      )}
    </>
  );
}

export function AdminsPage() {
  const { data, isLoading } = useUsers("All");
  const admins = (data ?? []).filter((u) => u.roles.length > 0);
  return (
    <>
      <PageHeader title="Admins" subtitle="Users holding at least one Role. Grant or revoke Roles from any row." />
      {isLoading ? <SkeletonList rows={6} /> : <UserTable data={admins} />}
    </>
  );
}

/* ----------------------------- ROLES & PERMISSIONS ------------------------- */

const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve", "publish"] as const;

// The permission vocabulary is seeded (seed-roles.sql), not served by an
// endpoint; this mirrors it. A module added there must be added here.
const PERMISSION_MODULES = [
  "Businesses", "Listings", "Reviews", "Categories", "Enquiries",
  "Users", "Admins", "Marketing", "Content", "Settings",
];

export function RolesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: roles, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: ({ signal }) => api.roles.list(signal),
  });

  const selected = roles?.find((r) => r.id === selectedId) ?? roles?.[0];
  const key = (p: Permission) => `${p.module}:${p.action}`;
  // Editing state is a draft set of "Module:action" keys, seeded from the role.
  const grants = draft ?? new Set(selected?.permissions.map(key) ?? []);

  const savePermissions = useMutation({
    mutationFn: () => {
      const permissions: Permission[] = [...grants].map((k) => {
        const [module, action] = k.split(":");
        return { module, action: action as Permission["action"] };
      });
      return api.roles.setPermissions(selected!.id, permissions);
    },
    onSuccess: () => {
      toast.success(`Permissions saved for ${selected?.name}`);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: onApiError,
  });

  const createRole = useMutation({
    mutationFn: (name: string) => api.roles.create(name),
    onSuccess: (r) => {
      toast.success(`Role "${r.name}" created`);
      setSelectedId(r.id);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Roles are bundles of per-module permissions; Users hold Roles." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <SectionCard title="Roles">
            <ul className="space-y-1">
              {(roles ?? []).map((r) => (
                <li
                  key={r.id}
                  onClick={() => { setSelectedId(r.id); setDraft(null); }}
                  className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between ${
                    r.id === selected?.id ? "bg-emerald-50 text-emerald-700 font-semibold" : "hover:bg-slate-50"
                  }`}
                >
                  {r.name}
                  {r.isSystem && <span className="text-[10px] text-slate-400 uppercase">system</span>}
                </li>
              ))}
            </ul>
            {can("Admins", "create") && (
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { setNewName(""); setAdding(true); }}>
                <Plus className="w-3 h-3 mr-1" /> Add Role
              </Button>
            )}
          </SectionCard>

          {selected ? (
            <SectionCard title={`Permission Matrix — ${selected.name}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs">
                      <th className="text-left py-2">Module</th>
                      {PERMISSION_ACTIONS.map((a) => <th key={a} className="text-center capitalize font-medium">{a}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_MODULES.map((m) => (
                      <tr key={m} className="border-t border-slate-100">
                        <td className="py-2 font-medium">{m}</td>
                        {PERMISSION_ACTIONS.map((a) => (
                          <td key={a} className="text-center">
                            <Checkbox
                              checked={grants.has(`${m}:${a}`)}
                              disabled={!can("Admins", "edit")}
                              onCheckedChange={(v) => {
                                const next = new Set(grants);
                                if (v) next.add(`${m}:${a}`); else next.delete(`${m}:${a}`);
                                setDraft(next);
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {can("Admins", "edit") && (
                <div className="flex justify-end gap-2 pt-3">
                  {draft && (
                    <Button variant="outline" onClick={() => setDraft(null)}>Discard</Button>
                  )}
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!draft || savePermissions.isPending}
                    onClick={() => savePermissions.mutate()}
                  >
                    Save Permissions
                  </Button>
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard><EmptyState title="No roles yet" /></SectionCard>
          )}
        </div>
      )}

      <FormDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add Role"
        onSave={() => {
          if (!newName.trim()) { toast.error("The role needs a name"); return; }
          createRole.mutate(newName.trim());
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700">Name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Content Moderator" />
        </div>
      </FormDrawer>
    </>
  );
}
