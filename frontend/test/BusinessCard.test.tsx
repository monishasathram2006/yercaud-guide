import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BusinessCardGrid } from "@/components/BusinessCard";
import type { ListingSummary } from "@/lib/api";

/** @tanstack/react-router and the auth/favorites hooks mocked the same way as Header.test.tsx. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isSignedIn: false }) }));
vi.mock("@/lib/favorites", () => ({
  useIsFavorite: () => false,
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));

function listing(overrides: Partial<ListingSummary & { sponsored?: boolean }> = {}): ListingSummary & { sponsored?: boolean } {
  return {
    id: "listing-1",
    businessId: "biz-1",
    categoryId: "cat-1",
    locationId: null,
    name: "Lakeside Suite",
    slug: "lakeside-suite",
    status: "approved",
    primaryImageUrl: null,
    averageRating: 4.5,
    priceFrom: null,
    priceUnit: null,
    badge: null,
    categoryName: "Hotel",
    categorySlug: "hotel",
    locationName: null,
    reviewCount: 10,
    tags: [],
    phone: null,
    website: null,
    ...overrides,
  };
}

describe("BusinessCardGrid — Sponsored badge (issue #23)", () => {
  it("shows a Sponsored badge when the item is flagged sponsored", () => {
    render(<BusinessCardGrid listing={listing({ sponsored: true })} />);
    expect(screen.getByText("Sponsored")).toBeInTheDocument();
  });

  it("does not show a Sponsored badge on an organic (non-flagged) item", () => {
    render(<BusinessCardGrid listing={listing({ sponsored: false })} />);
    expect(screen.queryByText("Sponsored")).not.toBeInTheDocument();
  });

  it("does not show a Sponsored badge when the field is simply absent (every non-Featured caller)", () => {
    const { sponsored: _sponsored, ...withoutSponsoredField } = listing();
    render(<BusinessCardGrid listing={withoutSponsoredField} />);
    expect(screen.queryByText("Sponsored")).not.toBeInTheDocument();
  });

  it("shows both the Sponsored badge and a manually-assigned Badge together without one replacing the other", () => {
    render(
      <BusinessCardGrid
        listing={listing({ sponsored: true, badge: { id: "b1", label: "Popular", color: "#1E7A46" } })}
      />,
    );
    expect(screen.getByText("Sponsored")).toBeInTheDocument();
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });
});
