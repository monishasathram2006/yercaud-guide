import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewsletterForm } from "@/components/Footer";
import { ApiError } from "@/lib/api";

/**
 * Component tests for the footer's "Stay Updated with Yercaud" subscribe
 * form. It used to fake success with a setTimeout — it now posts to the real
 * POST /newsletter/subscribe endpoint via api.content.subscribe.
 *
 * Covers the QA test-case sheet's client-testable rows (TC01-TC23). Several
 * rows are pure CSS/visual or infra concerns a component test can't verify
 * meaningfully and are intentionally not covered here:
 *  - TC14 (placeholder legibility), TC16 (hover/active visual feedback),
 *    TC20 (color contrast) — need a real browser/visual review, not jsdom.
 *  - TC21 (responsive viewport reflow) — jsdom has no real CSS layout engine.
 *  - TC15 (focus outline styling) — focus *reachability* is covered by TC18;
 *    the visible-outline appearance itself is CSS-only.
 * Several other rows describe behaviour this form does not actually have
 * (see comments at each — TC02, TC06, TC07, TC08, TC22): the tests assert
 * what the form actually does, not the sheet's assumption, matching the
 * convention already established in EnquiryForm.test.tsx.
 */

const subscribe = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      content: {
        subscribe: (...args: unknown[]) => subscribe(...args),
      },
    },
  };
});

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewsletterForm />
    </QueryClientProvider>,
  );
}

function getEmailInput() {
  return screen.getByPlaceholderText("Enter your email") as HTMLInputElement;
}

function getButton() {
  return screen.getByRole("button", { name: /Subscribe|Subscribing/ });
}

beforeEach(() => {
  subscribe.mockReset();
  subscribe.mockResolvedValue({ email: "visitor@example.com", status: "active" });
});

describe("NewsletterForm — rendering", () => {
  it("renders the email field and submit button", () => {
    renderForm();
    expect(getEmailInput()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  });
});

describe("NewsletterForm — validation (TC02-TC05, TC08-TC10, TC23)", () => {
  it("TC02 empty submit shows a validation error, not 'Email is required' — the form has one message for both blank and malformed input", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(getButton());
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(["test@", "test.com", "test@@x.com"])(
    "TC03 %s is rejected before the app's own validation ever runs — blocked by the input's native type=\"email\" constraint (no noValidate on the form)",
    async (value) => {
      const user = userEvent.setup();
      renderForm();
      await user.type(getEmailInput(), value);
      await user.click(getButton());
      expect(getEmailInput().validity.valid).toBe(false);
      expect(subscribe).not.toHaveBeenCalled();
      // The app's own "Enter a valid email" text never renders for these —
      // the browser's native validation UI intercepts the submit first.
      expect(screen.queryByText("Enter a valid email")).not.toBeInTheDocument();
    },
  );

  it("TC04 an email missing a TLD ('test@domain') passes the native constraint but fails the app's own regex", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "test@domain");
    expect(getEmailInput().validity.valid).toBe(true);
    await user.click(getButton());
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("TC05 leading/trailing whitespace is stripped (by the browser's native type=\"email\" sanitization as it's typed, then .trim() again before sending) and the email is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), " test@domain.com ");
    expect(getEmailInput().value).toBe("test@domain.com");
    await user.click(getButton());
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith({ email: "test@domain.com", source: "footer" }),
    );
  });

  it("TC08 a 250+ character email has no client-side length limit — sent in full, untruncated", async () => {
    const user = userEvent.setup();
    renderForm();
    const longEmail = `${"a".repeat(250)}@test.com`;
    const input = getEmailInput();
    await user.click(input);
    await user.paste(longEmail);
    expect(input.value.length).toBe(longEmail.length);
    expect(input.maxLength === -1).toBe(true);
    await user.click(getButton());
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith({ email: longEmail, source: "footer" }),
    );
  });

  it("TC09 an XSS-shaped local part ('<script>...</script>@x.com') is rejected by the native type=\"email\" constraint before it ever reaches app code or the API", async () => {
    const user = userEvent.setup();
    renderForm();
    const payload = "<script>alert(1)</script>@x.com";
    await user.type(getEmailInput(), payload);
    expect(getEmailInput().validity.valid).toBe(false);
    await user.click(getButton());
    expect(subscribe).not.toHaveBeenCalled();
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });

  it("TC10 a SQL-injection-shaped value (\"' OR '1'='1\", no '@') is rejected by the native type=\"email\" constraint before it ever reaches app code or the API", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "' OR '1'='1");
    expect(getEmailInput().validity.valid).toBe(false);
    await user.click(getButton());
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(["user+test@domain.com", "user.name@domain.com"])(
    "TC23 %s (plus-addressing / dotted local part) is accepted",
    async (value) => {
      const user = userEvent.setup();
      renderForm();
      await user.type(getEmailInput(), value);
      await user.click(getButton());
      await waitFor(() =>
        expect(subscribe).toHaveBeenCalledWith({ email: value, source: "footer" }),
      );
    },
  );
});

describe("NewsletterForm — submission behaviour (TC01, TC06, TC07, TC11-TC13, TC17)", () => {
  it("TC01 a valid email submits successfully and shows the success message", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "visitor@example.com");
    await user.click(getButton());
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith({ email: "visitor@example.com", source: "footer" }),
    );
    expect(await screen.findByText(/you're subscribed/i)).toBeInTheDocument();
  });

  it("TC06 re-subscribing an already-subscribed email shows the same generic success message, not a distinct 'already subscribed' notice — the backend's ack is deliberately identical either way, so the UI can't tell them apart (see newsletter.ts: SubscribeAck omits subscribedAt/id/source so a caller can't probe who's already on the list)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "known@example.com");
    await user.click(getButton());
    expect(await screen.findByText("Thanks — you're subscribed.")).toBeInTheDocument();
  });

  it("TC07 case is preserved, not normalized — 'Test@Domain.com' is sent exactly as typed (the backend's unique constraint is on the raw column, per newsletter.ts)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "Test@Domain.com");
    await user.click(getButton());
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith({ email: "Test@Domain.com", source: "footer" }),
    );
  });

  it("TC11 the submit button disables after the first click, so a rapid second click sends only one request", async () => {
    let resolveFn!: (v: { email: string; status: "active" }) => void;
    subscribe.mockReturnValue(new Promise((r) => (resolveFn = r)));
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "visitor@example.com");
    const button = getButton();
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button); // second click on the now-disabled button
    expect(subscribe).toHaveBeenCalledTimes(1);
    resolveFn({ email: "visitor@example.com", status: "active" });
  });

  it("TC12 a network failure (rejected fetch, not an ApiError) shows the raw browser error, not a silent failure", async () => {
    subscribe.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "visitor@example.com");
    await user.click(getButton());
    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
  });

  it("TC13 a 5xx server error shows the server's message verbatim, not a generic fallback", async () => {
    subscribe.mockRejectedValue(new ApiError(500, "Internal server error"));
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "visitor@example.com");
    await user.click(getButton());
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();
  });

  it("TC17 the button shows a loading label and is disabled while the request is pending", async () => {
    let resolveFn!: (v: { email: string; status: "active" }) => void;
    subscribe.mockReturnValue(new Promise((r) => (resolveFn = r)));
    const user = userEvent.setup();
    renderForm();
    await user.type(getEmailInput(), "visitor@example.com");
    await user.click(getButton());
    const pending = await screen.findByRole("button", { name: "Subscribing..." });
    expect(pending).toBeDisabled();
    resolveFn({ email: "visitor@example.com", status: "active" });
  });
});

describe("NewsletterForm — accessibility (TC18, TC19)", () => {
  it("TC18 the field is keyboard-reachable and Enter submits the form", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(getEmailInput());
    expect(getEmailInput()).toHaveFocus();
    await user.type(getEmailInput(), "visitor@example.com{Enter}");
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith({ email: "visitor@example.com", source: "footer" }),
    );
  });

  it("TC19 both the email input and the Subscribe button have an accessible name — the input via aria-label (it has no visible <label> by design), the button via its text", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeInTheDocument();
  });
});

describe("NewsletterForm — spam/abuse (TC22)", () => {
  it("TC22 there is no client-side rate limiting or CAPTCHA — repeated submissions from separate forms all go through unblocked", async () => {
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) {
      renderForm();
      const inputs = screen.getAllByPlaceholderText("Enter your email");
      const input = inputs[inputs.length - 1];
      await user.type(input, `visitor${i}@example.com`);
      const buttons = screen.getAllByRole("button", { name: "Subscribe" });
      await user.click(buttons[buttons.length - 1]);
    }
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(3));
    expect(document.querySelector("iframe, [class*='captcha']")).not.toBeInTheDocument();
  });
});
