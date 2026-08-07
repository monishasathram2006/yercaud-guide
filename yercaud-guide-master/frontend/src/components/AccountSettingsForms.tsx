import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, ApiError } from "@/lib/api";
import { CURRENT_USER_KEY } from "@/lib/auth";

/**
 * Change Password / Set Password (issue #13) — the same form either way, just
 * a different first field. hasPassword (from CurrentUser) is the only signal
 * for which mode this is: a Google-only account has never had one to verify.
 */
export function ChangePasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.me.changePassword(hasPassword ? { currentPassword, newPassword } : { newPassword }),
    onSuccess: () => {
      // A Google-only account just went from hasPassword: false to true —
      // without this, Account Settings would keep showing "Set Password".
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
      onDone();
    },
    onError: (e) => setErr(e instanceof ApiError && e.status === 401 ? "Current password is incorrect." : "Something went wrong. Please try again."),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr("");
        mutation.mutate();
      }}
      className="space-y-3"
    >
      {hasPassword && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">New Password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button disabled={mutation.isPending} className="w-full rounded-lg bg-[#1E7A46] py-2 text-sm font-medium text-white hover:bg-[#186238] disabled:opacity-70">
        {mutation.isPending ? "Saving…" : hasPassword ? "Change Password" : "Set Password"}
      </button>
    </form>
  );
}

/** Delete Account (issue #13) — type-to-confirm rather than a password re-prompt, since a Google-only account has no password to re-enter. */
export function DeleteAccountForm({ userId, onCancel }: { userId: string; onCancel: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.me.deleteAccount(userId),
    onSuccess: () => {
      // The row (and its sessions) are already gone server-side — just catch
      // the client's cache up and land back on the site signed out.
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      queryClient.invalidateQueries();
      navigate({ to: "/" });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Something went wrong. Please try again."),
  });

  const canConfirm = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        This permanently deletes your account. Type <strong>DELETE</strong> below to confirm.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="Type DELETE"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => mutation.mutate()}
          disabled={!canConfirm || mutation.isPending}
          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Deleting…" : "Delete My Account"}
        </button>
      </div>
    </div>
  );
}
