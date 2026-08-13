import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CurrentUser } from "./api";

/**
 * Real session auth.
 *
 * This used to sleep 400ms and write a canned user to localStorage. The session
 * is now an httpOnly cookie the browser holds and this code cannot read — which
 * is the point: a session in localStorage is a session any script on the page
 * can steal.
 *
 * Deliberately client-side only. SSR renders anonymous content (that's what
 * makes the directory indexable without forwarding cookies through the server),
 * so /auth/me runs after hydration. The cost is a frame of signed-out header on
 * first paint; the benefit is that a personalized response can never be cached
 * and served to the wrong visitor.
 */

interface AuthState {
  user: CurrentUser | null;
  isSignedIn: boolean;
  /** True until the first /auth/me settles — distinct from "signed out". */
  isLoading: boolean;
  /** True only while a Super Admin is viewing as someone else (FR160). */
  impersonating: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Every permission the caller holds, unioned across their Roles. Empty for a visitor. */
  can: (module: string, action: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export const CURRENT_USER_KEY = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: ({ signal }) => api.auth.me(signal),
    // 401 is the normal answer for a visitor, not a failure worth retrying.
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
    // A signed-out visitor must not hit an error boundary.
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  const user = data ?? null;

  const signInMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) => api.auth.login(vars),
    onSuccess: (u) => queryClient.setQueryData(CURRENT_USER_KEY, u),
  });

  const registerMutation = useMutation({
    mutationFn: (vars: { name: string; email: string; password: string }) => api.auth.register(vars),
    onSuccess: (u) => queryClient.setQueryData(CURRENT_USER_KEY, u),
  });

  const signOutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      // Favourites and anything else keyed to the person are no longer theirs.
      queryClient.invalidateQueries();
    },
  });

  const value: AuthState = {
    user,
    isSignedIn: user !== null,
    isLoading,
    impersonating: Boolean(user?.impersonatedBy),
    signIn: async (email, password) => {
      await signInMutation.mutateAsync({ email, password });
    },
    register: async (name, email, password) => {
      await registerMutation.mutateAsync({ name, email, password });
    },
    signOut: async () => {
      await signOutMutation.mutateAsync();
    },
    // Advisory: the API guards every endpoint itself. This only decides what to
    // render, so we never offer a button the API will refuse.
    can: (module, action) => Boolean(user?.permissions?.some((p) => p.module === module && p.action === action)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
