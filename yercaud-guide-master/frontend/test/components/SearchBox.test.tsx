import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchBox } from "@/components/SearchBox";
import { navigateSpy, LinkStub, baseListingSummary } from "../test-utils";

/** The state updates this file exercises land inside a raw `setTimeout`
 * callback (the debounce, the typewriter), not inside a React event handler
 * or `waitFor`'s own polling — so they need an explicit `act()` around the
 * timer advance to be flushed and observable synchronously afterward. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * The live hero search (issue #11) — debounced quick-search dropdown, full
 * submit navigation, category scoping, and the typewriter placeholder.
 * `fireEvent` (not `userEvent`) is used throughout: userEvent's internal
 * delays fight with Vitest's fake timers, which this file needs for both the
 * search debounce and the typewriter's own timers.
 */
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
  Link: (props: Parameters<typeof LinkStub>[0]) => LinkStub(props),
}));

const search = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { search: (...args: unknown[]) => search(...args) } };
});

beforeEach(() => {
  navigateSpy.mockReset();
  search.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchBox — debounced quick-search", () => {
  it("does not search for a query under 2 characters", async () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "l" } });
    await advance(300);
    expect(search).not.toHaveBeenCalled();
  });

  it("searches (quick mode) 180ms after typing stops, and shows the dropdown", async () => {
    search.mockResolvedValue({ listings: [baseListingSummary], businesses: [] });
    render(<SearchBox />);

    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "lake" } });
    await advance(200);

    expect(search).toHaveBeenCalledWith(
      { q: "lake", category: undefined, mode: "quick", pageSize: 6 },
      expect.anything(),
    );
    expect(screen.getByText(baseListingSummary.name)).toBeInTheDocument();
  });

  it("only fires once for a burst of keystrokes within the debounce window", async () => {
    search.mockResolvedValue({ listings: [], businesses: [] });
    render(<SearchBox />);

    const input = screen.getByLabelText("Search the directory");
    fireEvent.change(input, { target: { value: "l" } });
    await advance(50);
    fireEvent.change(input, { target: { value: "la" } });
    await advance(50);
    fireEvent.change(input, { target: { value: "lak" } });
    await advance(50);
    fireEvent.change(input, { target: { value: "lake" } });
    await advance(200);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      { q: "lake", category: undefined, mode: "quick", pageSize: 6 },
      expect.anything(),
    );
  });

  it("shows a no-matches message rather than an empty dropdown", async () => {
    search.mockResolvedValue({ listings: [], businesses: [] });
    render(<SearchBox />);

    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "zzz" } });
    await advance(200);

    expect(screen.getByText(/no quick matches/i)).toBeInTheDocument();
  });

  it("scopes the quick-search call to the given category", async () => {
    search.mockResolvedValue({ listings: [], businesses: [] });
    render(<SearchBox category="hotel" />);

    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "lake" } });
    await advance(200);

    expect(search).toHaveBeenCalledWith(
      { q: "lake", category: "hotel", mode: "quick", pageSize: 6 },
      expect.anything(),
    );
  });
});

describe("SearchBox — submit navigates to /search", () => {
  it("navigates with the trimmed query", () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText("Search the directory"), {
      target: { value: "  lake view  " },
    });
    fireEvent.submit(screen.getByLabelText("Search the directory").closest("form")!);

    expect(navigateSpy).toHaveBeenCalledWith({ to: "/search", search: { q: "lake view" } });
  });

  it("does not navigate for an empty/whitespace-only query", () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Search the directory").closest("form")!);

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("carries the category through to the /search navigation", () => {
    render(<SearchBox category="hotel" />);
    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "lake" } });
    fireEvent.submit(screen.getByLabelText("Search the directory").closest("form")!);

    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/search",
      search: { q: "lake", category: "hotel" },
    });
  });
});

describe("SearchBox — placeholder", () => {
  it("uses the static placeholder when animatedWords is omitted", () => {
    render(<SearchBox placeholder="Search hotels…" />);
    expect(screen.getByLabelText("Search the directory")).toHaveAttribute(
      "placeholder",
      "Search hotels…",
    );
  });

  it("cycles through animatedWords via the typewriter effect when given", async () => {
    render(<SearchBox animatedWords={["Hotels", "Tours"]} />);
    const input = screen.getByLabelText("Search the directory");

    expect(input).toHaveAttribute("placeholder", "Search for |");

    await advance(90);
    expect(input).toHaveAttribute("placeholder", "Search for H|");

    // Each character re-triggers the effect to schedule the next tick, so
    // advancing 5 * 90ms in one jump isn't guaranteed to flush all 5 renders
    // in between — advance one tick at a time instead.
    for (let i = 0; i < 5; i++) await advance(90);
    expect(input).toHaveAttribute("placeholder", "Search for Hotels|");
  });
});
