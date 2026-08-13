import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoogleButton } from "@/components/GoogleButton";

describe("GoogleButton", () => {
  it("renders as a link pointing at href, with label as its accessible name", () => {
    render(<GoogleButton href="http://localhost:4000/auth/google" label="Continue with Google" />);

    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "http://localhost:4000/auth/google");
  });

  it("renders as a real anchor element, not a button", () => {
    render(<GoogleButton href="http://localhost:4000/auth/google" label="Sign up with Google" />);

    expect(screen.getByRole("link", { name: "Sign up with Google" }).tagName).toBe("A");
  });
});
