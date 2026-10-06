/**
 * Which plan a user is on — server only. Until billing exists everyone is on
 * Free, except the owner's emails (UNLIMITED_AI_EMAILS), who get Pro.
 * Billing will replace the body of userPlan() with a subscription lookup.
 */

import type { PrismaClient } from "@prisma/client";
import { isUnlimited } from "./ai-budget";
import { PLANS, type Plan } from "./plans";

/**
 * The plan this user is on (Free, or Pro for the owner's emails), with its
 * limits.
 */
export async function userPlan(prisma: PrismaClient, userId: string): Promise<Plan> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, isAnonymous: true },
  });
  const id = !user.isAnonymous && isUnlimited(user.email) ? "pro" : "free";
  return PLANS.find((plan) => plan.id === id)!;
}
