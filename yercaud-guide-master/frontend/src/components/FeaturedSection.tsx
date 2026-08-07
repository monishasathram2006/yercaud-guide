import type { ReactNode } from "react";

/**
 * One of the home page's per-category Featured shelves (issue #20, #15) —
 * Featured Hotels, Featured Restaurants, Featured Activities, Featured
 * Tours & Travels, and (issue #21) Featured Blog. Generic over the item
 * shape and how each renders (`renderItem`): Listing sections pass
 * FeaturedListingItem through BusinessCardGrid, the Blog section passes
 * BlogPostSummary through BlogPostCard — two different card components for
 * two genuinely different content shapes, sharing this one shelf layout.
 *
 * Renders nothing (not even the heading) for an empty section, rather than
 * showing a title over a blank grid — a category that hasn't earned any
 * Featured placement yet shouldn't look broken.
 */
export function FeaturedSection<T extends { id: string }>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-6 pb-14">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id}>{renderItem(item)}</div>
        ))}
      </div>
    </section>
  );
}
