import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { TourDetails } from "@/components/TourDetails";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  LinkStub,
  makeListingDetail,
  makeTourDetails,
} from "../test-utils";

/**
 * The Tours & Travel category's detail page — itinerary, languages/type/
 * best-for facts, inclusions, attractions, the favorite toggle, and (ADR
 * 0003) rendering sensibly for a detail-less "travel" listing that has none
 * of the above. Header, Footer, EnquiryForm, and DetailBlocks' heavier
 * pieces are stubbed the same way as the other Details test files.
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

const detail = makeListingDetail();

beforeEach(() => {
  resetAuthState();
  toggleFavoriteMutate.mockReset();
  isFavoriteState = false;
});

describe("TourDetails — facts", () => {
  it("shows duration, type, best-for and languages", () => {
    renderWithClient(
      <TourDetails
        detail={detail}
        tour={makeTourDetails({
          duration: "Full day",
          tourType: "Sightseeing",
          bestFor: "Families",
        })}
        languages={["English", "Tamil"]}
      />,
    );

    expect(screen.getByText("Full day")).toBeInTheDocument();
    expect(screen.getByText("Sightseeing")).toBeInTheDocument();
    expect(screen.getByText("Families")).toBeInTheDocument();
    expect(screen.getByText("English, Tamil")).toBeInTheDocument();
  });

  it("omits the Languages fact when there are none", () => {
    renderWithClient(<TourDetails detail={detail} tour={makeTourDetails()} languages={[]} />);
    expect(screen.queryByText("Languages")).not.toBeInTheDocument();
  });
});

describe("TourDetails — itinerary", () => {
  it("renders itinerary steps in stepOrder, with title and duration", () => {
    renderWithClient(
      <TourDetails
        detail={detail}
        tour={makeTourDetails({
          itinerarySteps: [
            {
              id: "s2",
              stepOrder: 2,
              title: "Botanical Garden",
              description: null,
              duration: "1 hour",
              stepType: "stop",
            },
            {
              id: "s1",
              stepOrder: 1,
              title: "Pickup",
              description: null,
              duration: "30 mins",
              stepType: "pickup",
            },
          ],
        })}
        languages={[]}
      />,
    );

    const steps = screen.getAllByText(/Pickup|Botanical Garden/).map((el) => el.textContent);
    expect(steps).toEqual(["Pickup", "Botanical Garden"]);
  });
});

describe("TourDetails — inclusions and attractions", () => {
  it("splits inclusions into included and excluded", () => {
    renderWithClient(
      <TourDetails
        detail={detail}
        tour={makeTourDetails({
          inclusions: [
            { id: "i1", item: "Guide", isIncluded: true },
            { id: "i2", item: "Lunch", isIncluded: false },
          ],
        })}
        languages={[]}
      />,
    );

    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("renders each attraction by name", () => {
    renderWithClient(
      <TourDetails
        detail={detail}
        tour={makeTourDetails({
          attractions: [
            { id: "a1", name: "Lady's Seat" },
            { id: "a2", name: "Pagoda Point" },
          ],
        })}
        languages={[]}
      />,
    );

    expect(screen.getByText("Lady's Seat")).toBeInTheDocument();
    expect(screen.getByText("Pagoda Point")).toBeInTheDocument();
  });
});

describe("TourDetails — a detail-less (travel) listing", () => {
  it("renders without a facts row, itinerary, inclusions or attractions when none exist", () => {
    renderWithClient(
      <TourDetails
        detail={detail}
        tour={makeTourDetails({
          duration: null,
          tourType: null,
          bestFor: null,
          itinerarySteps: [],
          inclusions: [],
          attractions: [],
        })}
        languages={[]}
      />,
    );

    expect(screen.queryByText("Itinerary 🍃")).not.toBeInTheDocument();
    expect(screen.queryByText("What's Included 🍃")).not.toBeInTheDocument();
    expect(screen.queryByText("Attractions Covered 🍃")).not.toBeInTheDocument();
    // The rest of the page (name, enquiry, contact) still renders fine.
    expect(screen.getByRole("heading", { name: detail.listing.name })).toBeInTheDocument();
  });
});

describe("TourDetails — favorite toggle", () => {
  it("shows a sign-in link instead of a toggle button for a signed-out visitor", () => {
    renderWithClient(<TourDetails detail={detail} tour={makeTourDetails()} languages={[]} />);
    expect(screen.getByRole("link", { name: /add to favorites/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("lets a signed-in visitor toggle the favorite", () => {
    signIn();
    renderWithClient(<TourDetails detail={detail} tour={makeTourDetails()} languages={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /add to favorites/i }));
    expect(toggleFavoriteMutate).toHaveBeenCalledWith({
      listingId: detail.listing.id,
      isFavorite: false,
    });
  });
});
