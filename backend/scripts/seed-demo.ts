// Demo content for local development and the SSR check — NOT reference data.
//
// A script rather than a .sql file in the init chain, and rather than part of
// seed:reference, for one reason: a script can't be mounted into a production
// container's startup by accident. Demo hotels must never reach real visitors.
//
// Converts the Listings from frontend/src/lib/data.ts into a real Business with
// real Listings, so `npm run dev` renders a populated directory and the SSR
// check has something to assert against.
//
// Idempotent — safe to run repeatedly. Depends on `npm run seed:reference`
// having run first (it looks taxonomies up by slug).
//
// Usage: npm run seed:demo

import { pool } from "../src/db.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { generateUniqueUsername } from "../src/modules/auth/username.js";
import { slugify } from "../src/slug.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo content in production.");
  process.exit(1);
}

const DEMO_OWNER = { email: "owner@demo.yercaud.test", name: "Demo Owner", password: "demo-password-123" };

interface DemoListing {
  name: string;
  categorySlug: string;
  locationSlug: string;
  description: string;
  image: string;
  badge?: string;
  tags: string[];
  /** amenities.name values — the category-page filter sidebar's Amenities section. */
  amenities?: string[];
  /** For the four detail-less categories only — the rest derive their price. */
  priceFrom?: number;
  /** Hotel: cheapest room's nightly rate. Restaurant: cost for two. Activity/Tour: per person. */
  detail?:
    | {
        kind: "hotel";
        rooms: { name: string; rate: number; quantity: number }[];
        starRating: number;
        /** property_types.name — the filter sidebar's Property Type section is Hotel-only. */
        propertyType: string;
      }
    | { kind: "restaurant"; avgCostForTwo: number; cuisine: string }
    | { kind: "activity"; pricePerPerson: number; difficulty: string; duration: string }
    | { kind: "tour"; pricePerPerson: number; tourType: string; duration: string };
}

const LISTINGS: DemoListing[] = [
  {
    name: "Grand Palace Hotel",
    categorySlug: "hotel",
    locationSlug: "near-lake",
    description:
      "A luxurious retreat set beside Yercaud Lake, blending elegant interiors with panoramic views of the Shevaroy Hills. Perfect for couples, families and long weekends.",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    badge: "Popular",
    tags: ["Free Wi-Fi", "Parking", "Restaurant", "Room Service"],
    amenities: ["Free Wi-Fi", "Parking", "Restaurant", "Room Service"],
    detail: {
      kind: "hotel",
      starRating: 4,
      propertyType: "Hotel",
      rooms: [
        { name: "Deluxe Room", rate: 3500, quantity: 4 },
        { name: "Suite", rate: 6500, quantity: 2 },
      ],
    },
  },
  {
    name: "Sterling Yercaud",
    categorySlug: "hotel",
    locationSlug: "kottachedu",
    description: "Hillside resort with a pool, spa and sweeping valley views.",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    badge: "Luxury",
    tags: ["Free Wi-Fi", "Pool", "Restaurant", "Spa"],
    amenities: ["Free Wi-Fi", "Swimming Pool", "Restaurant", "Spa"],
    detail: {
      kind: "hotel",
      starRating: 5,
      propertyType: "Resort",
      rooms: [{ name: "Premium Room", rate: 6999, quantity: 3 }],
    },
  },
  {
    name: "Hill Top Homestay",
    categorySlug: "hotel",
    locationSlug: "shevaroy-hills",
    description: "A quiet family-run homestay a short walk from the ghat road viewpoints.",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    badge: "Budget",
    tags: ["Free Wi-Fi", "Parking"],
    amenities: ["Free Wi-Fi", "Parking"],
    detail: {
      kind: "hotel",
      starRating: 3,
      propertyType: "Homestay",
      rooms: [{ name: "Double Room", rate: 1200, quantity: 2 }],
    },
  },
  {
    name: "Spice Garden Restaurant",
    categorySlug: "restaurant",
    locationSlug: "anna-salai",
    description: "Multi-cuisine dining with a garden terrace, known for Chettinad specials.",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80",
    badge: "Best Seller",
    tags: ["Outdoor Seating", "Multi Cuisine", "Family Friendly"],
    amenities: ["Parking", "Air Conditioning"],
    detail: { kind: "restaurant", avgCostForTwo: 800, cuisine: "Multi Cuisine" },
  },
  {
    name: "Lake View Cafe",
    categorySlug: "restaurant",
    locationSlug: "near-lake",
    description: "Filter coffee, breakfast and lake views from every table.",
    image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80",
    tags: ["Outdoor Seating", "Pure Veg"],
    detail: { kind: "restaurant", avgCostForTwo: 450, cuisine: "South Indian" },
  },
  {
    name: "Shevaroy Trekking",
    categorySlug: "activity",
    locationSlug: "shevaroy-hills",
    description: "Guided treks across the Shevaroy range, from gentle walks to full-day climbs.",
    image: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80",
    tags: ["Safety Gear", "Guide", "All Ages"],
    detail: { kind: "activity", pricePerPerson: 1200, difficulty: "Moderate", duration: "4 hours" },
  },
  {
    name: "Boating at Yercaud Lake",
    categorySlug: "activity",
    locationSlug: "near-lake",
    description: "Pedal and row boats on the lake, with life jackets provided.",
    image: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&q=80",
    tags: ["Safety Gear", "All Ages"],
    detail: { kind: "activity", pricePerPerson: 300, difficulty: "Easy", duration: "1 hour" },
  },
  {
    name: "Yercaud Heritage Tour",
    categorySlug: "tour",
    locationSlug: "botanical-garden",
    description: "A full-day circuit of the hill's viewpoints, gardens and colonial landmarks.",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80",
    badge: "Popular",
    tags: ["Sightseeing", "Guide", "Custom Packages"],
    detail: { kind: "tour", pricePerPerson: 2499, tourType: "Sightseeing", duration: "Full day" },
  },
  // The four detail-less categories (ADR 0003) — these write price_from directly
  // and route through the public site's generic Listing page.
  {
    name: "Hill Cabs Yercaud",
    categorySlug: "travel",
    locationSlug: "anna-salai",
    description: "Airport transfers, ghat-road drops and local sightseeing cabs.",
    image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80",
    tags: ["AC Vehicles", "Verified Drivers", "24/7 Service"],
    priceFrom: 1800,
  },
  {
    name: "Yercaud Spice Store",
    categorySlug: "shopping",
    locationSlug: "anna-salai",
    description: "Local pepper, coffee and hill produce, packed to carry home.",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&q=80",
    tags: ["Family Friendly"],
    priceFrom: 200,
  },
  {
    name: "Green Leaf Ayurveda",
    categorySlug: "health-wellness",
    locationSlug: "kottachedu",
    description: "Traditional treatments and massage, by appointment.",
    image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80",
    tags: ["Family Friendly"],
    priceFrom: 1500,
  },
];

async function lookupId(table: string, slugOrName: string, column = "slug"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${column} = $1`, [slugOrName]);
  if (!rows[0]) {
    throw new Error(`${table}.${column} = "${slugOrName}" not found — run \`npm run seed:reference\` first.`);
  }
  return rows[0].id;
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_OWNER.password);
  const username = await generateUniqueUsername(pool, DEMO_OWNER.name);
  const { rows: userRows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, username, phone)
     VALUES ($1, $2, $3, $4, '+91 98765 43210')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [DEMO_OWNER.email, passwordHash, DEMO_OWNER.name, username],
  );
  const ownerId = userRows[0].id;

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = 'Business Owner'
     ON CONFLICT DO NOTHING`,
    [ownerId],
  );

  // Approved: the demo directory should have something in it, and an owner
  // approving their own Business isn't a flow the seed should imitate.
  const { rows: bizRows } = await pool.query<{ id: string }>(
    `INSERT INTO businesses (owner_id, name, description, contact_phone, contact_email, website, address, status)
     VALUES ($1, 'Yercaud Demo Group', 'Demo Business seeded for local development.',
             '+91 98765 43210', 'hello@demo.yercaud.test', 'demo.yercaud.test',
             'Anna Salai, Yercaud, Tamil Nadu 636601', 'approved')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ownerId],
  );
  const businessId =
    bizRows[0]?.id ??
    (await pool.query<{ id: string }>(`SELECT id FROM businesses WHERE owner_id = $1 LIMIT 1`, [ownerId])).rows[0].id;

  for (const item of LISTINGS) {
    const categoryId = await lookupId("categories", item.categorySlug);
    const locationId = await lookupId("locations", item.locationSlug);
    const slug = slugify(item.name);

    const { rows: listingRows } = await pool.query<{ id: string }>(
      `INSERT INTO listings (business_id, category_id, location_id, name, slug, description,
                             status, first_published_at, price_from, price_unit)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW(), $7, $8)
       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [
        businessId,
        categoryId,
        locationId,
        item.name,
        slug,
        item.description,
        // Only the detail-less categories carry a directly-written price; the
        // rest are filled in by recompute_listing_price when their detail rows
        // land below.
        item.priceFrom ?? null,
        item.priceFrom === undefined ? null : "from",
      ],
    );
    const listingId = listingRows[0].id;

    await pool.query(
      `INSERT INTO listing_images (listing_id, url, sort_order) VALUES ($1, $2, 0)
       ON CONFLICT DO NOTHING`,
      [listingId, item.image],
    );

    if (item.badge) {
      await pool.query(`UPDATE listings SET badge_id = (SELECT id FROM badges WHERE label = $1) WHERE id = $2`, [
        item.badge,
        listingId,
      ]);
    }

    for (const tag of item.tags) {
      await pool.query(
        `INSERT INTO listing_tags (listing_id, tag_id)
         SELECT $1, id FROM attribute_tags WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [listingId, tag],
      );
    }

    for (const amenity of item.amenities ?? []) {
      await pool.query(
        `INSERT INTO listing_amenities (listing_id, amenity_id)
         SELECT $1, id FROM amenities WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [listingId, amenity],
      );
    }

    const detail = item.detail;
    if (detail?.kind === "hotel") {
      const propertyTypeId = await lookupId("property_types", detail.propertyType, "name");
      await pool.query(
        `INSERT INTO hotel_details (listing_id, property_type_id, star_rating, check_in_time, check_out_time)
         VALUES ($1, $2, $3, '14:00', '11:00')
         ON CONFLICT (listing_id) DO UPDATE SET
           property_type_id = EXCLUDED.property_type_id,
           star_rating = EXCLUDED.star_rating`,
        [listingId, propertyTypeId, detail.starRating],
      );
      for (const [i, room] of detail.rooms.entries()) {
        // The rooms trigger recompute_listing_price, which is what gives the
        // Listing its price — nothing here sets price_from for a Hotel.
        await pool.query(
          `INSERT INTO hotel_rooms (listing_id, name, rate_per_night, quantity_available, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [listingId, room.name, room.rate, room.quantity, i],
        );
      }
    } else if (detail?.kind === "restaurant") {
      await pool.query(
        `INSERT INTO restaurant_details (listing_id, avg_cost_for_two, cuisine_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (listing_id) DO UPDATE SET avg_cost_for_two = EXCLUDED.avg_cost_for_two`,
        [listingId, detail.avgCostForTwo, detail.cuisine],
      );
    } else if (detail?.kind === "activity") {
      await pool.query(
        `INSERT INTO activity_details (listing_id, price_per_person, difficulty_level, duration)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (listing_id) DO UPDATE SET price_per_person = EXCLUDED.price_per_person`,
        [listingId, detail.pricePerPerson, detail.difficulty, detail.duration],
      );
    } else if (detail?.kind === "tour") {
      await pool.query(
        `INSERT INTO tour_details (listing_id, price_per_person, tour_type, duration)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (listing_id) DO UPDATE SET price_per_person = EXCLUDED.price_per_person`,
        [listingId, detail.pricePerPerson, detail.tourType, detail.duration],
      );
    }
  }

  // FR14's featured strip on the home page reads /featured-listings, so the demo
  // needs some — otherwise the front door renders an empty section and the SSR
  // check has nothing to assert.
  const FEATURED = ["grand-palace-hotel", "spice-garden-restaurant", "shevaroy-trekking", "yercaud-heritage-tour", "hill-cabs-yercaud"];
  for (const [i, slug] of FEATURED.entries()) {
    await pool.query(
      `INSERT INTO featured_listings (listing_id, start_date, end_date, sort_order)
       SELECT id, CURRENT_DATE - 1, NULL, $2 FROM listings WHERE slug = $1
       ON CONFLICT DO NOTHING`,
      [slug, i],
    );
  }

  const { rows: counts } = await pool.query<{ listings: string }>(`SELECT COUNT(*) AS listings FROM listings`);
  console.log(`Demo content ready: ${counts[0].listings} Listings under "Yercaud Demo Group".`);
  console.log(`Demo owner: ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
