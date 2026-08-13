import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  Card,
  ContactCard,
  OpeningHoursCard,
  ReviewsBlock,
  LocationBlock,
  SimilarListingsSection,
} from "@/components/DetailBlocks";
import type { ContactDetails } from "@/lib/listing-detail";
import type { OpeningHour, Review } from "@/lib/api";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  LinkStub,
  routerStateStub,
  baseCategory,
  baseListingSummary,
} from "../test-utils";

/**
 * The shared building blocks every category Details page renders — Card,
 * ContactCard, OpeningHoursCard, ReviewsBlock, LocationBlock, and
 * SimilarListingsSection (which renders `BusinessCardGrid`, so it needs the
 * same router/auth/favorites mocks `test/BusinessCard.test.tsx` already
 * uses). ContactCard also renders `ContactGateOverlay` and fires
 * `useContactReveal`/`useListingView` (both covered directly in
 * test/components/ContactGate.test.tsx) — this file only checks that
 * ContactCard wires them in, not their own internals again.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
  useRouterState: (opts: Parameters<typeof routerStateStub>[0]) => routerStateStub(opts),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/favorites", () => ({
  useIsFavorite: () => false,
  useToggleFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}));

const logContactReveal = vi.fn();
const logView = vi.fn();
const submitReview = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      listings: {
        logContactReveal: (...args: unknown[]) => logContactReveal(...args),
        logView: (...args: unknown[]) => logView(...args),
        submitReview: (...args: unknown[]) => submitReview(...args),
      },
    },
  };
});

beforeEach(() => {
  resetAuthState();
  logContactReveal.mockReset();
  logView.mockReset();
  submitReview.mockReset();
});

describe("Card", () => {
  it("renders its title and children", () => {
    renderWithClient(
      <Card title="Contact Information">
        <p>Card body</p>
      </Card>,
    );

    expect(screen.getByText("Contact Information")).toBeInTheDocument();
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });
});

const baseContact: ContactDetails = {
  phone: "+91 98765 43210",
  email: "contact@grandpalace.example",
  website: "grandpalace.example",
  address: "Near Lake, Yercaud",
  socialLinks: { facebook: "https://facebook.com/grandpalace", instagram: "" },
};

describe("ContactCard", () => {
  it("blurs contact values and shows the sign-in gate for a signed-out visitor", () => {
    renderWithClient(<ContactCard contact={baseContact} listingId="listing-1" />);

    expect(screen.getByText("Sign in to reveal contact info")).toBeInTheDocument();
    expect(screen.getByText(baseContact.phone!).closest("a")).not.toBeInTheDocument();
  });

  it("shows real, clickable contact values for a signed-in visitor", () => {
    signIn();
    renderWithClient(<ContactCard contact={baseContact} listingId="listing-1" />);

    expect(screen.queryByText("Sign in to reveal contact info")).not.toBeInTheDocument();
    expect(screen.getByText(baseContact.phone!).closest("a")).toHaveAttribute(
      "href",
      `tel:${baseContact.phone}`,
    );
    expect(screen.getByText(baseContact.email!).closest("a")).toHaveAttribute(
      "href",
      `mailto:${baseContact.email}`,
    );
    expect(screen.getByText(baseContact.website!).closest("a")).toHaveAttribute(
      "href",
      "https://grandpalace.example",
    );
  });

  it("only renders social icons for links the owner actually filled in", () => {
    signIn();
    renderWithClient(<ContactCard contact={baseContact} listingId="listing-1" />);

    expect(screen.getByLabelText("facebook")).toBeInTheDocument();
    expect(screen.queryByLabelText("instagram")).not.toBeInTheDocument();
  });

  it("logs the page view on mount", async () => {
    renderWithClient(<ContactCard contact={baseContact} listingId="listing-1" />);
    await waitFor(() => expect(logView).toHaveBeenCalledWith("listing-1"));
  });
});

describe("OpeningHoursCard", () => {
  it("renders nothing when there are no hours", () => {
    const { container } = renderWithClient(<OpeningHoursCard hours={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each day sorted by dayOfWeek, with Closed for a closed day", () => {
    const hours: OpeningHour[] = [
      { dayOfWeek: 2, openTime: "09:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
      { dayOfWeek: 1, openTime: "09:00", closeTime: "22:00", isClosed: false },
    ];
    renderWithClient(<OpeningHoursCard hours={hours} />);

    const days = screen.getAllByText(/Sunday|Monday|Tuesday/).map((el) => el.textContent);
    expect(days).toEqual(["Sunday", "Monday", "Tuesday"]);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getAllByText("09:00 – 22:00")).toHaveLength(2);
  });
});

const baseReview: Review = {
  id: "review-1",
  listingId: "listing-1",
  userId: "user-2",
  rating: 4,
  text: "Great stay overall.",
  status: "approved",
  createdAt: "2026-01-02T00:00:00.000Z",
};

describe("ReviewsBlock", () => {
  it("shows a sign-in prompt instead of the review form for a signed-out visitor", () => {
    renderWithClient(<ReviewsBlock listingId="listing-1" reviews={[]} rating={null} total={0} />);

    expect(screen.getByRole("link", { name: "Sign in to review" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByRole("button", { name: "Write a Review" })).not.toBeInTheDocument();
  });

  it("shows the average rating, or — when there are none yet", () => {
    renderWithClient(<ReviewsBlock listingId="listing-1" reviews={[]} rating={null} total={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("pluralizes the review count correctly", () => {
    const { unmount } = renderWithClient(
      <ReviewsBlock listingId="listing-1" reviews={[]} rating={4.5} total={1} />,
    );
    expect(screen.getByText("Based on 1 review")).toBeInTheDocument();
    unmount();

    renderWithClient(<ReviewsBlock listingId="listing-1" reviews={[]} rating={4.5} total={3} />);
    expect(screen.getByText("Based on 3 reviews")).toBeInTheDocument();
  });

  it("renders each review's rating, text, and the owner's reply when present", () => {
    renderWithClient(
      <ReviewsBlock
        listingId="listing-1"
        reviews={[{ ...baseReview, ownerReply: "Thanks for staying with us!" }]}
        rating={4}
        total={1}
      />,
    );

    expect(screen.getByText("Great stay overall.")).toBeInTheDocument();
    expect(screen.getByText("A visitor")).toBeInTheDocument();
    expect(screen.getByText("Thanks for staying with us!")).toBeInTheDocument();
  });

  it("lets a signed-in visitor write and submit a review", async () => {
    signIn();
    submitReview.mockResolvedValue({ ...baseReview, id: "review-2" });
    renderWithClient(<ReviewsBlock listingId="listing-1" reviews={[]} rating={null} total={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Write a Review" }));
    fireEvent.click(screen.getByLabelText("3 stars"));
    fireEvent.change(screen.getByPlaceholderText("What was your experience?"), {
      target: { value: "Loved the lake view." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() =>
      expect(submitReview).toHaveBeenCalledWith("listing-1", {
        rating: 3,
        text: "Loved the lake view.",
      }),
    );
    expect(await screen.findByText(/pending approval/)).toBeInTheDocument();
  });

  it("disables submit until the review text is at least 3 characters", () => {
    signIn();
    renderWithClient(<ReviewsBlock listingId="listing-1" reviews={[]} rating={null} total={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Write a Review" }));
    const submitButton = screen.getByRole("button", { name: "Submit review" });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("What was your experience?"), {
      target: { value: "ok" },
    });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("What was your experience?"), {
      target: { value: "okay" },
    });
    expect(submitButton).toBeEnabled();
  });
});

describe("LocationBlock", () => {
  it("renders nothing when there's no address or locationName", () => {
    const { container } = renderWithClient(<LocationBlock address={null} locationName={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the address and a working Maps link for a signed-in visitor", () => {
    signIn();
    renderWithClient(<LocationBlock address="Near Lake, Yercaud" locationName="Yercaud town" />);

    expect(screen.getByText("Yercaud town, Yercaud")).toBeInTheDocument();
    expect(screen.getByText("Near Lake, Yercaud")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open in maps/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Near%20Lake%2C%20Yercaud",
    );
  });

  it("blurs the address and hides the Maps link for a signed-out visitor", () => {
    renderWithClient(<LocationBlock address="Near Lake, Yercaud" locationName="Yercaud town" />);

    expect(screen.getByText("Sign in to view")).toBeInTheDocument();
    // No href means it's not an ARIA link at all — the "Open in Maps" anchor
    // itself only becomes an accessible link once signed in.
    expect(screen.queryByRole("link", { name: /open in maps/i })).not.toBeInTheDocument();
    expect(screen.getByText(/open in maps/i)).not.toHaveAttribute("href");
  });
});

describe("SimilarListingsSection", () => {
  it("renders one card per similar listing", () => {
    renderWithClient(
      <SimilarListingsSection
        category={baseCategory}
        listings={[
          baseListingSummary,
          { ...baseListingSummary, id: "listing-2", name: "Lakeview Cottage" },
        ]}
        categoryColor="#1E7A46"
      />,
    );

    expect(screen.getByText(baseListingSummary.name)).toBeInTheDocument();
    expect(screen.getByText("Lakeview Cottage")).toBeInTheDocument();
  });

  it('titles the section after the given category, falling back to "Listings" without one', () => {
    const { unmount } = renderWithClient(
      <SimilarListingsSection category={baseCategory} listings={[]} categoryColor="#1E7A46" />,
    );
    expect(screen.getByText(`Similar ${baseCategory.name}`)).toBeInTheDocument();
    unmount();

    renderWithClient(
      <SimilarListingsSection category={undefined} listings={[]} categoryColor="#1E7A46" />,
    );
    expect(screen.getByText("Similar Listings")).toBeInTheDocument();
  });
});
