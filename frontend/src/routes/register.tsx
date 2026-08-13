import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { HERO_IMG } from "@/lib/data";
import { googleSignInUrl } from "@/lib/api";
import { GoogleButton } from "@/components/GoogleButton";

interface RegisterSearch {
  redirect?: string;
}

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — Yercaud Business Directory" },
      { name: "description", content: "Create your Yercaud Guide account." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", agree: false });
  const [err, setErr] = useState("");
  const strength = f.password.length >= 10 ? "Strong" : f.password.length >= 6 ? "Medium" : "Weak";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) return setErr("Enter your name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return setErr("Enter a valid email");
    if (f.password.length < 6) return setErr("Password too short");
    if (f.password !== f.confirm) return setErr("Passwords do not match");
    if (!f.agree) return setErr("You must accept the terms");
    setErr("");
    await register(f.name, f.email, f.password);
    // Same "return to where the sign-in prompt sent you" behavior as
    // login.tsx's redirect, so the contact-info gate's "Create Account"
    // button lands back on the Listing too, not just "Sign In" does.
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
            </div>
          </Link>
          <div>
            <h2 className="text-3xl font-bold">Join Yercaud Guide</h2>
            <p className="mt-2 text-sm text-white/80">
              Save your favorite places and reach local businesses directly.
            </p>
          </div>
          <div className="text-xs opacity-70">© 2025 Yercaud Business Directory</div>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-600">
            Already have an account?{" "}
            <Link to="/login" search={{ redirect }} className="font-medium text-[#1E7A46]">
              Sign In
            </Link>
          </p>
          <GoogleButton href={googleSignInUrl()} label="Continue with Google" />
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" /> or{" "}
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <Fld label="Full Name" v={f.name} on={(v) => setF({ ...f, name: v })} />
          <Fld label="Email" type="email" v={f.email} on={(v) => setF({ ...f, email: v })} />
          <Fld
            label="Password"
            type="password"
            v={f.password}
            on={(v) => setF({ ...f, password: v })}
          />
          {f.password && (
            <div className="text-xs text-gray-600">
              Password strength:{" "}
              <span
                className={
                  strength === "Strong"
                    ? "text-[#1E7A46]"
                    : strength === "Medium"
                      ? "text-yellow-600"
                      : "text-red-600"
                }
              >
                {strength}
              </span>
            </div>
          )}
          <Fld
            label="Confirm Password"
            type="password"
            v={f.confirm}
            on={(v) => setF({ ...f, confirm: v })}
          />
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={f.agree}
              onChange={(e) => setF({ ...f, agree: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[#1E7A46]"
            />{" "}
            I agree to the Terms of Service and Privacy Policy.
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button className="w-full rounded-lg bg-[#1E7A46] py-2.5 text-sm font-medium text-white hover:bg-[#186238]">
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}
function Fld({
  label,
  v,
  on,
  type = "text",
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        value={v}
        onChange={(e) => on(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
