import type pg from "pg";
import { createChildCollectionService } from "./child-collection.js";

export const activityItineraryStepsService = createChildCollectionService({
  table: "activity_itinerary_steps",
  fields: [
    { api: "stepOrder", db: "step_order" },
    { api: "title", db: "title" },
    { api: "description", db: "description" },
    { api: "duration", db: "duration" },
  ],
  orderBy: "step_order",
  parentMissingMessage: "Create the Activity details first",
});

export const activityInclusionsService = createChildCollectionService({
  table: "activity_inclusions",
  fields: [
    { api: "item", db: "item" },
    { api: "isIncluded", db: "is_included" },
  ],
  orderBy: "created_at",
  parentMissingMessage: "Create the Activity details first",
});

export interface ActivityDetails {
  duration: string | null;
  maxHeight: string | null;
  totalDistance: string | null;
  difficultyLevel: string | null;
  /** FR58's per-person price. Also the source of the Listing's cached price_from. */
  pricePerPerson: number | null;
  itinerarySteps: Awaited<ReturnType<typeof activityItineraryStepsService.list>>;
  inclusions: Awaited<ReturnType<typeof activityInclusionsService.list>>;
}

export interface ActivityDetailsInput {
  duration?: string | null;
  maxHeight?: string | null;
  totalDistance?: string | null;
  difficultyLevel?: string | null;
  pricePerPerson?: number | null;
}

interface ActivityDetailsRow {
  duration: string | null;
  max_height: string | null;
  total_distance: string | null;
  difficulty_level: string | null;
  price_per_person: number | null;
}

const EMPTY_ROW: ActivityDetailsRow = {
  duration: null,
  max_height: null,
  total_distance: null,
  difficulty_level: null,
  price_per_person: null,
};

export async function getActivityDetails(db: pg.Pool, listingId: string): Promise<ActivityDetails> {
  const { rows } = await db.query<ActivityDetailsRow>(
    `SELECT duration, max_height, total_distance, difficulty_level, price_per_person
     FROM activity_details WHERE listing_id = $1`,
    [listingId],
  );
  const row = rows[0] ?? EMPTY_ROW;
  const [itinerarySteps, inclusions] = await Promise.all([
    activityItineraryStepsService.list(db, listingId),
    activityInclusionsService.list(db, listingId),
  ]);
  return {
    duration: row.duration,
    maxHeight: row.max_height,
    totalDistance: row.total_distance,
    difficultyLevel: row.difficulty_level,
    pricePerPerson: row.price_per_person,
    itinerarySteps,
    inclusions,
  };
}

export async function upsertActivityDetails(
  db: pg.Pool,
  listingId: string,
  input: ActivityDetailsInput,
): Promise<ActivityDetails> {
  await db.query(
    `INSERT INTO activity_details (listing_id, duration, max_height, total_distance, difficulty_level, price_per_person)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (listing_id) DO UPDATE SET
       duration = EXCLUDED.duration,
       max_height = EXCLUDED.max_height,
       total_distance = EXCLUDED.total_distance,
       difficulty_level = EXCLUDED.difficulty_level,
       price_per_person = EXCLUDED.price_per_person`,
    [
      listingId,
      input.duration ?? null,
      input.maxHeight ?? null,
      input.totalDistance ?? null,
      input.difficultyLevel ?? null,
      input.pricePerPerson ?? null,
    ],
  );
  return getActivityDetails(db, listingId);
}
