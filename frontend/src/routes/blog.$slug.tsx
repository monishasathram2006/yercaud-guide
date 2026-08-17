import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { BlogNewsletterBox } from "@/components/BlogNewsletterBox";
import { api, isNotFound, resolveUploadUrl, type BlogPost, type Listing } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { detailPath, formatPrice } from "@/lib/listing-display";
import { categoryColor } from "@/lib/blog-category-colors";
import { Clock, Share2, Bookmark, ThumbsUp, MessageSquare, Star, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    try {
      // Sequenced, not Promise.all'd with the linked posts/listings: those
      // fetches need the post's placeListingIds/relatedPostIds, which only
      // the first call knows.
      const post = await api.blog.postBySlug(params.slug);
      const [categories, places, related, allPosts, comments] = await Promise.all([
        api.blog.categories(),
        // An id that 404s (e.g. a listing since unpublished) just doesn't render.
        Promise.all(post.placeListingIds.map((id) => api.listings.byId(id).catch(() => null))),
        Promise.all(post.relatedPostIds.map((id) => api.blog.post(id).catch(() => null))),
        // Same list the /blog index page already fetches (newest-first) —
        // reused here purely to compute Previous/Next by the current post's
        // position in it, no new endpoint needed.
        api.blog.posts({ pageSize: 100 }),
        api.blog.comments(post.id),
      ]);
      const index = allPosts.findIndex((p) => p.id === post.id);
      return {
        post,
        categoryName: categories.find((c) => c.id === post.categoryId)?.name ?? "—",
        places: places.filter((p): p is Listing => p !== null),
        related: related.filter((p): p is BlogPost => p !== null),
        // allPosts is newest-first, so "previous" (older) is the next index.
        previousPost: index >= 0 ? (allPosts[index + 1] ?? null) : null,
        nextPost: index > 0 ? allPosts[index - 1] : null,
        comments,
      };
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.post.title ?? "Article"} — Yercaud Blog` },
      { name: "description", content: loaderData?.post.excerpt ?? "" },
    ],
  }),
  component: BlogDetail,
});

/** Fire-and-forget View tracking (issue #18), same shape as ContactGate.tsx's useListingView. */
function useBlogPostView(postId: string) {
  const logged = useRef<string | null>(null);
  const view = useMutation({ mutationFn: (id: string) => api.blog.logView(id) });

  useEffect(() => {
    if (logged.current === postId) return;
    logged.current = postId;
    view.mutate(postId);
    // view is a fresh useMutation object every render; only postId should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function BlogDetail() {
  const { post, categoryName, places, related, previousPost, nextPost, comments } = Route.useLoaderData();
  const { isSignedIn } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [commentSent, setCommentSent] = useState(false);
  useBlogPostView(post.id);

  const postComment = useMutation({
    mutationFn: (body: string) => api.blog.comment(post.id, { body }),
    onSuccess: () => {
      setCommentSent(true);
      setComment("");
    },
  });

  return (
    <PageShell>
      <Breadcrumbs
        items={[{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: post.title }]}
      />
      <article className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${categoryColor(post.categoryId).bg} ${categoryColor(post.categoryId).text}`}>
              {categoryName}
            </span>
            {post.readingTimeMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {post.readingTimeMinutes} min read
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {post.authorAvatarUrl ? (
                <img src={post.authorAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1E7A46]/10 text-sm font-semibold text-[#1E7A46]">
                  {post.authorName.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                <div className="text-sm font-semibold text-gray-900">{post.authorName}</div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3 w-3" /> {formatDate(post.publishedAt)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                <Share2 className="h-4 w-4" /> Share Article
              </button>
              <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                <Bookmark className="h-4 w-4" /> Save
              </button>
            </div>
          </div>
          {post.coverImage && (
            <img
              src={resolveUploadUrl(post.coverImage) ?? undefined}
              alt=""
              className="mt-6 h-80 w-full rounded-2xl object-cover"
            />
          )}
          <div className="prose prose-sm mt-6 max-w-none text-gray-700">
            {/* remarkGfm: tables/strikethrough/autolinks (CommonMark alone doesn't have these).
                rehypeRaw: lets the editor's Underline/Video toolbar buttons, which have no
                Markdown syntax, embed real <u>/<video> tags that actually render here. */}
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{post.body}</ReactMarkdown>
          </div>

          {/*
            Article Rating (PUT /blog-posts/:id/rating) stays mock for this
            pass — comments are wired to the real API below, but rating is a
            separate concern left out of scope here.
          */}
          <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">Reader Engagement</h3>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                { i: ThumbsUp, l: "Helpful", n: 42 },
                { i: MessageSquare, l: "Comments", n: comments.length },
                { i: Share2, l: "Shares", n: 18 },
                { i: Bookmark, l: "Saved", n: 22 },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-gray-50 p-3">
                  <x.i className="mx-auto h-4 w-4 text-[#1E7A46]" />
                  <div className="mt-1 font-bold">{x.n}</div>
                  <div className="text-[11px] text-gray-500">{x.l}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Rate this article</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)}>
                    <Star
                      className={`h-6 w-6 ${n <= rating ? "fill-yellow-500 text-yellow-500" : "text-gray-300"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 p-1">
            <h3 className="mb-4 text-xl font-bold text-gray-900">
              Comments ({comments.length})
            </h3>
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1E7A46]/10 text-sm font-semibold text-[#1E7A46]">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{c.body}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-gray-500">No comments yet — be the first to share your thoughts.</p>}
            </div>
            {isSignedIn ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim().length >= 3) postComment.mutate(comment.trim());
                }}
                className="mt-4 rounded-2xl border border-gray-100 bg-white p-4"
              >
                <label className="text-sm font-semibold text-gray-900">Leave a Comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Share your thoughts..."
                  className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={postComment.isPending}
                  className="mt-2 rounded-lg bg-[#1E7A46] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {postComment.isPending ? "Posting…" : "Post Comment"}
                </button>
                {commentSent && (
                  <div className="mt-2 text-sm text-[#1E7A46]">Your comment is pending approval.</div>
                )}
                {postComment.isError && (
                  <div className="mt-2 text-sm text-red-600">Couldn't post your comment — please try again.</div>
                )}
              </form>
            ) : (
              <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600">
                <Link to="/login" className="font-medium text-[#1E7A46] hover:underline">
                  Sign in
                </Link>{" "}
                to leave a comment.
              </div>
            )}
          </div>

          {(previousPost || nextPost) && (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {previousPost ? (
                <Link
                  to="/blog/$slug"
                  params={{ slug: previousPost.slug }}
                  className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-4 hover:border-[#1E7A46]/30"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 text-[#1E7A46]" />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400">Previous</div>
                    <div className="truncate text-sm font-medium text-gray-800">{previousPost.title}</div>
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {nextPost && (
                <Link
                  to="/blog/$slug"
                  params={{ slug: nextPost.slug }}
                  className="flex items-center justify-end gap-2 rounded-xl border border-gray-100 bg-white p-4 text-right hover:border-[#1E7A46]/30"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400">Next</div>
                    <div className="truncate text-sm font-medium text-gray-800">{nextPost.title}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#1E7A46]" />
                </Link>
              )}
            </div>
          )}

          {related.length > 0 && (
            <div className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">More from Yercaud Blog</h3>
                <Link to="/blog" className="text-sm font-medium text-[#1E7A46] hover:underline">
                  View All →
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to="/blog/$slug"
                    params={{ slug: r.slug }}
                    className="overflow-hidden rounded-xl border border-gray-100 bg-white"
                  >
                    {r.coverImage ? (
                      <img src={resolveUploadUrl(r.coverImage) ?? undefined} alt="" className="h-32 w-full object-cover" />
                    ) : (
                      <div className="h-32 w-full bg-gray-100" />
                    )}
                    <div className="p-3">
                      <div className="text-sm font-semibold text-gray-900 line-clamp-2">
                        {r.title}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{formatDate(r.publishedAt)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">About the Author</h3>
            <div className="mt-3 flex items-center gap-3">
              {post.authorAvatarUrl ? (
                <img src={post.authorAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#1E7A46]/10 text-sm font-semibold text-[#1E7A46]">
                  {post.authorName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-semibold text-gray-900">{post.authorName}</div>
                <div className="text-xs text-gray-500">Yercaud Guide</div>
              </div>
            </div>
            {post.authorBio && <p className="mt-3 text-xs leading-relaxed text-gray-600">{post.authorBio}</p>}
          </div>
          {post.tags.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <h3 className="mb-3 font-bold text-gray-900">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span key={t} className="rounded-full bg-[#1E7A46]/10 px-3 py-1 text-xs font-medium text-[#1E7A46]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">Article Summary 🍃</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Category" value={categoryName} />
              <Row label="Published" value={formatDate(post.publishedAt)} />
              <Row
                label="Reading Time"
                value={post.readingTimeMinutes ? `${post.readingTimeMinutes} min` : "—"}
              />
              <Row label="Views" value={post.viewCount.toLocaleString("en-IN")} />
              <Row label="Comments" value={String(comments.length)} />
            </div>
          </div>
          {places.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <h3 className="font-bold text-gray-900">Popular Places Mentioned</h3>
              <div className="mt-3 space-y-3">
                {places.map((b) => (
                  <Link key={b.id} to={detailPath(b)} className="flex gap-2">
                    {b.primaryImageUrl ? (
                      <img
                        src={b.primaryImageUrl}
                        alt=""
                        className="h-14 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-14 w-16 shrink-0 rounded-lg bg-gray-100" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{b.name}</div>
                      <div className="text-[11px] text-gray-500">{b.categoryName}</div>
                      {formatPrice(b.priceFrom, b.priceUnit) && (
                        <div className="text-[11px] text-[#1E7A46]">
                          {formatPrice(b.priceFrom, b.priceUnit)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl bg-[#1E7A46]/5 p-5">
            <h3 className="font-bold text-gray-900">Travel Budget Estimate</h3>
            <div className="mt-2 text-sm text-gray-700">
              A comfortable Yercaud weekend for two: ₹6,000 – ₹12,000 including stay, food and local
              transport.
            </div>
          </div>
          <div className="rounded-2xl bg-[#F97316]/10 p-5">
            <h3 className="font-bold text-gray-900">Best Time to Visit</h3>
            <p className="mt-2 text-sm text-gray-700">
              October to February — pleasant weather, clear views and vibrant local festivals.
            </p>
          </div>
          <BlogNewsletterBox />
        </aside>
      </article>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
