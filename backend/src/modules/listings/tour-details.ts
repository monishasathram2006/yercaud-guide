import type pg from "pg";
import { createChildCollectionService } from "./child-collection.js";
import { replaceJoinSet } from "../../join-set.js";

export const tourItineraryStepsService = createChildCollectionService({
  table: "tour_itinerary_steps",
  fields: [
    { api: "stepOrder", db: "step_order" },
    // API key is `title`, not `stopName` — shares the ItineraryStep response
    // shape with Activity's itinerary steps (see Phase 4 spec), even though
    // the underlying column is named stop_name.
    { api: "title", db: "stop_name" },
    { api: "description", db: "description" },
    { api: "duration", db: "duration" },
    { api: "stepType", db: "step_type" },
  ],
  orderBy: "step_order",
  parentMissingMessage: "Create the Tour & Travel details first",
});

export const tourInclusionsService = createChildCollectionService({
  table: "tour_inclusions",
  fields: [
    { api: "item", db: "item" },
    { api: "isIncluded", db: "is_included" },
  ],
  orderBy: "created_at",
  parentMissingMessage: "Create the Tour & Travel details first",
});

export const tourAttractionsService = createChildCollectionService({
  table: "tour_attractions",
  fields: [{ api: "name", db: "name" }],
  orderBy: "created_at",
  parentMissingMessage: "Create the Tour & Travel details first",
});

export interface TourDetails {
  tourType: string | null;
  bestFor: string | null;
  duration: string | null;
  /** FR58's per-person price. Also the source of the Listing's cached price_from. */
  pricePerPerson: number | null;
  languageIds: string[];
  itinerarySteps: Awaited<ReturnType<typeof tourItineraryStepsService.list>>;
  inclusions: Awaited<ReturnType<typeof tourInclusionsService.list>>;
  attractions: Awaited<ReturnType<typeof tourAttractionsService.list>>;
}

export interface TourDetailsInput {
  tourType?: string | null;
  bestFor?: string | null;
  duration?: string | null;
  pricePerPerson?: number | null;
  languageIds?: string[];
}

interface TourDetailsRow {
  tour_type: string | null;
  best_for: string | null;
  duration: string | null;
  price_per_person: number | null;
}

const EMPTY_ROW: TourDetailsRow = { tour_type: null, best_for: null, duration: null, price_per_person: null };

async function loadLanguageIds(db: pg.Pool, listingId: string): Promise<string[]> {
  const { rows } = await db.query<{ language_id: string }>(`SELECT language_id FROM tour_languages WHERE listing_id = $1`, [
    listingId,
  ]);
  return rows.map((r) => r.language_id);
}

export async function getTourDetails(db: pg.Pool, listingId: string): Promise<TourDetails> {
  const { rows } = await db.query<TourDetailsRow>(
    `SELECT tour_type, best_for, duration, price_per_person FROM tour_details WHERE listing_id = $1`,
    [listingId],
  );
  const row = rows[0] ?? EMPTY_ROW;
  const [languageIds, itinerarySteps, inclusions, attractions] = await Promise.all([
    loadLanguageIds(db, listingId),
    tourItineraryStepsService.list(db, listingId),
    tourInclusionsService.list(db, listingId),
    tourAttractionsService.list(db, listingId),
  ]);
  return {
    tourType: row.tour_type,
    bestFor: row.best_for,
    duration: row.duration,
    pricePerPerson: row.price_per_person,
    languageIds,
    itinerarySteps,
    inclusions,
    attractions,
  };
}

export async function upsertTourDetails(db: pg.Pool, listingId: string, input: TourDetailsInput): Promise<TourDetails> {
  await db.query(
    `INSERT INTO tour_details (listing_id, tour_type, best_for, duration, price_per_person)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id) DO UPDATE SET
       tour_type = EXCLUDED.tour_type,
       best_for = EXCLUDED.best_for,
       duration = EXCLUDED.duration,
       price_per_person = EXCLUDED.price_per_person`,
    [listingId, input.tourType ?? null, input.bestFor ?? null, input.duration ?? null, input.pricePerPerson ?? null],
  );
  if (input.languageIds !== undefined) {
    await replaceJoinSet(db, "tour_languages", "listing_id", listingId, "language_id", input.languageIds);
  }
  return getTourDetails(db, listingId);
}
