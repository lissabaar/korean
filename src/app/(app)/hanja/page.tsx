/**
 * "/hanja" — the Sino-Korean syllables in the user's words: each syllable
 * with the hanja behind it (소 → 小 "small", 少 "few", 所 "place" ...), the
 * character's meaning, the user's words built on it and more from the
 * dictionary; plus flip cards to practise them.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 * `searchParams` (?char=小, from a tapped syllable on a word card) opens that
 * character; in this Next.js version it is a Promise and must be awaited.
 *
 * Gathers the data here (lib/hanja.ts: which syllable comes from which
 * character, the Unihan meanings); <HanjaBrowser/> shows it.
 */

import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { alignHanja, hanjaInfo } from "@/lib/hanja";
import HanjaBrowser, { type HanjaCard } from "@/components/HanjaBrowser";

// Personal page: kept out of search results (see also app/robots.ts).
export const metadata = { title: "Hanja", robots: { index: false } };

export default async function HanjaPage({ searchParams }: { searchParams: Promise<{ char?: string }> }) {
  const user = await currentUser();
  if (!user) return null;
  const { char } = await searchParams;

  const entries = await prisma.entry.findMany({
    where: { userId: user.id, originalForm: { not: null } },
    select: {
      lemma: true,
      originalForm: true,
      senses: { where: { order: 0 }, select: { translation: true, userMeaning: true }, take: 1 },
    },
  });

  // Character → the syllable it is read as in these words, and the words.
  const byChar = new Map<string, { syllables: Set<string>; words: HanjaCard["words"] }>();
  for (const entry of entries) {
    const aligned = alignHanja(entry.lemma, entry.originalForm);
    if (!aligned) continue;
    const seen = new Set<string>();
    for (const item of aligned) {
      if (!item.char) continue;
      const card = byChar.get(item.char) ?? { syllables: new Set<string>(), words: [] };
      card.syllables.add(item.syllable);
      if (!seen.has(item.char)) {
        card.words.push({
          lemma: entry.lemma,
          originalForm: entry.originalForm!,
          translation: entry.senses[0]?.translation ?? entry.senses[0]?.userMeaning ?? null,
        });
        seen.add(item.char);
      }
      byChar.set(item.char, card);
    }
  }
  const info = await hanjaInfo(prisma, [...byChar.keys()]);
  const cards: HanjaCard[] = [...byChar].map(([hanja, { syllables, words }]) => ({
    char: hanja,
    // The reading as met in the user's words (노 in 노인 even though 老 is 로).
    syllable: [...syllables][0],
    readings: info.get(hanja)?.hangul ?? [],
    meaning: info.get(hanja)?.definition ?? null,
    words: words.sort((a, b) => a.lemma.localeCompare(b.lemma, "ko")),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-7">
        <p className="korean text-4xl text-celadon-deep">한자</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Hanja syllables</h1>
        <p className="mt-2 text-sm text-muted">
          Many Korean words are built from Chinese characters, each one a syllable with its own meaning: 소 in
          소년 is 少 “young”, 학 in 대학 is 學 “learning”. Here are the ones in your words. On word cards, tap
          a dotted syllable to see its character.
        </p>
      </header>
      <HanjaBrowser cards={cards} initialChar={char ?? null} />
      <p className="mt-8 text-xs text-muted">
        Which characters a word is made of: 한국어기초사전 (KRDict). Readings and meanings: Unicode Unihan
        database (Unicode License v3).
      </p>
    </main>
  );
}
