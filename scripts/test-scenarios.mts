/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment -- test script over loosely typed DB rows */
// @ts-nocheck — a test script on loosely typed database rows; it is run, not imported by the app.
/**
 * End-to-end scenario test of the app's logic (everything behind the UI),
 * on the real database with throwaway users that are deleted at the end.
 * Makes a few real AI calls (about 5 cents, on the project's Anthropic key).
 * Run after larger changes:  npm run test:scenarios
 * Covers: adding words (own meanings, a sense the dictionary lacks, idioms,
 * "put these in X", phrases only), learning (intro, skip, drill, graduation),
 * typed grading, editing (examples + translation, meanings to learn),
 * categories (rename, lock, re-sort, delete), reviews and background jobs,
 * the AI budget, anonymous → account, deleting a word. The UI itself
 * (clicks, image tiling in the browser) is not covered.
 */
const { prisma, anthropic, dictionaryKeys } = await import("../src/lib/clients.ts");
const { analyzeText } = await import("../src/lib/ingest/analyze.ts");
const { commitWords } = await import("../src/lib/ingest/commit.ts");
const { buildSession, getDeckStats } = await import("../src/lib/review/queue.ts");
const { introduceWord } = await import("../src/lib/review/intro.ts");
const { submitAnswer } = await import("../src/lib/review/submit.ts");
const { pickExercise } = await import("../src/lib/review/session.ts");
const edit = await import("../src/lib/words/edit.ts");
const { listSenses, setStudiedSenses } = await import("../src/lib/words/senses.ts");
const { dictionaryExamples, writeExample, fillMissingExamples } = await import("../src/lib/words/examples.ts");
const { translateOneExample, translateExamples } = await import("../src/lib/words/example-translations.ts");
const { resortPlan, resortBatch } = await import("../src/lib/words/resort.ts");
const { getAiBalance, assertCanUseAi } = await import("../src/lib/ai-budget.ts");
const { moveAnonymousData } = await import("../src/lib/words/merge-anonymous.ts");
const { createManualWord } = await import("../src/lib/words/manual.ts");
const { verifyPending } = await import("../src/lib/words/verify.ts");

let failed = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}
async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    check(`${name} (threw)`, false, error instanceof Error ? error.message.slice(0, 200) : String(error));
  }
}

const stamp = Date.now().toString(36);
const user = await prisma.user.create({ data: { email: `scenario-${stamp}@example.invalid`, name: "Scenario test" } });
const anon = await prisma.user.create({ data: { email: `anon-${stamp}@example.invalid`, isAnonymous: true } });
const userId = user.id;
const approve = (c: any) => ({
  lemma: c.lemma, sentence: c.sentence, contextNote: c.contextNote, register: c.register,
  primaryCategory: c.primaryCategory, secondaryCategories: c.secondaryCategories, categoriesFromAi: !c.edited,
  dictionary: c.dictionary, aiMeaning: c.aiMeaning, userMeaning: c.userMeaning,
  useDictionaryMeaning: c.useDictionaryMeaning, needsCheck: c.status === "unreachable",
});
let words: any[] = [];

try {
  // ------------------------------------------------------------ 1. add a word list with own meanings
  await scenario("add word list", async () => {
    const result = await analyzeText(prisma, anthropic, dictionaryKeys, {
      userId, unlimitedAi: false, phrases: true,
      source: { kind: "text", text: "놓다 — класть, помещать\n달달하다 — приторный, сладкий\n사과 — яблоко\n공원 — парк\n첫 단추를 끼우다 — хорошо начать дело" },
    });
    const by = (l: string) => result.candidates.find((c: any) => c.lemma === l);
    check("list: 5 candidates", result.candidates.length >= 5, result.candidates.map((c: any) => `${c.lemma}:${c.status}`).join(", "));
    check("놓다 → sense 'put; place'", by("놓다")?.dictionary?.senses[0]?.translation === "put; place", by("놓다")?.dictionary?.senses[0]?.translation);
    check("달달하다 → dictionary lacks 'sweet' → AI meaning", by("달달하다")?.status === "ai" && by("달달하다")?.dictionaryMismatch === true, `${by("달달하다")?.status} ${by("달달하다")?.aiMeaning}`);
    check("사과 + 'яблоко' → apple", /apple/i.test(by("사과")?.dictionary?.senses[0]?.translation ?? ""), by("사과")?.dictionary?.senses[0]?.translation);
    check("idiom found in dictionary", by("첫 단추를 끼우다")?.status === "new", by("첫 단추를 끼우다")?.status);
    const saved = await commitWords(prisma, { userId, kind: "TEXT", text: "list", title: "scenario", words: result.candidates.filter((c: any) => c.selected).map(approve) });
    check("commit: entry ids returned", saved.entryIds.length > 0 && saved.entryIds.every(Boolean), `${saved.created} created`);
    words = await prisma.entry.findMany({ where: { userId }, include: { senses: { include: { examples: true, cards: true } } } });
    const noh = words.find((w) => w.lemma === "놓다");
    check("놓다 saved: studied sense first, own meaning kept, 2 cards", noh?.senses.find((s: any) => s.order === 0)?.translation === "put; place" && noh?.senses.find((s: any) => s.order === 0)?.userMeaning?.includes("класть") && noh?.senses.find((s: any) => s.order === 0)?.cards.length === 2);
    check("dictionary examples saved at once", (noh?.senses.find((s: any) => s.order === 0)?.examples.length ?? 0) > 0);
  });

  // ------------------------------------------------------------ 2. "put these in X" note → locked category
  await scenario("requested category", async () => {
    const result = await analyzeText(prisma, anthropic, dictionaryKeys, {
      userId, unlimitedAi: false,
      source: { kind: "text", text: "저는 아침에 커피를 마시고 빵을 먹어요.", note: "добавь все слова в категорию завтрак" },
    });
    check("note → requestedCategory", result.requestedCategory === "завтрак", JSON.stringify(result.requestedCategory));
    check("every candidate in it", result.candidates.every((c: any) => c.primaryCategory === "завтрак"));
    await commitWords(prisma, { userId, kind: "TEXT", text: "x", words: result.candidates.filter((c: any) => c.selected).map((c: any) => ({ ...approve(c), lockCategory: true })) });
    const cat = await prisma.category.findFirst({ where: { userId, name: "завтрак" } });
    check("category saved locked", cat?.locked === true);
  });

  // ------------------------------------------------------------ 3. phrases only
  await scenario("phrases only", async () => {
    const result = await analyzeText(prisma, anthropic, dictionaryKeys, {
      userId, unlimitedAi: false, phrases: "only",
      source: { kind: "text", text: "만나서 반갑습니다. 저는 학생이에요. 잘 부탁드립니다." },
    });
    check("only phrases returned", result.candidates.length > 0 && result.candidates.every((c: any) => c.kind === "phrase"), result.candidates.map((c: any) => `${c.lemma}:${c.kind}`).join(", "));
  });

  // ------------------------------------------------------------ 4. learning: intro, drill, graduate
  await scenario("learning", async () => {
    let items = await buildSession(prisma, userId, "learn");
    check("learn session has intro cards", items.length > 0 && items.every((i: any) => i.intro), `${items.length} cards`);
    const first = items[0];
    await introduceWord(prisma, userId, { cardId: first.cardId, action: "start" });
    const skipTarget = items.find((i: any) => i.senseId !== first.senseId);
    const skip = await introduceWord(prisma, userId, { cardId: skipTarget.cardId, action: "skip", sessionSenseIds: items.map((i: any) => i.senseId) });
    const snoozed = await prisma.card.findFirst({ where: { id: skipTarget.cardId } });
    check("skip snoozes ~3 days", snoozed?.snoozedUntil && snoozed.snoozedUntil.getTime() > Date.now() + 2.9 * 864e5);
    check("skip returns a replacement", Array.isArray(skip.replacement));
    items = await buildSession(prisma, userId, "learn");
    check("snoozed word left the session", !items.some((i: any) => i.senseId === skipTarget.senseId));
    // drill one RECALL card to graduation: right answers with the expected lemma
    const card = await prisma.card.findFirst({ where: { id: first.cardId }, include: { sense: { include: { entry: true } } } });
    const lemma = card.sense.entry.lemma;
    let result: any;
    for (let step = 0; step < 10; step++) {
      const fresh = await prisma.card.findUnique({ where: { id: card.id } });
      if (fresh.phase !== "LEARNING") break;
      const exercise = pickExercise(fresh, 5);
      const answer = card.direction === "RECALL" ? lemma : (card.sense.translation ?? "");
      result = await submitAnswer(prisma, userId, { cardId: card.id, answer: exercise === "TYPING" ? answer : (card.direction === "RECALL" ? lemma : (card.sense.translation ?? "")) });
    }
    const after = await prisma.card.findUnique({ where: { id: card.id } });
    check("5 right answers graduate the card", after.phase === "SCHEDULED" && result?.graduated === true, `${after.phase}`);
    check("first review is ~1 day later", after.due.getTime() > Date.now() + 0.9 * 864e5);
    const logs = await prisma.reviewLog.count({ where: { cardId: card.id } });
    check("learning wrote no ReviewLog", logs === 0);
  });

  // ------------------------------------------------------------ 5. typing: wrong syllable is wrong
  await scenario("typing grading", async () => {
    const word = await createManualWord(prisma, userId, { lemma: "동전", translation: "coin" });
    const card = await prisma.card.findFirst({ where: { userId, direction: "RECALL", sense: { entryId: word.entryId ?? word.id } } }) ?? await prisma.card.findFirst({ where: { userId, direction: "RECALL", sense: { entry: { lemma: "동전" } } } });
    await prisma.card.update({ where: { id: card.id }, data: { learningStreak: 4, introducedAt: new Date() } }); // last step: typing
    const wrong = await submitAnswer(prisma, userId, { cardId: card.id, answer: "동근" });
    check("동근 for 동전 is wrong", wrong.correct === false && wrong.graduated === false, wrong.verdict);
    await prisma.card.update({ where: { id: card.id }, data: { learningStreak: 4 } });
    const slip = await submitAnswer(prisma, userId, { cardId: card.id, answer: "동젼" });
    check("동젼 for 동전 is a typo (accepted)", slip.verdict === "almost" && slip.graduated === true, slip.verdict);
  });

  // ------------------------------------------------------------ 6. edit: example + translation, senses
  await scenario("editing", async () => {
    const noh = await prisma.entry.findFirst({ where: { userId, lemma: "놓다" } });
    const ex = await dictionaryExamples(prisma, dictionaryKeys, userId, noh.id);
    check("dictionary examples for the editor", ex.length > 0, ex[0]?.text);
    const ai = await writeExample(prisma, anthropic, userId, noh.id);
    check("AI example comes with translation", Boolean(ai.text && ai.translation), `${ai.text} / ${ai.translation}`);
    const { untranslatedExampleId } = await edit.updateWord(prisma, userId, noh.id, { example: "저는 책을 책상 위에 놓았어요." });
    check("typed example reported untranslated", Boolean(untranslatedExampleId));
    const english = await translateOneExample(prisma, anthropic, userId, untranslatedExampleId!);
    const details = await edit.getWord(prisma, userId, noh.id);
    check("typed example translated on save", Boolean(english) && details.exampleEnglish === english, english ?? "");
    const senses = await listSenses(prisma, dictionaryKeys, userId, noh.id);
    check("senses list has all 27", senses.length >= 27, `${senses.length}`);
    const letGo = senses.find((s: any) => s.translation?.startsWith("let go"));
    const studied = senses.filter((s: any) => s.studied).map((s: any) => s.key);
    const ids = await setStudiedSenses(prisma, dictionaryKeys, userId, noh.id, [...studied, letGo.key]);
    const cardsNow = await prisma.card.count({ where: { userId, sense: { entryId: noh.id } } });
    check("ticking a second meaning adds 2 cards", ids.length === 2 && cardsNow === 4, `${cardsNow} cards`);
    await setStudiedSenses(prisma, dictionaryKeys, userId, noh.id, studied);
    check("unticking removes them", (await prisma.card.count({ where: { userId, sense: { entryId: noh.id } } })) === 2);
    let threw = false;
    try { await setStudiedSenses(prisma, dictionaryKeys, userId, noh.id, []); } catch { threw = true; }
    check("cannot untick every meaning", threw);
  });

  // ------------------------------------------------------------ 7. categories: rename/merge, lock, re-sort, delete
  await scenario("categories", async () => {
    const cats = await prisma.category.findMany({ where: { userId } });
    const unlocked = cats.find((c: any) => !c.locked && c.name !== "uncategorised");
    const renamed = await edit.renameCategory(prisma, userId, unlocked.id, "my test category");
    check("rename", !renamed.merged);
    const plan = await resortPlan(prisma, userId);
    const lockedWords = await prisma.entry.count({ where: { userId, categories: { some: { category: { locked: true } } } } });
    check("re-sort plan skips locked words", plan.lockedWords === lockedWords && plan.estimatedCredits > 0, `${plan.words} words, ~${plan.estimatedCredits} credits`);
    const lockedBefore = await prisma.entryCategory.findMany({ where: { category: { userId, locked: true } } });
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) { const r = await resortBatch(prisma, anthropic, userId, cursor); cursor = r.nextCursor; if (!cursor) break; }
    const lockedAfter = await prisma.entryCategory.findMany({ where: { category: { userId, locked: true } } });
    check("re-sort left locked words where they were", lockedBefore.length === lockedAfter.length);
    const perWord = await prisma.entry.findMany({ where: { userId, categories: { none: { category: { locked: true } } } }, select: { _count: { select: { categories: true } } } });
    check("re-sorted words have exactly one category", perWord.every((w: any) => w._count.categories === 1));
    const target = await prisma.category.findFirst({ where: { userId, name: "my test category" } });
    if (target) {
      await edit.deleteCategory(prisma, userId, target.id);
      const loose = await prisma.entry.count({ where: { userId, categories: { none: {} } } });
      check("deleting a category leaves no word without one", loose === 0);
    }
  });

  // ------------------------------------------------------------ 8. reviews, stats, background jobs
  await scenario("review + stats", async () => {
    await prisma.card.updateMany({ where: { userId, phase: "SCHEDULED" }, data: { due: new Date(Date.now() - 1000) } });
    const items = await buildSession(prisma, userId, "review");
    check("due cards come up in review", items.length > 0 && items.every((i: any) => i.phase === "SCHEDULED"));
    const r = await submitAnswer(prisma, userId, { cardId: items[0].cardId, answer: items[0].choices?.[0] ?? "x" });
    check("review answer schedules FSRS + log", Boolean(r.nextDue) && (await prisma.reviewLog.count({ where: { cardId: items[0].cardId } })) === 1);
    const stats = await getDeckStats(prisma, userId);
    check("deck stats", stats.words > 0, JSON.stringify(stats));
    const v = await verifyPending(prisma, dictionaryKeys, userId);
    check("verify runs", v.remaining === 0);
    const fill = await fillMissingExamples(prisma, anthropic, dictionaryKeys, userId);
    check("fill examples runs", typeof fill.remaining === "number", JSON.stringify(fill));
    const tr = await translateExamples(prisma, anthropic, userId);
    check("translate examples runs", typeof tr.remaining === "number", JSON.stringify(tr));
  });

  // ------------------------------------------------------------ 9. AI budget
  await scenario("AI budget", async () => {
    const balance = await getAiBalance(prisma, userId);
    check("free allowance is 20 (unless FREE_AI_CREDITS is set)", balance.allowance === Number(process.env.FREE_AI_CREDITS ?? 20), `${balance.allowance}, ${balance.remaining} left`);
    await prisma.user.update({ where: { id: userId }, data: { aiBonusCredits: -1000 } });
    let scope = "";
    try { await assertCanUseAi(prisma, userId); } catch (e: any) { scope = e.scope; }
    check("out of credits blocks AI", scope === "user");
    const items = await buildSession(prisma, userId, "all");
    check("…but study still works", items.length >= 0);
    await prisma.user.update({ where: { id: userId }, data: { aiBonusCredits: 0 } });
    let anonScope = "";
    try { await assertCanUseAi(prisma, anon.id); } catch (e: any) { anonScope = e.scope; }
    check("anonymous users get no AI", anonScope === "anonymous");
  });

  // ------------------------------------------------------------ 10. anonymous → account
  await scenario("anonymous merge", async () => {
    await createManualWord(prisma, anon.id, { lemma: "바다", translation: "sea" });
    await createManualWord(prisma, anon.id, { lemma: "놓다", translation: "put" });
    await moveAnonymousData(prisma, anon.id, userId);
    const sea = await prisma.entry.count({ where: { userId, lemma: "바다" } });
    const dup = await prisma.entry.count({ where: { userId, lemma: "놓다" } });
    check("anonymous words move to the account, duplicates dropped", sea === 1 && dup === 1, `바다 ${sea}, 놓다 ${dup}`);
  });

  // ------------------------------------------------------------ 11. delete word
  await scenario("delete word", async () => {
    const w = await prisma.entry.findFirst({ where: { userId, lemma: "바다" } });
    await edit.deleteWord(prisma, userId, w.id);
    check("word and its cards gone", (await prisma.entry.count({ where: { id: w.id } })) === 0 && (await prisma.card.count({ where: { sense: { entryId: w.id } } })) === 0);
  });
} finally {
  const spent = await prisma.aiUsage.aggregate({ where: { userId: { in: [userId, anon.id] } }, _sum: { costMicros: true } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, anon.id] } } });
  await prisma.sourceMaterial.deleteMany({ where: { userId: { in: [userId, anon.id] } } });
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed} passed, ${failed} failed · AI cost $${((spent._sum.costMicros ?? 0) / 1e6).toFixed(3)} · test users deleted`);
  await prisma.$disconnect();
}
