import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      {children}
      <Footer />
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 pt-6 text-sm text-gray-600">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
          {it.to ? (
            <Link to={it.to} className="hover:text-[#1E7A46]">{it.label}</Link>
          ) : (
            <span className="text-[#1E7A46]">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function SignInPrompt({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{sub}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/login" className="rounded-lg bg-[#1E7A46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#186238]">Sign In</Link>
          <Link to="/register" className="rounded-lg border border-[#1E7A46] px-5 py-2.5 text-sm font-medium text-[#1E7A46] hover:bg-[#1E7A46]/5">Create Account</Link>
        </div>
      </div>
    </div>
  );
}
