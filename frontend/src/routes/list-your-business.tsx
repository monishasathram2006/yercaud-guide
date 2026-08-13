import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell, Breadcrumbs } from "@/components/PageShell";
import { CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { Mock } from "@/components/MockBadge";

export const Route = createFileRoute("/list-your-business")({
  head: () => ({ meta: [{ title: "List Your Business — Yercaud Business Directory" }, { name: "description", content: "Add your business to the Yercaud Business Directory." }] }),
  component: ListYourBusiness,
});

const steps = ["Business Details", "Contact & Address", "Logo & Social", "Review & Submit"] as const;

function ListYourBusiness() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState({
    name: "", category: "Hotel", description: "",
    phone: "", email: "", website: "", address: "",
    logo: "", facebook: "", instagram: "",
  });
  function set<K extends keyof typeof data>(k: K, v: string) { setData({ ...data, [k]: v }); }

  if (submitted) {
    return (
      <PageShell>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-[#1E7A46]" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Application Received</h1>
          <p className="mt-2 text-sm text-gray-600">Your application has been received and is pending approval. We'll email you once it's reviewed.</p>
          <Link to="/" className="mt-6 inline-block rounded-lg bg-[#1E7A46] px-6 py-2.5 text-sm font-medium text-white">Back to Home</Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "List Your Business" }]} />
      <section className="mx-auto max-w-4xl px-6 py-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">List Your Business on Yercaud Guide 🍃</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">Reach thousands of travellers looking for the best of Yercaud. Free basic listings, verified by our team.</p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <ol className="mb-8 flex flex-wrap items-center justify-between gap-2">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 text-xs ${i <= step ? "text-[#1E7A46]" : "text-gray-500"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-white ${i <= step ? "bg-[#1E7A46]" : "bg-gray-300"}`}>{i + 1}</span>
              <span className="font-medium">{s}</span>
            </li>
          ))}
        </ol>

        <Mock note="Fake submit — the wizard never calls the API; no public business-application endpoint is wired">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {step === 0 && (
            <div className="space-y-4">
              <F label="Business Name" value={data.name} onChange={(v) => set("name", v)} />
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                <select value={data.category} onChange={(e) => set("category", e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {["Hotel", "Restaurant", "Activity", "Travel", "Tours & Travels"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Short Description</label>
                <textarea rows={4} value={data.description} onChange={(e) => set("description", e.target.value)} className="w-full rounded-lg border border-gray-200 p-3 text-sm" />
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <F label="Phone" value={data.phone} onChange={(v) => set("phone", v)} />
              <F label="Email" type="email" value={data.email} onChange={(v) => set("email", v)} />
              <F label="Website" value={data.website} onChange={(v) => set("website", v)} />
              <F label="Address" value={data.address} onChange={(v) => set("address", v)} />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <F label="Logo URL" value={data.logo} onChange={(v) => set("logo", v)} />
              <F label="Facebook" value={data.facebook} onChange={(v) => set("facebook", v)} />
              <F label="Instagram" value={data.instagram} onChange={(v) => set("instagram", v)} />
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3 text-sm">
              <h3 className="text-lg font-bold text-gray-900">Review your details</h3>
              {Object.entries(data).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-gray-100 py-1"><span className="text-gray-500 capitalize">{k}</span><span className="text-gray-800">{v || "—"}</span></div>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-50"><ChevronLeft className="h-4 w-4" /> Back</button>
            {step < steps.length - 1 ? (
              <button onClick={() => setStep(step + 1)} className="inline-flex items-center gap-1 rounded-lg bg-[#1E7A46] px-5 py-2 text-sm text-white">Next <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button onClick={() => setSubmitted(true)} className="rounded-lg bg-[#1E7A46] px-6 py-2.5 text-sm font-medium text-white">Submit for Review</button>
            )}
          </div>
        </div>
        </Mock>
      </section>
    </PageShell>
  );
}

function F({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1E7A46] focus:outline-none" />
    </div>
  );
}
