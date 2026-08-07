import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { blogPosts, blogCategories, HERO_IMG } from "@/lib/data";
import { Mock } from "@/components/MockBadge";
import { Search, Clock, User, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/blog/")({
  head: () => ({ meta: [{ title: "Yercaud Blog — Travel Guides & Local Stories" }, { name: "description", content: "Read local travel tips, guides and stories about Yercaud." }] }),
  component: BlogList,
});

const PER_PAGE = 9;

function BlogList() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [subscribed, setSubscribed] = useState(false);
  const filtered = useMemo(() => blogPosts.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) || p.excerpt.toLowerCase().includes(q.toLowerCase())), [q]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* Home-style photo hero: dark scrim + white copy for legibility. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 py-12 text-center">
          <h1 className="text-3xl font-bold text-white drop-shadow-md sm:text-4xl">Yercaud Blog 🍃</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/90 drop-shadow">Travel guides, food journals and stories from the Shevaroy Hills.</p>
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); }} className="mx-auto mt-6 flex max-w-xl gap-2 rounded-full bg-white p-2 shadow-xl">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles..." className="flex-1 border-0 bg-transparent px-4 text-sm focus:outline-none" />
            <button className="inline-flex items-center gap-1 rounded-full bg-[#1E7A46] px-5 py-2 text-sm font-medium text-white"><Search className="h-4 w-4" /> Search</button>
          </form>
        </div>
      </section>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Blog" }]} />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1fr_300px]">
        <Mock note="Generated blogPosts from lib/data.ts — backend GET /blog-posts exists but is not used (search/sort/pagination are client-side over mock data)">
        <div className="p-1">
          <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
            <div>{filtered.length} Articles</div>
            <select className="rounded-lg border border-gray-200 px-3 py-1.5"><option>Sort by: Latest</option></select>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}` as string} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="aspect-[16/10] overflow-hidden"><img src={p.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" /></div>
                <div className="p-4">
                  <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: p.categoryColor }}>{p.category}</span>
                  <h3 className="mt-2 font-bold text-gray-900 line-clamp-2">{p.title}</h3>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{p.excerpt}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {p.author}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {p.readingTime}</span>
                    <span>{p.date}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={`h-9 w-9 rounded-lg text-sm ${page === i + 1 ? "bg-[#1E7A46] text-white" : "border border-gray-200 text-gray-700"}`}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
        </Mock>
        <aside className="space-y-5">
          <Mock note="Static blogCategories from lib/data.ts — backend GET /blog-categories exists but is not used">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="mb-3 font-bold text-gray-900">Categories</h3>
            <ul className="space-y-2 text-sm">
              {blogCategories.map((c) => (
                <li key={c.name} className="flex items-center justify-between text-gray-700"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} /> {c.name}</span><span className="text-xs text-gray-500">{c.count}</span></li>
              ))}
            </ul>
            <a className="mt-3 block text-sm font-medium text-[#1E7A46]">View All Categories →</a>
          </div>
          </Mock>
          <Mock note="First 4 mock posts, not real popularity data">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="mb-3 font-bold text-gray-900">Popular Articles</h3>
            <ul className="space-y-3">
              {blogPosts.slice(0, 4).map((p) => (
                <li key={p.slug} className="flex gap-2">
                  <img src={p.image} alt="" className="h-14 w-16 rounded-lg object-cover" />
                  <div><Link to={`/blog/${p.slug}` as string} className="text-sm font-medium text-gray-800 hover:text-[#1E7A46] line-clamp-2">{p.title}</Link><div className="text-[11px] text-gray-500">{p.date}</div></div>
                </li>
              ))}
            </ul>
          </div>
          </Mock>
          <Mock note="Fake submit — backend POST /newsletter/subscribe exists but is never called">
          <div className="rounded-2xl bg-[#1E7A46]/10 p-5">
            <h3 className="font-bold text-[#1E7A46]">Subscribe to Our Newsletter</h3>
            <p className="mt-1 text-xs text-gray-700">Get the latest Yercaud stories in your inbox.</p>
            {subscribed ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 text-sm"><CheckCircle2 className="h-4 w-4 text-[#1E7A46]" /> Subscribed!</div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setSubscribed(true); }} className="mt-3 flex gap-2">
                <input type="email" required placeholder="your@email.com" className="flex-1 rounded-lg border border-white/50 bg-white px-3 py-2 text-sm" />
                <button className="rounded-lg bg-[#1E7A46] px-3 text-sm font-medium text-white">Subscribe</button>
              </form>
            )}
          </div>
          </Mock>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center">
            <h3 className="font-bold text-gray-900">Submit Your Story</h3>
            <p className="mt-1 text-xs text-gray-600">Are you a Yercaud local? Share your travel tips with us.</p>
            <Link to="/contact" className="mt-3 inline-block rounded-lg bg-[#1E7A46] px-4 py-2 text-sm font-medium text-white">Get in Touch</Link>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
