/**
 * Plans — DRAFT, nothing is sold yet. One source of truth for the pricing
 * page now and for billing later (see PRICING.md for how the numbers were
 * worked out, PAYMENTS.md for the plan to take payments).
 *
 * Credits are the existing AI meter: 1 credit = 1 US cent of model cost.
 * A plan's monthly credits are therefore also its worst-case AI cost.
 */

export interface Plan {
  id: "free" | "plus" | "pro";
  name: string;
  /** Monthly price; null = free. */
  priceUsd: number | null;
  priceRub: number | null;
  /** Yearly price (two months free). */
  yearlyUsd: number | null;
  yearlyRub: number | null;
  /** AI credits: one-off for free, per month for paid plans. */
  credits: number;
  creditsPeriod: "once" | "month";
  /** One line on who the plan is for. */
  wordsHint: string;
  /** Typed-in dictionary lookups per day; null = unlimited. */
  dictionaryLookupsPerDay: number | null;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: null,
    priceRub: null,
    yearlyUsd: null,
    yearlyRub: null,
    credits: 50,
    creditsPeriod: "once",
    wordsHint: "Everything you need to learn — for good",
    dictionaryLookupsPerDay: 100,
    features: [
      "Learning and reviews, unlimited",
      "Add words by hand with dictionary lookup (100 a day)",
      "Categories, starter deck, dictionary examples",
      "50 AI credits to try texts, screenshots, Anki and topics",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    priceUsd: 4.99,
    priceRub: 399,
    yearlyUsd: 49,
    yearlyRub: 3990,
    credits: 200,
    creditsPeriod: "month",
    wordsHint: "For learning from what you read and watch",
    dictionaryLookupsPerDay: 1000,
    features: [
      "Everything in Free",
      "AI turns texts, screenshots, subtitles and Anki decks into cards",
      "Words on any topic, examples written where the dictionary has none",
      "1,000 dictionary lookups a day",
      "Coming: AI exercises and answer checking",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 9.99,
    priceRub: 799,
    yearlyUsd: 99,
    yearlyRub: 7990,
    credits: 500,
    creditsPeriod: "month",
    wordsHint: "For heavy importing and practice",
    dictionaryLookupsPerDay: null,
    features: [
      "Everything in Plus, with 2.5× the AI",
      "Whole Anki decks and textbooks at once",
      "Unlimited dictionary lookups",
      "Coming: more AI practice — writing and conversation checks",
    ],
  },
];
