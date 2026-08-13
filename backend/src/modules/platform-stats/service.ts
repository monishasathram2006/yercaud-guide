import type pg from "pg";

export interface PlatformStats {
  businesses: number;
  activities: number;
  enquiries: number;
  averageRating: number;
}

/**
 * The home page's bottom "Plan Your Perfect Yercaud Escape" stat tiles —
 * real counts, not the hardcoded mock numbers they replaced. "Enquiries
 * Sent" stands in for "Happy Travelers": there's no bookings/traveler
 * concept on this platform (ADR-0001), and an Enquiry is the closest real
 * signal of someone finding a Business they liked here.
 */
export async function getPlatformStats(db: pg.Pool): Promise<PlatformStats> {
  const [{ rows: businessRows }, { rows: activityRows }, { rows: enquiryRows }, { rows: ratingRows }] = await Promise.all([
    db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM businesses WHERE status = 'approved'`),
    db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM listings l
       JOIN categories c ON c.id = l.category_id
       WHERE l.status = 'approved' AND c.slug = 'activity'`,
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM enquiries`),
    db.query<{ avg: string | null }>(`SELECT AVG(rating) AS avg FROM reviews WHERE status = 'approved'`),
  ]);
  return {
    businesses: Number(businessRows[0].count),
    activities: Number(activityRows[0].count),
    enquiries: Number(enquiryRows[0].count),
    averageRating: ratingRows[0].avg === null ? 0 : Number(ratingRows[0].avg),
  };
}
