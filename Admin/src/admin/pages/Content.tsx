import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Download, Check, X, Send, ImagePlus, Copy, Eye, EyeOff } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, SkeletonList, EmptyState, fmtDate } from "../components/primitives";
import { DataTable } from "../components/DataTable";
import { FormDrawer } from "../components/FormDrawer";
import { api, PUBLIC_SITE_URL, type BlogPostSummary, type Schemas } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onApiError } from "../queries";

type Faq = Schemas["Faq"];

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

/* ----------------------------------- BLOG ---------------------------------- */

const POST_STATUSES = ["All", "draft", "pending", "published"] as const;

export function BlogPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState<(typeof POST_STATUSES)[number]>("All");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Fetched once, unfiltered — the status strip needs counts across every
  // status at the same time, and DataTable already filters/sorts/paginates
  // client-side (same pattern the rest of this file already uses at pageSize:100).
  const { data, isLoading } = useQuery({
    queryKey: ["blog-posts", "admin-all"],
    queryFn: ({ signal }) => api.blog.posts({ pageSize: 100 }, signal),
  });
  const { data: categories } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: ({ signal }) => api.blog.categories(signal),
  });
  const categoryName = (id?: string) => categories?.find((c) => c.id === id)?.name ?? "—";

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: data?.length ?? 0, draft: 0, pending: 0, published: 0 };
    for (const p of data ?? []) c[p.status ?? "draft"] = (c[p.status ?? "draft"] ?? 0) + 1;
    return c;
  }, [data]);
  const filtered = status === "All" ? (data ?? []) : (data ?? []).filter((p) => p.status === status);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["blog-posts"] });

  const publish = useMutation({
    mutationFn: (id: string) => api.blog.publishPost(id),
    onSuccess: (p) => { toast.success(`Published "${p.title}"`); refresh(); },
    onError: onApiError,
  });
  const unpublish = useMutation({
    mutationFn: (id: string) => api.blog.updatePost(id, { status: "draft" }),
    onSuccess: (p) => { toast.success(`Unpublished "${p.title}"`); refresh(); },
    onError: onApiError,
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.blog.duplicatePost(id),
    onSuccess: (p) => { toast.success(`Duplicated as "${p.title}"`); refresh(); },
    onError: onApiError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.blog.deletePost(id),
    onSuccess: () => { toast.success("Post deleted"); refresh(); },
    onError: onApiError,
  });

  const bulkPublish = useMutation({
    mutationFn: (ids: (string | number)[]) => Promise.all(ids.map((id) => api.blog.publishPost(String(id)))),
    onSuccess: (r) => toast.success(`Published ${r.length} post(s)`),
    onError: onApiError,
    onSettled: refresh,
  });
  const bulkUnpublish = useMutation({
    mutationFn: (ids: (string | number)[]) => Promise.all(ids.map((id) => api.blog.updatePost(String(id), { status: "draft" }))),
    onSuccess: (r) => toast.success(`Unpublished ${r.length} post(s)`),
    onError: onApiError,
    onSettled: refresh,
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: (string | number)[]) => Promise.all(ids.map((id) => api.blog.deletePost(String(id)))),
    onSuccess: (r) => toast.success(`Deleted ${r.length} post(s)`),
    onError: onApiError,
    onSettled: refresh,
  });

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="Posts publish through their own gate, separate from Listing approval."
        actions={can("Content", "create") ? (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Post
          </Button>
        ) : undefined}
      />
      <Tabs defaultValue="posts" className="mb-4">
        <TabsList>
          <TabsTrigger value="posts">All Posts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="pt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {POST_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  status === s
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {s === "All" ? "All Posts" : s[0].toUpperCase() + s.slice(1)} ({counts[s] ?? 0})
              </button>
            ))}
          </div>
          {isLoading ? (
            <SkeletonList rows={6} />
          ) : (
            <DataTable
              data={filtered.map((p) => ({ ...p, id: p.id ?? "" }))}
              emptyTitle="No posts yet"
              columns={[
                { key: "title", header: "Title", sortable: true, accessor: (r) => r.title ?? "", render: (r) => (
                  <div className="flex items-center gap-3">
                    {r.coverImage && <img src={r.coverImage} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                    <span className="font-medium">{r.title}</span>
                  </div>
                ) },
                { key: "category", header: "Category", render: (r) => categoryName(r.categoryId) },
                { key: "author", header: "Author", render: (r) => r.authorName ?? "—" },
                { key: "views", header: "Views", sortable: true, accessor: (r) => r.viewCount ?? 0, render: (r) => r.viewCount ?? 0 },
                { key: "created", header: "Created", sortable: true, accessor: (r) => r.createdAt ?? "", render: (r) => fmtDate(r.createdAt) },
                { key: "published", header: "Published", render: (r) => (r.publishedAt ? fmtDate(r.publishedAt) : "—") },
                { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "draft"} /> },
              ]}
              onEdit={can("Content", "edit") ? (r) => setEditingId(r.id) : undefined}
              onDelete={can("Content", "delete") ? (r) => remove.mutate(r.id) : undefined}
              rowActions={(r) => (
                <>
                  <button
                    onClick={() => window.open(`${PUBLIC_SITE_URL}/blog/${r.slug}`, "_blank")}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center"
                  >
                    <Eye className="w-3 h-3 mr-2" />Preview
                  </button>
                  {can("Content", "create") && (
                    <button onClick={() => duplicate.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                      <Copy className="w-3 h-3 mr-2" />Duplicate
                    </button>
                  )}
                  {can("Content", "publish") && r.status !== "published" && (
                    <button onClick={() => publish.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                      <Send className="w-3 h-3 mr-2" />Publish
                    </button>
                  )}
                  {can("Content", "edit") && r.status === "published" && (
                    <button onClick={() => unpublish.mutate(r.id)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 flex items-center">
                      <EyeOff className="w-3 h-3 mr-2" />Unpublish
                    </button>
                  )}
                </>
              )}
              bulkActions={can("Content", "edit") ? (ids, clear) => (
                <>
                  {can("Content", "publish") && (
                    <Button size="sm" variant="outline" className="h-7 bg-white" onClick={() => { bulkPublish.mutate(ids); clear(); }}>
                      Publish
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 bg-white" onClick={() => { bulkUnpublish.mutate(ids); clear(); }}>
                    Unpublish
                  </Button>
                  {can("Content", "delete") && (
                    <Button size="sm" variant="outline" className="h-7 bg-white text-red-600" onClick={() => { bulkDelete.mutate(ids); clear(); }}>
                      Delete
                    </Button>
                  )}
                </>
              ) : undefined}
            />
          )}
        </TabsContent>
        <TabsContent value="categories" className="pt-4">
          <BlogCategories />
        </TabsContent>
      </Tabs>
      {(creating || editingId) && (
        <BlogPostDrawer postId={editingId} onClose={() => { setCreating(false); setEditingId(null); }} />
      )}
    </>
  );
}

/**
 * A post needs a categoryId to save, but the Admin UI previously had no way
 * to create one — the dropdown in BlogPostDrawer just listed whatever
 * /blog-categories already returned. On a fresh install that's empty, so
 * "New Post" was a dead end. Mirrors FAQ's inline add/delete category UX.
 */
function BlogCategories() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [name, setName] = useState("");
  const { data: categories, isLoading } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: ({ signal }) => api.blog.categories(signal),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
  const create = useMutation({
    mutationFn: (n: string) => api.blog.createCategory(n),
    onSuccess: (c) => { toast.success(`Category "${c.name}" added`); setName(""); refresh(); },
    onError: onApiError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.blog.deleteCategory(id),
    onSuccess: () => { toast.success("Category deleted"); refresh(); },
    onError: onApiError,
  });

  const canEdit = can("Content", "edit") || can("Content", "create");
  if (!canEdit && (categories ?? []).length === 0) return null;

  return (
    <SectionCard title="Categories" className="mb-6">
      {isLoading ? (
        <SkeletonList rows={1} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {(categories ?? []).length === 0 && <span className="text-sm text-slate-400">No categories yet — add one below.</span>}
          {(categories ?? []).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-3 pr-1.5 py-1 text-sm text-slate-700">
              {c.name}
              {can("Content", "delete") && (
                <button
                  onClick={() => remove.mutate(c.id!)}
                  className="rounded-full p-0.5 hover:bg-slate-200 text-slate-500 hover:text-red-600"
                  aria-label={`Delete ${c.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {can("Content", "create") && (
        <div className="mt-3 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create.mutate(name.trim());
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              if (!name.trim()) { toast.error("The category needs a name"); return; }
              create.mutate(name.trim());
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

type BlogPostStatus = "draft" | "pending" | "published";

/** yyyy-MM-ddThh:mm, what <input type="datetime-local"> needs — chopping the ISO string is fine, it never carries fractional seconds from here. */
function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BlogPostDrawer({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: ({ signal }) => api.blog.categories(signal),
  });
  // Edit needs the full body, which the summary list doesn't carry.
  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-posts", "byId", postId],
    enabled: postId !== null,
    queryFn: ({ signal }) => api.blog.post(postId!, signal),
  });

  const [draft, setDraft] = useState<{
    categoryId: string;
    title: string;
    excerpt: string;
    body: string;
    coverImage: string;
    tags: string[];
    status: BlogPostStatus;
    publishedAt: string;
  } | null>(null);
  const form = draft ?? {
    categoryId: post?.categoryId ?? "",
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    body: post?.body ?? "",
    coverImage: post?.coverImage ?? "",
    tags: post?.tags ?? [],
    status: (post?.status as BlogPostStatus | undefined) ?? "draft",
    publishedAt: toLocalDateTimeInput(post?.publishedAt),
  };
  const set = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });

  const [tagInput, setTagInput] = useState("");
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
    setTagInput("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const basePayload = {
        categoryId: form.categoryId,
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        body: form.body,
        coverImage: form.coverImage.trim() || null,
        tags: form.tags,
      };
      const publishedAtIso = form.status === "published" && form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined;

      let saved: Schemas["BlogPost"];
      if (postId) {
        saved = await api.blog.updatePost(postId, { ...basePayload, status: form.status, ...(publishedAtIso ? { publishedAt: publishedAtIso } : {}) });
      } else {
        // A new post always starts as draft server-side (posts.ts's invariant) —
        // a second PATCH moves it on if the author picked pending/published up front.
        saved = await api.blog.createPost(basePayload);
        if (form.status !== "draft") {
          saved = await api.blog.updatePost(saved.id!, { status: form.status, ...(publishedAtIso ? { publishedAt: publishedAtIso } : {}) });
        }
      }
      if (coverImageFile) {
        saved = await api.blog.uploadCoverImage(saved.id!, coverImageFile);
      }
      return saved;
    },
    onSuccess: (p) => {
      toast.success(postId ? `Updated "${p.title}"` : `Created "${p.title}"`);
      void queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
    },
    onError: onApiError,
  });

  const saveLabel = form.status === "draft" ? "Save Draft" : form.status === "pending" ? "Submit for Review"
    : form.publishedAt && new Date(form.publishedAt) > new Date() ? "Schedule" : "Publish";

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={postId ? `Edit ${post?.title ?? ""}` : "New Blog Post"}
      size="lg"
      saveLabel={saveLabel}
      onSave={() => {
        if (!form.categoryId || !form.title.trim() || !form.body.trim()) {
          toast.error("Category, title and body are required");
          return;
        }
        save.mutate();
      }}
    >
      {postId && isLoading ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          <FormField label="Title">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Top 10 things to do in Yercaud" />
          </FormField>
          <FormField label="Category">
            <select
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Choose a category…</option>
              {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Cover Image">
            <div className="flex items-center gap-3">
              {coverImagePreview || form.coverImage ? (
                <img src={coverImagePreview ?? form.coverImage} alt="" className="h-16 w-24 rounded-lg object-cover border border-slate-200" />
              ) : (
                <div className="h-16 w-24 rounded-lg bg-slate-100 grid place-items-center text-[10px] text-slate-400">No image</div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setCoverImageFile(file);
                  setCoverImagePreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="w-3.5 h-3.5 mr-1" /> Choose Image
              </Button>
            </div>
          </FormField>
          <FormField label="Tags">
            <div className="flex flex-wrap gap-1.5 mb-2 empty:mb-0">
              {form.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 py-0.5 text-xs text-slate-700">
                  {t}
                  <button
                    onClick={() => set({ tags: form.tags.filter((x) => x !== t) })}
                    className="rounded-full p-0.5 hover:bg-slate-200 text-slate-500 hover:text-red-600"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Type a tag and press Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(); }
              }}
            />
          </FormField>
          <FormField label="Excerpt">
            <Textarea rows={2} value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
          </FormField>
          <FormField label="Body">
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="pt-2">
                <Textarea rows={12} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder="Write your post in Markdown…" />
              </TabsContent>
              <TabsContent value="preview" className="pt-2">
                <div className="prose prose-sm max-w-none rounded-md border border-slate-200 p-3 min-h-[240px]">
                  <ReactMarkdown>{form.body || "*Nothing to preview yet.*"}</ReactMarkdown>
                </div>
              </TabsContent>
            </Tabs>
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) => {
                const nextStatus = e.target.value as BlogPostStatus;
                // Defaults the schedule field to "now" the moment Published is
                // picked, so an untouched field still means "publish immediately".
                set({ status: nextStatus, publishedAt: nextStatus === "published" && !form.publishedAt ? toLocalDateTimeInput(new Date().toISOString()) : form.publishedAt });
              }}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending Review</option>
              <option value="published">Published</option>
            </select>
          </FormField>
          {form.status === "published" && (
            <FormField label="Publish Date">
              <Input type="datetime-local" value={form.publishedAt} onChange={(e) => set({ publishedAt: e.target.value })} />
            </FormField>
          )}
        </>
      )}
    </FormDrawer>
  );
}

const COMMENT_STATUSES = ["All", "pending", "approved", "rejected"];

export function BlogCommentsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["blog-comments", status],
    queryFn: ({ signal }) => api.blog.comments(status === "All" ? {} : { status }, signal),
  });
  const { data: posts } = useQuery({
    queryKey: ["blog-posts", "All"],
    queryFn: ({ signal }) => api.blog.posts({ pageSize: 100 }, signal),
    select: (d) => new Map(d.map((p: BlogPostSummary) => [p.id, p.title])),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["blog-comments"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "approval-queue"] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.blog.approveComment(id),
    onSuccess: () => { toast.success("Comment approved"); refresh(); },
    onError: onApiError,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.blog.rejectComment(id),
    onSuccess: () => { toast.success("Comment rejected"); refresh(); },
    onError: onApiError,
  });

  return (
    <>
      <PageHeader title="Blog Comments" subtitle="Held pending until approved here — same moderation shape as Reviews." />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={(data ?? []).map((c) => ({ ...c, id: c.id ?? "" }))}
          filters={[{ label: "Status", key: "status", options: COMMENT_STATUSES, value: status, onChange: setStatus }]}
          emptyTitle="No comments"
          columns={[
            { key: "body", header: "Comment", render: (r) => <span className="line-clamp-2 max-w-md inline-block">{r.body}</span> },
            { key: "post", header: "Post", render: (r) => posts?.get(r.postId) ?? "—" },
            { key: "date", header: "Date", render: (r) => fmtDate(r.createdAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "pending"} /> },
          ]}
          rowActions={can("Content", "approve") ? (r) => (
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

/* ----------------------------------- FAQ ----------------------------------- */

export function FAQPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Faq | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["faq-categories"],
    queryFn: ({ signal }) => api.faq.categories(signal),
  });
  const { data: faqs } = useQuery({
    queryKey: ["faqs"],
    queryFn: ({ signal }) => api.faq.list(signal),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["faqs"] });
    void queryClient.invalidateQueries({ queryKey: ["faq-categories"] });
  };

  const createCategory = useMutation({
    mutationFn: (name: string) => api.faq.createCategory({ name }),
    onSuccess: (c) => { toast.success(`Category "${c.name}" added`); refresh(); },
    onError: onApiError,
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.faq.deleteCategory(id),
    onSuccess: () => { toast.success("Category deleted"); refresh(); },
    onError: onApiError,
  });
  const deleteFaq = useMutation({
    mutationFn: (id: string) => api.faq.remove(id),
    onSuccess: () => { toast.success("FAQ deleted"); refresh(); },
    onError: onApiError,
  });

  const canEdit = can("Content", "edit");

  return (
    <>
      <PageHeader
        title="FAQ"
        subtitle="Questions grouped by admin-defined categories."
        actions={can("Content", "create") ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setCategoryName(""); setAddingCategory(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Category
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add FAQ
            </Button>
          </div>
        ) : undefined}
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : !categories || categories.length === 0 ? (
        <SectionCard><EmptyState title="No FAQ categories yet" subtitle="Add a category, then its questions." /></SectionCard>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const items = (faqs ?? []).filter((f) => f.categoryId === cat.id);
            return (
              <SectionCard
                key={cat.id}
                title={cat.name}
                action={canEdit ? (
                  <Button variant="ghost" size="sm" className="h-8 text-red-600" onClick={() => deleteCategory.mutate(cat.id!)}>
                    Delete category
                  </Button>
                ) : undefined}
              >
                {items.length === 0 ? (
                  <div className="text-sm text-slate-400">No questions yet.</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((f) => (
                      <div key={f.id} className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-sm">{f.question}</div>
                          <div className="text-xs text-slate-500 mt-1">{f.answer}</div>
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(f)}>Edit</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => deleteFaq.mutate(f.id!)}>Delete</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      <FormDrawer
        open={addingCategory}
        onOpenChange={setAddingCategory}
        title="Add FAQ Category"
        onSave={() => {
          if (!categoryName.trim()) { toast.error("The category needs a name"); return; }
          createCategory.mutate(categoryName.trim());
        }}
      >
        <FormField label="Name"><Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="General" /></FormField>
      </FormDrawer>

      {(creating || editing) && (
        <FaqDrawer faq={editing} categories={categories ?? []} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </>
  );
}

function FaqDrawer({ faq, categories, onClose }: { faq: Faq | null; categories: Schemas["FaqCategory"][]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(faq?.categoryId ?? "");
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = { categoryId, question: question.trim(), answer: answer.trim() };
      return faq ? api.faq.update(faq.id!, body) : api.faq.create(body);
    },
    onSuccess: () => {
      toast.success(faq ? "FAQ updated" : "FAQ added");
      void queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
    onError: onApiError,
  });

  return (
    <FormDrawer
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={faq ? "Edit FAQ" : "Add FAQ"}
      onSave={() => {
        if (!categoryId || !question.trim() || !answer.trim()) { toast.error("Category, question and answer are required"); return; }
        save.mutate();
      }}
    >
      <FormField label="Category">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </FormField>
      <FormField label="Question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} /></FormField>
      <FormField label="Answer"><Textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} /></FormField>
    </FormDrawer>
  );
}

/* ------------------------------- STATIC PAGES ------------------------------ */

/**
 * Content Blocks are free-shape JSON per (pageSlug, blockKey) — the public
 * site reads whatever convention each page established (Phase 10's static-page
 * SEO rides the same table). A generic key + JSON editor is the honest UI:
 * inventing a fixed form here would constrain a schema the backend
 * deliberately doesn't have.
 */
const STATIC_PAGES = ["home", "about", "contact"];

export function StaticPagesPage() {
  return (
    <>
      <PageHeader title="Static Pages" subtitle="Content Blocks per page — each block is a keyed JSON document the public site renders." />
      <Tabs defaultValue={STATIC_PAGES[0]}>
        <TabsList>
          {STATIC_PAGES.map((p) => <TabsTrigger key={p} value={p} className="capitalize">{p}</TabsTrigger>)}
        </TabsList>
        {STATIC_PAGES.map((p) => (
          <TabsContent key={p} value={p} className="pt-4">
            <PageBlocks pageSlug={p} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function PageBlocks({ pageSlug }: { pageSlug: string }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["content-blocks", pageSlug],
    queryFn: ({ signal }) => api.content.blocks(pageSlug, signal),
  });
  const [newKey, setNewKey] = useState("");

  const canEdit = can("Content", "edit");

  if (isLoading) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-4">
      {(data ?? []).length === 0 && <SectionCard><EmptyState title="No blocks on this page yet" /></SectionCard>}
      {(data ?? []).map((block) => (
        <BlockEditor key={block.blockKey} pageSlug={pageSlug} blockKey={block.blockKey} initial={block.content} readOnly={!canEdit} />
      ))}
      {canEdit && (
        <SectionCard title="Add a block">
          <div className="flex gap-2">
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="block key, e.g. hero" className="max-w-xs" />
            <Button
              variant="outline"
              onClick={() => {
                const key = newKey.trim();
                if (!key) { toast.error("The block needs a key"); return; }
                // Upserting {} materialises the block; edit its JSON below.
                api.content.upsertBlock(pageSlug, key, {}).then(() => {
                  setNewKey("");
                  void queryClient.invalidateQueries({ queryKey: ["content-blocks", pageSlug] });
                }).catch(onApiError);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function BlockEditor({ pageSlug, blockKey, initial, readOnly }: {
  pageSlug: string;
  blockKey: string;
  initial: Record<string, unknown>;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2));

  const save = useMutation({
    mutationFn: (content: Record<string, unknown>) => api.content.upsertBlock(pageSlug, blockKey, content),
    onSuccess: () => {
      toast.success(`Saved ${pageSlug}/${blockKey}`);
      void queryClient.invalidateQueries({ queryKey: ["content-blocks", pageSlug] });
    },
    onError: onApiError,
  });

  return (
    <SectionCard
      title={blockKey}
      action={!readOnly ? (
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => {
            try {
              const parsed = JSON.parse(text) as Record<string, unknown>;
              save.mutate(parsed);
            } catch {
              toast.error("Not valid JSON — fix it before saving");
            }
          }}
        >
          Save
        </Button>
      ) : undefined}
    >
      <Textarea
        rows={Math.min(14, Math.max(4, text.split("\n").length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={readOnly}
        className="font-mono text-xs"
      />
    </SectionCard>
  );
}

/* -------------------------------- NEWSLETTER ------------------------------- */

const SUBSCRIBER_FILTERS = ["All", "active", "unsubscribed"];

export function NewsletterPage() {
  const [status, setStatus] = useState("All");
  const { data, isLoading } = useQuery({
    queryKey: ["newsletter-subscribers", status],
    queryFn: ({ signal }) => api.content.subscribers(status === "All" ? {} : { status }, signal),
  });

  // Campaigns need a mail pipeline the platform doesn't have; export is what
  // the API supports, so export is what the page offers.
  const exportCsv = () => {
    const rows = data ?? [];
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    const csv = ["email,source,status,subscribedAt"]
      .concat(rows.map((s) => [s.email, s.source ?? "", s.status ?? "", s.subscribedAt ?? ""].join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "newsletter-subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Newsletter"
        subtitle="Subscribers collected on the public site."
        actions={<Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>}
      />
      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <DataTable
          data={(data ?? []).map((s) => ({ ...s, id: s.id ?? "" }))}
          filters={[{ label: "Status", key: "status", options: SUBSCRIBER_FILTERS, value: status, onChange: setStatus }]}
          emptyTitle="No subscribers yet"
          columns={[
            { key: "email", header: "Email", sortable: true, accessor: (r) => r.email ?? "" },
            { key: "source", header: "Source", render: (r) => r.source ?? "—" },
            { key: "date", header: "Subscribed On", render: (r) => fmtDate(r.subscribedAt) },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status ?? "active"} /> },
          ]}
        />
      )}
    </>
  );
}
