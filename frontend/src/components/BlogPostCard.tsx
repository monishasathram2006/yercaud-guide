import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { resolveUploadUrl, type BlogPostSummary } from "@/lib/api";
import { categoryColor } from "@/lib/blog-category-colors";

/**
 * A Featured Blog card (issue #21) — deliberately simpler than the Listing
 * cards: BlogPostSummary carries no category color (just categoryId), and
 * resolving it here would reintroduce the N+1 the Featured endpoint was
 * built to avoid. `categoryName` is optional and left to callers who already
 * have both the posts and categories lists in scope (e.g. blog.index.tsx) —
 * the card itself never fetches.
 */
export function BlogPostCard({ post, categoryName }: { post: BlogPostSummary; categoryName?: string }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group block h-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="aspect-[16/10] overflow-hidden bg-gray-100">
        {post.coverImage ? (
          <img
            src={resolveUploadUrl(post.coverImage) ?? undefined}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-gray-400">No photo yet</div>
        )}
      </div>
      <div className="p-4">
        {categoryName && (
          <span className={`mb-1.5 inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${categoryColor(post.categoryId).bg} ${categoryColor(post.categoryId).text}`}>
            {categoryName}
          </span>
        )}
        <h3 className="font-semibold text-gray-900 line-clamp-2">{post.title}</h3>
        {post.excerpt && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{post.excerpt}</p>}
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
          {post.publishedAt && <span>{formatShortDate(post.publishedAt)}</span>}
          {post.readingTimeMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {post.readingTimeMinutes} min read
            </span>
          )}
        </div>
        <span className="mt-2 inline-block text-sm font-medium text-[#1E7A46] group-hover:underline">Read More →</span>
      </div>
    </Link>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
