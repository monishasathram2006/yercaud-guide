import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/AccountSettingsForms";
import { ApiError } from "@/lib/api";
import { renderWithClient } from "../test-utils";

/**
 * Component tests for the Account Settings forms (issue #13) — Change/Set
 * Password and Delete Account. Both take their data via props (no route
 * context needed), so these render the components directly rather than
 * going through profile.tsx.
 */

const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
}));

const changePassword = vi.fn();
const deleteAccount = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      me: {
        changePassword: (...args: unknown[]) => changePassword(...args),
        deleteAccount: (...args: unknown[]) => deleteAccount(...args),
      },
    },
  };
});

// Current/New Password labels aren't associated with their inputs (no
// htmlFor/id), so getByLabelText can't find them — query by position instead.
function passwordInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('input[type="password"]'));
}

beforeEach(() => {
  navigateSpy.mockReset();
  changePassword.mockReset();
  deleteAccount.mockReset();
});

describe("ChangePasswordForm", () => {
  it("shows a Current Password field and a Change Password button when hasPassword is true", () => {
    renderWithClient(<ChangePasswordForm hasPassword={true} onDone={vi.fn()} />);

    expect(screen.getByText("Current Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Password" })).toBeInTheDocument();
  });

  it("hides Current Password and shows a Set Password button for a Google-only account (hasPassword: false)", () => {
    renderWithClient(<ChangePasswordForm hasPassword={false} onDone={vi.fn()} />);

    expect(screen.queryByText("Current Password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Password" })).toBeInTheDocument();
  });

  it("submits current + new password, and calls onDone on success", async () => {
    changePassword.mockResolvedValue(undefined);
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ChangePasswordForm hasPassword={true} onDone={onDone} />);

    const [current, newPass] = passwordInputs();
    await user.type(current, "oldpass123");
    await user.type(newPass, "newpass123");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "oldpass123",
        newPassword: "newpass123",
      }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("submits only the new password when setting a password for the first time (hasPassword: false)", async () => {
    changePassword.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithClient(<ChangePasswordForm hasPassword={false} onDone={vi.fn()} />);

    await user.type(passwordInputs()[0], "newpass123");
    await user.click(screen.getByRole("button", { name: "Set Password" }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ newPassword: "newpass123" }));
  });

  it("shows a specific error for a wrong current password (401), without calling onDone", async () => {
    changePassword.mockRejectedValue(new ApiError(401, "Unauthorized"));
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ChangePasswordForm hasPassword={true} onDone={onDone} />);

    const [current, newPass] = passwordInputs();
    await user.type(current, "wrongpass");
    await user.type(newPass, "newpass123");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows a generic error for any other failure", async () => {
    changePassword.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderWithClient(<ChangePasswordForm hasPassword={true} onDone={vi.fn()} />);

    const [current, newPass] = passwordInputs();
    await user.type(current, "oldpass123");
    await user.type(newPass, "newpass123");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});

describe("DeleteAccountForm", () => {
  it("disables the delete button until DELETE is typed", async () => {
    const user = userEvent.setup();
    renderWithClient(<DeleteAccountForm userId="user-1" onCancel={vi.fn()} />);

    const deleteButton = screen.getByRole("button", { name: "Delete My Account" });
    expect(deleteButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Type DELETE"), "not delete");
    expect(deleteButton).toBeDisabled();

    await user.clear(screen.getByPlaceholderText("Type DELETE"));
    await user.type(screen.getByPlaceholderText("Type DELETE"), "delete");
    expect(deleteButton).toBeEnabled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<DeleteAccountForm userId="user-1" onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("deletes the account and navigates home on success", async () => {
    deleteAccount.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithClient(<DeleteAccountForm userId="user-1" onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Type DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete My Account" }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("user-1"));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith({ to: "/" }));
  });

  it("shows the API's error message on failure, without navigating away", async () => {
    deleteAccount.mockRejectedValue(new ApiError(500, "Could not delete account"));
    const user = userEvent.setup();
    renderWithClient(<DeleteAccountForm userId="user-1" onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Type DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete My Account" }));

    expect(await screen.findByText("Could not delete account")).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
