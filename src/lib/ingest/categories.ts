/**
 * Category taxonomy.
 *
 * The problem this solves: left to itself a model will produce "food",
 * "cooking", "meals", "eating" and "cuisine" across five sessions and the
 * category list stops being navigable. Passing the existing list in the
 * prompt helps but does not fix it — the model still invents near-synonyms
 * under pressure to be precise.
 *
 * So the primary category comes from a closed set, and only the secondary
 * ones are free-form. The spine stays stable; nuance still gets recorded.
 */

/** Shipped with the app, created for every user on first run. */
export const BASE_CATEGORIES = [
  "food and drink",
  "people and family",
  "body and health",
  "emotions and feelings",
  "daily routine",
  "home and household",
  "work and study",
  "travel and transport",
  "shopping and money",
  "time and dates",
  "places and directions",
  "nature and weather",
  "clothing and appearance",
  "communication",
  "leisure and hobbies",
  "society and culture",
  "abstract concepts",
  "actions and movement",
  "qualities and descriptions",
  "uncategorised",
] as const;

export type BaseCategory = (typeof BASE_CATEGORIES)[number];

const BASE_SET = new Set<string>(BASE_CATEGORIES);

/**
 * Hand-written aliases for the near-synonyms a model reaches for most
 * often. Cheap, deterministic, and runs without a model call.
 *
 * This is not meant to be exhaustive — it catches the common cases, and
 * anything it misses lands as a secondary category rather than silently
 * becoming a sixth flavour of "food".
 */
const ALIASES: Record<string, BaseCategory> = {
  food: "food and drink",
  cooking: "food and drink",
  meals: "food and drink",
  eating: "food and drink",
  cuisine: "food and drink",
  drinks: "food and drink",
  beverages: "food and drink",

  family: "people and family",
  people: "people and family",
  relationships: "people and family",
  "social relationships": "people and family",

  health: "body and health",
  body: "body and health",
  medical: "body and health",
  illness: "body and health",

  emotions: "emotions and feelings",
  feelings: "emotions and feelings",
  mood: "emotions and feelings",

  routine: "daily routine",
  "everyday life": "daily routine",
  "daily life": "daily routine",

  home: "home and household",
  house: "home and household",
  household: "home and household",
  furniture: "home and household",

  work: "work and study",
  study: "work and study",
  school: "work and study",
  education: "work and study",
  office: "work and study",
  business: "work and study",

  travel: "travel and transport",
  transport: "travel and transport",
  transportation: "travel and transport",
  vehicles: "travel and transport",

  shopping: "shopping and money",
  money: "shopping and money",
  finance: "shopping and money",

  time: "time and dates",
  dates: "time and dates",
  calendar: "time and dates",

  places: "places and directions",
  location: "places and directions",
  directions: "places and directions",

  nature: "nature and weather",
  weather: "nature and weather",
  animals: "nature and weather",
  environment: "nature and weather",

  clothing: "clothing and appearance",
  clothes: "clothing and appearance",
  appearance: "clothing and appearance",
  fashion: "clothing and appearance",

  language: "communication",
  speaking: "communication",
  conversation: "communication",

  leisure: "leisure and hobbies",
  hobbies: "leisure and hobbies",
  sports: "leisure and hobbies",
  entertainment: "leisure and hobbies",

  culture: "society and culture",
  society: "society and culture",
  tradition: "society and culture",
  politics: "society and culture",

  abstract: "abstract concepts",
  concepts: "abstract concepts",
  ideas: "abstract concepts",

  actions: "actions and movement",
  movement: "actions and movement",
  verbs: "actions and movement",

  adjectives: "qualities and descriptions",
  descriptions: "qualities and descriptions",
  qualities: "qualities and descriptions",
};

export interface ResolvedCategories {
  /** Always a member of BASE_CATEGORIES. */
  primary: BaseCategory;
  /** Free-form, deduplicated, never duplicating the primary. */
  secondary: string[];
}

export interface ResolveOptions {
  /** How many free-form categories to keep beyond the primary. */
  maxSecondary?: number;
}

function clean(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Fold the model's proposals onto the taxonomy.
 *
 * The first proposal that maps onto a base category wins as primary. If
 * none does, the word lands in "uncategorised" and every proposal survives
 * as a secondary tag — better an honest gap the user can fix than a
 * confident wrong bucket.
 */
export function resolveCategories(
  proposed: string[],
  options: ResolveOptions = {},
): ResolvedCategories {
  const { maxSecondary = 2 } = options;

  const cleaned = proposed.map(clean).filter(Boolean);
  let primary: BaseCategory | null = null;
  const secondary: string[] = [];

  for (const candidate of cleaned) {
    const mapped = BASE_SET.has(candidate)
      ? (candidate as BaseCategory)
      : (ALIASES[candidate] ?? null);

    if (mapped && primary === null) {
      primary = mapped;
      continue;
    }
    if (mapped === primary) continue;
    if (!secondary.includes(candidate)) secondary.push(candidate);
  }

  return {
    primary: primary ?? "uncategorised",
    secondary: secondary.filter((name) => name !== primary).slice(0, maxSecondary),
  };
}
