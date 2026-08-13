import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell, Breadcrumbs, SignInPrompt } from "@/components/PageShell";
import { LinkStub } from "../test-utils";

// Breadcrumbs/SignInPrompt only use `Link` for navigation — a trivial anchor
// stub is enough, unlike PageShell itself (which renders the full Header +
// Footer chrome and needs the fuller router/auth mock; see #28).
//
// vi.mock's factory runs before this file's own imports are guaranteed to
// have settled, so `Link` is wrapped in a fresh arrow function rather than
// referenced directly — that defers resolving `LinkStub` until React
// actually renders it, well after the whole module has loaded.
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));

// PageShell's own job is just "wrap children with Header + Footer" — Header
// and Footer each have their own test files (test/Header.test.tsx,
// test/components/Footer.test.tsx) already covering their internals, so
// they're stubbed here rather than re-mocking everything they themselves
// depend on (auth, react-query, etc).
vi.mock("@/components/Header", () => ({ Header: () => <div data-testid="header-stub" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <div data-testid="footer-stub" /> }));

describe("PageShell", () => {
  it("renders its children between Header and Footer", () => {
    render(
      <PageShell>
        <main>Page content</main>
      </PageShell>,
    );

    const header = screen.getByTestId("header-stub");
    const content = screen.getByText("Page content");
    const footer = screen.getByTestId("footer-stub");

    // DOCUMENT_POSITION_FOLLOWING: `content` comes after `header` in the DOM,
    // and `footer` comes after `content` — i.e. Header, then children, then Footer.
    expect(header.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(content.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Breadcrumbs", () => {
  it("renders a crumb with a `to` as a link", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Hotels", to: "/hotels" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Hotels" })).toHaveAttribute("href", "/hotels");
  });

  it("renders the current crumb (no `to`) as plain text, not a dead link", () => {
    render(<Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Grand Palace Hotel" }]} />);

    expect(screen.getByText("Grand Palace Hotel")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Grand Palace Hotel" })).not.toBeInTheDocument();
  });
});

describe("SignInPrompt", () => {
  it("renders the given title and subtitle", () => {
    render(
      <SignInPrompt
        title="Sign in to see your favorites"
        sub="Save listings to come back to later."
      />,
    );

    expect(screen.getByText("Sign in to see your favorites")).toBeInTheDocument();
    expect(screen.getByText("Save listings to come back to later.")).toBeInTheDocument();
  });

  it("links to /login and /register", () => {
    render(<SignInPrompt title="Sign in" sub="to continue" />);

    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create Account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
