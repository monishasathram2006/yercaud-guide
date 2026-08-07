import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { aboutContent, HILLS_IMG } from "@/lib/data";
import { Mock } from "@/components/MockBadge";
import { Target, Eye, ShieldCheck, Tag, MessageCircle, Headphones, Compass, Users, Calendar, Building2, Globe, ArrowRight, MapPin } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About Yercaud Guide — Yercaud Business Directory" },
    { name: "description", content: aboutContent.heroText },
  ]}),
  component: About,
});

const whyIcons = [ShieldCheck, Tag, MessageCircle, Headphones, Compass, Users];

function About() {
  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "About Yercaud Guide" }]} />
      <section className="mx-auto max-w-7xl px-6 py-8">
        <Mock note="Entire page renders static aboutContent from lib/data.ts (stats/milestones are made-up numbers) — backend GET /content-blocks/about exists but is not used">
        <div className="grid overflow-hidden rounded-2xl bg-[#F7F9F8] md:grid-cols-2">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{aboutContent.heroTitle} 🍃</h1>
            <p className="mt-2 font-semibold text-[#1E7A46]">{aboutContent.heroTagline}</p>
            <p className="mt-3 text-sm text-gray-600">{aboutContent.heroText}</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {aboutContent.stats.map((s) => (
                <div key={s.label} className="rounded-xl bg-white p-3 text-center">
                  <div className="text-lg font-bold text-[#1E7A46]">{s.n}</div>
                  <div className="text-[11px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <img src={HILLS_IMG} alt="Yercaud hills" className="h-full min-h-[280px] w-full object-cover" />
        </div>
        </Mock>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <h2 className="text-center text-2xl font-bold text-gray-900">Our Mission & Vision 🍃</h2>
        <div className="mx-auto mt-1 h-1 w-16 rounded bg-[#1E7A46]" />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <MissionCard icon={Target} title="Our Mission" text={aboutContent.mission} />
          <MissionCard icon={Eye} title="Our Vision" text={aboutContent.vision} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-center text-2xl font-bold text-gray-900">Why Choose Yercaud Guide?</h2>
        <div className="mx-auto mt-1 h-1 w-16 rounded bg-[#1E7A46]" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
          {aboutContent.why.map((w, i) => {
            const Icon = whyIcons[i % whyIcons.length];
            return (
              <div key={w.title} className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#1E7A46]/10 text-[#1E7A46]"><Icon className="h-6 w-6" /></div>
                <div className="mt-3 text-sm font-bold text-gray-900">{w.title}</div>
                <div className="mt-1 text-xs text-gray-600">{w.sub}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-6 md:grid-cols-2">
          <img src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80" alt="" className="h-72 w-full rounded-2xl object-cover" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Our Journey 🍃</h2>
            <p className="mt-3 text-sm text-gray-600">{aboutContent.journey}</p>
            <Mock note="Made-up milestone numbers from lib/data.ts" className="mt-6">
            <div className="grid grid-cols-3 gap-3 p-1">
              {aboutContent.milestones.map((m, i) => {
                const Icon = [Calendar, Building2, Globe][i];
                return (
                  <div key={m.label} className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                    <Icon className="mx-auto h-4 w-4 text-[#1E7A46]" />
                    <div className="mt-1 text-lg font-bold text-gray-900">{m.n}</div>
                    <div className="text-[11px] text-gray-500">{m.label}</div>
                  </div>
                );
              })}
            </div>
            </Mock>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-14">
        <div className="grid items-center gap-4 rounded-2xl bg-[#1E7A46]/10 p-6 md:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#1E7A46]/20 text-[#1E7A46]"><MapPin className="h-6 w-6" /></div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Be a Part of Yercaud Guide 🍃</h3>
              <p className="text-sm text-gray-700">List your business with us and reach thousands of travellers looking for the best services in Yercaud.</p>
            </div>
          </div>
          <Link to="/list-your-business" className="inline-flex items-center gap-2 rounded-lg bg-[#1E7A46] px-6 py-3 text-sm font-medium text-white hover:bg-[#186238]">List Your Business <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </PageShell>
  );
}
function MissionCard({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#1E7A46]/10 text-[#1E7A46]"><Icon className="h-6 w-6" /></div>
      <h3 className="mt-3 text-lg font-bold text-[#1E7A46]">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{text}</p>
    </div>
  );
}
