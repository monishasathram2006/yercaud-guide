import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { BlogPostSummary } from "@/lib/api";

/**
 * A Featured Blog card (issue #21) — deliberately simpler than the Listing
 * cards: BlogPostSummary carries no category name/color or author name (just
 * their ids), and resolving those here would reintroduce the N+1 the
 * Featured endpoint was built to avoid. Cover image, title, excerpt, and
 * reading time are what BlogPostSummary actually gives us.
 */
export function BlogPostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group block h-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="aspect-[16/10] overflow-hidden bg-gray-100">
        {post.coverImage ? (
          <img
            src={post.coverImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-gray-400">No photo yet</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-2">{post.title}</h3>
        {post.excerpt && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{post.excerpt}</p>}
        {post.readingTimeMinutes && (
          <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" /> {post.readingTimeMinutes} min read
          </div>
        )}
      </div>
    </Link>
  );
}
