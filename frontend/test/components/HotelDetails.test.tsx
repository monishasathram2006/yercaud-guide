import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { HotelDetails } from "@/components/HotelDetails";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  LinkStub,
  makeListingDetail,
  makeHotelDetails,
} from "../test-utils";

/**
 * The Hotel category's detail page — tab highlighting/scroll, room
 * rates/availability, star rating, and the favorite toggle. Header, Footer,
 * EnquiryForm, and DetailBlocks' heavier pieces (ContactCard, LocationBlock,
 * ReviewsBlock, SimilarListingsSection) are stubbed: each already has its
 * own test file. `Card` (also from DetailBlocks) is left real — it's a
 * trivial title+children wrapper with no dependencies of its own.
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
  // jsdom has no scroll layout engine and doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("HotelDetails — rooms", () => {
  it("renders each room's rate and availability", () => {
    renderWithClient(<HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails()} />);

    // The Listing's own headline price ("₹3,500/night") happens to match the
    // Deluxe Room's rate, so assertions are scoped to each room's own card
    // rather than matched globally.
    const deluxe = screen.getByText("Deluxe Room").parentElement!.parentElement!;
    expect(within(deluxe).getByText("₹3,500/night")).toBeInTheDocument();
    expect(within(deluxe).getByText("2 available")).toBeInTheDocument();

    const standard = screen.getByText("Standard Room").parentElement!.parentElement!;
    expect(within(standard).getByText("₹2,500/night")).toBeInTheDocument();
    expect(within(standard).getByText("3 available")).toBeInTheDocument();
  });

  it("shows a room with no stock as currently unavailable", () => {
    renderWithClient(
      <HotelDetails
        detail={makeListingDetail()}
        hotel={makeHotelDetails({
          rooms: [
            {
              id: "room-1",
              name: "Deluxe Room",
              description: null,
              ratePerNight: 3500,
              quantityAvailable: 0,
              sortOrder: 1,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
  });
});

describe("HotelDetails — star rating", () => {
  it("shows the star rating when set", () => {
    renderWithClient(
      <HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails({ starRating: 4 })} />,
    );
    expect(screen.getByText("4-star")).toBeInTheDocument();
  });

  it("shows no star badge when unset", () => {
    renderWithClient(
      <HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails({ starRating: null })} />,
    );
    expect(screen.queryByText(/-star/)).not.toBeInTheDocument();
  });
});

describe("HotelDetails — tabs", () => {
  it("marks the clicked tab active and scrolls its section into view", () => {
    renderWithClient(<HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails()} />);

    const overviewTab = screen.getByRole("button", { name: "Overview" });
    const roomsTab = screen.getByRole("button", { name: "Rooms" });
    expect(overviewTab.className).toContain("border-[#1E7A46]");
    expect(roomsTab.className).not.toContain("border-[#1E7A46]");

    fireEvent.click(roomsTab);

    expect(roomsTab.className).toContain("border-[#1E7A46]");
    expect(overviewTab.className).not.toContain("border-[#1E7A46]");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe("HotelDetails — favorite toggle", () => {
  it("shows a sign-in link instead of a toggle button for a signed-out visitor", () => {
    renderWithClient(<HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails()} />);

    const link = screen.getByRole("link", { name: /add to favorites/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("lets a signed-in visitor add a listing to favorites", () => {
    signIn();
    renderWithClient(<HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails()} />);

    fireEvent.click(screen.getByRole("button", { name: /add to favorites/i }));
    expect(toggleFavoriteMutate).toHaveBeenCalledWith({
      listingId: makeListingDetail().listing.id,
      isFavorite: false,
    });
  });

  it("shows Saved and un-favorites on click when already a favorite", () => {
    signIn();
    isFavoriteState = true;
    renderWithClient(<HotelDetails detail={makeListingDetail()} hotel={makeHotelDetails()} />);

    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(toggleFavoriteMutate).toHaveBeenCalledWith({
      listingId: makeListingDetail().listing.id,
      isFavorite: true,
    });
  });
});
