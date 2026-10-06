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
  /** Rough capacity, shown to people instead of "credits". */
  wordsHint: string;
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
    wordsHint: "about 300–500 words found by AI",
    features: [
      "Unlimited words typed in by hand, with dictionary lookup",
      "Unlimited reviews and learning",
      "Categories, starter deck, examples from the dictionary",
      "50 AI credits to try texts, screenshots and Anki imports",
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
    wordsHint: "about 1,500–2,500 words a month",
    features: [
      "Everything in Free",
      "200 AI credits every month",
      "Texts, screenshots, Anki decks and tables",
      "AI-written examples where the dictionary has none",
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
    wordsHint: "about 4,000–6,000 words a month",
    features: [
      "Everything in Plus",
      "500 AI credits every month",
      "For importing whole Anki decks and textbooks",
    ],
  },
];
