import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { HERO_IMG } from "@/lib/data";
import { googleSignInUrl } from "@/lib/api";
import { GoogleButton } from "@/components/GoogleButton";
import { Eye, EyeOff } from "lucide-react";

interface LoginSearch {
  error?: "google_failed";
  redirect?: string;
}

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_failed:
    "Google sign-in didn't go through. Please try again or sign in with your email and password.",
};

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Yercaud Business Directory" },
      { name: "description", content: "Sign in to your Yercaud Guide account." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    error: search.error === "google_failed" ? "google_failed" : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { error: googleError, redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErr("Enter a valid email");
      return;
    }
    if (password.length < 4) {
      setErr("Password too short");
      return;
    }
    setErr("");
    setLoading(true);
    await signIn(email, password);
    // redirect is where the visitor was — e.g. a Listing page they clicked
    // "Sign in to reveal contact info" from — falling back to home the same
    // way this route already did before `redirect` existed.
    navigate({ to: redirect || "/" });
  }
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#1E7A46]/70" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Yercaud Guide"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <div>
              <div className="text-lg font-extrabold">YERCAUD</div>
              <div className="-mt-0.5 text-[11px] opacity-80">Business Directory</div>
            </div>
          </Link>
          <div>
            <h2 className="text-3xl font-bold">Welcome back</h2>
            <p className="mt-2 text-sm text-white/80">
              Sign in to save favorites, send enquiries and track your Yercaud plans in one place.
            </p>
          </div>
          <div className="text-xs opacity-70">© 2025 Yercaud Business Directory</div>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
          <p className="mt-1 text-sm text-gray-600">
            New here?{" "}
            <Link to="/register" search={{ redirect }} className="font-medium text-[#1E7A46]">
              Create an account
            </Link>
          </p>
          {googleError && (
            <p className="mt-4 text-xs text-red-600">{GOOGLE_ERROR_MESSAGES[googleError]}</p>
          )}
          <div className="mt-6">
            <GoogleButton href={googleSignInUrl()} label="Continue with Google" />
            <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
              <div className="h-px flex-1 bg-gray-200" /> or{" "}
              <div className="h-px flex-1 bg-gray-200" />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[#1E7A46]" /> Remember me
              </label>
              <Link to="/forgot-password" className="font-medium text-[#1E7A46]">
                Forgot password?
              </Link>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button
              disabled={loading}
              className="w-full rounded-lg bg-[#1E7A46] py-2.5 text-sm font-medium text-white hover:bg-[#186238] disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
