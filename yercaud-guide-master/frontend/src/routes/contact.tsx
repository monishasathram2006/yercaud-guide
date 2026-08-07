import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { contactContent, faqs } from "@/lib/data";
import { Mock } from "@/components/MockBadge";
import { Phone, Mail, MapPin, MessageCircle, Headphones, CheckCircle2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact Us — Yercaud Business Directory" }, { name: "description", content: "Get in touch with the Yercaud Business Directory team." }] }),
  component: Contact,
});

const iconMap = { Phone, Mail, MapPin, MessageCircle, Headphones } as const;

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: contactContent.subjects[0], phone: "", message: "", agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (form.name.trim().length < 2) err.name = "Enter your name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) err.email = "Enter a valid email";
    if (form.message.trim().length < 10) err.message = "Message too short";
    if (form.message.length > 1000) err.message = "Message too long";
    if (!form.agree) err.agree = "You must agree to the privacy policy";
    setErrors(err); if (Object.keys(err).length) return;
    setSent(true);
  }
  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Contact Us" }]} />
      <section className="mx-auto max-w-7xl px-6 py-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Contact Us 🍃</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">Questions, partnerships or feedback — we'd love to hear from you.</p>
      </section>
      <section className="mx-auto max-w-7xl px-6">
        <Mock note="Static contactContent from lib/data.ts — backend GET /content-blocks/contact exists but is not used">
        <div className="grid gap-4 p-1 sm:grid-cols-2 lg:grid-cols-5">
          {contactContent.methods.map((m) => {
            const Icon = iconMap[m.icon as keyof typeof iconMap];
            return (
              <div key={m.title} className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1E7A46]/10 text-[#1E7A46]"><Icon className="h-5 w-5" /></div>
                <div className="mt-3 text-sm font-bold text-gray-900">{m.title}</div>
                <div className="mt-1 text-sm text-gray-700">{m.detail}</div>
                <div className="text-xs text-gray-500">{m.sub}</div>
              </div>
            );
          })}
        </div>
        </Mock>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[1fr_1fr]">
        <Mock note="Fake submit — backend POST /contact-messages exists but api.content.sendMessage is never called">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Send Us a Message 🍃</h2>
          {sent ? (
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#1E7A46]/10 p-4 text-sm text-[#1E7A46]"><CheckCircle2 className="h-5 w-5" /> Thanks! Your message has been sent — we'll be in touch soon.</div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <F label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} err={errors.name} />
                <F label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} err={errors.email} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Subject</label>
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {contactContent.subjects.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <F label="Phone (optional)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Message</label>
                <textarea rows={5} maxLength={1000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-lg border border-gray-200 p-3 text-sm" />
                <div className="mt-1 flex justify-between text-xs text-gray-500"><span>{errors.message && <span className="text-red-600">{errors.message}</span>}</span><span>{form.message.length}/1000</span></div>
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#1E7A46]" />
                <span>I agree to the Privacy Policy and consent to being contacted.</span>
              </label>
              {errors.agree && <p className="text-xs text-red-600">{errors.agree}</p>}
              <button className="rounded-lg bg-[#1E7A46] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#186238]">Send Message</button>
            </form>
          )}
        </div>
        </Mock>
        <div className="space-y-6">
          <Mock note="Stock photo standing in for a real map; address is static contactContent">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">Our Location</h3>
            <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80" alt="Map" className="mt-3 h-56 w-full rounded-xl object-cover" />
            <p className="mt-2 text-sm text-gray-700">{contactContent.address}</p>
          </div>
          </Mock>
          <div className="grid items-center gap-3 rounded-2xl bg-[#1E7A46]/10 p-5 sm:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-bold text-gray-900">Explore Yercaud 🍃</h3>
              <p className="mt-1 text-sm text-gray-700">Browse hotels, restaurants, activities and more.</p>
            </div>
            <Link to="/directory" className="inline-flex items-center gap-1 rounded-lg bg-[#1E7A46] px-4 py-2 text-sm text-white">Explore Now <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-14">
        <Mock note="Static faqs from lib/data.ts — backend GET /faqs exists but is not used">
        <div className="p-1">
        <h2 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h2>
        <div className="mt-4 space-y-2">
          {faqs.slice(0, 5).map((f) => (
            <details key={f.q} className="rounded-xl border border-gray-100 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800">{f.q}</summary>
              <p className="mt-2 text-sm text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
        <Link to="/faq" className="mt-4 inline-block text-sm font-medium text-[#1E7A46]">View All FAQs →</Link>
        </div>
        </Mock>
      </section>
    </PageShell>
  );
}

function F({ label, value, onChange, type = "text", err }: { label: string; value: string; onChange: (v: string) => void; type?: string; err?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1E7A46] focus:outline-none" />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
