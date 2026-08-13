import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

/** Same api.content.subscribe mutation Footer.tsx's NewsletterForm uses — shared by the blog list and detail page sidebars. */
export function BlogNewsletterBox() {
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const subscribe = useMutation({
    mutationFn: () => api.content.subscribe({ email: email.trim(), source: "blog" }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    subscribe.mutate();
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#1E7A46] text-white">
        <Mail className="h-5 w-5" />
      </div>
      <h3 className="mt-3 font-bold text-gray-900">Subscribe to Our Newsletter</h3>
      <p className="mt-1 text-xs text-gray-600">Get weekly travel tips and new Yercaud guides.</p>
      {subscribe.isSuccess ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-[#1E7A46]" /> Subscribed!
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2 text-left">
          <input
            type="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setInvalid(false);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={subscribe.isPending}
            className="w-full rounded-lg bg-[#1E7A46] px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
          >
            {subscribe.isPending ? "…" : "Subscribe"}
          </button>
        </form>
      )}
      {invalid && <p className="mt-2 text-xs text-red-600">Enter a valid email</p>}
      {subscribe.isError && (
        <p className="mt-2 text-xs text-red-600">
          {subscribe.error instanceof Error ? subscribe.error.message : "Something went wrong. Please try again."}
        </p>
      )}
      {!subscribe.isSuccess && !subscribe.isError && (
        <p className="mt-2 text-[11px] text-gray-400">We respect your privacy. Unsubscribe anytime.</p>
      )}
    </div>
  );
}
