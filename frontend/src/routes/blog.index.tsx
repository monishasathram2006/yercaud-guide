import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { BlogNewsletterBox } from "@/components/BlogNewsletterBox";
import { HERO_IMG } from "@/lib/data";
import { api, type BlogPostSummary } from "@/lib/api";
import { categoryColor } from "@/lib/blog-category-colors";
import { Search, Calendar, Clock, ChevronLeft, ChevronRight, Layers, Send } from "lucide-react";

export const Route = createFileRoute("/blog/")({
  // Fetched server-side so the rendered HTML contains the posts — same
  // reasoning as hotels.index.tsx's loader.
  loader: async () => {
    const [posts, categories] = await Promise.all([
      api.blog.posts({ pageSize: 60 }),
      api.blog.categories(),
    ]);
    return { posts, categories };
  },
  head: () => ({
    meta: [
      { title: "Yercaud Blog — Travel Guides & Local Stories" },
      { name: "description", content: "Read local travel tips, guides and stories about Yercaud." },
    ],
  }),
  component: BlogList,
});

const PER_PAGE = 9;

function BlogList() {
  const { posts, categories } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<"latest" | "oldest">("latest");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const rows = posts.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (p.title.toLowerCase().includes(q.toLowerCase()) ||
          (p.excerpt ?? "").toLowerCase().includes(q.toLowerCase())),
    );
    // posts already arrives newest-first from the API — reverse for "oldest".
    return sort === "latest" ? rows : [...rows].reverse();
  }, [posts, q, categoryId, sort]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const categoryCount = (id: string) => posts.filter((p) => p.categoryId === id).length;

  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* Home-style photo hero: dark scrim + white copy for legibility. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 py-12 text-center">
          <h1 className="text-3xl font-bold text-white drop-shadow-md sm:text-4xl">
            Yercaud Blog 🍃
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/90 drop-shadow">
            Travel guides, food journals and stories from the Shevaroy Hills.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
            className="mx-auto mt-6 flex max-w-xl gap-2 rounded-full bg-white p-2 shadow-xl"
          >
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search articles..."
              className="flex-1 border-0 bg-transparent px-4 text-sm focus:outline-none"
            />
            <button className="inline-flex items-center gap-1 rounded-full bg-[#1E7A46] px-5 py-2 text-sm font-medium text-white">
              <Search className="h-4 w-4" /> Search
            </button>
          </form>
        </div>
      </section>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Blog" }]} />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1fr_300px]">
        <div className="p-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              All Articles
              <span className="rounded-full bg-[#1E7A46]/10 px-2 py-0.5 text-xs font-semibold text-[#1E7A46]">
                {filtered.length} Articles
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Sort by:
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "latest" | "oldest")}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
              >
                <option value="latest">Latest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
          </div>
          {pageItems.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500">
              No articles found.
            </div>
          ) : (
            <div className="space-y-4">
              {pageItems.map((p) => (
                <BlogPostRow key={p.id} post={p} categoryName={categoryName(p.categoryId)} />
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`h-9 w-9 rounded-lg text-sm ${page === i + 1 ? "bg-[#1E7A46] text-white" : "border border-gray-200 text-gray-700"}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="mb-3 flex items-center gap-1.5 font-bold text-gray-900">
              Categories <Layers className="h-4 w-4 text-[#1E7A46]" />
            </h3>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">No categories yet.</p>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  <li>
                    <button
                      onClick={() => {
                        setCategoryId(null);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${categoryId === null ? "bg-[#1E7A46]/10 font-semibold text-[#1E7A46]" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <span>All Categories</span>
                      <span className="text-xs text-gray-400">({posts.length})</span>
                    </button>
                  </li>
                  {categories.map((c) => {
                    const color = categoryColor(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            setCategoryId(c.id);
                            setPage(1);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left ${categoryId === c.id ? "bg-[#1E7A46]/10 font-semibold text-[#1E7A46]" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} /> {c.name}
                          </span>
                          <span className="text-xs text-gray-400">({categoryCount(c.id)})</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {categoryId !== null && (
                  <button
                    onClick={() => {
                      setCategoryId(null);
                      setPage(1);
                    }}
                    className="mt-2 text-xs font-medium text-[#1E7A46] hover:underline"
                  >
                    View All Categories →
                  </button>
                )}
              </>
            )}
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="mb-3 font-bold text-gray-900">Popular Articles</h3>
            {posts.length === 0 ? (
              <p className="text-sm text-gray-400">No articles yet.</p>
            ) : (
              <ul className="space-y-3">
                {posts.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex gap-2">
                    {p.coverImage ? (
                      <img
                        src={p.coverImage}
                        alt=""
                        className="h-14 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-14 w-16 shrink-0 rounded-lg bg-gray-100" />
                    )}
                    <div>
                      <Link
                        to="/blog/$slug"
                        params={{ slug: p.slug }}
                        className="text-sm font-medium text-gray-800 hover:text-[#1E7A46] line-clamp-2"
                      >
                        {p.title}
                      </Link>
                      {p.publishedAt && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                          <Calendar className="h-2.5 w-2.5" /> {formatShortDate(p.publishedAt)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <BlogNewsletterBox />
        </aside>
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gray-50 p-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1E7A46] text-white">
              <Send className="h-4 w-4" />
            </span>
            <div>
              <div className="font-bold text-gray-900">Love Yercaud?</div>
              <div className="text-sm text-gray-600">Share your experiences and travel stories with us.</div>
            </div>
          </div>
          <Link
            to="/contact"
            className="shrink-0 rounded-lg border border-[#1E7A46] px-4 py-2 text-sm font-medium text-[#1E7A46] hover:bg-[#1E7A46]/5"
          >
            Submit Your Story
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

/** The list page's row layout — thumbnail left, content right, with a category-colored label and inline meta (date, read time, author). */
function BlogPostRow({ post, categoryName }: { post: BlogPostSummary; categoryName: string }) {
  const color = categoryColor(post.categoryId);
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group flex gap-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition hover:shadow-md sm:p-4"
    >
      <div className="aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:w-44">
        {post.coverImage ? (
          <img src={post.coverImage} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[10px] text-gray-400">No photo yet</div>
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center py-1">
        <span className={`mb-1.5 inline-block w-fit rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${color.bg} ${color.text}`}>
          {categoryName}
        </span>
        <h3 className="font-bold text-gray-900 group-hover:text-[#1E7A46] sm:text-lg">{post.title} ›</h3>
        {post.excerpt && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{post.excerpt}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {post.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {formatShortDate(post.publishedAt)}
            </span>
          )}
          {post.readingTimeMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {post.readingTimeMinutes} min read
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {post.authorAvatarUrl ? (
              <img src={post.authorAvatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#1E7A46]/10 text-[9px] font-semibold text-[#1E7A46]">
                {post.authorName.charAt(0).toUpperCase()}
              </span>
            )}
            {post.authorName}
          </span>
        </div>
      </div>
    </Link>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
