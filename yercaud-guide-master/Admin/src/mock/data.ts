// Mock data for Yercaud Business Directory admin panel.
// Frontend-only — populates every table, list, and chart.

export type Status =
  | "Published"
  | "Pending"
  | "Draft"
  | "Approved"
  | "Rejected"
  | "Confirmed"
  | "Cancelled"
  | "Active"
  | "Suspended"
  | "Connected"
  | "Disconnected"
  | "Synced"
  | "Sync Error";

export type Channel =
  | "Direct"
  | "Booking.com"
  | "Trivago"
  | "Expedia"
  | "Agoda"
  | "MakeMyTrip"
  | "TripAdvisor"
  | "Google Hotel Ads";

export const CATEGORIES = [
  { name: "Hotels", count: 48, pct: 23, color: "#16a34a" },
  { name: "Restaurants", count: 73, pct: 35, color: "#f97316" },
  { name: "Activities", count: 26, pct: 13, color: "#3b82f6" },
  { name: "Travel", count: 32, pct: 15, color: "#a855f7" },
  { name: "Tours & Travels", count: 18, pct: 9, color: "#ec4899" },
  { name: "Shopping", count: 41, pct: 20, color: "#0ea5e9" },
  { name: "Health & Wellness", count: 15, pct: 7, color: "#f59e0b" },
  { name: "Other Services", count: 27, pct: 13, color: "#64748b" },
];

const IMG = {
  hotel:
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&h=200&fit=crop",
  restaurant:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&h=200&fit=crop",
  adventure:
    "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=200&h=200&fit=crop",
  tour:
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=200&h=200&fit=crop",
};

export const KPI = {
  superAdmin: [
    { label: "Total Businesses", value: "512", change: 12.5, icon: "building" },
    { label: "Total Users", value: "1,248", change: 8.3, icon: "users" },
    { label: "Total Bookings", value: "763", change: 15.2, icon: "calendar" },
    { label: "Total Enquiries", value: "389", change: 10.1, icon: "message" },
    { label: "Total Views", value: "28,542", change: 18.7, icon: "eye" },
    { label: "Average Rating", value: "4.6", change: 0.2, icon: "star" },
  ],
  owner: [
    { label: "Total Views", value: "12,842", change: 14.2, icon: "eye" },
    { label: "Bookings", value: "142", change: 9.8, icon: "calendar" },
    { label: "Enquiries", value: "56", change: 5.1, icon: "message" },
    { label: "Avg. Rating", value: "4.7", change: 0.3, icon: "star" },
    { label: "Revenue", value: "₹4,82,300", change: 22.4, icon: "wallet" },
  ],
};

// Deterministic pseudo-random so SSR and client match.
function seeded(i: number, salt = 1) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Business Overview time series
export const OVERVIEW_SERIES = Array.from({ length: 30 }, (_, i) => {
  const d = i + 1;
  const added = 15 + Math.round(20 * Math.sin(i / 3) + seeded(i, 1) * 15);
  const approved = Math.round(added * (0.55 + seeded(i, 2) * 0.2));
  return { day: `Jun ${d}`, added: Math.max(5, added), approved: Math.max(3, approved) };
});

export const BOOKING_TREND = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
  bookings: 20 + Math.round(seeded(i, 3) * 60 + i * 3),
  revenue: 40000 + Math.round(seeded(i, 4) * 60000 + i * 3000),
}));

export const CHANNEL_MIX = [
  { name: "Direct", value: 62, color: "#16a34a" },
  { name: "Booking.com", value: 28, color: "#3b82f6" },
  { name: "Trivago", value: 14, color: "#f97316" },
  { name: "MakeMyTrip", value: 22, color: "#a855f7" },
  { name: "Agoda", value: 16, color: "#ec4899" },
];

export const RECENT_BOOKINGS = [
  { id: "BK1001", name: "Grand Palace Hotel", location: "Near Lake, Yercaud", status: "Confirmed", amount: 6999, time: "Today, 10:30 AM", img: IMG.hotel },
  { id: "BK1002", name: "Yercaud One Day Tour", location: "Top Attractions", status: "Confirmed", amount: 2499, time: "Today, 09:15 AM", img: IMG.tour },
  { id: "BK1003", name: "Zipline Adventure", location: "Yercaud Hills", status: "Pending", amount: 1200, time: "Yesterday, 04:45 PM", img: IMG.adventure },
  { id: "BK1004", name: "Green Leaf Restaurant", location: "Anna Salai, Yercaud", status: "Confirmed", amount: 1000, time: "Yesterday, 01:30 PM", img: IMG.restaurant },
];

export const RECENT_ENQUIRIES = [
  { name: "Rajesh Kumar", type: "Hotel Enquiry", message: "Want to know about stay options near lake", time: "Today, 11:20 AM", color: "#16a34a" },
  { name: "Priya Sharma", type: "Tour Enquiry", message: "Need package for 2 days trip", time: "Today, 10:05 AM", color: "#a855f7" },
  { name: "Arun Prasad", type: "Activity Enquiry", message: "Details about adventure activities", time: "Yesterday, 05:30 PM", color: "#f97316" },
  { name: "Sneha Reddy", type: "General Enquiry", message: "Group booking for 10 people", time: "Yesterday, 03:15 PM", color: "#3b82f6" },
];

export const TOP_LISTINGS = [
  { rank: 1, name: "Grand Palace Hotel", location: "Near Lake, Yercaud", rating: 4.6, views: "2.4K", img: IMG.hotel },
  { rank: 2, name: "Green Leaf Restaurant", location: "Anna Salai, Yercaud", rating: 4.3, views: "1.8K", img: IMG.restaurant },
  { rank: 3, name: "Yercaud One Day Tour", location: "Top Attractions", rating: 4.6, views: "1.7K", img: IMG.tour },
  { rank: 4, name: "Sterling Yercaud", location: "Kottachedu, Yercaud", rating: 4.7, views: "1.5K", img: IMG.hotel },
  { rank: 5, name: "Zipline Adventure", location: "Yercaud Hills", rating: 4.7, views: "1.3K", img: IMG.adventure },
];

const OWNERS = ["Ravi Kumar", "Anitha S", "Suresh N", "Meena R", "Vignesh B", "Karthik M", "Divya P", "Prakash G"];
const LOCATIONS = ["Near Lake, Yercaud", "Anna Salai, Yercaud", "Kottachedu, Yercaud", "Yercaud Hills", "Shevaroy Hills", "Salem Main Rd"];
const BIZ_NAMES = [
  "Grand Palace Hotel", "Sterling Yercaud", "Green Leaf Restaurant", "Zipline Adventure",
  "Yercaud One Day Tour", "Shevaroy Retreat", "Lake View Cafe", "Coffee Estate Tours",
  "Hillside Bakery", "Silver Cloud Inn", "Nature Walk Trails", "Boat House",
  "Rose Garden Cafe", "Yercaud Spice Shop", "Ayurveda Wellness Spa", "Trekker's Base",
  "Mountain Mist Resort", "Chola Grand", "Deer Park Cafe", "Adventure Sports Co",
  "Servaroyan Temple Tours", "Bear Cave Trek", "Kottachedu Bakery", "Golden Palm Hotel",
  "Shanti Wellness", "Highland Homestay", "Pine View Lodge", "Cloud Nine Rooms",
  "Killiyur Falls Trek", "Emerald Lake Boating",
];

export const BUSINESSES = BIZ_NAMES.map((name, i) => ({
  id: `BIZ${1000 + i}`,
  name,
  category: CATEGORIES[i % CATEGORIES.length].name,
  owner: OWNERS[i % OWNERS.length],
  location: LOCATIONS[i % LOCATIONS.length],
  rating: (3.8 + (i % 12) * 0.1).toFixed(1),
  status: (["Active", "Pending", "Active", "Active", "Suspended"] as Status[])[i % 5],
  listings: 1 + (i % 5),
  img: [IMG.hotel, IMG.restaurant, IMG.adventure, IMG.tour][i % 4],
  createdAt: `2025-0${(i % 6) + 1}-${((i % 27) + 1).toString().padStart(2, "0")}`,
}));

const LISTING_TYPES = ["Hotel", "Restaurant", "Activity", "Tour", "Travel"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTINGS = Array.from({ length: 60 }, (_, i) => {
  const type = LISTING_TYPES[i % LISTING_TYPES.length];
  const biz = BUSINESSES[i % BUSINESSES.length];
  return {
    id: `LST${2000 + i}`,
    name: `${biz.name} ${type === "Hotel" ? "Deluxe" : type === "Tour" ? "Package" : ""}`.trim(),
    type,
    business: biz.name,
    owner: biz.owner,
    price: 500 + i * 137,
    status: (["Published", "Pending", "Draft", "Published", "Published"] as Status[])[i % 5],
    location: biz.location,
    rating: (3.9 + (i % 10) * 0.1).toFixed(1),
    img: [IMG.hotel, IMG.restaurant, IMG.adventure, IMG.tour, IMG.hotel][i % 5],
  };
});

const CUSTOMERS = ["Rajesh Kumar", "Priya Sharma", "Arun Prasad", "Sneha Reddy", "Vikram Iyer", "Ananya M", "Deepak S", "Kavya R", "Manoj P", "Lakshmi N"];
const CHANNELS: Channel[] = ["Direct", "Booking.com", "Trivago", "MakeMyTrip", "Agoda", "Expedia"];

export const BOOKINGS = Array.from({ length: 40 }, (_, i) => ({
  id: `BK${5000 + i}`,
  customer: CUSTOMERS[i % CUSTOMERS.length],
  listing: LISTINGS[i % LISTINGS.length].name,
  channel: CHANNELS[i % CHANNELS.length],
  checkIn: `2025-07-${((i % 27) + 1).toString().padStart(2, "0")}`,
  checkOut: `2025-07-${((i % 27) + 3).toString().padStart(2, "0")}`,
  guests: 1 + (i % 5),
  amount: 1200 + i * 250,
  status: (["Confirmed", "Pending", "Confirmed", "Cancelled", "Confirmed"] as Status[])[i % 5],
  ownerBiz: BUSINESSES[i % BUSINESSES.length].name,
}));

export const ENQUIRIES = Array.from({ length: 30 }, (_, i) => ({
  id: `ENQ${3000 + i}`,
  name: CUSTOMERS[i % CUSTOMERS.length],
  email: `${CUSTOMERS[i % CUSTOMERS.length].split(" ")[0].toLowerCase()}@example.com`,
  type: ["Hotel", "Tour", "Activity", "General"][i % 4] + " Enquiry",
  listing: LISTINGS[i % LISTINGS.length].name,
  message: "Looking for more details and best price options.",
  status: (["Pending", "Approved", "Pending", "Rejected"] as Status[])[i % 4],
  date: `2025-07-${((i % 27) + 1).toString().padStart(2, "0")}`,
}));

export const REVIEWS = Array.from({ length: 40 }, (_, i) => ({
  id: `RV${4000 + i}`,
  reviewer: CUSTOMERS[i % CUSTOMERS.length],
  listing: LISTINGS[i % LISTINGS.length].name,
  rating: 3 + (i % 3),
  text: [
    "Amazing experience, highly recommended!",
    "Loved the hospitality and view.",
    "Food was great, service could be faster.",
    "Adventure was thrilling. Guides were super.",
    "Good value for money.",
  ][i % 5],
  date: `2025-06-${((i % 27) + 1).toString().padStart(2, "0")}`,
  status: (["Approved", "Pending", "Approved", "Rejected"] as Status[])[i % 4],
  reported: i % 7 === 0,
}));

export const USERS = Array.from({ length: 30 }, (_, i) => ({
  id: `USR${6000 + i}`,
  name: CUSTOMERS[i % CUSTOMERS.length] + " " + (i + 1),
  email: `user${i + 1}@example.com`,
  joined: `2024-${((i % 12) + 1).toString().padStart(2, "0")}-15`,
  bookings: i % 8,
  status: (["Active", "Active", "Suspended", "Active"] as Status[])[i % 4],
}));

export const OWNERS_LIST = BUSINESSES.slice(0, 20).map((b, i) => ({
  id: `OWN${7000 + i}`,
  owner: b.owner,
  business: b.name,
  listings: b.listings,
  joined: b.createdAt,
  status: (["Approved", "Pending", "Approved", "Suspended"] as Status[])[i % 4],
}));

export const ADMINS = [
  { id: "AD1", name: "Admin User", email: "admin@yercaud.in", role: "Super Admin", status: "Active" as Status },
  { id: "AD2", name: "Karthik M", email: "karthik@yercaud.in", role: "Content Admin", status: "Active" as Status },
  { id: "AD3", name: "Divya P", email: "divya@yercaud.in", role: "Finance Admin", status: "Active" as Status },
  { id: "AD4", name: "Suresh N", email: "suresh@yercaud.in", role: "Moderator", status: "Suspended" as Status },
];

export const ROLES = ["Super Admin", "Content Admin", "Finance Admin", "Moderator", "Support"];
export const PERMISSION_MODULES = [
  "Businesses", "Listings", "Categories", "Bookings", "Enquiries", "Reviews", "Users", "Admins",
  "Marketing", "Content", "Integrations", "Finance", "Settings",
];
export const PERMISSIONS = ["view", "create", "edit", "delete", "approve", "publish"] as const;

export const PROMOTIONS = Array.from({ length: 12 }, (_, i) => ({
  id: `PR${8000 + i}`,
  title: `Monsoon Special ${i + 1}`,
  target: LISTINGS[i % LISTINGS.length].name,
  discount: 10 + (i % 5) * 5,
  start: "2025-07-01",
  end: "2025-07-31",
  status: (["Active", "Pending", "Active", "Draft"] as Status[])[i % 4],
  img: IMG.hotel,
}));

export const BLOG_POSTS = Array.from({ length: 20 }, (_, i) => ({
  id: `BP${9000 + i}`,
  title: [
    "Top 10 things to do in Yercaud",
    "Best coffee estates to visit",
    "Ultimate guide to Yercaud lake",
    "Weekend trekking trails",
    "Where to eat local cuisine",
  ][i % 5] + ` — Part ${i + 1}`,
  category: ["Travel", "Food", "Adventure", "Guide"][i % 4],
  author: OWNERS[i % OWNERS.length],
  status: (["Published", "Draft", "Published", "Pending"] as Status[])[i % 4],
  date: `2025-05-${((i % 27) + 1).toString().padStart(2, "0")}`,
  views: 100 + i * 47,
}));

export const BLOG_COMMENTS = Array.from({ length: 15 }, (_, i) => ({
  id: `BC${1000 + i}`,
  comment: "Great post! Really helpful information.",
  author: CUSTOMERS[i % CUSTOMERS.length],
  post: BLOG_POSTS[i % BLOG_POSTS.length].title,
  date: `2025-06-${((i % 27) + 1).toString().padStart(2, "0")}`,
  status: (["Approved", "Pending", "Rejected", "Approved"] as Status[])[i % 4],
}));

export const FAQS = Array.from({ length: 15 }, (_, i) => ({
  id: `F${i + 1}`,
  category: ["General", "Booking", "Payment", "Cancellation"][i % 4],
  question: `Question ${i + 1}: How do I book a listing in Yercaud?`,
  answer: "You can book directly from the listing page by choosing dates and clicking Book Now.",
}));

export const NEWSLETTER = Array.from({ length: 25 }, (_, i) => ({
  id: `NL${i + 1}`,
  email: `subscriber${i + 1}@example.com`,
  source: ["Homepage", "Blog", "Footer", "Popup"][i % 4],
  date: `2025-06-${((i % 27) + 1).toString().padStart(2, "0")}`,
}));

export const CHANNELS_LIST = [
  { name: "Booking.com", logo: "🏨", status: "Connected", lastSync: "2 min ago", color: "#003580" },
  { name: "Trivago", logo: "🔍", status: "Connected", lastSync: "5 min ago", color: "#d9232e" },
  { name: "Expedia", logo: "✈️", status: "Disconnected", lastSync: "—", color: "#ffc72c" },
  { name: "Agoda", logo: "🌏", status: "Connected", lastSync: "12 min ago", color: "#ff6b00" },
  { name: "MakeMyTrip", logo: "🎒", status: "Sync Error", lastSync: "1 hr ago", color: "#eb2226" },
  { name: "TripAdvisor", logo: "🦉", status: "Connected", lastSync: "8 min ago", color: "#00af87" },
  { name: "Google Hotel Ads", logo: "🌐", status: "Connected", lastSync: "3 min ago", color: "#4285f4" },
] as const;

export const CHANNEL_MAPPINGS = Array.from({ length: 15 }, (_, i) => ({
  id: `MAP${i + 1}`,
  listing: LISTINGS[i % LISTINGS.length].name,
  channel: CHANNELS_LIST[i % CHANNELS_LIST.length].name,
  externalId: `EXT-${10000 + i}`,
  roomType: ["Deluxe", "Suite", "Standard", "Family"][i % 4],
  status: (["Synced", "Synced", "Sync Error", "Synced"] as Status[])[i % 4],
}));

export const SYNC_LOG = Array.from({ length: 20 }, (_, i) => ({
  id: `SL${i + 1}`,
  channel: CHANNELS_LIST[i % CHANNELS_LIST.length].name,
  time: `2025-07-14 ${(10 + (i % 12)).toString().padStart(2, "0")}:${(i * 3 % 60).toString().padStart(2, "0")}`,
  event: i % 4 === 3 ? "Rate sync failed: 401 Unauthorized" : "Rate & inventory synced",
  status: (i % 4 === 3 ? "Sync Error" : "Synced") as Status,
}));

export const TRANSACTIONS = Array.from({ length: 25 }, (_, i) => ({
  id: `TXN${20000 + i}`,
  business: BUSINESSES[i % BUSINESSES.length].name,
  amount: 1200 + i * 320,
  commission: Math.round((1200 + i * 320) * 0.12),
  method: ["UPI", "Card", "NetBanking", "Wallet"][i % 4],
  status: (["Confirmed", "Pending", "Confirmed", "Cancelled"] as Status[])[i % 4],
  date: `2025-07-${((i % 27) + 1).toString().padStart(2, "0")}`,
}));

export const PAYOUTS = Array.from({ length: 15 }, (_, i) => ({
  id: `PO${30000 + i}`,
  business: BUSINESSES[i % BUSINESSES.length].name,
  amount: 15000 + i * 2500,
  requestedOn: `2025-07-${((i % 27) + 1).toString().padStart(2, "0")}`,
  status: (["Pending", "Approved", "Approved", "Rejected"] as Status[])[i % 4],
}));

export const AUDIT_LOG = Array.from({ length: 20 }, (_, i) => ({
  id: `LOG${i + 1}`,
  actor: ADMINS[i % ADMINS.length].name,
  action: ["Approved business", "Rejected review", "Updated listing", "Created promotion", "Suspended user"][i % 5],
  entity: BUSINESSES[i % BUSINESSES.length].name,
  timestamp: `2025-07-14 ${(9 + (i % 12)).toString().padStart(2, "0")}:${(i * 7 % 60).toString().padStart(2, "0")}`,
}));

export const APPROVAL_QUEUE = [
  ...OWNERS_LIST.filter((o) => o.status === "Pending").slice(0, 5).map((o) => ({
    id: o.id, kind: "Business Owner", subject: o.owner, detail: o.business, submitted: o.joined,
  })),
  ...LISTINGS.filter((l) => l.status === "Pending").slice(0, 6).map((l) => ({
    id: l.id, kind: "Listing", subject: l.name, detail: l.type, submitted: "2025-07-10",
  })),
  ...ENQUIRIES.filter((e) => e.status === "Pending").slice(0, 4).map((e) => ({
    id: e.id, kind: "Edit", subject: e.listing, detail: "Detail update", submitted: e.date,
  })),
];

export const REPORTED_CONTENT = REVIEWS.filter((r) => r.reported).map((r) => ({
  id: r.id, type: "Review", author: r.reviewer, target: r.listing, reason: "Inappropriate content", date: r.date,
}));

// Owner-scoped: filter for owner "Ravi Kumar" / "Grand Palace Hotel"
export const OWNER_BUSINESS = "Grand Palace Hotel";
export const OWNER_NAME = "Ravi Kumar";

export function ownerListings() {
  return LISTINGS.filter((l) => l.business.startsWith("Grand Palace"));
}
export function ownerBookings() {
  return BOOKINGS.filter((b) => b.ownerBiz === OWNER_BUSINESS);
}
export function ownerEnquiries() {
  return ENQUIRIES.slice(0, 8);
}
export function ownerReviews() {
  return REVIEWS.filter((r) => r.listing.startsWith("Grand Palace"));
}
