import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { CheckCircle2 } from "lucide-react";
import { Mock } from "@/components/MockBadge";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — Yercaud Business Directory" }, { name: "description", content: "Choose a new password." }] }),
  component: ResetPage,
});

function ResetPage() {
  const [p, setP] = useState(""); const [c, setC] = useState(""); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p.length < 6) return setErr("Password too short");
    if (p !== c) return setErr("Passwords do not match");
    setErr(""); setDone(true);
  }
  return (
    <PageShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        {done ? (
          <div className="mt-6 rounded-xl bg-[#1E7A46]/10 p-4 text-sm text-[#1E7A46]"><CheckCircle2 className="mb-1 h-5 w-5" /> Password updated. <Link to="/login" className="font-medium underline">Sign in</Link>.</div>
        ) : (
          <Mock note="Fake submit — backend POST /auth/password-reset/confirm exists but is not called; no token is read from the URL" className="mt-6">
          <form onSubmit={submit} className="space-y-3 p-1">
            <input type="password" placeholder="New password" value={p} onChange={(e) => setP(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input type="password" placeholder="Confirm password" value={c} onChange={(e) => setC(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button className="w-full rounded-lg bg-[#1E7A46] py-2.5 text-sm font-medium text-white">Reset password</button>
          </form>
          </Mock>
        )}
      </div>
    </PageShell>
  );
}
