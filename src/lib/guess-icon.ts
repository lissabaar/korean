/**
 * Pick a fitting icon for a category the user named themselves — server
 * only, since it needs the full Bootstrap Icons name list (~2000 names).
 */

import iconNames from "bootstrap-icons/font/bootstrap-icons.json";

const NAMES = Object.keys(iconNames);

/** Words people use for categories → icons whose names would not match. */
const SYNONYMS: Record<string, string> = {
  cooking: "egg-fried", kitchen: "egg-fried", recipe: "egg-fried", food: "cup-hot",
  drink: "cup-straw", drinks: "cup-straw", coffee: "cup-hot", tea: "cup-hot",
  sport: "trophy", sports: "trophy", animal: "bug", animals: "bug", pets: "bug",
  travel: "airplane", trip: "airplane", weather: "cloud-sun", family: "people",
  friends: "people", love: "heart", romance: "suit-heart", school: "mortarboard",
  study: "mortarboard", university: "mortarboard", medicine: "capsule",
  health: "heart-pulse", hospital: "hospital", body: "person", clothes: "handbag",
  fashion: "handbag", colour: "palette", color: "palette", colours: "palette",
  colors: "palette", art: "palette", money: "cash-coin", shopping: "bag",
  city: "building", nature: "tree", plants: "flower1", emotion: "emoji-smile",
  emotions: "emoji-smile", feelings: "emoji-smile", time: "clock", numbers: "123",
  verbs: "lightning", grammar: "alphabet", work: "briefcase", office: "briefcase",
  job: "briefcase", tech: "laptop", computer: "laptop", internet: "wifi",
  kpop: "music-note-beamed", "k-pop": "music-note-beamed", drama: "film",
  dramas: "film", movies: "film", tv: "tv", games: "controller", home: "house",
  house: "house", transport: "bus-front", car: "car-front", greetings: "chat-dots",
  phrases: "chat-quote", slang: "chat-dots", religion: "book", history: "hourglass",
  politics: "bank", law: "bank", science: "lightbulb", space: "moon-stars",
  flower: "flower1", flowers: "flower1", garden: "flower2",
  sea: "water", beach: "umbrella", winter: "snow", summer: "sun", party: "balloon",
  holiday: "gift", holidays: "gift", birthday: "gift",
};

/**
 * Pick an icon for a category the user named: the first word of the name with a
 * known icon, else a tag.
 */
export function guessIcon(name: string): string {
  const words = name.toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 2);
  for (const word of words) {
    if (SYNONYMS[word]) return SYNONYMS[word];
    if (NAMES.includes(word)) return word;
    const prefixed = NAMES.find((icon) => icon.startsWith(`${word}-`));
    if (prefixed) return prefixed;
  }
  return "tag";
}
