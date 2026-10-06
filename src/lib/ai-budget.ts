/**
 * Who may spend money on model calls, and how much.
 *
 * Registration is open, so the AI part is metered: every user gets a free
 * allowance of credits (1 credit = 1 US cent of model cost), and once it is
 * spent only the AI features stop — reviews and saved words keep working.
 * A shared daily budget across all free users caps the worst case (someone
 * registering a hundred accounts). The owner's emails are unlimited.
 *
 * The real hard stop is still a spend limit in the Anthropic console; this
 * is the polite layer in front of it.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";

/** 1 credit = 1 cent = 10 000 micro-dollars. */
const MICROS_PER_CREDIT = 10_000;

/**
 * Price per token in micro-dollars ($3 per million tokens = 3 per token).
 * Update when the extraction model changes; an unknown model is charged at
 * the most expensive known rate rather than for free.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Free credits per user. Default 50 = $0.50, roughly 10–25 analysed parts. */
export const freeCredits = () => envInt("FREE_AI_CREDITS", 50);

/** Shared budget per UTC day for everyone who is not unlimited. */
export const dailyBudgetCredits = () => envInt("AI_DAILY_BUDGET_CREDITS", 300);

export function isUnlimited(email: string): boolean {
  const list = (process.env.UNLIMITED_AI_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function costMicros(model: string, usage: Anthropic.Usage): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  // Cache reads and writes are input tokens too; count them at full price
  // (the extraction prompt is not cached, so this is exact in practice).
  const input =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  return input * price.input + usage.output_tokens * price.output;
}

export interface AiBalance {
  unlimited: boolean;
  /** No account yet: AI is off until they sign up (and get free credits). */
  anonymous: boolean;
  /** Whole credits; Infinity for unlimited users. */
  remaining: number;
  allowance: number;
}

export async function getAiBalance(prisma: PrismaClient, userId: string): Promise<AiBalance> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, aiBonusCredits: true, isAnonymous: true },
  });
  if (user.isAnonymous) {
    return { unlimited: false, anonymous: true, remaining: 0, allowance: 0 };
  }
  if (isUnlimited(user.email)) {
    return { unlimited: true, anonymous: false, remaining: Infinity, allowance: Infinity };
  }
  const used = await prisma.aiUsage.aggregate({
    where: { userId },
    _sum: { costMicros: true },
  });
  const allowance = freeCredits() + user.aiBonusCredits;
  const usedCredits = (used._sum.costMicros ?? 0) / MICROS_PER_CREDIT;
  return {
    unlimited: false,
    anonymous: false,
    remaining: Math.max(0, Math.floor(allowance - usedCredits)),
    allowance,
  };
}

export class AiQuotaError extends Error {
  constructor(readonly scope: "user" | "daily" | "anonymous") {
    super(
      scope === "user"
        ? "AI credits used up"
        : scope === "daily"
          ? "Daily AI budget reached"
          : "AI needs an account",
    );
  }
}

/**
 * Throws AiQuotaError when this user may not start another model call.
 * Checked before the call; the call itself may overshoot by its own cost,
 * which is at most a few cents.
 */
export async function assertCanUseAi(prisma: PrismaClient, userId: string): Promise<AiBalance> {
  const balance = await getAiBalance(prisma, userId);
  if (balance.unlimited) return balance;
  if (balance.anonymous) throw new AiQuotaError("anonymous");
  if (balance.remaining <= 0) throw new AiQuotaError("user");

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const today = await prisma.aiUsage.aggregate({
    where: { unlimited: false, createdAt: { gte: dayStart } },
    _sum: { costMicros: true },
  });
  if ((today._sum.costMicros ?? 0) >= dailyBudgetCredits() * MICROS_PER_CREDIT) {
    throw new AiQuotaError("daily");
  }
  return balance;
}

export async function recordAiUsage(
  prisma: PrismaClient,
  userId: string,
  unlimited: boolean,
  model: string,
  usage: Anthropic.Usage,
): Promise<void> {
  await prisma.aiUsage.create({
    data: {
      userId,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costMicros: costMicros(model, usage),
      unlimited,
    },
  });
}
