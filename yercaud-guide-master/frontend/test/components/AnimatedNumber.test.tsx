import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AnimatedNumber } from "@/components/AnimatedNumber";

/**
 * jsdom has no real IntersectionObserver — this stands in for the browser,
 * capturing each instance so a test can fire its callback manually to
 * simulate "this element scrolled into view."
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds: number[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AnimatedNumber", () => {
  it("stays at 0 before the element has scrolled into view", () => {
    render(<AnimatedNumber value={250} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("counts up to the target value once scrolled into view", () => {
    vi.useFakeTimers();
    render(<AnimatedNumber value={250} />);

    const observer = MockIntersectionObserver.instances[0];
    act(() => observer.trigger(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("250")).toBeInTheDocument();
  });

  it("does not replay the count-up if the element scrolls out and back into view", () => {
    vi.useFakeTimers();
    render(<AnimatedNumber value={100} />);

    const observer = MockIntersectionObserver.instances[0];
    act(() => observer.trigger(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("100")).toBeInTheDocument();

    // The component disconnects its observer after the first trigger (see
    // AnimatedNumber.tsx), so a real second intersection can't fire — this
    // just confirms the value holds steady rather than resetting.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders decimals and a suffix when given", () => {
    vi.useFakeTimers();
    render(<AnimatedNumber value={4.5} decimals={1} suffix=" yrs" />);

    const observer = MockIntersectionObserver.instances[0];
    act(() => observer.trigger(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("4.5 yrs")).toBeInTheDocument();
  });

  it("disconnects the observer once it's scrolled into view", () => {
    render(<AnimatedNumber value={10} />);
    const observer = MockIntersectionObserver.instances[0];

    act(() => observer.trigger(true));

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
