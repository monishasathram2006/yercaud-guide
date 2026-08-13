import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { HERO_IMG } from "@/lib/data";
import { api } from "@/lib/api";
import { Mock } from "@/components/MockBadge";
import { Search, Phone, Mail, Clock, HelpCircle, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/faq")({
  // Fetched server-side so the rendered HTML contains the FAQs — same
  // reasoning as blog.index.tsx's loader.
  loader: async () => {
    const [faqs, categories] = await Promise.all([
      api.content.faqs(),
      api.content.faqCategories(),
    ]);
    return { faqs, categories };
  },
  head: () => ({ meta: [{ title: "FAQ — Yercaud Business Directory" }, { name: "description", content: "Frequently asked questions about the Yercaud Business Directory." }] }),
  component: FaqPage,
});

function FaqPage() {
  const { faqs, categories } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const categoryCount = (id?: string) => faqs.filter((f) => f.categoryId === id).length;
  const filtered = useMemo(
    () =>
      faqs.filter(
        (f) =>
          (catId === null || f.categoryId === catId) &&
          ((f.question ?? "").toLowerCase().includes(q.toLowerCase()) || (f.answer ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [faqs, q, catId],
  );

  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* Home-style photo hero: dark scrim + white copy for legibility. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 py-12 text-center">
          <h1 className="text-3xl font-bold text-white drop-shadow-md sm:text-4xl">Frequently Asked Questions 🍃</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/90 drop-shadow">Find quick answers to common questions about listings, enquiries, and how the directory works.</p>
          <div className="mx-auto mt-6 flex max-w-xl gap-2 rounded-full bg-white p-2 shadow-xl">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions..." className="flex-1 border-0 bg-transparent px-4 text-sm focus:outline-none" />
            <button className="inline-flex items-center gap-1 rounded-full bg-[#1E7A46] px-5 py-2 text-sm font-medium text-white"><Search className="h-4 w-4" /> Search</button>
          </div>
        </div>
      </section>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "FAQ" }]} />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <h3 className="mb-3 font-bold text-gray-900">FAQ Categories</h3>
            <button onClick={() => setCatId(null)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${catId === null ? "bg-[#1E7A46]/10 font-semibold text-[#1E7A46]" : "text-gray-700 hover:bg-gray-50"}`}>All <span className="text-xs text-gray-500">{faqs.length}</span></button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCatId(c.id ?? null)} className={`mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${catId === c.id ? "bg-[#1E7A46]/10 font-semibold text-[#1E7A46]" : "text-gray-700 hover:bg-gray-50"}`}>
                <span>{c.name}</span><span className="text-xs text-gray-500">{categoryCount(c.id)}</span>
              </button>
            ))}
          </div>
          <Mock note="Hardcoded phone/email/hours">
          <div className="rounded-2xl bg-[#1E7A46]/5 p-5">
            <h3 className="font-bold text-gray-900">Still Need Help?</h3>
            <p className="mt-1 text-sm text-gray-700">Our team is here for you.</p>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#1E7A46]" /> +91 98765 43210</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#1E7A46]" /> support@yercaudguide.com</div>
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#1E7A46]" /> Mon-Sat 9 AM - 7 PM</div>
            </div>
            <Link to="/contact" className="mt-3 inline-block rounded-lg bg-[#1E7A46] px-4 py-2 text-sm font-medium text-white">Contact Support</Link>
          </div>
          </Mock>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">Popular Topics</h3>
            <ul className="mt-2 space-y-2 text-sm text-[#1E7A46]">
              <li>• Sending an enquiry</li><li>• Listing your business</li><li>• How reviews work</li><li>• Verified listings</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h3 className="font-bold text-gray-900">Quick Tips</h3>
            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              <li>💡 Mention dates in your enquiry.</li>
              <li>💡 Save places to Favorites for later.</li>
              <li>💡 Read reviews before deciding.</li>
            </ul>
          </div>
        </aside>
        <div className="space-y-3 p-1">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F7F9F8] p-10 text-center text-sm text-gray-600">No matching questions. Try a different search.</div>
          ) : filtered.map((f) => (
            <details key={f.id} className="group rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-gray-800">
                <span className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-[#1E7A46]" /> {f.question}</span>
                <span className="text-xs text-gray-400 group-open:hidden">▼</span>
              </summary>
              <p className="mt-3 text-sm text-gray-600">{f.answer}</p>
            </details>
          ))}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1E7A46]/10 p-5">
            <div className="flex items-center gap-3"><MessageSquare className="h-6 w-6 text-[#1E7A46]" /><div><div className="font-semibold text-gray-900">Ask a Question</div><div className="text-xs text-gray-700">Can't find what you need? We're happy to help.</div></div></div>
            <Link to="/contact" className="rounded-lg bg-[#1E7A46] px-4 py-2 text-sm font-medium text-white">Contact Us</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
