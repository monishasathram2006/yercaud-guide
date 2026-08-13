import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { CheckCircle2 } from "lucide-react";
import { Mock } from "@/components/MockBadge";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password — Yercaud Business Directory" }, { name: "description", content: "Reset your Yercaud Guide password." }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <PageShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-gray-600">Enter your email and we'll send a reset link.</p>
        {sent ? (
          <div className="mt-6 rounded-xl bg-[#1E7A46]/10 p-4 text-sm text-[#1E7A46]"><CheckCircle2 className="mb-1 h-5 w-5" /> If that email exists, we've sent a reset link.</div>
        ) : (
          <Mock note="Fake submit — backend POST /auth/password-reset/request exists but is not called (and its email delivery is a console stub)" className="mt-6">
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-3 p-1">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <button className="w-full rounded-lg bg-[#1E7A46] py-2.5 text-sm font-medium text-white">Send reset link</button>
          </form>
          </Mock>
        )}
        <Link to="/login" className="mt-4 inline-block text-sm text-[#1E7A46]">← Back to Sign In</Link>
      </div>
    </PageShell>
  );
}
