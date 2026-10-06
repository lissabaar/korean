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

/** A short list shown first in the picker; search covers the full set. */
export const SUGGESTED_ICONS = [
  ...new Set(Object.values(DEFAULTS)),
  "egg-fried", "basket", "cart", "shop", "cash-coin", "bus-front", "train-front",
  "car-front", "bicycle", "building", "hospital", "capsule", "book", "mortarboard",
  "pencil", "laptop", "phone", "music-note-beamed", "film", "camera", "palette",
  "brush", "tree", "flower1", "snow", "umbrella", "moon-stars", "fire", "water",
  "bug", "balloon-heart", "gift", "suit-heart", "emoji-frown", "hand-thumbs-up",
  "translate", "alphabet", "tag", "star", "flag", "trophy", "clock",
];

export function categoryIcon(name: string, icon: string | null | undefined): string {
  return icon || DEFAULTS[name as BaseCategory] || "tag";
}

/** Icon names are interpolated into a class name; keep them to the safe set. */
export function isIconName(value: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(value);
}
