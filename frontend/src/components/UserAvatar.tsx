import { useState } from "react";
import { resolveUploadUrl } from "@/lib/api";

/**
 * Falls back to an initial letter whenever there's no avatarUrl, or the URL
 * fails to load (e.g. a Google photo URL blocked by an ad blocker/privacy
 * extension) — without this, a broken <img> renders as an empty box, which
 * looks identical to "no photo was ever captured".
 */
export function UserAvatar({
  src,
  name,
  className,
  fallbackClassName,
}: {
  src: string | null;
  name: string;
  /** Sizing/shape shared by both the image and the fallback (e.g. "h-7 w-7 rounded-full"). */
  className: string;
  /** Fallback-only styling (background/text color) — call sites vary here. */
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  // resolveUploadUrl leaves blob:/http(s): URLs (a local preview, a Google
  // photo) untouched — only a bare "/uploads/..." path from a real upload
  // needs the backend's origin prefixed on.
  const resolvedSrc = src?.startsWith("blob:") ? src : resolveUploadUrl(src);

  if (resolvedSrc && !failed) {
    return <img src={resolvedSrc} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${className} object-cover`} />;
  }
  return <span className={`${className} grid place-items-center ${fallbackClassName}`}>{name.charAt(0).toUpperCase()}</span>;
}
