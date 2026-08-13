import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { screen } from "@testing-library/react";
import { Footer } from "@/components/Footer";
import { renderWithClient, LinkStub } from "../test-utils";

/**
 * Footer's nav links, checked against the known-real route set — same idea
 * as test/Header.test.tsx's HN-037, guarding against a link surviving a
 * route removal (e.g. the recent /travel page merge into /tours).
 * NewsletterForm (rendered inside Footer) already has its own test file —
 * this only needs a QueryClientProvider so its `useMutation` doesn't throw,
 * not an API mock, since these tests don't submit it.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));

const knownRoutes = new Set([
  "/",
  "/hotels",
  "/restaurants",
  "/activities",
  "/tours",
  "/directory",
  "/about",
  "/blog",
  "/faq",
  "/contact",
  "/list-your-business",
]);

describe("Footer", () => {
  it("every nav link points to a route that actually exists in this app", () => {
    renderWithClient(<Footer />);

    const links = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href")?.startsWith("/"));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(knownRoutes.has(link.getAttribute("href")!)).toBe(true);
    }
  });

  it("links Hotels, Restaurants, Activities and Tours & Travels (repeated under Quick Links and Top Categories)", () => {
    renderWithClient(<Footer />);

    for (const link of screen.getAllByRole("link", { name: "Hotels" }))
      expect(link).toHaveAttribute("href", "/hotels");
    for (const link of screen.getAllByRole("link", { name: "Restaurants" }))
      expect(link).toHaveAttribute("href", "/restaurants");
    for (const link of screen.getAllByRole("link", { name: "Activities" }))
      expect(link).toHaveAttribute("href", "/activities");
    for (const link of screen.getAllByRole("link", { name: "Tours & Travels" }))
      expect(link).toHaveAttribute("href", "/tours");
  });

  it("no longer links to the removed /travel page", () => {
    renderWithClient(<Footer />);

    const links = screen.getAllByRole("link");
    expect(links.some((el) => el.getAttribute("href") === "/travel")).toBe(false);
  });
});
