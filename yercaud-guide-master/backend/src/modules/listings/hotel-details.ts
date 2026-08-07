import type pg from "pg";
import { createChildCollectionService } from "./child-collection.js";
import { replaceJoinSet } from "../../join-set.js";

export const hotelRoomsService = createChildCollectionService({
  table: "hotel_rooms",
  fields: [
    { api: "name", db: "name" },
    { api: "description", db: "description" },
    { api: "ratePerNight", db: "rate_per_night" },
    { api: "quantityAvailable", db: "quantity_available" },
    { api: "sortOrder", db: "sort_order" },
  ],
  orderBy: "sort_order",
  parentMissingMessage: "Create the Hotel details first",
});

export const hotelAvailabilityBlocksService = createChildCollectionService({
  table: "hotel_availability_blocks",
  fields: [
    { api: "startDate", db: "start_date" },
    { api: "endDate", db: "end_date" },
    { api: "note", db: "note" },
  ],
  orderBy: "start_date",
  parentMissingMessage: "Create the Hotel details first",
});

export interface HotelDetails {
  propertyTypeId: string | null;
  starRating: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  guestsCapacityNote: string | null;
  cancellationPolicy: string | null;
  languageIds: string[];
  rooms: Awaited<ReturnType<typeof hotelRoomsService.list>>;
  availabilityBlocks: Awaited<ReturnType<typeof hotelAvailabilityBlocksService.list>>;
}

export interface HotelDetailsInput {
  propertyTypeId?: string | null;
  starRating?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  guestsCapacityNote?: string | null;
  cancellationPolicy?: string | null;
  languageIds?: string[];
}

interface HotelDetailsRow {
  property_type_id: string | null;
  star_rating: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  guests_capacity_note: string | null;
  cancellation_policy: string | null;
}

const EMPTY_ROW: HotelDetailsRow = {
  property_type_id: null,
  star_rating: null,
  check_in_time: null,
  check_out_time: null,
  guests_capacity_note: null,
  cancellation_policy: null,
};

async function loadLanguageIds(db: pg.Pool, listingId: string): Promise<string[]> {
  const { rows } = await db.query<{ language_id: string }>(
    `SELECT language_id FROM hotel_languages WHERE listing_id = $1`,
    [listingId],
  );
  return rows.map((r) => r.language_id);
}

export async function getHotelDetails(db: pg.Pool, listingId: string): Promise<HotelDetails> {
  const { rows } = await db.query<HotelDetailsRow>(
    `SELECT property_type_id, star_rating, check_in_time, check_out_time, guests_capacity_note, cancellation_policy
     FROM hotel_details WHERE listing_id = $1`,
    [listingId],
  );
  const row = rows[0] ?? EMPTY_ROW;
  const [languageIds, rooms, availabilityBlocks] = await Promise.all([
    loadLanguageIds(db, listingId),
    hotelRoomsService.list(db, listingId),
    hotelAvailabilityBlocksService.list(db, listingId),
  ]);
  return {
    propertyTypeId: row.property_type_id,
    starRating: row.star_rating,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    guestsCapacityNote: row.guests_capacity_note,
    cancellationPolicy: row.cancellation_policy,
    languageIds,
    rooms,
    availabilityBlocks,
  };
}

/** Create-if-absent, update-if-present (the contract's own "Create/update" wording) — always overwrites every scalar field, same full-replace-on-write convention as updateListing/updateBusiness. */
export async function upsertHotelDetails(db: pg.Pool, listingId: string, input: HotelDetailsInput): Promise<HotelDetails> {
  await db.query(
    `INSERT INTO hotel_details (listing_id, property_type_id, star_rating, check_in_time, check_out_time, guests_capacity_note, cancellation_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (listing_id) DO UPDATE SET
       property_type_id = EXCLUDED.property_type_id,
       star_rating = EXCLUDED.star_rating,
       check_in_time = EXCLUDED.check_in_time,
       check_out_time = EXCLUDED.check_out_time,
       guests_capacity_note = EXCLUDED.guests_capacity_note,
       cancellation_policy = EXCLUDED.cancellation_policy`,
    [
      listingId,
      input.propertyTypeId ?? null,
      input.starRating ?? null,
      input.checkInTime ?? null,
      input.checkOutTime ?? null,
      input.guestsCapacityNote ?? null,
      input.cancellationPolicy ?? null,
    ],
  );
  // languageIds is a tri-state presence check, not a value check: omitted
  // from the request body means "leave languages untouched", an explicit
  // [] means "clear them" — same distinction join-set callers elsewhere make.
  if (input.languageIds !== undefined) {
    await replaceJoinSet(db, "hotel_languages", "listing_id", listingId, "language_id", input.languageIds);
  }
  return getHotelDetails(db, listingId);
}
