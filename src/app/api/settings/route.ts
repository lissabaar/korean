/**
 * PATCH /api/settings — save study settings (toggles and numbers from the
 * Settings page).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Only known fields with valid values are accepted; anything else in the
 * request is ignored. Switching "Also ask the other way" on sends the
 * Korean → English card of every already-learned word straight to review
 * (lib/review/siblings.ts) — otherwise they all came up as new words.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { promoteRecognitionOfLearned } from "@/lib/review/siblings";
import { MAX_MASTERED_AFTER_DAYS, MIN_MASTERED_AFTER_DAYS } from "@/lib/review/mastery";

/** Study settings. Only known boolean fields are accepted. */
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const data: {
    askRecognition?: boolean;
    showKoreanDefinition?: boolean;
    learningGoal?: number;
    masteredAfterDays?: number;
    autoPlayAudio?: boolean;
    myMeaningFirst?: boolean;
    newPerSession?: number;
    cardTextSize?: number;
    acceptTypos?: boolean;
  } = {};
  if (
    Number.isInteger(body.masteredAfterDays) &&
    body.masteredAfterDays >= MIN_MASTERED_AFTER_DAYS &&
    body.masteredAfterDays <= MAX_MASTERED_AFTER_DAYS
  ) {
    data.masteredAfterDays = body.masteredAfterDays;
  }
  if (Number.isInteger(body.learningGoal) && body.learningGoal >= 2 && body.learningGoal <= 10) {
    data.learningGoal = body.learningGoal;
  }
  if (typeof body.askRecognition === "boolean") data.askRecognition = body.askRecognition;
  if (typeof body.autoPlayAudio === "boolean") data.autoPlayAudio = body.autoPlayAudio;
  if (typeof body.acceptTypos === "boolean") data.acceptTypos = body.acceptTypos;
  if (typeof body.myMeaningFirst === "boolean") data.myMeaningFirst = body.myMeaningFirst;
  if (Number.isInteger(body.newPerSession) && body.newPerSession >= 5 && body.newPerSession <= 50) {
    data.newPerSession = body.newPerSession;
  }
  if (Number.isInteger(body.cardTextSize) && body.cardTextSize >= 0 && body.cardTextSize <= 2) {
    data.cardTextSize = body.cardTextSize;
  }
  if (typeof body.showKoreanDefinition === "boolean") {
    data.showKoreanDefinition = body.showKoreanDefinition;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data });
  if (data.askRecognition === true) await promoteRecognitionOfLearned(prisma, userId);
  return NextResponse.json({ ok: true });
}
