#!/usr/bin/env node
//
// Does the server-rendered HTML actually contain the Listings?
//
// This is the one regression manual testing is structurally blind to. Everything
// else on the public site fails visibly — a broken enquiry form, a missing price.
// But if someone moves a listing fetch out of a route loader into a useEffect,
// the page still looks perfect in a browser. Nothing breaks. You find out weeks
// later, from search rankings, and by then the cause is long buried.
//
// The whole reason this app server-renders is that a directory lives or dies on
// being found. This is the only thing guarding that bet.
//
// Written in node rather than curl|grep on purpose: the rendered HTML is a
// single ~70KB line, and grep silently matched nothing against it — a check that
// can quietly report the wrong answer is worse than no check at all.
//
// Usage:
//   npm run check:ssr
//   BASE_URL=https://yercaud.example npm run check:ssr
//
// Expects the app running and the backend seeded (backend: npm run seed:demo).

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

/** Each case asserts a string that must appear in the raw first response. */
const CASES = [
  {
    path: "/hotels",
    needles: ["Grand Palace Hotel", "Sterling Yercaud", "3,500"],
    why: "a category page is a search result — its Listings and prices must be in the HTML",
  },
  {
    path: "/restaurants",
    needles: ["Spice Garden Restaurant"],
    why: "every category index server-renders its Listings",
  },
  {
    path: "/directory/travel/hill-cabs-yercaud",
    needles: ["Hill Cabs Yercaud"],
    why: "the generic Listing page (ADR 0003's detail-less categories) renders server-side",
  },
  {
    path: "/hotels",
    needles: ["Near Lake"],
    why: "the Location name is server-rendered, not resolved from a UUID after hydration",
  },
  {
    path: "/hotels/grand-palace-hotel",
    needles: ["Grand Palace Hotel", "Deluxe Room", "3,500", "Check-in from 14:00", "hello@demo.yercaud.test"],
    why: "an individual Listing is the page that most needs to be found; its rooms, policies and the owning Business's contact details must be in the HTML",
  },
  {
    path: "/restaurants/spice-garden-restaurant",
    needles: ["Spice Garden Restaurant", "800"],
    why: "a Restaurant's derived cost-for-two renders server-side",
  },
  {
    path: "/activities/shevaroy-trekking",
    needles: ["Shevaroy Trekking", "1,200"],
    why: "FR58's per-person price — a field that did not exist before Phase 10",
  },
  {
    path: "/tours/yercaud-heritage-tour",
    needles: ["Yercaud Heritage Tour", "2,499"],
    why: "FR58's per-person price on a Tour",
  },
];

let failures = 0;

console.log(`SSR check against ${BASE_URL}\n`);

for (const { path, needles, why } of CASES) {
  let html;
  try {
    const response = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) {
      console.log(`  FAIL  ${path} — HTTP ${response.status}`);
      failures += 1;
      continue;
    }
    html = await response.text();
  } catch (error) {
    console.log(`  FAIL  ${path} — no response (is the app running?): ${error.message}`);
    failures += 1;
    continue;
  }

  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length === 0) {
    console.log(`  ok    ${path} — ${needles.map((n) => JSON.stringify(n)).join(", ")}`);
  } else {
    console.log(`  FAIL  ${path} — not in the server-rendered HTML: ${missing.map((n) => JSON.stringify(n)).join(", ")}`);
    console.log(`        ${why}`);
    failures += 1;
  }
}

console.log();
if (failures > 0) {
  console.log(`${failures} check(s) failed: the page may render in a browser while shipping empty HTML.`);
  console.log("Look for a route loader that became a useEffect or a client-only useQuery.");
  process.exit(1);
}
console.log("All checks passed — the server-rendered HTML contains real content.");
