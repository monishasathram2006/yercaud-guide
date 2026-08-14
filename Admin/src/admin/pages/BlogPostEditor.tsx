import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Eye, Send, UploadCloud, X } from "lucide-react";
import { SkeletonList } from "../components/primitives";
import { MarkdownToolbar } from "../components/MarkdownToolbar";
import { RelatedListingsPicker } from "../components/RelatedListingsPicker";
import { api, PUBLIC_SITE_URL, type Schemas } from "@/lib/api";
import { onApiError } from "../queries";

/** Mirrors the backend's assertValidBlogCoverImageFile — reject bad files before the round trip, not after. Same rule for both the Featured and Social Share images. */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-semibold text-slate-700">{label}</Label>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Cosmetic only — the real slug is computed server-side (uniqueSlug). Never sent unless the admin explicitly edits the permalink. */
function previewSlug(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "…";
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Only JPG, PNG or WEBP images are allowed";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 4 MB or smaller";
  return null;
}

function ImageDropzone({
  label,
  hint,
  currentUrl,
  file,
  preview,
  onFile,
  compact = false,
}: {
  label: string;
  hint: string;
  currentUrl: string | null | undefined;
  file: File | null;
  preview: string | null;
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const shown = preview ?? currentUrl ?? null;

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const error = validateImageFile(f);
    if (error) {
      toast.error(error);
      return;
    }
    onFile(f);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {shown && compact ? (
        <div className="flex items-center gap-3">
          <img src={shown} alt="" className="h-14 w-20 rounded-lg border border-slate-200 object-cover" />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Replace Image</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          {shown ? (
            <img src={shown} alt="" className="h-28 w-full rounded-lg object-cover" />
          ) : (
            <UploadCloud className="h-6 w-6 text-slate-400" />
          )}
          <div className="text-xs">
            <span className="font-medium text-emerald-600">{shown ? "Replace image" : "Click to upload"}</span>
            <span className="text-slate-500"> or drag & drop</span>
          </div>
          <div className="text-[10px] text-slate-400">{hint}</div>
        </button>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

type BlogPostStatus = "draft" | "pending" | "published";
type BlogPostVisibility = "public" | "private";

/** yyyy-MM-ddThh:mm, what <input type="datetime-local"> needs — chopping the ISO string is fine, it never carries fractional seconds from here. */
function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BlogPostEditor({ postId }: { postId?: string }) {
  const navigate = useNavigate();
  // `to` is a plain string, not an inline literal — same escape hatch
  // GlobalSearch.tsx's go() uses for this app's untyped AdminRouter paths.
  const go = (to: string) => void navigate({ to });
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: categories } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: ({ signal }) => api.blog.categories(signal),
  });
  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-posts", "byId", postId],
    enabled: postId !== undefined,
    queryFn: ({ signal }) => api.blog.post(postId!, signal),
  });

  const [draft, setDraft] = useState<{
    categoryId: string;
    title: string;
    excerpt: string;
    body: string;
    seoTitle: string;
    seoDescription: string;
    focusKeyword: string;
    canonicalUrl: string;
    tags: string[];
    placeListingIds: string[];
    status: BlogPostStatus;
    publishedAt: string;
    visibility: BlogPostVisibility;
  } | null>(null);
  const form = draft ?? {
    categoryId: post?.categoryId ?? "",
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    body: post?.body ?? "",
    seoTitle: post?.seoTitle ?? "",
    seoDescription: post?.seoDescription ?? "",
    focusKeyword: post?.focusKeyword ?? "",
    canonicalUrl: post?.canonicalUrl ?? "",
    tags: post?.tags ?? [],
    placeListingIds: post?.placeListingIds ?? [],
    status: (post?.status as BlogPostStatus | undefined) ?? "draft",
    publishedAt: toLocalDateTimeInput(post?.publishedAt),
    visibility: (post?.visibility as BlogPostVisibility | undefined) ?? "public",
  };
  const set = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });

  const [tagInput, setTagInput] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState(false);
  const effectiveSlug = slugOverride ?? post?.slug ?? previewSlug(form.title);

  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [socialImageFile, setSocialImageFile] = useState<File | null>(null);
  const [socialImagePreview, setSocialImagePreview] = useState<string | null>(null);

  // Once create succeeds, later steps (status PATCH, image uploads) address
  // the post by this id — a retry after a mid-save failure updates the post
  // that already exists instead of calling createPost again.
  const [createdPostId, setCreatedPostId] = useState<string | null>(null);
  const activePostId = postId ?? createdPostId;

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
    setTagInput("");
  };

  const save = useMutation({
    mutationFn: async (overrides?: Partial<{ status: BlogPostStatus }>) => {
      const status = overrides?.status ?? form.status;
      const publishedAtIso = status === "published" && form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined;
      const basePayload = {
        categoryId: form.categoryId,
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        body: form.body,
        seoTitle: form.seoTitle.trim() || null,
        seoDescription: form.seoDescription.trim() || null,
        focusKeyword: form.focusKeyword.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        visibility: form.visibility,
        tags: form.tags,
        placeListingIds: form.placeListingIds,
        ...(slugOverride ? { slug: slugOverride } : {}),
      };
      const wasCreate = !activePostId;

      let saved: Schemas["BlogPost"];
      if (activePostId) {
        saved = await api.blog.updatePost(activePostId, { ...basePayload, status, ...(publishedAtIso ? { publishedAt: publishedAtIso } : {}) });
      } else {
        // A new post always starts as draft server-side (posts.ts's invariant) —
        // a second PATCH moves it on if the author picked pending/published up front.
        saved = await api.blog.createPost(basePayload);
        setCreatedPostId(saved.id!);
        if (status !== "draft") {
          saved = await api.blog.updatePost(saved.id!, { status, ...(publishedAtIso ? { publishedAt: publishedAtIso } : {}) });
        }
      }
      if (coverImageFile) {
        saved = await api.blog.uploadCoverImage(saved.id!, coverImageFile);
        setCoverImageFile(null);
      }
      if (socialImageFile) {
        saved = await api.blog.uploadSocialImage(saved.id!, socialImageFile);
        setSocialImageFile(null);
      }
      return { post: saved, wasCreate };
    },
    onSuccess: ({ post: saved, wasCreate }) => {
      toast.success(wasCreate ? `Created "${saved.title}"` : `Updated "${saved.title}"`);
      void queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
      go("/blog");
    },
    onError: onApiError,
  });

  const canSubmit = form.categoryId !== "" && form.title.trim() !== "" && form.body.trim() !== "";
  const requireValid = (): boolean => {
    if (!canSubmit) {
      toast.error("Category, title and body are required");
      return false;
    }
    return true;
  };

  const wordCount = useMemo(() => form.body.trim().split(/\s+/).filter(Boolean).length, [form.body]);

  const keywordUsage = useMemo(() => {
    const kw = form.focusKeyword.trim().toLowerCase();
    if (!kw) return null;
    const inTitle = form.title.toLowerCase().includes(kw);
    const inMeta = (form.seoDescription || form.excerpt).toLowerCase().includes(kw);
    const inBody = form.body.toLowerCase().includes(kw);
    const hits = [inTitle, inMeta, inBody].filter(Boolean).length;
    return hits >= 2 ? "Good" : "Needs work";
  }, [form.focusKeyword, form.title, form.seoDescription, form.excerpt, form.body]);

  const publishLabel = form.publishedAt && new Date(form.publishedAt) > new Date() ? "Schedule" : "Publish";

  if (postId && isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <SkeletonList rows={8} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <button
        onClick={() => go("/blog")}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Blog
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{postId ? "Edit Blog Post" : "Create New Blog Post"}</h1>
          <p className="mt-1 text-sm text-slate-500">Write and publish engaging content for your audience.</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => { if (requireValid()) save.mutate({ status: "draft" }); }}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!post?.slug) { toast.error("Save the post first to preview it"); return; }
              window.open(`${PUBLIC_SITE_URL}/blog/${post.slug}`, "_blank");
            }}
          >
            <Eye className="mr-1 h-4 w-4" /> Preview
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={save.isPending}
            onClick={() => {
              if (!requireValid()) return;
              set({ publishedAt: form.publishedAt || toLocalDateTimeInput(new Date().toISOString()) });
              save.mutate({ status: "published" });
            }}
          >
            <Send className="mr-1 h-4 w-4" /> {save.isPending ? "Saving…" : publishLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* -------------------------------- MAIN -------------------------------- */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <FormField label="Post Title *" hint={`${form.title.length}/120`}>
              <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Top 10 things to do in Yercaud" maxLength={120} />
            </FormField>

            <FormField label="Permalink (Slug)">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                <span className="shrink-0 text-slate-400">yercaudguide.com/blog/</span>
                {editingSlug ? (
                  <Input
                    autoFocus
                    value={slugOverride ?? effectiveSlug}
                    onChange={(e) => setSlugOverride(e.target.value)}
                    className="h-7 flex-1 border-slate-300 bg-white text-sm"
                  />
                ) : (
                  <span className="flex-1 truncate font-medium text-slate-800">{effectiveSlug}</span>
                )}
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 bg-white" onClick={() => setEditingSlug((v) => !v)}>
                  {editingSlug ? "Done" : "Edit"}
                </Button>
              </div>
            </FormField>

            <FormField label="Short Description (Excerpt)" hint={`${form.excerpt.length}/160`}>
              <Textarea rows={3} value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} maxLength={160} />
            </FormField>

            <FormField label="Content *">
              <Tabs defaultValue="write">
                <TabsList>
                  <TabsTrigger value="write">Write</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="write" className="pt-2">
                  <MarkdownToolbar textareaRef={textareaRef} value={form.body} onChange={(body) => set({ body })} />
                  <Textarea
                    ref={textareaRef}
                    rows={16}
                    value={form.body}
                    onChange={(e) => set({ body: e.target.value })}
                    placeholder="Start writing your blog post…"
                    className="rounded-t-none"
                  />
                  <div className="mt-1 text-right text-xs text-slate-400">Words: {wordCount}</div>
                </TabsContent>
                <TabsContent value="preview" className="pt-2">
                  <div className="prose prose-sm max-w-none rounded-md border border-slate-200 p-3 min-h-[240px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{form.body || "*Nothing to preview yet.*"}</ReactMarkdown>
                  </div>
                </TabsContent>
              </Tabs>
            </FormField>
          </div>

          {/* ----------------------------- SEO PANEL ----------------------------- */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900">SEO & Search Preview</h3>
              <p className="text-xs text-slate-500">Optimize how your post appears in search engines.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <FormField label="SEO Title" hint={`${form.seoTitle.length}/60`}>
                  <Input value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={60} placeholder={form.title} />
                </FormField>
                <FormField label="Meta Description" hint={`${form.seoDescription.length}/160`}>
                  <Textarea rows={3} value={form.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} maxLength={160} placeholder={form.excerpt} />
                </FormField>
                <FormField label="Focus Keyword" hint={`${form.focusKeyword.length}/100`}>
                  <div className="flex items-center gap-2">
                    <Input value={form.focusKeyword} onChange={(e) => set({ focusKeyword: e.target.value })} maxLength={100} placeholder="e.g. yercaud monsoon" />
                    {keywordUsage && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${keywordUsage === "Good" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {keywordUsage}
                      </span>
                    )}
                  </div>
                  {keywordUsage && (
                    <p className="text-[11px] text-slate-400">Your keyword is used in the title, meta description and content.</p>
                  )}
                </FormField>
                <FormField label="Canonical URL (Optional)">
                  <Input value={form.canonicalUrl} onChange={(e) => set({ canonicalUrl: e.target.value })} placeholder={`${PUBLIC_SITE_URL}/blog/${effectiveSlug}`} />
                </FormField>
                <FormField label="Social Share Image (Optional)" hint="1200 x 630px, Max 4MB">
                  <ImageDropzone
                    label="Social share image"
                    hint="Recommended 1200 x 630px, JPG/PNG/WebP, Max 4MB"
                    currentUrl={post?.ogImage}
                    file={socialImageFile}
                    preview={socialImagePreview}
                    compact
                    onFile={(f) => {
                      setSocialImageFile(f);
                      setSocialImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
                    }}
                  />
                </FormField>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Search Preview</Label>
                <p className="mb-2 text-[11px] text-slate-400">This is how your post may appear in Google search results.</p>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">{PUBLIC_SITE_URL.replace(/^https?:\/\//, "")} › blog › {effectiveSlug}</div>
                  <div className="mt-1 truncate text-base text-blue-700">{form.seoTitle || form.title || "Untitled post"}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-slate-600">{form.seoDescription || form.excerpt || "Add a meta description to control how this looks in search results."}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* -------------------------------- SIDEBAR -------------------------------- */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <h3 className="font-semibold text-slate-900">Publishing</h3>
            <FormField label="Status">
              <select
                value={form.status}
                onChange={(e) => {
                  const nextStatus = e.target.value as BlogPostStatus;
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
              <FormField label="Publish">
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={!form.publishedAt || new Date(form.publishedAt) <= new Date()} onChange={() => set({ publishedAt: toLocalDateTimeInput(new Date().toISOString()) })} />
                    Publish immediately
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={!!form.publishedAt && new Date(form.publishedAt) > new Date()} onChange={() => set({ publishedAt: toLocalDateTimeInput(new Date(Date.now() + 3600_000).toISOString()) })} />
                    Schedule for later
                  </label>
                  {!!form.publishedAt && new Date(form.publishedAt) > new Date() && (
                    <Input type="datetime-local" value={form.publishedAt} onChange={(e) => set({ publishedAt: e.target.value })} />
                  )}
                </div>
              </FormField>
            )}
            <FormField label="Visibility">
              <select
                value={form.visibility}
                onChange={(e) => set({ visibility: e.target.value as BlogPostVisibility })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <p className="text-[11px] text-slate-400">
                {form.visibility === "public" ? "The post will be visible to everyone." : "The post is reachable by admins only, even if published."}
              </p>
            </FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">Featured Image</h3>
            <ImageDropzone
              label="Featured image"
              hint="Recommended 1200 x 630px (16:9), JPG/PNG/WebP, Max 4MB"
              currentUrl={post?.coverImage}
              file={coverImageFile}
              preview={coverImagePreview}
              onFile={(f) => {
                setCoverImageFile(f);
                setCoverImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
              }}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
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
                placeholder="Add tag and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(); }
                }}
              />
            </FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <FormField label="Related Listings (Optional)" hint={form.placeListingIds.length > 0 ? `${form.placeListingIds.length} selected` : undefined}>
              <RelatedListingsPicker selectedIds={form.placeListingIds} onChange={(ids) => set({ placeListingIds: ids })} />
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}
