import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { CategoryPage } from "@/components/CategoryPage";
import type { CategoryFilters } from "@/lib/category-filters";
import type { ListingSummary } from "@/lib/api";
import { renderWithClient, LinkStub, baseCategory, baseListingSummary } from "../test-utils";

/**
 * CategoryPage's filter sidebar (Price, Amenities, Star Rating, Property
 * Type, Guest Rating) — the subject of a recent "non-functional filters" bug
 * fix. Header/Footer/SearchBox/BusinessCardGrid are stubbed: each already
 * has its own test file, and CategoryPage only needs them present, not
 * re-verified here.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));
vi.mock("@/components/Header", () => ({ Header: () => <div data-testid="header-stub" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer-stub" /> }));
vi.mock("@/components/SearchBox", () => ({
  SearchBox: () => <div data-testid="searchbox-stub" />,
}));
vi.mock("@/components/BusinessCard", () => ({
  BusinessCardGrid: ({ listing }: { listing: ListingSummary }) => <div>{listing.name}</div>,
}));

const amenities = vi.fn();
const propertyTypes = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      taxonomies: {
        amenities: (...args: unknown[]) => amenities(...args),
        propertyTypes: (...args: unknown[]) => propertyTypes(...args),
      },
    },
  };
});

beforeEach(() => {
  amenities.mockReset().mockResolvedValue([
    { id: "a1", name: "Wifi" },
    { id: "a2", name: "Parking" },
  ]);
  propertyTypes.mockReset().mockResolvedValue([{ id: "pt1", name: "Homestay" }]);
});

const baseProps = {
  listings: [] as ListingSummary[],
  category: baseCategory,
  priceBands: [],
  title: "Hotels in Yercaud",
  subtitle: "Find the best places to stay",
  ctaTitle: "Book with Confidence",
  ctaText: "Get in touch directly with owners",
  filters: {} as CategoryFilters,
  onFilterChange: vi.fn(),
  onClearFilters: vi.fn(),
};

describe("CategoryPage — hotel-only filter sections (ADR 0003)", () => {
  it("shows Property Type and Star Rating for the hotel category", async () => {
    renderWithClient(<CategoryPage {...baseProps} category={baseCategory} />);

    expect(await screen.findByText("Property Type")).toBeInTheDocument();
    expect(screen.getByText("Star Rating")).toBeInTheDocument();
  });

  it("hides Property Type and Star Rating for a non-hotel category", async () => {
    renderWithClient(
      <CategoryPage
        {...baseProps}
        category={{ ...baseCategory, slug: "restaurant", name: "Restaurant" }}
      />,
    );

    await screen.findByText("Amenities");
    expect(screen.queryByText("Property Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Star Rating")).not.toBeInTheDocument();
  });
});

describe("CategoryPage — Clear Filters", () => {
  it("is disabled when no filters are active", () => {
    renderWithClient(<CategoryPage {...baseProps} filters={{}} />);
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("is enabled and calls onClearFilters when filters are active", () => {
    const onClearFilters = vi.fn();
    renderWithClient(
      <CategoryPage {...baseProps} filters={{ minRating: 4.5 }} onClearFilters={onClearFilters} />,
    );

    const clearButton = screen.getByRole("button", { name: "Clear" });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);
    expect(onClearFilters).toHaveBeenCalled();
  });
});

describe("CategoryPage — filter controls call onFilterChange with the right patch", () => {
  it("toggling an amenity adds it, comma-joined, to the amenities filter", async () => {
    const onFilterChange = vi.fn();
    renderWithClient(<CategoryPage {...baseProps} onFilterChange={onFilterChange} />);

    fireEvent.click(await screen.findByText("Wifi"));
    expect(onFilterChange).toHaveBeenCalledWith({ amenities: "Wifi" });
  });

  it("toggling an already-selected amenity off clears the amenities filter", async () => {
    const onFilterChange = vi.fn();
    renderWithClient(
      <CategoryPage
        {...baseProps}
        filters={{ amenities: "Wifi" }}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(await screen.findByText("Wifi"));
    expect(onFilterChange).toHaveBeenCalledWith({ amenities: undefined });
  });

  it("selecting a Guest Rating step sets minRating", () => {
    const onFilterChange = vi.fn();
    renderWithClient(<CategoryPage {...baseProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText("4.5 & above"));
    expect(onFilterChange).toHaveBeenCalledWith({ minRating: 4.5 });
  });

  it("selecting the same Guest Rating step again clears minRating", () => {
    const onFilterChange = vi.fn();
    renderWithClient(
      <CategoryPage {...baseProps} filters={{ minRating: 4.5 }} onFilterChange={onFilterChange} />,
    );

    fireEvent.click(screen.getByText("4.5 & above"));
    expect(onFilterChange).toHaveBeenCalledWith({ minRating: undefined });
  });

  it("selecting a Property Type sets propertyType (hotel category only)", async () => {
    const onFilterChange = vi.fn();
    renderWithClient(<CategoryPage {...baseProps} onFilterChange={onFilterChange} />);

    fireEvent.click(await screen.findByText("Homestay"));
    expect(onFilterChange).toHaveBeenCalledWith({ propertyType: "Homestay" });
  });

  it("selecting a Star Rating sets minStarRating (hotel category only)", async () => {
    const onFilterChange = vi.fn();
    renderWithClient(<CategoryPage {...baseProps} onFilterChange={onFilterChange} />);

    const heading = await screen.findByText("Star Rating");
    const section = heading.closest("div")!;
    // STAR_RATING_STEPS is [5, 4, 3, 2, 1] — the first checkbox is 5-star.
    fireEvent.click(within(section).getAllByRole("checkbox")[0]);
    expect(onFilterChange).toHaveBeenCalledWith({ minStarRating: 5 });
  });
});

describe("CategoryPage — empty state", () => {
  it("shows the no-listings-yet message when there are no listings and no active filters", () => {
    renderWithClient(<CategoryPage {...baseProps} listings={[]} filters={{}} />);
    expect(
      screen.getByText("No listings yet in this category. Check back soon!"),
    ).toBeInTheDocument();
  });

  it("shows a different message when filters are active but match nothing", () => {
    renderWithClient(<CategoryPage {...baseProps} listings={[]} filters={{ minRating: 4.5 }} />);
    expect(
      screen.getByText("No listings match these filters. Try clearing some."),
    ).toBeInTheDocument();
  });

  it("renders a card per listing when there are results", () => {
    renderWithClient(
      <CategoryPage
        {...baseProps}
        listings={[
          baseListingSummary,
          { ...baseListingSummary, id: "listing-2", name: "Lakeview Cottage" },
        ]}
      />,
    );

    expect(screen.getByText(baseListingSummary.name)).toBeInTheDocument();
    expect(screen.getByText("Lakeview Cottage")).toBeInTheDocument();
  });
});
