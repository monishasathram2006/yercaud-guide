/** "Continue with Google" (issue #12) — a plain anchor, not a button/onClick:
 * this is a full browser navigation to the backend's /auth/google redirect,
 * not a fetch, so the browser can follow Google's own redirect chain and come
 * back with a session cookie already set. */
export function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
    >
      <GoogleLogo />
      {label}
    </a>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 7 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.5-5.5C29.6 34.9 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.5 5.5C41.5 35.7 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
