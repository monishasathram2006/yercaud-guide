import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CurrentUser } from "@/lib/api";
import { Route } from "@/routes/profile_.edit";

/**
 * Component tests for the rebuilt /profile/edit form (issue #14) — the first
 * frontend test tooling in this repo. Router chrome (Header/Footer, which
 * need a real router context) is mocked away: these tests exercise the form
 * itself, not the page shell around it.
 */

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/PageShell", () => ({
  PageShell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Breadcrumbs: () => null,
  SignInPrompt: ({ title }: { title: string }) => <div>{title}</div>,
}));

const updateProfile = vi.fn();
const usernameAvailable = vi.fn();
const uploadAvatar = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      me: {
        updateProfile: (...args: unknown[]) => updateProfile(...args),
        usernameAvailable: (...args: unknown[]) => usernameAvailable(...args),
        uploadAvatar: (...args: unknown[]) => uploadAvatar(...args),
      },
    },
  };
});

const baseUser: CurrentUser = {
  id: "user-1",
  email: "asha@example.com",
  name: "Asha R",
  username: "asha_r",
  phone: null,
  avatarUrl: null,
  bio: null,
  dateOfBirth: null,
  gender: null,
  status: "active",
  roles: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  hasPassword: true,
  permissions: [],
  impersonatedBy: null,
};

vi.mock("@/lib/auth", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({ user: currentUser, isSignedIn: true }),
}));

let currentUser: CurrentUser = baseUser;

function renderEditProfile() {
  // @ts-expect-error — createFileRoute is mocked to return its options object directly.
  const EditProfile = Route.component as React.ComponentType;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditProfile />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentUser = { ...baseUser };
  updateProfile.mockReset();
  usernameAvailable.mockReset();
  uploadAvatar.mockReset();
  updateProfile.mockResolvedValue(baseUser);
  usernameAvailable.mockResolvedValue({ available: true });
});

describe("Edit Profile form", () => {
  it("accepts keystrokes into Full Name, Phone and Bio — the regression test for the original typing bug", async () => {
    const user = userEvent.setup();
    renderEditProfile();

    const fullName = screen.getByLabelText("Full Name");
    await user.clear(fullName);
    await user.type(fullName, "Hello World");
    expect(fullName).toHaveValue("Hello World");

    const phone = screen.getByLabelText("Phone");
    await user.type(phone, "9876543210");
    expect(phone).toHaveValue("9876543210");

    const bio = screen.getByLabelText("Bio");
    await user.type(bio, "Weekend hiker.");
    expect(bio).toHaveValue("Weekend hiker.");
  });

  it("blocks submit and shows an inline error for a name that's too short, without calling the save mutation", async () => {
    const user = userEvent.setup();
    renderEditProfile();

    const fullName = screen.getByLabelText("Full Name");
    await user.clear(fullName);
    await user.type(fullName, "A");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("blocks submit and shows an inline error for a bio over 500 characters, without calling the save mutation", async () => {
    // The textarea's own maxLength stops a User from *typing* past 500, so the
    // over-limit case that matters is legacy data: a bio saved before the 500
    // cap existed, loaded unchanged into the form.
    currentUser = { ...baseUser, bio: "a".repeat(501) };
    const user = userEvent.setup();
    renderEditProfile();

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Max 500 characters")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows an inline error for an unavailable username before submit", async () => {
    usernameAvailable.mockResolvedValue({ available: false });
    const user = userEvent.setup();
    renderEditProfile();

    const username = screen.getByLabelText("Username");
    await user.clear(username);
    await user.type(username, "takenname");

    await waitFor(() => expect(usernameAvailable).toHaveBeenCalled());
    expect(await screen.findByText("That username is already taken")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows an inline error for a malformed username", async () => {
    const user = userEvent.setup();
    renderEditProfile();

    const username = screen.getByLabelText("Username");
    await user.clear(username);
    await user.type(username, "1x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(/lowercase letters, digits or underscores/i),
    ).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects a non-JPG/PNG/WEBP file without attempting an upload", async () => {
    // applyAccept: false — the input's accept="image/jpeg,image/png,image/webp"
    // is a file-picker hint a User can bypass (drag-drop, "All Files"), not a
    // hard block, so the app's own validation is what must catch this.
    const user = userEvent.setup({ applyAccept: false });
    renderEditProfile();

    const file = new File(["gif-bytes"], "photo.gif", { type: "image/gif" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText("Only JPG, PNG or WEBP allowed")).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("rejects a file over the 2 MB cap without attempting an upload", async () => {
    const user = userEvent.setup();
    renderEditProfile();

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, big);

    expect(await screen.findByText("Max size 2 MB")).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("removing an existing photo clears it and falls back to the initial-letter avatar", async () => {
    currentUser = { ...baseUser, avatarUrl: "/uploads/avatars/user-1/photo.jpg" };
    const user = userEvent.setup();
    renderEditProfile();

    expect(
      document.querySelector('img[src$="/uploads/avatars/user-1/photo.jpg"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument(); // initial-letter fallback for "Asha R"
  });

  it("renders no Language field and no Change Email control", async () => {
    renderEditProfile();

    expect(screen.queryByText("Language")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change email/i })).not.toBeInTheDocument();
    // Email is still shown (read-only, in both Contact Details and Email
    // Verification), but not as an editable field.
    expect(screen.getAllByText("asha@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});
