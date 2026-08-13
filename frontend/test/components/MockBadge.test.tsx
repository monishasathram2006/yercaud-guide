import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockBadge, Mock } from "@/components/MockBadge";

// SHOW (MockBadge.tsx) is `import.meta.env.DEV || ...` — DEV is always true
// under Vitest, so both components always render their badge here. The
// hidden-in-production branch isn't exercised by these tests.

describe("MockBadge", () => {
  it("renders the default note as its title", () => {
    render(<MockBadge />);
    expect(screen.getByText("Mock")).toHaveAttribute(
      "title",
      "Mock — not wired to the backend yet",
    );
  });

  it("renders a custom note as its title", () => {
    render(<MockBadge note="Awaiting POST /listings/:id/reviews" />);
    expect(screen.getByText("Mock")).toHaveAttribute(
      "title",
      "Awaiting POST /listings/:id/reviews",
    );
  });
});

describe("Mock", () => {
  it("renders its children alongside the badge, unmodified", () => {
    render(
      <Mock note="Static data from lib/data.ts">
        <p>Featured Listing</p>
      </Mock>,
    );

    expect(screen.getByText("Featured Listing")).toBeInTheDocument();
    expect(screen.getByText("Mock")).toHaveAttribute("title", "Static data from lib/data.ts");
  });
});
