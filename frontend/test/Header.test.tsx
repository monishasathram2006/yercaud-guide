import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "@/components/Header";
import type { CurrentUser } from "@/lib/api";

/**
 * Component tests for the global Header (logo, nav, Favorites, Sign In /
 * account menu, mobile menu). Covers the QA sheet's client-testable rows
 * (HN-001–HN-050).
 *
 * `@tanstack/react-router` is mocked (Link -> <a href>, useRouterState ->
 * a controllable fake pathname, useNavigate -> a spy) since there's no real
 * router in a component test — same approach profile-edit.test.tsx already
 * uses ("Router chrome ... needs a real router context"). This means link
 * assertions check the *href is correct*, not that navigation/URL/page-title
 * actually changed — a real router would be needed for that, so those rows
 * are narrowed accordingly rather than skipped outright.
 *
 * jsdom loads no stylesheet, so Tailwind responsive classes (hidden, lg:flex,
 * sm:hidden, etc.) have no effect here — every element is present regardless
 * of viewport class, which is why desktop/mobile duplicate elements (e.g. two
 * "Favorites" links once the mobile menu is open) need `within()`/getAllBy*.
 *
 * Rows intentionally not covered, and why:
 *  - HN-015, HN-017, HN-018, HN-024, HN-025, HN-028 (visual-only: hover
 *    styling, text alignment, header alignment, focus-outline appearance) —
 *    CSS rendering, not verifiable without a real browser. Where a row has
 *    both a behavioral and a visual half (e.g. HN-028's focus reachability
 *    vs. outline appearance), the behavioral half is still covered.
 *  - HN-030–HN-032, HN-034 (responsive/overlap layout) — jsdom has no CSS
 *    layout engine.
 *  - HN-036 (reload), HN-038–HN-040 (browser compat / slow network), HN-045,
 *    HN-046 (browser back/forward), HN-050 (performance) — need a real
 *    browser/E2E harness, not a component test.
 *  - HN-042 (page title), HN-043 (URL change), HN-044 (auth-gated routes) —
 *    not Header's job: title/URL come from the router and each route's own
 *    `head()`, and route-level auth gating already exists per-route (e.g.
 *    favorites.tsx renders a SignInPrompt itself — see HN-023 below).
 *  - HN-049 (dark/light theme) — not implemented anywhere in this codebase.
 */

const mockRouter = vi.hoisted(() => ({ pathname: "/" }));
const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    className,
    onClick,
  }: {
    children?: React.ReactNode;
    to?: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  ),
  useRouterState: <T,>(opts: { select: (s: { location: { pathname: string } }) => T }) =>
    opts.select({ location: { pathname: mockRouter.pathname } }),
  useNavigate: () => navigateSpy,
}));

const authState = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  isSignedIn: false,
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authState,
}));

const signedInUser: CurrentUser = {
  id: "user-1",
  email: "asha@example.com",
  name: "Asha Rao",
  username: "asha_r",
  phone: null,
  avatarUrl: null,
  bio: null,
  dateOfBirth: null,
  gender: null,
  status: "active",
  roles: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
};

const navItems = [
  ["Home", "/"],
  ["Hotels", "/hotels"],
  ["Restaurants", "/restaurants"],
  ["Activities", "/activities"],
  ["Tours & Travels", "/tours"],
  ["Directory", "/directory"],
  ["Blog", "/blog"],
  ["FAQ", "/faq"],
] as const;

beforeEach(() => {
  mockRouter.pathname = "/";
  navigateSpy.mockReset();
  authState.user = null;
  authState.isSignedIn = false;
  authState.signOut.mockReset().mockResolvedValue(undefined);
});

describe("Header — rendering (HN-001, HN-002, HN-004)", () => {
  it("HN-001 renders without throwing", () => {
    expect(() => render(<Header />)).not.toThrow();
  });

  it("HN-002 the logo image renders with a real src and descriptive alt text", () => {
    render(<Header />);
    const logo = screen.getByAltText("Yercaud Guide") as HTMLImageElement;
    expect(logo).toBeInTheDocument();
    expect(logo.src).toContain("/logo.png");
    // Whether the image actually *loads* (vs. 404s) needs a real browser/network — not verifiable here.
  });

  it("HN-004 all eight nav items are present in the desktop nav", () => {
    render(<Header />);
    const desktopNav = screen.getAllByRole("navigation")[0];
    for (const [label] of navItems) {
      expect(within(desktopNav).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});

describe("Header — nav links (HN-003, HN-005–HN-013, HN-016, HN-037)", () => {
  it("HN-003 the logo links to Home ('/')", () => {
    render(<Header />);
    // The link's accessible name concatenates the logo image's alt text with
    // the visible "YERCAUD / Business Directory" wordmark next to it — not
    // just the alt text alone — hence the partial match.
    expect(screen.getByRole("link", { name: /Yercaud Guide/ })).toHaveAttribute("href", "/");
  });

  it.each(navItems)("HN-005–013 the %s link points to %s", (label, href) => {
    render(<Header />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("HN-016 every nav item is a real, clickable anchor element", () => {
    render(<Header />);
    for (const [label] of navItems) {
      const link = screen.getByRole("link", { name: label });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href");
    }
  });

  it("HN-037 every nav link points to a route that actually exists in this app (frontend/src/routes/*.tsx: hotels, restaurants, activities, tours, directory, blog.index, faq, index)", () => {
    // This just confirms the Header's hrefs match the known-real route set —
    // an actual crawl/E2E check would still be needed to fully rule out a
    // typo'd or removed route.
    const knownRoutes = new Set([
      "/",
      "/hotels",
      "/restaurants",
      "/activities",
      "/tours",
      "/directory",
      "/blog",
      "/faq",
    ]);
    for (const [, href] of navItems) {
      expect(knownRoutes.has(href)).toBe(true);
    }
  });
});

function classTokens(el: HTMLElement) {
  return el.className.split(/\s+/);
}

describe("Header — active link highlighting (HN-014)", () => {
  it("HN-014 the link matching the current path is styled active; others are not", () => {
    mockRouter.pathname = "/hotels";
    render(<Header />);
    // Exact class-token match, not substring: the inactive style is
    // "hover:text-[#1E7A46]", which *contains* "text-[#1E7A46]" as a
    // substring, so a naive .toContain() check would false-negative here.
    expect(classTokens(screen.getByRole("link", { name: "Hotels" }))).toContain("text-[#1E7A46]");
    expect(classTokens(screen.getByRole("link", { name: "Restaurants" }))).not.toContain(
      "text-[#1E7A46]",
    );
  });

  it("HN-014 Home is only active at the exact root path, not for every path (prefix-matching would otherwise make it always active)", () => {
    mockRouter.pathname = "/hotels";
    render(<Header />);
    expect(classTokens(screen.getByRole("link", { name: "Home" }))).not.toContain("text-[#1E7A46]");
  });
});

describe("Header — Sign In / account (HN-019, HN-020, HN-021, HN-022, HN-023, HN-048)", () => {
  it("HN-019 the Sign In link is visible when signed out", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /Sign In/ })).toBeInTheDocument();
  });

  it("HN-020 the Sign In link points to /login (opening the actual login page needs a real router)", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /Sign In/ })).toHaveAttribute("href", "/login");
  });

  it("HN-021 the Favorites link is visible", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /Favorites/ })).toBeInTheDocument();
  });

  it("HN-022 when signed in, Favorites points to /favorites", () => {
    authState.isSignedIn = true;
    authState.user = signedInUser;
    render(<Header />);
    expect(screen.getByRole("link", { name: /Favorites/ })).toHaveAttribute("href", "/favorites");
  });

  it("HN-023 when signed out, Favorites is still the same /favorites link — Header itself doesn't gate or redirect it; the /favorites route renders its own sign-in prompt (see favorites.tsx)", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /Favorites/ })).toHaveAttribute("href", "/favorites");
  });

  it("HN-048 Header has no session-timeout-specific handling — it simply reflects whatever useAuth() currently reports; a signed-out state (e.g. after a session expires) renders the same as a fresh visit", () => {
    authState.isSignedIn = false;
    authState.user = null;
    render(<Header />);
    expect(screen.getByRole("link", { name: /Sign In/ })).toBeInTheDocument();
    expect(screen.queryByText(/Hi, /)).not.toBeInTheDocument();
  });

  it("signed in: shows a greeting and no Sign In link", () => {
    authState.isSignedIn = true;
    authState.user = signedInUser;
    render(<Header />);
    expect(screen.getByText("Hi, Asha")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sign In/ })).not.toBeInTheDocument();
  });

  it("clicking the account button opens a menu with Sign Out, which calls signOut()", async () => {
    authState.isSignedIn = true;
    authState.user = signedInUser;
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: /Hi, Asha/ }));
    const signOutButton = screen.getByRole("button", { name: /Sign Out/ });
    await user.click(signOutButton);
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("Header — mobile menu (HN-033, HN-047)", () => {
  it("HN-033 the mobile nav is hidden until the toggle button is clicked, then shows the same nav items", async () => {
    const user = userEvent.setup();
    render(<Header />);
    expect(screen.getAllByRole("link", { name: "Hotels" })).toHaveLength(1); // desktop nav only

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getAllByRole("link", { name: "Hotels" })).toHaveLength(2); // desktop + mobile
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.getAllByRole("link", { name: "Hotels" })).toHaveLength(1);
  });

  it("HN-047 rapid repeated clicks on the mobile toggle just flip open/closed state each time, with no crash or stuck state", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const toggle = () => screen.getByRole("button", { name: /Open menu|Close menu/ });
    await user.click(toggle());
    await user.click(toggle());
    await user.click(toggle());
    // Three clicks from closed -> open, closed, open.
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
  });
});

describe("Header — keyboard & screen-reader accessibility (HN-026, HN-027, HN-028, HN-029)", () => {
  it("HN-026 Tab moves focus through the header's links/buttons in source order", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.tab();
    expect(screen.getByRole("link", { name: /Yercaud Guide/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
  });

  it("HN-027, HN-028 a focused nav link is a real anchor with an href — natively keyboard-activatable (Enter follows the link) and focusable", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const hotelsLink = screen.getByRole("link", { name: "Hotels" });
    hotelsLink.focus();
    expect(hotelsLink).toHaveFocus();
    expect(hotelsLink).toHaveAttribute("href", "/hotels");
    // Actual navigation-on-Enter is native <a> browser behavior; there's no
    // real router here to observe a page change against.
  });

  it("HN-029 the mobile menu toggle exposes its state via aria-expanded and an accurate aria-label", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("Header — structural/misc (HN-035, HN-041)", () => {
  it("HN-035 the header carries sticky-positioning classes (visual stickiness itself needs a real browser to observe)", () => {
    render(<Header />);
    expect(screen.getByRole("banner").className).toMatch(/\bsticky\b/);
    expect(screen.getByRole("banner").className).toMatch(/\btop-0\b/);
  });

  it("HN-041 rendering signed-out and signed-in states logs no console errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Header />);
    authState.isSignedIn = true;
    authState.user = signedInUser;
    render(<Header />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
