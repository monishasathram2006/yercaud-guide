/** Shared by My Enquiries / My Reviews / My Favorites (issue #13) — a Listing's photo, or the same neutral placeholder BusinessCard already uses for one with none. */
export function ListingThumb({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  if (src) return <img src={src} alt={alt} className={`${className} object-cover`} />;
  return <div className={`${className} grid place-items-center bg-gray-100 text-xs text-gray-400`}>No photo yet</div>;
}
