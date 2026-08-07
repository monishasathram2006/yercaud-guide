import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { RestaurantDetails } from "@/components/RestaurantDetails";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  LinkStub,
  makeListingDetail,
  makeRestaurantDetails,
} from "../test-utils";

/**
 * The Restaurant category's detail page — menu, cuisine/best-for tags, the
 * gated address fallback, and the favorite toggle. Header, Footer,
 * EnquiryForm, and DetailBlocks' heavier pieces are stubbed the same way as
 * test/components/HotelDetails.test.tsx; `Card` and `OpeningHoursCard` (also
 * from DetailBlocks) are left real — neither has dependencies of its own.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));
vi.mock("@/components/Header", () => ({ Header: () => <div data-testid="header-stub" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer-stub" /> }));
vi.mock("@/components/EnquiryForm", () => ({
  EnquiryForm: () => <div data-testid="enquiry-form-stub" />,
}));
vi.mock("@/components/DetailBlocks", async () => {
  const actual = await vi.importActual<typeof import("@/components/DetailBlocks")>(
    "@/components/DetailBlocks",
  );
  return {
    ...actual,
    ContactCard: () => <div data-testid="contact-card-stub" />,
    LocationBlock: () => <div data-testid="location-block-stub" />,
    ReviewsBlock: () => <div data-testid="reviews-block-stub" />,
    SimilarListingsSection: () => <div data-testid="similar-listings-stub" />,
  };
});

const toggleFavoriteMutate = vi.fn();
let isFavoriteState = false;
vi.mock("@/lib/favorites", () => ({
  useIsFavorite: () => isFavoriteState,
  useToggleFavorite: () => ({ mutate: toggleFavoriteMutate, isPending: false }),
}));

beforeEach(() => {
  resetAuthState();
  toggleFavoriteMutate.mockReset();
  isFavoriteState = false;
  Element.prototype.scrollIntoView = vi.fn();
});

describe("RestaurantDetails — menu", () => {
  it("renders each menu item's name and price", () => {
    renderWithClient(
      <RestaurantDetails detail={makeListingDetail()} restaurant={makeRestaurantDetails()} />,
    );

    expect(screen.getByText("Chettinad Chicken")).toBeInTheDocument();
    expect(screen.getByText("From ₹320")).toBeInTheDocument();
    expect(screen.getByText("Filter Coffee")).toBeInTheDocument();
    expect(screen.getByText("From ₹60")).toBeInTheDocument();
  });

  it("renders no Popular Dishes card when there are no menu items", () => {
    renderWithClient(
      <RestaurantDetails
        detail={makeListingDetail()}
        restaurant={makeRestaurantDetails({ menuItems: [] })}
      />,
    );
    expect(screen.queryByText("Popular Dishes 🍃")).not.toBeInTheDocument();
  });
});

describe("RestaurantDetails — cuisine and best-for", () => {
  it("shows the cuisine type and bestFor tags", () => {
    renderWithClient(
      <RestaurantDetails
        detail={makeListingDetail()}
        restaurant={makeRestaurantDetails({ cuisineType: "South Indian", bestFor: "Breakfast" })}
      />,
    );

    expect(screen.getByText("South Indian")).toBeInTheDocument();
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
  });
});

describe("RestaurantDetails — gated address", () => {
  // A distinct street address, deliberately different from the fixture's
  // locationName-derived fallback text ("Near Lake, Yercaud"), so the two
  // assertions below can't accidentally match the same string.
  const detail = makeListingDetail({
    business: { ...makeListingDetail().business, address: "42 MG Road, Yercaud" },
  });

  it("shows the real address for a signed-in visitor", () => {
    signIn();
    renderWithClient(<RestaurantDetails detail={detail} restaurant={makeRestaurantDetails()} />);

    expect(screen.getByText("42 MG Road, Yercaud")).toBeInTheDocument();
  });

  it("falls back to the coarse locality for a signed-out visitor", () => {
    renderWithClient(<RestaurantDetails detail={detail} restaurant={makeRestaurantDetails()} />);

    expect(screen.queryByText("42 MG Road, Yercaud")).not.toBeInTheDocument();
    expect(screen.getByText(`${detail.listing.locationName}, Yercaud`)).toBeInTheDocument();
  });
});

describe("RestaurantDetails — tabs", () => {
  it("marks the clicked tab active", () => {
    renderWithClient(
      <RestaurantDetails detail={makeListingDetail()} restaurant={makeRestaurantDetails()} />,
    );

    const menuTab = screen.getByRole("button", { name: "Menu" });
    expect(menuTab.className).not.toContain("border-[#1E7A46]");
    fireEvent.click(menuTab);
    expect(menuTab.className).toContain("border-[#1E7A46]");
  });
});

describe("RestaurantDetails — favorite toggle", () => {
  it("shows a sign-in link instead of a toggle button for a signed-out visitor", () => {
    renderWithClient(
      <RestaurantDetails detail={makeListingDetail()} restaurant={makeRestaurantDetails()} />,
    );
    expect(screen.getByRole("link", { name: /add to favorites/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("lets a signed-in visitor toggle the favorite", () => {
    signIn();
    const detail = makeListingDetail();
    renderWithClient(<RestaurantDetails detail={detail} restaurant={makeRestaurantDetails()} />);

    fireEvent.click(screen.getByRole("button", { name: /add to favorites/i }));
    expect(toggleFavoriteMutate).toHaveBeenCalledWith({
      listingId: detail.listing.id,
      isFavorite: false,
    });
  });
});
