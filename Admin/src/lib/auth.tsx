import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CurrentUser } from "./api";

/**
 * Real session auth and permission-driven access for the Admin panel.
 *
 * This replaces RoleContext, which was a demo switcher: `role: "super" | "owner"`,
 * defaulting to Super Admin, with a setRole toggle and no authentication at all.
 * Anyone with the URL was a Super Admin.
 *
 * Access is decided by permissions, not role names. That's the whole point of the
 * RBAC module: a Super Admin can create a custom Role out of per-module
 * permissions, and branching on names would leave a "Content Moderator" seeing
 * the Business Owner UI or nothing — an admin panel contradicting its own Roles &
 * Permissions screen.
 *
 * These checks are advisory. Every endpoint guards itself; hiding a control is a
 * courtesy so we never offer a button the API will refuse.
 */

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "publish";

interface AuthState {
  user: CurrentUser | null;
  isSignedIn: boolean;
  /** True until the first /auth/me settles — distinct from "signed out". */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<CurrentUser>;
  signOut: () => Promise<void>;
  can: (module: string, action: PermissionAction) => boolean;
  /** Any permission on a module — the usual question for "should this nav item exist". */
  canAccess: (module: string) => boolean;
  /** FR160: a Super Admin is viewing as someone else. */
  isImpersonating: boolean;
  impersonate: (userId: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const CURRENT_USER_KEY = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: ({ signal }) => api.auth.me(signal),
    // 401 is the normal answer for a signed-out caller, not a failure to retry.
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const user = data ?? null;

  const signIn = useMutation({
    mutationFn: (vars: { email: string; password: string }) => api.auth.login(vars),
    onSuccess: (u) => queryClient.setQueryData(CURRENT_USER_KEY, u),
  });

  const signOut = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      queryClient.clear();
    },
  });

  const impersonate = useMutation({
    mutationFn: (userId: string) => api.users.impersonate(userId),
    onSuccess: (u) => {
      queryClient.setQueryData(CURRENT_USER_KEY, u);
      // Everything on screen belonged to the admin; none of it is theirs now.
      queryClient.invalidateQueries();
    },
  });

  const exitImpersonation = useMutation({
    mutationFn: () => api.auth.exitImpersonation(),
    onSuccess: (u) => {
      queryClient.setQueryData(CURRENT_USER_KEY, u);
      queryClient.invalidateQueries();
    },
  });

  const can = (module: string, action: PermissionAction) =>
    Boolean(user?.permissions?.some((p) => p.module === module && p.action === action));

  const value: AuthState = {
    user,
    isSignedIn: user !== null,
    isLoading,
    can,
    canAccess: (module) => Boolean(user?.permissions?.some((p) => p.module === module)),
    isImpersonating: Boolean(user?.impersonatedBy),
    signIn: async (email, password) => signIn.mutateAsync({ email, password }),
    signOut: async () => {
      await signOut.mutateAsync();
    },
    impersonate: async (userId) => {
      await impersonate.mutateAsync(userId);
    },
    exitImpersonation: async () => {
      await exitImpersonation.mutateAsync();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
