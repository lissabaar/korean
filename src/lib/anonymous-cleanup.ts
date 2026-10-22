/**
 * Remove anonymous accounts nobody uses any more.
 *
 * Library module (server: writes the database). Called after a page has been
 * sent (`after()` in app/(app)/layout.tsx), at most once a day per server
 * instance — no scheduled job or extra setting needed.
 *
 * An anonymous account is made for every first visit without signing in
 * (StartAnonymous). Deleted (with everything in it, by cascade):
 *   - anonymous accounts with no words, older than a day — nothing to lose
 *     (mostly automated browsers: deploy screenshots, link previews);
 *   - anonymous accounts whose sessions have not been used for
 *     STALE_DAYS — the visitor never came back (and never signed up: a
 *     sign-up moves the words to the real account and deletes this one).
 * Real accounts are never touched.
 */

import type { PrismaClient } from "@prisma/client";

/** No visit in this many days: the anonymous account goes (owner's choice). */
export const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When this server instance last cleaned up (ms); once a day is plenty. */
let lastRun = 0;

/** Delete unused anonymous accounts (see the file comment). Returns how many. */
export async function cleanUpAnonymous(prisma: PrismaClient): Promise<number> {
  const now = Date.now();
  if (now - lastRun < DAY_MS) return 0;
  lastRun = now;
  const { count } = await prisma.user.deleteMany({
    where: {
      isAnonymous: true,
      OR: [
        { createdAt: { lt: new Date(now - DAY_MS) }, entries: { none: {} } },
        {
          createdAt: { lt: new Date(now - STALE_DAYS * DAY_MS) },
          sessions: { none: { updatedAt: { gte: new Date(now - STALE_DAYS * DAY_MS) } } },
        },
      ],
    },
  });
  if (count > 0) console.log(`Removed ${count} unused anonymous accounts.`);
  return count;
}
