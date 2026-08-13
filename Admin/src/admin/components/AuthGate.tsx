import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * The Admin panel's front door.
 *
 * It didn't have one: the app rendered straight into a Super Admin dashboard for
 * anyone who knew the URL, because `role` defaulted to "super" and nothing
 * authenticated. This is the whole panel's gate.
 *
 * Signing in isn't sufficient by itself — a plain visitor has a valid session and
 * no business here. Access needs at least one permission, which is what
 * distinguishes "has an account" from "works here".
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoading, user, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isSignedIn) return <SignInScreen />;

  // A signed-in User with no permissions is a public visitor who found this URL.
  if ((user?.permissions?.length ?? 0) === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">No access</h1>
          <p className="mt-2 text-sm text-slate-600">
            You're signed in as {user?.email}, but this account has no admin permissions.
          </p>
          <button
            onClick={() => void signOut()}
            className="mt-5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      // The API returns one generic message for a wrong password and an unknown
      // email alike, so this doesn't become an account-enumeration oracle.
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="grid min-h-screen place-items-center px-4"
      style={{ background: "linear-gradient(180deg, #0e2a3b 0%, #0b1f2e 100%)" }}
    >
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Yercaud Guide" className="h-14 w-14 rounded-full object-cover" />
          <div>
            <div className="font-extrabold leading-none tracking-wide text-emerald-700">YERCAUD</div>
            <div className="mt-1 text-[11px] text-slate-500">Admin Panel</div>
          </div>
        </div>

        <h1 className="mt-6 text-lg font-semibold text-slate-900">Sign in</h1>

        <label className="mt-4 block text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          required
        />

        <label className="mt-3 block text-xs font-medium text-slate-600">Password</label>
        <div className="relative mt-1">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm focus:border-emerald-500 focus:outline-none"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
