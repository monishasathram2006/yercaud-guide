import { useEffect, useState, type ReactNode } from "react";
import { Mail, Phone, User, MessageSquare, CheckCircle2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Props {
  /** The Listing being enquired about — an Enquiry always belongs to one (CONTEXT.md). */
  listingId: string;
  listingName?: string;
  title?: string;
  submitLabel?: string;
  subjectDefault?: string;
  extraFields?: ReactNode;
  compact?: boolean;
}

/**
 * The platform's only conversion mechanism (ADR 0001): a visitor sends an
 * Enquiry, and then arranges everything directly with the Business
 * off-platform. There is no booking and no payment.
 *
 * It used to validate the form and then call setSent(true) — the message went
 * nowhere. It now posts, and no account is needed (FR46).
 */
export function EnquiryForm({
  listingId,
  listingName,
  title = "Have a Question? 🍃",
  submitLabel = "Send Enquiry",
  subjectDefault,
  extraFields,
  compact,
}: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<{ name: string; email: string; phone: string; message: string }>({
    name: "", email: "", phone: "", message: subjectDefault ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Prefill for a signed-in User, once their session resolves — they shouldn't
  // retype what we already know. Only fills blanks, so it never overwrites
  // something they've started typing.
  useEffect(() => {
    if (!user) return;
    setState((prev) => ({
      ...prev,
      name: prev.name || user.name,
      email: prev.email || user.email,
      phone: prev.phone || user.phone || "",
    }));
  }, [user]);

  const send = useMutation({
    mutationFn: () =>
      api.listings.submitEnquiry(listingId, {
        name: state.name.trim(),
        email: state.email.trim(),
        phone: state.phone.trim() || undefined,
        message: state.message.trim(),
      }),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (state.name.trim().length < 2) err.name = "Enter your name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email)) err.email = "Enter a valid email";
    if (state.phone && !/^[0-9+\-\s]{7,}$/.test(state.phone)) err.phone = "Enter a valid phone";
    if (state.message.trim().length < 5) err.message = "Add a short message";
    setErrors(err);
    if (Object.keys(err).length) return;
    send.mutate();
  }

  const sent = send.isSuccess;

  if (sent) {
    return (
      <div className={`rounded-2xl border border-[#1E7A46]/20 bg-[#1E7A46]/5 ${compact ? "p-5" : "p-6"} text-center`}>
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#1E7A46]" />
        <h3 className="mt-3 font-bold text-gray-900">Enquiry sent!</h3>
        <p className="mt-1 text-sm text-gray-600">
          {listingName ? `${listingName} will get back to you shortly by email or phone.` : "The business owner will get back to you shortly by email or phone."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`rounded-2xl border border-gray-100 bg-white ${compact ? "p-5" : "p-6"} shadow-sm`}>
      {title && <h3 className="mb-4 font-bold text-gray-900">{title}</h3>}
      <div className="space-y-3">
        <Field icon={User} label="Your Name" placeholder="Enter your name" value={state.name} onChange={(v) => setState({ ...state, name: v })} error={errors.name} />
        <Field icon={Mail} label="Email Address" placeholder="Enter your email" type="email" value={state.email} onChange={(v) => setState({ ...state, email: v })} error={errors.email} />
        <Field icon={Phone} label="Phone Number" placeholder="Enter your phone number" value={state.phone} onChange={(v) => setState({ ...state, phone: v })} error={errors.phone} />
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
            <MessageSquare className="h-3.5 w-3.5" /> Your Message
          </label>
          <textarea
            value={state.message}
            onChange={(e) => setState({ ...state, message: e.target.value })}
            placeholder="Type your message here..."
            rows={compact ? 3 : 4}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1E7A46] focus:outline-none"
          />
          {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
        </div>
        {extraFields}
      </div>
      {send.isError && (
        <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
          {send.error instanceof Error ? send.error.message : "Could not send your enquiry. Please try again."}
        </p>
      )}
      <button
        type="submit"
        disabled={send.isPending}
        className="mt-4 w-full rounded-lg bg-[#1E7A46] py-2.5 text-sm font-medium text-white hover:bg-[#186238] disabled:opacity-60"
      >
        {send.isPending ? "Sending…" : submitLabel}
      </button>
      <p className="mt-2 text-center text-xs text-gray-500">Typically replies within a few hours</p>
      <p className="mt-1 text-center text-[11px] text-gray-500">Availability and final pricing are confirmed directly with the business.</p>
    </form>
  );
}

function Field({ icon: Icon, label, ...p }: { icon: typeof User; label: string; placeholder?: string; type?: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      <input
        type={p.type ?? "text"}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1E7A46] focus:outline-none"
      />
      {p.error && <p className="mt-1 text-xs text-red-600">{p.error}</p>}
    </div>
  );
}
