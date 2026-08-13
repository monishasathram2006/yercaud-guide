/**
 * Shared by profile.tsx, my-enquiries.tsx and my-reviews.tsx (issue #13) —
 * one set of query keys and status-badge colors instead of three copies.
 */
export const MY_ENQUIRIES_KEY = ["me", "enquiries"] as const;
export const MY_REVIEWS_KEY = ["me", "reviews"] as const;
export const MY_STATS_KEY = ["me", "stats"] as const;

export const ENQUIRY_STATUS_STYLES: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700",
  responded: "bg-[#1E7A46]/10 text-[#1E7A46]",
  closed: "bg-gray-100 text-gray-600",
};

export const REVIEW_STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-[#1E7A46]/10 text-[#1E7A46]",
  rejected: "bg-red-100 text-red-700",
};
