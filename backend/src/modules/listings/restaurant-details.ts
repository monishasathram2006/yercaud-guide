import type pg from "pg";
import { mapForeignKeyViolation } from "../../db-errors.js";
import { createChildCollectionService } from "./child-collection.js";

export const restaurantMenuItemsService = createChildCollectionService({
  table: "restaurant_menu_items",
  fields: [
    { api: "name", db: "name" },
    { api: "price", db: "price" },
    { api: "imageUrl", db: "image_url" },
    { api: "sortOrder", db: "sort_order" },
  ],
  orderBy: "sort_order",
  parentMissingMessage: "Create the Restaurant details first",
});

export interface OpeningHour {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface RestaurantDetails {
  cuisineType: string | null;
  avgCostForTwo: number | null;
  bestFor: string | null;
  openingHours: OpeningHour[];
  menuItems: Awaited<ReturnType<typeof restaurantMenuItemsService.list>>;
}

export interface RestaurantDetailsInput {
  cuisineType?: string | null;
  avgCostForTwo?: number | null;
  bestFor?: string | null;
}

interface RestaurantDetailsRow {
  cuisine_type: string | null;
  avg_cost_for_two: number | null;
  best_for: string | null;
}

const EMPTY_ROW: RestaurantDetailsRow = { cuisine_type: null, avg_cost_for_two: null, best_for: null };

async function loadOpeningHours(db: pg.Pool, listingId: string): Promise<OpeningHour[]> {
  const { rows } = await db.query<{
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
  }>(
    `SELECT day_of_week, open_time, close_time, is_closed FROM restaurant_opening_hours
     WHERE listing_id = $1 ORDER BY day_of_week`,
    [listingId],
  );
  return rows.map((r) => ({
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    isClosed: r.is_closed,
  }));
}

export async function getRestaurantDetails(db: pg.Pool, listingId: string): Promise<RestaurantDetails> {
  const { rows } = await db.query<RestaurantDetailsRow>(
    `SELECT cuisine_type, avg_cost_for_two, best_for FROM restaurant_details WHERE listing_id = $1`,
    [listingId],
  );
  const row = rows[0] ?? EMPTY_ROW;
  const [openingHours, menuItems] = await Promise.all([
    loadOpeningHours(db, listingId),
    restaurantMenuItemsService.list(db, listingId),
  ]);
  return { cuisineType: row.cuisine_type, avgCostForTwo: row.avg_cost_for_two, bestFor: row.best_for, openingHours, menuItems };
}

export async function upsertRestaurantDetails(
  db: pg.Pool,
  listingId: string,
  input: RestaurantDetailsInput,
): Promise<RestaurantDetails> {
  await db.query(
    `INSERT INTO restaurant_details (listing_id, cuisine_type, avg_cost_for_two, best_for)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (listing_id) DO UPDATE SET
       cuisine_type = EXCLUDED.cuisine_type,
       avg_cost_for_two = EXCLUDED.avg_cost_for_two,
       best_for = EXCLUDED.best_for`,
    [listingId, input.cuisineType ?? null, input.avgCostForTwo ?? null, input.bestFor ?? null],
  );
  return getRestaurantDetails(db, listingId);
}

export interface OpeningHourInput {
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  isClosed?: boolean;
}

/** Full replace of all 7 days in one call — restaurant_opening_hours is UNIQUE (listing_id, day_of_week), so this is not per-day CRUD (see Phase 4 spec). */
export async function setOpeningHours(db: pg.Pool, listingId: string, hours: OpeningHourInput[]): Promise<OpeningHour[]> {
  return mapForeignKeyViolation(async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM restaurant_opening_hours WHERE listing_id = $1`, [listingId]);
      for (const hour of hours) {
        await client.query(
          `INSERT INTO restaurant_opening_hours (listing_id, day_of_week, open_time, close_time, is_closed)
           VALUES ($1, $2, $3, $4, $5)`,
          [listingId, hour.dayOfWeek, hour.openTime ?? null, hour.closeTime ?? null, hour.isClosed ?? false],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return loadOpeningHours(db, listingId);
  }, "Create the Restaurant details first");
}
