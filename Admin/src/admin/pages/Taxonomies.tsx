import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { PageHeader, SkeletonList, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, type Badge, type Category, type NamedLookup } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError } from "../queries";

/**
 * The Super-Admin-managed lookups: Categories, Locations, Badges. All three
 * are guarded by the Categories module on the backend (they're one taxonomy
 * family), so the write controls share one permission check.
 *
 * Deleting is not symmetric across them — a category delete is blocked while
 * Listings reference it (ADR 0009 RESTRICT), a location delete nulls the
 * Listings' location, a badge delete unbadges them. The API's error/success
 * is the source of truth; the pages just surface it.
 */

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => api.taxonomies.categories(signal),
  });

  // Same trick as the dashboard donut: exact per-category counts off search
  // totals. Distinct queryKey from the dashboard's ["listings", "by-category"]
  // — that one caches a different shape, and sharing the key meant whichever
  // page ran first poisoned the other. A plain object rather than a Map so the
  // value also survives SSR dehydration.
  const { data: counts } = useQuery({
    queryKey: ["listings", "count-by-category-id"],
    queryFn: async ({ signal }) => {
      const categories = await api.taxonomies.categories(signal);
      const totals = await Promise.all(
        categories.map((c) => api.listings.search({ category: c.slug, pageSize: 1 }, signal).then((r) => r.total)),
      );
      return Object.fromEntries(categories.map((c, i) => [c.id, totals[i]])) as Record<string, number>;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.taxonomies.deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: onApiError,
  });

  const canEdit = can("Categories", "edit");

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="The directory's eight sections. Four carry bespoke detail pages (ADR 0003); new ones use the generic listing shape."
        actions={can("Categories", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Category
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={data ?? []}
          columns={[
            { key: "name", header: "Category", sortable: true, accessor: (r) => r.sortOrder, render: (r) => (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color ?? "#64748b" }} />
                {r.name}
              </div>
            ) },
            { key: "slug", header: "Slug", render: (r) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.slug}</code> },
            { key: "detail", header: "Detail Page", render: (r) => r.hasDetailTable
              ? <span className="text-xs text-emerald-700">Bespoke</span>
              : <span className="text-xs text-slate-500">Generic</span> },
            { key: "listings", header: "Listings", render: (r) => counts?.[r.id] ?? "—" },
            { key: "sortOrder", header: "Order" },
          ]}
          onEdit={canEdit ? (r) => setEditing(r) : undefined}
          onDelete={can("Categories", "delete") ? (r) => remove.mutate(r.id) : undefined}
        />
      )}
      {(creating || editing) && (
        <CategoryDrawer category={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </>
  );
}

function CategoryDrawer({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(category !== null);
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [color, setColor] = useState(category?.color ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        slug: (slugTouched ? slug : slugify(name)).trim(),
        icon: icon.trim() || undefined,
        color: color.trim() || undefined,
        sortOrder: Number(sortOrder) || 0,
      };
      return category ? api.taxonomies.updateCategory(category.id, body) : api.taxonomies.createCategory(body);
    },
    onSuccess: (c) => {
      toast.success(category ? `Updated ${c.name}` : `Created ${c.name}`);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={category ? `Edit ${category.name}` : "Add Category"}
      onSave={() => {
        if (!name.trim()) { toast.error("The category needs a name"); return; }
        save.mutate();
      }}
    >
      <FormField label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurants" />
      </FormField>
      <FormField label="Slug">
        <Input
          value={slugTouched ? slug : slugify(name)}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Icon"><Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="utensils" /></FormField>
        <FormField label="Colour"><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#f59e0b" /></FormField>
      </div>
      <FormField label="Sort Order"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></FormField>
    </FormDrawer>
  );
}

export function LocationsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<NamedLookup | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: ({ signal }) => api.taxonomies.locations(signal),
  });

  const save = useMutation({
    mutationFn: () =>
      editing ? api.taxonomies.updateLocation(editing.id, name.trim()) : api.taxonomies.createLocation(name.trim()),
    onSuccess: (l) => {
      toast.success(editing ? `Updated ${l.name}` : `Created ${l.name}`);
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: onApiError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.taxonomies.deleteLocation(id),
    onSuccess: () => {
      toast.success("Location deleted — its Listings keep no location");
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: onApiError,
  });

  const open = creating || editing !== null;

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="A flat lookup of areas within Yercaud — the directory is scoped to one town."
        actions={can("Categories", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setName(""); setEditing(null); setCreating(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Location
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={data ?? []}
          columns={[
            { key: "name", header: "Name", sortable: true, accessor: (r) => r.name },
            { key: "slug", header: "Slug", render: (r) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.slug}</code> },
          ]}
          onEdit={can("Categories", "edit") ? (r) => { setName(r.name); setCreating(false); setEditing(r); } : undefined}
          onDelete={can("Categories", "delete") ? (r) => remove.mutate(r.id) : undefined}
        />
      )}
      <FormDrawer
        open={open}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        title={editing ? `Edit ${editing.name}` : "Add Location"}
        onSave={() => {
          if (!name.trim()) { toast.error("The location needs a name"); return; }
          save.mutate();
        }}
      >
        <FormField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Near Lake" /></FormField>
      </FormDrawer>
    </>
  );
}

export function BadgesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Badge | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["badges"],
    queryFn: ({ signal }) => api.taxonomies.badges(signal),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.taxonomies.deleteBadge(id),
    onSuccess: () => {
      toast.success("Badge deleted — Listings wearing it are unbadged");
      void queryClient.invalidateQueries({ queryKey: ["badges"] });
    },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader
        title="Badges"
        subtitle="FR30's promotional vocabulary. Assign them to Listings from the Listings page."
        actions={can("Categories", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Badge
          </Button>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <DataTable
          data={data ?? []}
          searchable={false}
          columns={[
            { key: "label", header: "Badge", sortable: true, accessor: (r) => r.sortOrder, render: (r) => (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                style={r.color ? { backgroundColor: `${r.color}20`, borderColor: r.color, color: r.color } : undefined}
              >
                {r.label}
              </span>
            ) },
            { key: "color", header: "Colour", render: (r) => r.color ?? "—" },
            { key: "sortOrder", header: "Order" },
          ]}
          onEdit={can("Categories", "edit") ? (r) => setEditing(r) : undefined}
          onDelete={can("Categories", "delete") ? (r) => remove.mutate(r.id) : undefined}
        />
      )}
      {(creating || editing) && <BadgeEditDrawer badge={editing} onClose={() => { setCreating(false); setEditing(null); }} />}
    </>
  );
}

function BadgeEditDrawer({ badge, onClose }: { badge: Badge | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(badge?.label ?? "");
  const [color, setColor] = useState(badge?.color ?? "");
  const [sortOrder, setSortOrder] = useState(String(badge?.sortOrder ?? 0));

  const save = useMutation({
    mutationFn: () => {
      const body = { label: label.trim(), color: color.trim() || null, sortOrder: Number(sortOrder) || 0 };
      return badge ? api.taxonomies.updateBadge(badge.id, body) : api.taxonomies.createBadge(body);
    },
    onSuccess: (b) => {
      toast.success(badge ? `Updated ${b.label}` : `Created ${b.label}`);
      void queryClient.invalidateQueries({ queryKey: ["badges"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={badge ? `Edit ${badge.label}` : "Add Badge"}
      onSave={() => {
        if (!label.trim()) { toast.error("The badge needs a label"); return; }
        save.mutate();
      }}
    >
      <FormField label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Best Seller" /></FormField>
      <FormField label="Colour"><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#e11d48" /></FormField>
      <FormField label="Sort Order"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></FormField>
    </FormDrawer>
  );
}
