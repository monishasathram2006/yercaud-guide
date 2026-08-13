import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlogPostCard } from "@/components/BlogPostCard";
import type { BlogPostSummary } from "@/lib/api";

/** @tanstack/react-router mocked the same way as Header.test.tsx — no real router in a component test. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children?: React.ReactNode; params?: { slug?: string } }) => (
    <a href={`/blog/${params?.slug ?? ""}`}>{children}</a>
  ),
}));

function post(overrides: Partial<BlogPostSummary> = {}): BlogPostSummary {
  return {
    id: "post-1",
    title: "Best Trails in Yercaud",
    slug: "best-trails-in-yercaud",
    excerpt: "A guide to the top hiking trails around the Shevaroy Hills.",
    coverImage: null,
    categoryId: "cat-1",
    authorId: "author-1",
    readingTimeMinutes: 6,
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("BlogPostCard", () => {
  it("renders the title, excerpt, and reading time", () => {
    render(<BlogPostCard post={post()} />);

    expect(screen.getByText("Best Trails in Yercaud")).toBeInTheDocument();
    expect(screen.getByText("A guide to the top hiking trails around the Shevaroy Hills.")).toBeInTheDocument();
    expect(screen.getByText("6 min read")).toBeInTheDocument();
  });

  it("links to the post's detail page by slug", () => {
    render(<BlogPostCard post={post({ slug: "monsoon-in-yercaud" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/blog/monsoon-in-yercaud");
  });

  it("shows a placeholder rather than a broken image when there's no cover image", () => {
    render(<BlogPostCard post={post({ coverImage: null })} />);
    expect(screen.getByText("No photo yet")).toBeInTheDocument();
  });
});
