import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeaturedSection } from "@/components/FeaturedSection";

/**
 * Component tests for FeaturedSection (issue #20, generalized to a
 * render-prop in #21 so it can host both Listing cards and Blog Post
 * cards). What's under test is FeaturedSection's own responsibility —
 * title, item order, empty handling — not any particular card's rendering,
 * so `renderItem` here is a trivial stub rather than a real card component.
 */
function item(id: string, label: string) {
  return { id, label };
}

describe("FeaturedSection", () => {
  it("renders the section title and one item per entry, in the given order", () => {
    const items = [item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")];

    render(<FeaturedSection title="Featured Hotels" items={items} renderItem={(i) => <span data-testid="card">{i.label}</span>} />);

    expect(screen.getByRole("heading", { name: "Featured Hotels" })).toBeInTheDocument();
    const cards = screen.getAllByTestId("card");
    expect(cards.map((c) => c.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("renders nothing at all for an empty item list — no title over a blank grid", () => {
    const { container } = render(
      <FeaturedSection title="Featured Hotels" items={[]} renderItem={(i) => <span>{i.label}</span>} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders however many items are available when there are fewer than a full shelf", () => {
    const items = [item("a", "Alpha")];

    render(<FeaturedSection title="Featured Hotels" items={items} renderItem={(i) => <span data-testid="card">{i.label}</span>} />);

    expect(screen.getAllByTestId("card")).toHaveLength(1);
  });
});
