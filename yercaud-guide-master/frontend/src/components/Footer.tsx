import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Facebook, Instagram, Twitter, Youtube, Heart, CheckCircle2 } from "lucide-react";
import { Mock } from "@/components/MockBadge";
import { api } from "@/lib/api";

export function Footer() {
  return (
    <>
      <section className="bg-[#0f172a] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-center">
          <div>
            <h3 className="text-xl font-bold">Stay Updated with Yercaud</h3>
            <p className="mt-1 text-sm text-white/70">
              Subscribe to get updates on the best deals, events and travel tips.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="Yercaud Guide"
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div className="leading-tight">
                  <div className="text-base font-extrabold text-[#1E7A46]">YERCAUD</div>
                  <div className="-mt-0.5 text-[11px] text-gray-500">Business Directory</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Your one-stop directory to discover the best hotels, restaurants, activities,
                travels and services in Yercaud.
              </p>
            </div>

            <FooterCol
              title="Quick Links"
              links={[
                { label: "Home", to: "/" },
                { label: "Hotels", to: "/hotels" },
                { label: "Restaurants", to: "/restaurants" },
                { label: "Activities", to: "/activities" },
                { label: "Tours & Travels", to: "/tours" },
                { label: "Directory", to: "/directory" },
              ]}
            />
            <FooterCol
              title="Top Categories"
              links={[
                { label: "Hotels", to: "/hotels" },
                { label: "Restaurants", to: "/restaurants" },
                { label: "Activities", to: "/activities" },
                { label: "Tours & Travels", to: "/tours" },
              ]}
            />
            <FooterCol
              title="Explore"
              links={[
                { label: "About Yercaud", to: "/about" },
                { label: "Blog", to: "/blog" },
                { label: "FAQ", to: "/faq" },
                { label: "Contact Us", to: "/contact" },
              ]}
            />
            <div>
              <FooterCol
                title="Support"
                links={[
                  { label: "Help Center", to: "/faq" },
                  { label: "Contact Us", to: "/contact" },
                  { label: "Privacy Policy", to: "/about" },
                  { label: "List Your Business", to: "/list-your-business" },
                ]}
              />
              <Mock note='Social links go nowhere (href="#")' className="mt-6">
                <div className="flex gap-3 p-1">
                  {[Facebook, Instagram, Twitter, Youtube].map((Icon, i) => (
                    <a
                      key={i}
                      href="#"
                      className="grid h-9 w-9 place-items-center rounded-full bg-[#1E7A46]/10 text-[#1E7A46] hover:bg-[#1E7A46] hover:text-white"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </Mock>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-gray-100 pt-6 text-xs text-gray-500 sm:flex-row">
            <div>© 2025 Yercaud Business Directory. All rights reserved.</div>
            <div className="flex items-center gap-1">
              Made with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> for Yercaud
            </div>
          </div>
          <div className="mt-3 text-center text-[11px] text-gray-400">
            Built by{" "}
            <a
              href="https://deepwebstudio.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#1E7A46] hover:underline"
            >
              deepwebstudio
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const subscribe = useMutation({
    mutationFn: () => api.content.subscribe({ email: email.trim(), source: "footer" }),
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

  if (subscribe.isSuccess) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-[#1E7A46]/20 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-[#1E7A46]" /> Thanks — you're subscribed.
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        placeholder="Enter your email"
        aria-label="Email address"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setInvalid(false);
        }}
        className="flex-1 rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-[#1E7A46] focus:outline-none"
      />
      <button
        type="submit"
        disabled={subscribe.isPending}
        className="rounded-md bg-[#1E7A46] px-5 py-2.5 text-sm font-medium hover:bg-[#186238] disabled:opacity-70"
      >
        {subscribe.isPending ? "Subscribing..." : "Subscribe"}
      </button>
      {invalid && <div className="text-xs text-red-300 sm:absolute">Enter a valid email</div>}
      {subscribe.isError && (
        <div className="text-xs text-red-300 sm:absolute">
          {subscribe.error instanceof Error
            ? subscribe.error.message
            : "Something went wrong. Please try again."}
        </div>
      )}
    </form>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-semibold text-gray-900">{title}</h4>
      <ul className="space-y-2 text-sm text-gray-600">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="hover:text-[#1E7A46]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
