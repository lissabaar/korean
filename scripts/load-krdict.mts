/**
 * Load the whole KRDict (한국어기초사전) into the KrdictEntry table.
 *
 * The National Institute of Korean Language publishes the dictionary as a
 * download (CC BY-SA 2.0 KR): krdict.korean.go.kr/download/downloadPopup →
 * "Json 전체 내려받기". Unzip it and run:
 *
 *   npm run load-krdict -- "<folder with the *.json files>"
 *
 * Keeps per sense: Korean definition, English translation and definition,
 * Russian translation (used to match a learner's Russian meaning to the
 * right sense), and up to three examples — sentences first, then dialogue,
 * then short phrases. Other languages, pronunciation and media are dropped
 * (media is not open-licensed). The table is replaced as a whole: run it
 * again for a newer download.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: npm run load-krdict -- "<folder with the KRDict *.json files>"');
  process.exit(1);
}

type Feat = { att?: string; val?: string };
type Node = { feat?: Feat | Feat[]; [key: string]: unknown };

/** The download's "feat" lists ([{att, val}]) as a plain object. */
function feats(feat: Feat | Feat[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of Array.isArray(feat) ? feat : feat ? [feat] : []) {
    if (item.att && typeof item.val === "string") out[item.att] = item.val;
  }
  return out;
}

/** One child or several: always an array. */
function list<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

const EXAMPLE_ORDER: Record<string, number> = { 문장: 0, 대화: 1, 구: 2 };

/** One sense in the shape the app's DictSense uses. */
function mapSense(sense: Node) {
  const equivalents = new Map(
    list(sense.Equivalent as Node | Node[]).map((eq) => {
      const f = feats(eq.feat);
      return [f.language, f] as const;
    }),
  );
  const english = equivalents.get("영어");
  const russian = equivalents.get("러시아어");
  const examples = list(sense.SenseExample as Node | Node[])
    .map((example) => feats(example.feat))
    .filter((f) => f.example)
    .sort((a, b) => (EXAMPLE_ORDER[a.type] ?? 3) - (EXAMPLE_ORDER[b.type] ?? 3))
    .slice(0, 3)
    .map((f) => f.example.normalize("NFC"));
  return {
    definition: feats(sense.feat).definition ?? "",
    ...(english?.lemma && { translation: english.lemma }),
    ...(english?.definition && { translatedDefinition: english.definition }),
    ...(russian?.lemma && { translationRu: russian.lemma }),
    examples,
  };
}

const rows: Prisma.KrdictEntryCreateManyInput[] = [];
const usedCodes = new Map<string, number>();

for (const file of readdirSync(folder).filter((name) => name.endsWith(".json")).sort()) {
  const data = JSON.parse(readFileSync(join(folder, file), "utf8").replace(/^﻿/, ""));
  for (const entry of list(data.LexicalResource.Lexicon.LexicalEntry as Node[])) {
    const f = feats(entry.feat);
    const lemma = list(entry.Lemma as Node | Node[])
      .map((l) => feats(l.feat).writtenForm)
      .find(Boolean)
      ?.normalize("NFC");
    if (!lemma) continue;
    // Idioms/proverbs share their head word's id: give them "<id>.<n>".
    const id = String(entry.val);
    const seen = usedCodes.get(id) ?? 0;
    usedCodes.set(id, seen + 1);
    rows.push({
      targetCode: seen === 0 ? id : `${id}.${seen}`,
      lemma,
      homonym: f.homonym_number ? Number(f.homonym_number) : null,
      unit: f.lexicalUnit ?? null,
      partOfSpeech: f.partOfSpeech ?? null,
      level: f.vocabularyLevel ?? null,
      origin: f.origin ?? null,
      senses: list(entry.Sense as Node | Node[]).map(mapSense).filter((s) => s.definition),
    });
  }
  console.log(`${file}: ${rows.length} entries so far`);
}

const prisma = new PrismaClient();
const BATCH = 1000;
console.log(`Replacing KrdictEntry with ${rows.length} entries…`);
await prisma.krdictEntry.deleteMany();
for (let i = 0; i < rows.length; i += BATCH) {
  await prisma.krdictEntry.createMany({ data: rows.slice(i, i + BATCH) });
  process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
}
console.log(`\nDone: ${await prisma.krdictEntry.count()} entries in KrdictEntry.`);
await prisma.$disconnect();
