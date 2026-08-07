import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { getBlogPost, blogPosts, blogComments, businesses } from "@/lib/data";
import { Mock, MockBadge } from "@/components/MockBadge";
import { Clock, User, Share2, Bookmark, ThumbsUp, MessageSquare, Star, Eye } from "lucide-react";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getBlogPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Article"} — Yercaud Blog` },
      { name: "description", content: loaderData?.excerpt ?? "" },
    ],
  }),
  component: BlogDetail,
});

function BlogDetail() {
  const post = Route.useLoaderData()!;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [commentSent, setCommentSent] = useState(false);
  const related = blogPosts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: post.title }]} />
      <article className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
        <div className="relative">
          <MockBadge note="Post loaded from lib/data.ts (getBlogPost) — backend GET /blog-posts/:id exists but is not used; Share/Save buttons are dead" />
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="rounded px-2 py-1 text-white" style={{ backgroundColor: post.categoryColor }}>{post.category}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readingTime}</span>
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {post.author} · {post.authorRole}</span>
            <span>{post.date}</span>
            <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /> {post.rating.toFixed(1)} ({post.ratings})</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{post.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"><Share2 className="h-4 w-4" /> Share Article</button>
            <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"><Bookmark className="h-4 w-4" /> Save</button>
          </div>
          <img src={post.image} alt="" className="mt-6 h-80 w-full rounded-2xl object-cover" />
          <div className="prose prose-sm mt-6 max-w-none text-gray-700">
            {post.content.split("\n\n").map((para: string, i: number) => (
              <p key={i} className="mb-4 leading-relaxed">{para}</p>
            ))}
          </div>

          <Mock note="Hardcoded engagement numbers; star rating only sets local state — backend PUT /blog-posts/:id/rating exists but is not called" className="mt-8">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">Reader Engagement</h3>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[{ i: ThumbsUp, l: "Helpful", n: 42 }, { i: MessageSquare, l: "Comments", n: blogComments.length }, { i: Share2, l: "Shares", n: 18 }, { i: Bookmark, l: "Saved", n: 22 }].map((x) => (
                <div key={x.l} className="rounded-lg bg-gray-50 p-3"><x.i className="mx-auto h-4 w-4 text-[#1E7A46]" /><div className="mt-1 font-bold">{x.n}</div><div className="text-[11px] text-gray-500">{x.l}</div></div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Rate this article</div>
              <div className="flex gap-1">
                {[1,2,3,4,5].map((n) => <button key={n} onClick={() => setRating(n)}><Star className={`h-6 w-6 ${n <= rating ? "fill-yellow-500 text-yellow-500" : "text-gray-300"}`} /></button>)}
              </div>
            </div>
          </div>
          </Mock>

          <Mock note="Static blogComments from lib/data.ts; comment form fakes success — backend GET/POST /blog-posts/:id/comments exist but are not used" className="mt-8">
          <div className="p-1">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Comments ({blogComments.length})</h3>
            <div className="space-y-4">
              {blogComments.map((c, i) => (
                <div key={i} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-4">
                  <img src={c.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="font-semibold text-gray-900">{c.author}</span>{c.badge && <span className="rounded bg-[#1E7A46]/10 px-2 py-0.5 text-[11px] text-[#1E7A46]">{c.badge}</span>}<span className="text-xs text-gray-500">{c.date}</span></div>
                    <div className="flex text-yellow-500">{Array.from({ length: c.rating }).map((_, j) => <Star key={j} className="h-3 w-3 fill-yellow-500" />)}</div>
                    <p className="mt-1 text-sm text-gray-700">{c.text}</p>
                    <div className="mt-1 flex gap-3 text-xs text-gray-500"><button>Like ({c.likes})</button><button>Reply</button></div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (comment.length >= 3) { setCommentSent(true); setComment(""); } }} className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
              <label className="text-sm font-semibold text-gray-900">Leave a Comment</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Share your thoughts..." className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm" />
              <button className="mt-2 rounded-lg bg-[#1E7A46] px-4 py-2 text-sm font-medium text-white">Post Comment</button>
              {commentSent && <div className="mt-2 text-sm text-[#1E7A46]">Your comment is pending approval.</div>}
            </form>
          </div>
          </Mock>

          <div className="mt-8">
            <h3 className="mb-4 text-xl font-bold text-gray-900">More from Yercaud Blog</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link key={r.slug} to={`/blog/${r.slug}` as string} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                  <img src={r.image} alt="" className="h-32 w-full object-cover" />
                  <div className="p-3"><div className="text-sm font-semibold text-gray-900 line-clamp-2">{r.title}</div><div className="mt-1 text-xs text-gray-500">{r.date}</div></div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <Mock note="Views/comment counts come from mock data, not the backend">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">Article Summary 🍃</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Category" value={post.category} />
              <Row label="Published" value={post.date} />
              <Row label="Reading Time" value={post.readingTime} />
              <Row label="Views" value={String(post.views)} icon={Eye} />
              <Row label="Comments" value={String(blogComments.length)} />
            </div>
          </div>
          </Mock>
          <Mock note="Mock businesses from lib/data.ts; links point at mock ids, not real listing slugs">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">Popular Places Mentioned</h3>
            <div className="mt-3 space-y-3">
              {post.mentions.map((id: string) => {
                const b = businesses.find((x) => x.id === id);
                if (!b) return null;
                return (
                  <Link key={id} to={`/${catPath(b.category)}/${b.id}` as string} className="flex gap-2">
                    <img src={b.image} alt="" className="h-14 w-16 rounded-lg object-cover" />
                    <div><div className="text-sm font-semibold text-gray-800">{b.name}</div><div className="text-[11px] text-gray-500">{b.category}</div><div className="text-[11px] text-[#1E7A46]">{b.priceLabel}</div></div>
                  </Link>
                );
              })}
            </div>
          </div>
          </Mock>
          <div className="rounded-2xl bg-[#1E7A46]/5 p-5">
            <h3 className="font-bold text-gray-900">Travel Budget Estimate</h3>
            <div className="mt-2 text-sm text-gray-700">A comfortable Yercaud weekend for two: ₹6,000 – ₹12,000 including stay, food and local transport.</div>
          </div>
          <div className="rounded-2xl bg-[#F97316]/10 p-5">
            <h3 className="font-bold text-gray-900">Best Time to Visit</h3>
            <p className="mt-2 text-sm text-gray-700">October to February — pleasant weather, clear views and vibrant local festivals.</p>
          </div>
        </aside>
      </article>
    </PageShell>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Eye }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="flex items-center gap-1 font-medium">{Icon && <Icon className="h-3 w-3" />} {value}</span>
    </div>
  );
}
function catPath(c: string) { return c === "Hotel" ? "hotels" : c === "Restaurant" ? "restaurants" : c === "Activity" ? "activities" : "tours"; }
