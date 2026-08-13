import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import {
  ContactGateOverlay,
  CardGateOverlay,
  useContactReveal,
  useListingView,
} from "@/components/ContactGate";
import {
  authState,
  resetAuthState,
  signIn,
  renderWithClient,
  routerStateStub,
} from "../test-utils";

/**
 * ContactGate's two overlays (issue #15) and two logging hooks (issues #15,
 * #16). `Link` is mocked locally rather than via the shared `LinkStub` —
 * unlike every other consumer of that stub, this file needs to assert on the
 * `search={{ redirect }}` prop each overlay passes, which `LinkStub`
 * deliberately discards.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children?: React.ReactNode; to?: string; search?: { redirect?: string } }) => (
    <a href={props.to} data-redirect={props.search?.redirect}>
      {props.children}
    </a>
  ),
  useRouterState: (opts: Parameters<typeof routerStateStub>[0]) => routerStateStub(opts),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));

const logContactReveal = vi.fn();
const logView = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      listings: {
        logContactReveal: (...args: unknown[]) => logContactReveal(...args),
        logView: (...args: unknown[]) => logView(...args),
      },
    },
  };
});

const CURRENT_PAGE = "http://localhost:3000/current-page";

beforeEach(() => {
  resetAuthState();
  logContactReveal.mockReset();
  logView.mockReset();
});

describe("ContactGateOverlay", () => {
  it("shows the sign-in prompt over the gated contact info", () => {
    renderWithClient(<ContactGateOverlay />);
    expect(screen.getByText("Sign in to reveal contact info")).toBeInTheDocument();
  });

  it("carries the current page as a redirect param on both Sign In and Create Account", () => {
    renderWithClient(<ContactGateOverlay />);

    const signInLink = screen.getByRole("link", { name: "Sign In" });
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink).toHaveAttribute("data-redirect", CURRENT_PAGE);

    const createAccountLink = screen.getByRole("link", { name: "Create Account" });
    expect(createAccountLink).toHaveAttribute("href", "/register");
    expect(createAccountLink).toHaveAttribute("data-redirect", CURRENT_PAGE);
  });
});

describe("CardGateOverlay", () => {
  it("shows a lighter single sign-in link, also carrying the redirect param", () => {
    renderWithClient(<CardGateOverlay />);

    const link = screen.getByRole("link", { name: /sign in to view/i });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveAttribute("data-redirect", CURRENT_PAGE);
  });
});

function ContactRevealHost({ listingId }: { listingId: string }) {
  useContactReveal(listingId);
  return null;
}

describe("useContactReveal", () => {
  it("logs the reveal once for a signed-in visitor", async () => {
    signIn();
    const { rerender } = renderWithClient(<ContactRevealHost listingId="listing-1" />);

    await waitFor(() => expect(logContactReveal).toHaveBeenCalledTimes(1));
    expect(logContactReveal).toHaveBeenCalledWith("listing-1");

    rerender(<ContactRevealHost listingId="listing-1" />);
    expect(logContactReveal).toHaveBeenCalledTimes(1);
  });

  it("never logs the reveal for a signed-out visitor", async () => {
    renderWithClient(<ContactRevealHost listingId="listing-1" />);
    // There's no success signal to await for "nothing happened" — settle the
    // microtask queue once, then assert it's still untouched.
    await new Promise((r) => setTimeout(r, 0));
    expect(logContactReveal).not.toHaveBeenCalled();
  });

  it("logs again for a different listing", async () => {
    signIn();
    const { rerender } = renderWithClient(<ContactRevealHost listingId="listing-1" />);
    await waitFor(() => expect(logContactReveal).toHaveBeenCalledTimes(1));

    rerender(<ContactRevealHost listingId="listing-2" />);
    await waitFor(() => expect(logContactReveal).toHaveBeenCalledTimes(2));
    expect(logContactReveal).toHaveBeenNthCalledWith(2, "listing-2");
  });
});

function ListingViewHost({ listingId }: { listingId: string }) {
  useListingView(listingId);
  return null;
}

describe("useListingView", () => {
  it("logs the view once per mount regardless of sign-in state", async () => {
    const { rerender } = renderWithClient(<ListingViewHost listingId="listing-1" />);

    await waitFor(() => expect(logView).toHaveBeenCalledTimes(1));
    expect(logView).toHaveBeenCalledWith("listing-1");

    rerender(<ListingViewHost listingId="listing-1" />);
    expect(logView).toHaveBeenCalledTimes(1);
  });

  it("logs the view for a signed-out visitor too", async () => {
    renderWithClient(<ListingViewHost listingId="listing-1" />);
    await waitFor(() => expect(logView).toHaveBeenCalledWith("listing-1"));
  });

  it("logs again for a different listing", async () => {
    const { rerender } = renderWithClient(<ListingViewHost listingId="listing-1" />);
    await waitFor(() => expect(logView).toHaveBeenCalledTimes(1));

    rerender(<ListingViewHost listingId="listing-2" />);
    await waitFor(() => expect(logView).toHaveBeenCalledTimes(2));
    expect(logView).toHaveBeenNthCalledWith(2, "listing-2");
  });
});
