/**
 * Category icons — Bootstrap Icons names, rendered as <i className="bi bi-…">.
 * The icon font's CSS is imported once in the root layout.
 */

import type { BaseCategory } from "./ingest/categories";

const DEFAULTS: Record<BaseCategory, string> = {
  "food and drink": "cup-hot",
  "people and family": "people",
  "body and health": "heart-pulse",
  "emotions and feelings": "emoji-smile",
  "daily routine": "sun",
  "home and household": "house",
  "clothing and appearance": "handbag",
  "work and study": "briefcase",
  "travel and transport": "airplane",
  "shopping and money": "bag",
  "time and dates": "calendar",
  "places and directions": "geo-alt",
  "nature and weather": "cloud-sun",
  communication: "chat-dots",
  "leisure and hobbies": "controller",
  "society and culture": "globe",
  "abstract concepts": "lightbulb",
  "actions and movement": "person-walking",
  "qualities and descriptions": "stars",
  uncategorised: "question-circle",
};

/**
 * Shown first in the picker, grouped loosely by topic; the search box covers
 * all ~2000 Bootstrap Icons.
 */
export const SUGGESTED_ICONS = [...new Set([
  ...new Set(Object.values(DEFAULTS)),
  "egg-fried", "basket", "cart", "shop", "cash-coin", "bus-front", "train-front",
  "car-front", "bicycle", "building", "hospital", "capsule", "book", "mortarboard",
  "pencil", "laptop", "phone", "music-note-beamed", "film", "camera", "palette",
  "brush", "tree", "flower1", "snow", "umbrella", "moon-stars", "fire", "water",
  "bug", "balloon-heart", "gift", "suit-heart", "emoji-frown", "hand-thumbs-up",
  "translate", "alphabet", "tag", "star", "flag", "trophy", "clock",
  "cup-straw", "lightning", "wifi", "tv", "chat-quote", "hourglass", "bank",
  "balloon", "123", "person", "cart3", "bag-heart", "basket2", "egg", "cake2",
  "cookie", "heart-fill", "emoji-heart-eyes", "emoji-laughing", "emoji-angry",
  "emoji-dizzy", "emoji-neutral", "emoji-tear", "person-heart",
  "person-arms-up", "gender-female", "gender-male", "house-heart", "lamp",
  "door-open", "key", "tools", "hammer", "scissors", "truck", "taxi-front",
  "scooter", "rocket", "globe-asia-australia", "map", "compass", "signpost",
  "pin-map", "buildings", "shop-window", "piggy-bank", "credit-card",
  "wallet2", "receipt", "calendar-heart", "calendar-event", "alarm",
  "stopwatch", "sunrise", "sunset", "cloud-rain", "cloud-snow",
  "thermometer-sun", "flower2", "flower3", "feather", "droplet",
  "music-note-list", "mic", "headphones", "dice-5", "puzzle", "book-half",
  "journal-text", "newspaper", "pen", "pencil-square", "alphabet-uppercase",
  "chat-heart", "chat-square-text", "megaphone", "telephone", "envelope",
  "image", "capsule-pill", "bandaid", "lungs", "activity", "person-walking",
  "airplane-engines", "suitcase-lg", "ticket-perforated", "award", "peace",
  "moon", "lightning-charge", "shield-check", "lock", "gem", "magic",
])];

/**
 * The icon to show for a category: the one chosen, else the built-in default for
 * its name, else a tag.
 */
export function categoryIcon(name: string, icon: string | null | undefined): string {
  return icon || DEFAULTS[name as BaseCategory] || "tag";
}

/** Icon names are interpolated into a class name; keep them to the safe set. */
export function isIconName(value: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(value);
}
