/**
 * Load hanja readings and meanings into the HanjaChar table.
 *
 * Source: the Unicode Unihan database (Unicode License v3), file
 * Unihan_Readings.txt from https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip.
 * Unzip it and run:
 *
 *   npm run load-hanja -- "<path to Unihan_Readings.txt>"
 *
 * Keeps every character that has a Korean reading (kHangul, ~8 500), with
 * its English meaning (kDefinition) when there is one. kHangul looks like
 * "소:0E" or "락:0N 낙:0N 악:0E" — the syllable before the colon is the
 * reading; the code after it (where the reading comes from) is dropped.
 * The table is replaced as a whole: run it again for a newer Unihan.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run load-hanja -- "<path to Unihan_Readings.txt>"');
  process.exit(1);
}

/** "U+5C0F" → "小". */
const fromCodePoint = (code: string) => String.fromCodePoint(parseInt(code.slice(2), 16));

const readings = new Map<string, string[]>();
const meanings = new Map<string, string>();
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.startsWith("U+")) continue;
  const [code, field, value] = line.split("\t");
  if (!value) continue;
  if (field === "kHangul") {
    readings.set(
      fromCodePoint(code),
      value.trim().split(/\s+/).map((part) => part.split(":")[0]).filter(Boolean),
    );
  } else if (field === "kDefinition") {
    meanings.set(fromCodePoint(code), value.trim());
  }
}

const rows = [...readings].map(([char, hangul]) => ({
  char,
  hangul: [...new Set(hangul)].join(","),
  definition: meanings.get(char) ?? null,
}));

const prisma = new PrismaClient();
console.log(`Replacing HanjaChar with ${rows.length} characters…`);
await prisma.hanjaChar.deleteMany();
for (let i = 0; i < rows.length; i += 2000) {
  await prisma.hanjaChar.createMany({ data: rows.slice(i, i + 2000) });
}
console.log(`Done: ${await prisma.hanjaChar.count()} characters, ${rows.filter((r) => r.definition).length} with a meaning.`);
await prisma.$disconnect();
