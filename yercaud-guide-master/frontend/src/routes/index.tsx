import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeaturedSection } from "@/components/FeaturedSection";
import { BusinessCardGrid } from "@/components/BusinessCard";
import { BlogPostCard } from "@/components/BlogPostCard";
import { SearchBox } from "@/components/SearchBox";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { HERO_IMG, HILLS_IMG } from "@/lib/data";
import { api } from "@/lib/api";
import {
  MapPin,
  Hotel,
  UtensilsCrossed,
  Activity,
  Briefcase,
  ShieldCheck,
  BadgePercent,
  Lock,
  Headphones,
  Leaf,
  ArrowRight,
  Building2,
  Star,
  MessageSquare,
  Compass,
} from "lucide-react";

export const Route = createFileRoute("/")({
  /**
   * The home page's Featured shelves, server-rendered — the home page is the
   * site's front door and its Listings must be in the HTML.
   *
   * GET /featured-sections (issue #19, extended to Blog by #21) returns full
   * summary data for all five shelves in one request, precomputed by the
   * daily ranking job — no per-card follow-up fetch, unlike the flat strip
   * this replaced (issue #20).
   */
  loader: async () => {
    const [sections, categories, stats] = await Promise.all([
      api.featured.sections(),
      api.taxonomies.categories(),
      api.platformStats(),
    ]);

    const colorBySlug: Record<string, string | undefined> = {};
    for (const c of categories) colorBySlug[c.slug ?? ""] = c.color ?? undefined;

    return { sections, colorBySlug, stats };
  },
  head: () => ({
    meta: [
      { title: "Yercaud Business Directory — Discover the Best of Yercaud" },
      {
        name: "description",
        content:
          "Explore trusted local hotels, restaurants, activities, travel and tours in Yercaud, India.",
      },
      { property: "og:title", content: "Yercaud Business Directory" },
      {
        property: "og:description",
        content: "Search, book and explore the best of Yercaud in one place.",
      },
    ],
  }),
  component: Home,
});

const categoryCards = [
  { name: "Hotels", desc: "Find the best places to stay", to: "/hotels", color: "#1E7A46", bg: "bg-[#1E7A46]/10", icon: Hotel },
  { name: "Restaurants", desc: "Discover great food and dining", to: "/restaurants", color: "#F97316", bg: "bg-[#F97316]/10", icon: UtensilsCrossed },
  { name: "Activities", desc: "Explore adventure and fun", to: "/activities", color: "#3B82F6", bg: "bg-[#3B82F6]/10", icon: Activity },
  { name: "Tours & Travels", desc: "Book cabs, tours and holiday packages", to: "/tours", color: "#14B8A6", bg: "bg-[#14B8A6]/10", icon: Briefcase },
] as const;

function Home() {
  const { sections, colorBySlug, stats } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {/* The photo is busy; without this scrim the copy disappears into it. */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-40 text-center">
          <h1 className="text-4xl font-bold leading-tight text-white drop-shadow-md sm:text-5xl">
            Discover the Best of
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className="text-6xl text-emerald-300 drop-shadow-md sm:text-7xl"
              style={{ fontFamily: '"Great Vibes", "Dancing Script", cursive' }}
            >
              Yercaud
            </span>
            <Leaf className="h-8 w-8 text-emerald-300 drop-shadow-md" />
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/90 drop-shadow sm:text-base">
            Your complete business directory to search, discover and explore hotels,
            restaurants, activities, travels and more.
          </p>
        </div>

        {/* Search box — the live hybrid directory search (issue #11). */}
        <div className="relative z-10 mx-auto -mt-20 max-w-3xl px-6">
          <SearchBox animatedWords={["Hotels", "Restaurants", "Activities", "Tours & Travels", "Travel Services"]} />
        </div>

        <div className="relative mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-6 px-6 pb-8 text-sm text-white/90 drop-shadow">
          {[
            { icon: BadgePercent, label: "Best Prices" },
            { icon: ShieldCheck, label: "Verified Listings" },
            { icon: Lock, label: "Secure & Private" },
            { icon: Headphones, label: "Local Support" },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <t.icon className="h-4 w-4 text-emerald-300" />
              {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* Category cards */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {categoryCards.map((c) => (
            <div key={c.name} className={`rounded-2xl p-5 shadow-sm ${c.bg}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold" style={{ color: c.color }}>{c.name}</h3>
                  <p className="mt-1 text-xs text-gray-700">{c.desc}</p>
                  <Link
                    to={c.to}
                    className="mt-4 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    Explore <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <c.icon className="h-10 w-10" style={{ color: c.color }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Sections — per-category, computed by the daily ranking job (issue #19/#20/#21) */}
      <FeaturedSection
        title="Featured Hotels"
        items={sections.hotels}
        renderItem={(item) => <BusinessCardGrid listing={item} categoryColor={colorBySlug[item.categorySlug]} />}
      />
      <FeaturedSection
        title="Featured Restaurants"
        items={sections.restaurants}
        renderItem={(item) => <BusinessCardGrid listing={item} categoryColor={colorBySlug[item.categorySlug]} />}
      />
      <FeaturedSection
        title="Featured Activities"
        items={sections.activities}
        renderItem={(item) => <BusinessCardGrid listing={item} categoryColor={colorBySlug[item.categorySlug]} />}
      />
      <FeaturedSection
        title="Featured Tours & Travels"
        items={sections.toursAndTravels}
        renderItem={(item) => <BusinessCardGrid listing={item} categoryColor={colorBySlug[item.categorySlug]} />}
      />
      <FeaturedSection title="Featured Blog" items={sections.blog} renderItem={(post) => <BlogPostCard post={post} />} />

      {/* Why choose */}
      <section className="bg-[#F7F9F8] py-14">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Why Choose Yercaud Business Directory? <Leaf className="ml-1 inline h-5 w-5 text-[#1E7A46]" />
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: ShieldCheck, title: "Verified Listings", desc: "All businesses are verified for your safety" },
              { icon: BadgePercent, title: "Best Prices", desc: "Get the best deals and offers" },
              { icon: Lock, title: "Verified Listings", desc: "Verified, up-to-date local listings" },
              { icon: Headphones, title: "Local Support", desc: "We're here to help you 24/7" },
              { icon: MapPin, title: "Explore Yercaud", desc: "Discover hidden gems and top attractions" },
            ].map((t) => (
              <div key={t.title} className="rounded-xl bg-white p-6 text-center shadow-sm">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1E7A46]/10">
                  <t.icon className="h-6 w-6 text-[#1E7A46]" />
                </div>
                <h4 className="mt-4 font-semibold text-gray-900">{t.title}</h4>
                <p className="mt-1 text-xs text-gray-600">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="relative overflow-hidden rounded-2xl">
          <img src={HILLS_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/85 via-[#0f172a]/70 to-[#0f172a]/40" />
          <div className="relative grid gap-8 p-8 md:grid-cols-2 md:items-center md:p-12">
            <div className="text-white">
              <h2 className="text-3xl font-bold">
                Plan Your Perfect <br />
                Yercaud Escape <Leaf className="ml-1 inline h-6 w-6" />
              </h2>
              <p className="mt-3 max-w-md text-sm text-white/80">
                Book hotels, travels and tours with ease and enjoy an unforgettable experience.
              </p>
              <Link
                to="/directory"
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#1E7A46] px-6 py-3 text-sm font-medium hover:bg-[#186238]"
              >
                Start Exploring <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {/* Real counts (GET /platform-stats), counting up on mount — issue: home page stat tiles */}
            <div className="grid grid-cols-2 gap-4 p-1">
              {[
                { icon: Building2, value: stats.businesses, label: "Businesses" },
                { icon: Compass, value: stats.activities, label: "Activities" },
                { icon: MessageSquare, value: stats.enquiries, label: "Enquiries Sent" },
                { icon: Star, value: stats.averageRating, decimals: 1, suffix: "★", label: "Average Rating" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white p-4 text-center shadow-sm">
                  <s.icon className="mx-auto h-6 w-6 text-[#1E7A46]" />
                  <div className="mt-2 text-2xl font-bold text-gray-900">
                    <AnimatedNumber value={s.value} decimals={s.decimals} suffix={s.suffix} />
                  </div>
                  <div className="text-xs text-gray-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
