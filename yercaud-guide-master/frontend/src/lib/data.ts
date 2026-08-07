export type Category = "Hotel" | "Restaurant" | "Activity" | "Travel" | "Tours & Travels";

export const categoryColors: Record<Category, { bg: string; text: string; btn: string; ring: string }> = {
  Hotel: { bg: "bg-[#1E7A46]/10", text: "text-[#1E7A46]", btn: "bg-[#1E7A46] hover:bg-[#186238] text-white", ring: "ring-[#1E7A46]" },
  Restaurant: { bg: "bg-[#F97316]/10", text: "text-[#F97316]", btn: "bg-[#F97316] hover:bg-[#ea6a0c] text-white", ring: "ring-[#F97316]" },
  Activity: { bg: "bg-[#3B82F6]/10", text: "text-[#3B82F6]", btn: "bg-[#3B82F6] hover:bg-[#2f6fdc] text-white", ring: "ring-[#3B82F6]" },
  Travel: { bg: "bg-[#8B5CF6]/10", text: "text-[#8B5CF6]", btn: "bg-[#8B5CF6] hover:bg-[#7a4de0] text-white", ring: "ring-[#8B5CF6]" },
  "Tours & Travels": { bg: "bg-[#14B8A6]/10", text: "text-[#14B8A6]", btn: "bg-[#14B8A6] hover:bg-[#0fa192] text-white", ring: "ring-[#14B8A6]" },
};

export interface Business {
  id: string;
  name: string;
  category: Category;
  location: string;
  rating: number;
  reviews: number;
  priceLabel: string;
  priceTier: 1 | 2 | 3 | 4;
  cuisineOrType?: string;
  tags: string[];
  phone: string;
  website: string;
  image: string;
  badge?: string;
}

export const businesses: Business[] = [
  {
    id: "grand-palace",
    name: "Grand Palace Hotel",
    category: "Hotel",
    location: "Near Lake, Yercaud",
    rating: 4.6,
    reviews: 128,
    priceLabel: "₹3,500/night",
    priceTier: 4,
    cuisineOrType: "Luxury",
    tags: ["Free Wi-Fi", "Parking", "Restaurant", "Room Service"],
    phone: "+91 98765 43210",
    website: "grandpalaceyercaud.com",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    badge: "Popular",
  },
  {
    id: "sterling",
    name: "Sterling Yercaud",
    category: "Hotel",
    location: "Kottachedu, Yercaud",
    rating: 4.7,
    reviews: 96,
    priceLabel: "₹6,999/night",
    priceTier: 4,
    tags: ["Free Wi-Fi", "Pool", "Restaurant", "Spa"],
    phone: "+91 98765 11122",
    website: "sterlingyercaud.com",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    badge: "Luxury",
  },
  {
    id: "great-trails",
    name: "Great Trails Yercaud",
    category: "Hotel",
    location: "Pagoda Point Road",
    rating: 4.5,
    reviews: 210,
    priceLabel: "₹5,200/night",
    priceTier: 3,
    tags: ["Free Wi-Fi", "Parking", "Restaurant", "Pool"],
    phone: "+91 98111 22233",
    website: "greattrailsyercaud.com",
    image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
    badge: "Best Seller",
  },
  {
    id: "hill-view",
    name: "Hotel Hill View",
    category: "Hotel",
    location: "Near Bus Stand",
    rating: 4.1,
    reviews: 78,
    priceLabel: "₹1,800/night",
    priceTier: 1,
    tags: ["Free Wi-Fi", "Parking", "Restaurant"],
    phone: "+91 90000 12345",
    website: "hillviewyercaud.com",
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
    badge: "Budget",
  },
  {
    id: "lake-forest",
    name: "Lake Forest Resort",
    category: "Hotel",
    location: "Near Yercaud Lake",
    rating: 4.6,
    reviews: 150,
    priceLabel: "₹4,800/night",
    priceTier: 3,
    tags: ["Free Wi-Fi", "Pool", "Parking", "Restaurant"],
    phone: "+91 98765 55555",
    website: "lakeforestyercaud.com",
    image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
  },
  {
    id: "eco-stay",
    name: "Eco Stay Yercaud",
    category: "Hotel",
    location: "Kiliyur Falls Road",
    rating: 4.4,
    reviews: 85,
    priceLabel: "₹2,700/night",
    priceTier: 2,
    tags: ["Free Wi-Fi", "Parking", "Restaurant"],
    phone: "+91 90876 54321",
    website: "ecostayyercaud.com",
    image: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=800&q=80",
  },
  {
    id: "shevaroys",
    name: "Shevaroys Resort",
    category: "Hotel",
    location: "Kalrayan Hills",
    rating: 4.3,
    reviews: 112,
    priceLabel: "₹3,900/night",
    priceTier: 3,
    tags: ["Free Wi-Fi", "Pool", "Parking"],
    phone: "+91 98123 45678",
    website: "shevaroysresort.com",
    image: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=80",
  },
  {
    id: "comfort-inn",
    name: "Comfort Inn Yercaud",
    category: "Hotel",
    location: "Ladies Seat Road",
    rating: 4.2,
    reviews: 63,
    priceLabel: "₹2,200/night",
    priceTier: 2,
    tags: ["Free Wi-Fi", "Parking", "Restaurant"],
    phone: "+91 90123 67890",
    website: "comfortinnyercaud.com",
    image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80",
  },
  {
    id: "green-leaf",
    name: "Green Leaf Restaurant",
    category: "Restaurant",
    location: "Anna Salai, Yercaud",
    rating: 4.3,
    reviews: 96,
    priceLabel: "₹500 for two",
    priceTier: 2,
    cuisineOrType: "Multi Cuisine",
    tags: ["Free Wi-Fi", "Parking", "Outdoor Seating"],
    phone: "+91 87654 32109",
    website: "greenleafyercaud.com",
    image: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80",
  },
  {
    id: "zipline",
    name: "Zipline Adventure",
    category: "Activity",
    location: "Yercaud Hills",
    rating: 4.7,
    reviews: 76,
    priceLabel: "₹1,200/person",
    priceTier: 2,
    cuisineOrType: "Adventure",
    tags: ["Safety Gear", "Guide", "All Ages"],
    phone: "+91 76543 21098",
    website: "ziplineyercaud.com",
    image: "https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=800&q=80",
  },
  {
    id: "cab-service",
    name: "Yercaud Cab Service",
    category: "Travel",
    location: "Local & Outstation",
    rating: 4.5,
    reviews: 64,
    priceLabel: "₹1,800/trip",
    priceTier: 2,
    cuisineOrType: "Transport",
    tags: ["AC Vehicles", "24/7 Service", "Verified Drivers"],
    phone: "+91 91234 56789",
    website: "yercaudcabservice.com",
    image: "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80",
  },
  {
    id: "one-day-tour",
    name: "Yercaud One Day Tour",
    category: "Tours & Travels",
    location: "Top Attractions",
    rating: 4.6,
    reviews: 88,
    priceLabel: "₹2,499/person",
    priceTier: 2,
    cuisineOrType: "Sightseeing",
    tags: ["Guide", "Sightseeing", "Custom Packages"],
    phone: "+91 99876 54321",
    website: "yercaudtours.com",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80",
  },
];

export const directoryCategories = [
  { name: "Hotels", count: 48, icon: "Hotel", color: "#1E7A46" },
  { name: "Restaurants", count: 73, icon: "UtensilsCrossed", color: "#F97316" },
  { name: "Activities", count: 26, icon: "Activity", color: "#3B82F6" },
  { name: "Travel", count: 32, icon: "Car", color: "#8B5CF6" },
  { name: "Tours & Travels", count: 18, icon: "Briefcase", color: "#14B8A6" },
  { name: "Shopping", count: 41, icon: "ShoppingBag", color: "#EC4899" },
  { name: "Health & Wellness", count: 15, icon: "Leaf", color: "#10B981" },
  { name: "Other Services", count: 27, icon: "Grid3x3", color: "#6B7280" },
];

export const HERO_IMG = "/images/hero-yercaud.png";
export const HILLS_IMG = "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80";

// ==================== SHARED DETAIL TYPES ====================

export interface Review {
  author: string;
  avatar: string;
  rating: number;
  date: string;
  text: string;
  helpful: number;
}

export interface Contact {
  phone: string;
  email: string;
  website: string;
  address: string;
  openingHours?: Record<string, string>;
  openNow?: boolean;
}

export interface Gallery {
  images: string[];
}

const stockPeople = [
  "https://i.pravatar.cc/64?img=12",
  "https://i.pravatar.cc/64?img=32",
  "https://i.pravatar.cc/64?img=47",
  "https://i.pravatar.cc/64?img=5",
];

const sampleReviews: Review[] = [
  { author: "Priya Menon", avatar: stockPeople[0], rating: 5, date: "2 days ago", text: "Amazing experience! Warm hospitality and beautiful views.", helpful: 3 },
  { author: "Arun Kumar", avatar: stockPeople[1], rating: 4, date: "1 week ago", text: "Very good service and clean surroundings. Recommended.", helpful: 1 },
  { author: "Karthik Raja", avatar: stockPeople[2], rating: 4, date: "2 weeks ago", text: "Nice place for a family outing. Slightly crowded on weekends.", helpful: 0 },
];

function galleryFor(image: string): string[] {
  return [
    image,
    "https://images.unsplash.com/photo-1517840901100-8179e982acb7?w=800&q=80",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=80",
    "https://images.unsplash.com/photo-1521783988139-89397d761dce?w=800&q=80",
    "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80",
  ];
}

function contactFor(b: Business): Contact {
  return {
    phone: b.phone,
    email: `hello@${b.website}`,
    website: `www.${b.website}`,
    address: `${b.location}, Yercaud, Tamil Nadu 636601`,
    openingHours: {
      Monday: "7:30 AM - 10:30 PM",
      Tuesday: "7:30 AM - 10:30 PM",
      Wednesday: "7:30 AM - 10:30 PM",
      Thursday: "7:30 AM - 10:30 PM",
      Friday: "7:30 AM - 10:30 PM",
      Saturday: "7:30 AM - 11:00 PM",
      Sunday: "7:30 AM - 11:00 PM",
    },
    openNow: true,
  };
}

// ==================== HOTEL DETAILS ====================

export interface HotelDetailData {
  description: string;
  gallery: string[];
  amenities: string[];
  roomTypes: { name: string; price: string; features: string[]; image: string }[];
  policies: string[];
  contact: Contact;
  userReviews: Review[];
  nearby: { name: string; distance: string }[];
}

export type Hotel = Business & HotelDetailData;

const hotelExtras: Record<string, HotelDetailData> = {
  "grand-palace": {
    description: "A luxurious retreat set beside Yercaud Lake, blending elegant interiors with panoramic views of the Shevaroy Hills. Perfect for couples, families and long weekends.",
    gallery: galleryFor("https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80"),
    amenities: ["Free Wi-Fi", "Swimming Pool", "Parking", "Restaurant", "Room Service", "Spa", "Gym", "Bar"],
    roomTypes: [
      { name: "Deluxe Room", price: "₹3,500 / night", features: ["Queen Bed", "Lake View", "AC"], image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80" },
      { name: "Premium Suite", price: "₹5,800 / night", features: ["King Bed", "Balcony", "Bathtub"], image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80" },
    ],
    policies: ["Check-in from 12:00 PM", "Check-out by 11:00 AM", "ID proof required at arrival"],
    contact: contactFor({ ...businesses[0], website: "grandpalaceyercaud.com" }),
    userReviews: sampleReviews,
    nearby: [
      { name: "Yercaud Lake", distance: "0.4 km" },
      { name: "Anna Park", distance: "0.9 km" },
      { name: "Lady's Seat", distance: "1.6 km" },
    ],
  },
};

function defaultHotelDetail(b: Business): HotelDetailData {
  return {
    description: `${b.name} offers a warm, welcoming stay in ${b.location.split(",")[0]}. Enjoy comfortable rooms, thoughtful service and easy access to Yercaud's best attractions.`,
    gallery: galleryFor(b.image),
    amenities: b.tags.concat(["Housekeeping", "24hr Front Desk"]),
    roomTypes: [
      { name: "Standard Room", price: b.priceLabel, features: ["Comfortable Bed", "AC", "TV"], image: b.image },
    ],
    policies: ["Check-in from 12:00 PM", "Check-out by 11:00 AM", "ID proof required at arrival"],
    contact: contactFor(b),
    userReviews: sampleReviews,
    nearby: [
      { name: "Yercaud Lake", distance: "1.2 km" },
      { name: "Pagoda Point", distance: "3.4 km" },
      { name: "Shevaroy Temple", distance: "5.1 km" },
    ],
  };
}

export function getHotel(id: string): Hotel | undefined {
  const b = businesses.find((x) => x.id === id && x.category === "Hotel");
  if (!b) return undefined;
  return { ...b, ...(hotelExtras[id] ?? defaultHotelDetail(b)) };
}

// ==================== RESTAURANT DETAILS ====================

export interface RestaurantDetailData {
  description: string;
  gallery: string[];
  cuisine: string;
  timings: string;
  averageCost: string;
  bestFor: string;
  highlights: { title: string; sub: string }[];
  amenities: string[];
  popularDishes: { name: string; price: string; image: string }[];
  contact: Contact;
  userReviews: Review[];
  nearby: { name: string; distance: string }[];
}
export type Restaurant = Business & RestaurantDetailData;

function defaultRestaurantDetail(b: Business): RestaurantDetailData {
  return {
    description: `${b.name} is a popular dining destination in Yercaud known for its warm ambience, friendly service and a wide variety of delicious dishes. Perfect for family dinners, casual lunches and special occasions.`,
    gallery: galleryFor(b.image),
    cuisine: b.cuisineOrType ?? "Multi Cuisine",
    timings: "7:30 AM - 10:30 PM",
    averageCost: b.priceLabel,
    bestFor: "Family, Groups, Couples",
    highlights: [
      { title: "Scenic View", sub: "Beautiful hill views" },
      { title: "Hygienic Food", sub: "100% hygienic kitchen" },
      { title: "Live Music", sub: "Weekends only" },
      { title: "Ample Parking", sub: "Free parking space" },
      { title: "Indoor & Outdoor", sub: "Seating available" },
      { title: "Party Friendly", sub: "Birthdays & events" },
    ],
    amenities: b.tags,
    popularDishes: [
      { name: "Paneer Butter Masala", price: "₹220", image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&q=80" },
      { name: "Veg Biryani", price: "₹180", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80" },
      { name: "Gobi Manchurian", price: "₹160", image: "https://images.unsplash.com/photo-1567337710282-00832b415979?w=400&q=80" },
      { name: "Cheese Naan", price: "₹90", image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&q=80" },
      { name: "Chocolate Brownie", price: "₹120", image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&q=80" },
    ],
    contact: contactFor(b),
    userReviews: sampleReviews,
    nearby: [
      { name: "Yercaud Lake", distance: "0.6 km" },
      { name: "Anna Park", distance: "0.8 km" },
      { name: "Lady's Seat", distance: "1.2 km" },
    ],
  };
}

export function getRestaurant(id: string): Restaurant | undefined {
  const b = businesses.find((x) => x.id === id && x.category === "Restaurant");
  if (!b) return undefined;
  return { ...b, ...defaultRestaurantDetail(b) };
}

// ==================== ACTIVITY DETAILS ====================

export interface ActivityDetailData {
  description: string;
  gallery: string[];
  duration: string;
  maxHeight?: string;
  totalDistance?: string;
  difficulty: string;
  whatToExpect: string[];
  inclusions: string[];
  itinerary: { time: string; title: string; desc: string }[];
  highlights: string[];
  contact: Contact;
  userReviews: Review[];
  faqs: { q: string; a: string }[];
}
export type Activity = Business & ActivityDetailData;

function defaultActivityDetail(b: Business): ActivityDetailData {
  return {
    description: `Experience an unforgettable ${b.name.toLowerCase()} adventure in Yercaud. Certified guides, professional equipment and breathtaking views of the Eastern Ghats.`,
    gallery: galleryFor(b.image),
    duration: "30-45 mins",
    maxHeight: "150 ft",
    totalDistance: "400 m",
    difficulty: "Easy",
    whatToExpect: [
      "Scenic ride across lush green valleys",
      "Stunning panoramic views of Yercaud Hills",
      "Professional guides and safety equipment",
      "Photo & video capture at designated points",
      "Fun and safe experience for all age groups",
      "Perfect for families, friends & solo travellers",
    ],
    inclusions: ["Safety Equipment", "Certified Guide", "Safety Briefing", "Insurance Coverage", "Photo Opportunity", "Refreshments"],
    itinerary: [
      { time: "10 mins", title: "Check-in & Registration", desc: "Arrive at the base station and complete registration." },
      { time: "10 mins", title: "Safety Briefing", desc: "Get familiar with safety guidelines and equipment." },
      { time: "20-25 mins", title: "Main Experience", desc: "Enjoy the thrilling ride with breathtaking views." },
      { time: "10 mins", title: "Photo Session", desc: "Capture memories at our scenic photo points." },
      { time: "5 mins", title: "End of Activity", desc: "Return to base and receive completion certificate." },
    ],
    highlights: ["Scenic Adventure", "Professional Guides", "Safe & Secure Experience", "Great for All Ages", "Unforgettable Views"],
    contact: contactFor(b),
    userReviews: sampleReviews,
    faqs: [
      { q: "Is this activity safe for children?", a: "Yes — suitable for ages 6+ with adult supervision. All safety gear is provided." },
      { q: "What should I wear?", a: "Comfortable clothes and closed shoes. Avoid loose accessories." },
      { q: "Can I reschedule my visit?", a: "Yes, contact the operator directly through the enquiry form to reschedule." },
    ],
  };
}

export function getActivity(id: string): Activity | undefined {
  const b = businesses.find((x) => x.id === id && x.category === "Activity");
  if (!b) return undefined;
  return { ...b, ...defaultActivityDetail(b) };
}

// ==================== TOUR / TRAVEL DETAILS ====================

export interface TourDetailData {
  description: string;
  gallery: string[];
  duration: string;
  tourType: string;
  bestFor: string;
  languages: string;
  highlights: { title: string; sub: string }[];
  itinerary: { time: string; title: string; desc: string }[];
  included: string[];
  notIncluded: string[];
  attractions: { name: string; sub: string; image: string }[];
  contact: Contact;
  userReviews: Review[];
  faqs: { q: string; a: string }[];
}
export type Tour = Business & TourDetailData;

function defaultTourDetail(b: Business): TourDetailData {
  return {
    description: `${b.name} is perfect for travellers who want to experience the highlights of Yercaud. Enjoy beautiful viewpoints, tranquil lakes, cascading waterfalls and popular attractions with a knowledgeable local guide.`,
    gallery: galleryFor(b.image),
    duration: "8 - 9 Hours",
    tourType: "Private / Group",
    bestFor: "Family, Couples, Friends",
    languages: "English, Tamil",
    highlights: [
      { title: "Scenic Drive", sub: "A beautiful drive through the hills" },
      { title: "Top Attractions", sub: "Visit the best places in Yercaud" },
      { title: "Local Guide", sub: "Expert guide for a rich experience" },
      { title: "Photo Opportunities", sub: "Capture stunning views" },
      { title: "Comfortable Transport", sub: "AC vehicle for a relaxed journey" },
      { title: "Customizable", sub: "Flexible itinerary on request" },
    ],
    itinerary: [
      { time: "08:00 AM", title: "Pickup from your location", desc: "Start your journey from your hotel or selected location in Yercaud." },
      { time: "09:00 AM", title: "Yercaud Lake", desc: "Enjoy boating and serene views around the lake." },
      { time: "10:00 AM", title: "Lady's Seat Viewpoint", desc: "Panoramic view of the plains and surrounding hills." },
      { time: "11:00 AM", title: "Shevaroys Temple", desc: "Visit the ancient temple on Shevaroy hill." },
      { time: "12:30 PM", title: "Lunch Break", desc: "Enjoy local cuisine at a recommended restaurant." },
      { time: "02:00 PM", title: "Kiliyur Falls", desc: "Visit the beautiful waterfall and relax in nature." },
      { time: "03:30 PM", title: "Botanical Garden", desc: "Explore a variety of plants in the tranquil garden." },
      { time: "04:30 PM", title: "Coffee Estate Visit", desc: "Walk through lush coffee estates and learn about the process." },
      { time: "05:30 PM", title: "Drop back to your location", desc: "Return with wonderful memories." },
    ],
    included: ["AC Transport", "Experienced Guide", "All Entry Tickets", "Lunch (Veg)", "Bottled Water"],
    notIncluded: ["Personal Expenses", "Any Adventure Activities", "Extra Food & Beverages"],
    attractions: [
      { name: "Yercaud Lake", sub: "Boating, Scenic Views", image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&q=80" },
      { name: "Lady's Seat", sub: "Viewpoint", image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=400&q=80" },
      { name: "Shevaroys Temple", sub: "Hilltop Temple", image: "https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&q=80" },
      { name: "Kiliyur Falls", sub: "Waterfall", image: "https://images.unsplash.com/photo-1467890947394-8171244e5410?w=400&q=80" },
      { name: "Botanical Garden", sub: "Flora & Greenery", image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80" },
    ],
    contact: contactFor(b),
    userReviews: sampleReviews,
    faqs: [
      { q: "Can I customize this tour?", a: "Yes — use the Customize Tour section to add or remove stops, then send an enquiry." },
      { q: "Is transport included?", a: "Yes, a comfortable AC vehicle is included." },
      { q: "How do I confirm dates?", a: "Send an enquiry with your preferred date; the operator will confirm availability directly." },
    ],
  };
}

export function getTour(id: string): Tour | undefined {
  const b = businesses.find((x) => x.id === id && (x.category === "Tours & Travels"));
  if (!b) return undefined;
  return { ...b, ...defaultTourDetail(b) };
}

export function getTravelService(id: string): Tour | undefined {
  const b = businesses.find((x) => x.id === id && x.category === "Travel");
  if (!b) return undefined;
  return { ...b, ...defaultTourDetail(b) };
}

// ==================== BLOG ====================

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categoryColor: string;
  image: string;
  author: string;
  authorRole: string;
  date: string;
  readingTime: string;
  rating: number;
  ratings: number;
  views: number;
  content: string;
  mentions: string[]; // business ids
}

export const blogCategories = [
  { name: "Travel Guide", color: "#1E7A46", count: 8 },
  { name: "Food & Dining", color: "#F97316", count: 5 },
  { name: "Adventure", color: "#3B82F6", count: 4 },
  { name: "Local Culture", color: "#8B5CF6", count: 3 },
  { name: "Photography", color: "#EC4899", count: 2 },
  { name: "Seasonal", color: "#14B8A6", count: 2 },
];

const blogImages = [
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80",
];

const longContent = `Yercaud, tucked into the Shevaroy range of the Eastern Ghats, is one of South India's most inviting hill stations. Cool mornings, coffee-scented breezes and mist over the lake make it a perfect getaway from the plains of Tamil Nadu.

Start your day early with a walk along Yercaud Lake, then head to Lady's Seat or Pagoda Point for sweeping views of the valley below. The Botanical Garden and the Silk Farm are quiet, gentle stops that suit families and photographers alike.

By afternoon, spice and coffee plantations open their gates for visitors — most estates offer short walks and a cup of freshly brewed local coffee. If you have the energy, the trail to Kiliyur Falls rewards you with a rushing cascade tucked into deep green forest.

Evenings in Yercaud belong to the small cafés and family-run restaurants scattered around Anna Salai. Try a hot filter coffee, a plate of hot bajjis and something local like Chettinad chicken or a hearty South Indian thali.

For anything you plan — a stay, a table for two, a guided walk, or a taxi to the plains — send an enquiry directly from the listing on our directory. Local businesses reply personally and can tailor plans to your dates and group.`;

export const blogPosts: BlogPost[] = Array.from({ length: 24 }).map((_, i) => {
  const cat = blogCategories[i % blogCategories.length];
  const titles = [
    "The Ultimate Guide to Yercaud in Monsoon",
    "Top 10 Viewpoints You Cannot Miss",
    "Best Cafés for Coffee Lovers in Yercaud",
    "A Weekend Escape from Bangalore",
    "Trekking Trails Beyond the Postcard Spots",
    "Yercaud's Coffee Story: From Estate to Cup",
    "Family-Friendly Places to Visit",
    "Photography Guide: Golden Hour on the Hills",
    "Where to Eat in Yercaud on a Budget",
    "The Silk Farm and Rose Garden Explained",
    "How to Plan a Yercaud Road Trip",
    "Yercaud in December: What to Pack",
  ];
  const title = titles[i % titles.length] + (i >= titles.length ? ` (Part ${Math.floor(i / titles.length) + 1})` : "");
  return {
    slug: `post-${i + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title,
    excerpt: "A local's take on planning your Yercaud trip — where to stay, what to eat, and the small details that make all the difference.",
    category: cat.name,
    categoryColor: cat.color,
    image: blogImages[i % blogImages.length],
    author: ["Priya Menon", "Arun Kumar", "Karthik Raja", "Divya Iyer"][i % 4],
    authorRole: "Yercaud Local",
    date: `May ${(i % 28) + 1}, 2025`,
    readingTime: `${4 + (i % 6)} min read`,
    rating: 4.2 + ((i % 8) / 10),
    ratings: 20 + i * 3,
    views: 200 + i * 41,
    content: longContent,
    mentions: [businesses[i % businesses.length].id, businesses[(i + 2) % businesses.length].id],
  };
});

export function getBlogPost(slug: string) {
  return blogPosts.find((p) => p.slug === slug);
}

export interface BlogComment { author: string; avatar: string; badge?: string; date: string; rating: number; text: string; likes: number; }
export const blogComments: BlogComment[] = [
  { author: "Ravi Shankar", avatar: stockPeople[0], badge: "Verified Reader", date: "3 days ago", rating: 5, text: "Loved this — planning my trip next weekend and this post gave me exactly the shortlist I needed.", likes: 8 },
  { author: "Meera Krishnan", avatar: stockPeople[1], date: "1 week ago", rating: 4, text: "Great tips, especially about the coffee estates. Would love a follow-up on offbeat trails.", likes: 3 },
];

// ==================== FAQ ====================

export const faqCategories = [
  { name: "Enquiries & Contacting Businesses", count: 5 },
  { name: "Listings & Business Owners", count: 4 },
  { name: "Activity Information", count: 3 },
  { name: "Safety & Guidelines", count: 3 },
  { name: "Policies & Cancellations", count: 3 },
  { name: "General Questions", count: 4 },
];

export interface Faq { q: string; a: string; category: string; }
export const faqs: Faq[] = [
  { category: "Enquiries & Contacting Businesses", q: "How do I contact a business?", a: "Open any listing page and use the Send Enquiry form. Your message goes directly to the business owner, who will reply by email or phone." },
  { category: "Enquiries & Contacting Businesses", q: "Do I have to pay anything on this website?", a: "No. Yercaud Business Directory does not process payments. You arrange everything — pricing, availability and payment — directly with the business." },
  { category: "Enquiries & Contacting Businesses", q: "How long does it take to hear back?", a: "Most businesses reply within a few hours during working hours. If you don't hear back in 24 hours, feel free to try another listing." },
  { category: "Enquiries & Contacting Businesses", q: "Can I enquire about multiple places at once?", a: "Yes — send separate enquiries from each listing page. Signed-in users can view all enquiries under My Enquiries." },
  { category: "Enquiries & Contacting Businesses", q: "Are the prices shown final?", a: "Prices shown are indicative. Final pricing depends on your dates, group size and requirements — confirm directly with the business." },
  { category: "Listings & Business Owners", q: "How can I list my business?", a: "Use the List Your Business page. Submissions are reviewed by our team and go live once approved." },
  { category: "Listings & Business Owners", q: "Is listing free?", a: "Yes, basic listings are free. Premium placements may be introduced in the future." },
  { category: "Listings & Business Owners", q: "How do I edit my listing?", a: "Sign in as the listing owner and use the Edit option from your dashboard, or contact support." },
  { category: "Listings & Business Owners", q: "How long does approval take?", a: "Usually 2-3 working days. We may reach out for additional details or photos." },
  { category: "Activity Information", q: "Are activities suitable for children?", a: "Most activities specify age suitability on the listing. When in doubt, mention your group ages in the enquiry." },
  { category: "Activity Information", q: "Is safety gear provided?", a: "Reputable operators listed here provide certified safety gear. Details appear under Inclusions on each activity page." },
  { category: "Activity Information", q: "Do activities run during monsoon?", a: "Some activities pause during heavy rain. Always confirm the schedule with the operator before travelling." },
  { category: "Safety & Guidelines", q: "Are the listings verified?", a: "Yes — every listing is reviewed by our team for authenticity before going live." },
  { category: "Safety & Guidelines", q: "How are reviews moderated?", a: "Reviews are checked for authenticity and language before being published. This may take up to 24 hours." },
  { category: "Safety & Guidelines", q: "How do I report a problem with a business?", a: "Use the Contact Us page and describe the issue. Our team investigates every report." },
  { category: "Policies & Cancellations", q: "Can I cancel an enquiry?", a: "There is nothing to cancel — an enquiry is just a message. If your plans change, let the business know directly." },
  { category: "Policies & Cancellations", q: "What is your privacy policy?", a: "We store only the information you provide and never sell it to third parties. See the Privacy Policy for details." },
  { category: "Policies & Cancellations", q: "How is my data used?", a: "Your enquiry details are shared only with the business you contact, so they can respond to you." },
  { category: "General Questions", q: "Is Yercaud Business Directory an official Yercaud website?", a: "We are an independent local directory, built by people who love Yercaud." },
  { category: "General Questions", q: "Which languages do businesses speak?", a: "Most speak Tamil and English. Many also speak Hindi and other regional languages." },
  { category: "General Questions", q: "When is the best time to visit Yercaud?", a: "October to February offers the most pleasant weather. Monsoon (June–September) is lush but wet." },
  { category: "General Questions", q: "How do I get to Yercaud?", a: "The nearest railway is Salem. From Salem it's about a 1-hour drive up the ghat road." },
];

// ==================== USER / FAVORITES / ENQUIRIES ====================

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  cover: string;
  memberSince: string;
  verified: boolean;
  bio: string;
  location: string;
  languages: string;
}

export const currentUser: UserProfile = {
  id: "arun",
  name: "Arun Kumar",
  email: "arun.kumar@email.com",
  phone: "+91 98765 43210",
  avatar: stockPeople[1],
  cover: HILLS_IMG,
  memberSince: "Jan 2024",
  verified: true,
  bio: "Travel enthusiast and nature lover. I love exploring the beautiful places in Yercaud and sharing my experiences to help others discover the best this hill station has to offer.",
  location: "Yercaud, Tamil Nadu, India",
  languages: "English, Tamil, Hindi",
};

export const favoriteIds: string[] = businesses.slice(0, 10).map((b) => b.id);

export interface MyEnquiry {
  id: string;
  listingId: string;
  listingName: string;
  image: string;
  status: "Sent" | "Responded" | "Closed";
  date: string;
  message: string;
}

export const myEnquiries: MyEnquiry[] = [
  { id: "e1", listingId: "grand-palace", listingName: "Grand Palace Hotel", image: businesses[0].image, status: "Responded", date: "20 May 2025", message: "Availability for 2 guests, 2 nights." },
  { id: "e2", listingId: "zipline", listingName: "Zipline Adventure", image: businesses.find((b) => b.id === "zipline")!.image, status: "Sent", date: "18 May 2025", message: "Group of 4, weekend slot?" },
  { id: "e3", listingId: "green-leaf", listingName: "Green Leaf Restaurant", image: businesses.find((b) => b.id === "green-leaf")!.image, status: "Closed", date: "15 May 2025", message: "Table for 6, birthday dinner." },
];

export interface MyReview { listingId: string; listingName: string; category: string; rating: number; date: string; image: string; }
export const myReviews: MyReview[] = [
  { listingId: "grand-palace", listingName: "Grand Palace Hotel", category: "Hotel", rating: 5, date: "10 May 2025", image: businesses[0].image },
  { listingId: "green-leaf", listingName: "Green Leaf Restaurant", category: "Restaurant", rating: 4, date: "8 May 2025", image: businesses.find((b) => b.id === "green-leaf")!.image },
];

// ==================== ABOUT & CONTACT COPY ====================

export const aboutContent = {
  heroTitle: "About Yercaud Guide",
  heroTagline: "Your trusted companion to explore the beauty of Yercaud.",
  heroText: "Yercaud Guide is your one-stop directory to discover the best hotels, restaurants, activities, travels, and local businesses in Yercaud. We connect travellers with trusted local businesses to make every journey memorable.",
  stats: [
    { n: "500+", label: "Listed Businesses" },
    { n: "20K+", label: "Happy Travellers" },
    { n: "4.6★", label: "Average Rating" },
  ],
  mission: "To empower travellers by providing accurate, up-to-date, and reliable information about businesses in Yercaud, helping them make better decisions and enjoy seamless experiences.",
  vision: "To become the most trusted and comprehensive local directory platform for Yercaud, promoting local businesses and enhancing tourism in the region.",
  why: [
    { title: "Verified Listings", sub: "All businesses are verified for authenticity and reliability." },
    { title: "Best Prices", sub: "Compare and find the best deals and offers in Yercaud." },
    { title: "Direct Contact", sub: "Reach business owners directly through the Enquiry form." },
    { title: "Local Support", sub: "We're here to help with local insights and assistance." },
    { title: "Explore Yercaud", sub: "Discover hidden gems, top attractions, and local favourites." },
    { title: "Support Local", sub: "We promote and support local businesses and communities." },
  ],
  journey: "Yercaud Guide was born out of a passion for travel and a deep love for Yercaud. We noticed the need for a reliable platform that brings together travellers and local businesses in one place. Today, we are proud to be a growing community dedicated to making travel in Yercaud easier, better, and more memorable for everyone.",
  milestones: [
    { n: "2022", label: "Founded" },
    { n: "500+", label: "Businesses" },
    { n: "10K+", label: "Monthly Visitors" },
  ],
};

export const contactContent = {
  methods: [
    { icon: "Phone", title: "Call Us", detail: "+91 98765 43210", sub: "Mon-Sat, 9 AM - 7 PM" },
    { icon: "Mail", title: "Email Us", detail: "hello@yercaudguide.com", sub: "We reply within 24 hours" },
    { icon: "MapPin", title: "Visit Us", detail: "Anna Salai, Yercaud 636601", sub: "Tamil Nadu, India" },
    { icon: "MessageCircle", title: "Live Chat", detail: "Chat with our team", sub: "Available 10 AM - 6 PM" },
    { icon: "Headphones", title: "Support", detail: "support@yercaudguide.com", sub: "Priority responses" },
  ],
  subjects: ["General Enquiry", "List My Business", "Report an Issue", "Partnership", "Media & Press"],
  address: "Anna Salai, Yercaud, Tamil Nadu 636601, India",
};
