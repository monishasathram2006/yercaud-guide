import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserAvatar } from "@/components/UserAvatar";

const sizing = "h-8 w-8 rounded-full";
const fallback = "bg-[#1E7A46] text-white";

// The avatar's <img> has alt="" (decorative — the name is shown elsewhere on
// every page that uses this), which gives it role="presentation" rather than
// "img" — so tests query the DOM directly instead of by accessible role.
function avatarImg(): HTMLImageElement | null {
  return document.querySelector("img");
}

describe("UserAvatar", () => {
  it("falls back to the uppercased initial letter when there's no avatarUrl", () => {
    render(<UserAvatar src={null} name="asha" className={sizing} fallbackClassName={fallback} />);

    expect(avatarImg()).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders the image, resolved against the backend origin, when avatarUrl is set", () => {
    render(
      <UserAvatar
        src="/uploads/avatars/user-1/photo.jpg"
        name="Asha"
        className={sizing}
        fallbackClassName={fallback}
      />,
    );

    expect(avatarImg()!.src).toContain("/uploads/avatars/user-1/photo.jpg");
  });

  it("leaves a blob: preview URL untouched, rather than prefixing it with the backend origin", () => {
    render(
      <UserAvatar
        src="blob:http://localhost:5173/preview-id"
        name="Asha"
        className={sizing}
        fallbackClassName={fallback}
      />,
    );

    expect(avatarImg()!.src).toBe("blob:http://localhost:5173/preview-id");
  });

  it("falls back to the initial letter if the image fails to load", () => {
    render(
      <UserAvatar
        src="/uploads/avatars/user-1/photo.jpg"
        name="Asha"
        className={sizing}
        fallbackClassName={fallback}
      />,
    );

    fireEvent.error(avatarImg()!);

    expect(avatarImg()).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
