/**
 * Reading an Anki deck export (.apkg / .colpkg) in the browser.
 *
 * The package is a zip. Inside, the notes live in an SQLite database:
 *   collection.anki21b  — Anki 2.1.50+, zstd-compressed
 *   collection.anki21   — older exports
 *   collection.anki2    — oldest; in new exports only a stub that says
 *                         "please update Anki", so it is the last resort
 * Media files are skipped entirely — only the collection is unzipped.
 *
 * Loaded on demand (dynamic import) so sql.js and its WebAssembly binary
 * are only fetched when someone actually drops a deck.
 */

import { unzipSync } from "fflate";
import { decompress } from "fzstd";
import initSqlJs from "sql.js";
import { fieldsToLine, UnsupportedFileError } from "./read";

/** Copied into public/ by scripts/copy-sqljs-wasm.mjs on npm install. */
const SQL_WASM_URL = "/sql-wasm-browser.wasm";

const STUB_TEXT = "update to the latest Anki version";

export async function readAnkiPackage(buffer: ArrayBuffer): Promise<string[]> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (file) => file.name.startsWith("collection."),
    });
  } catch {
    throw new UnsupportedFileError("This does not look like an Anki export (not a valid zip).");
  }

  const database = files["collection.anki21b"]
    ? decompress(files["collection.anki21b"])
    : (files["collection.anki21"] ?? files["collection.anki2"]);
  if (!database) {
    throw new UnsupportedFileError("No Anki collection found inside this file.");
  }

  // In Node (tests) sql.js finds its own binary next to the module.
  const SQL = await initSqlJs(
    typeof window === "undefined" ? {} : { locateFile: () => SQL_WASM_URL },
  );
  const db = new SQL.Database(database);
  try {
    const [result] = db.exec("SELECT flds FROM notes");
    const rows = (result?.values ?? []).map((row) => String(row[0]));

    if (rows.length === 1 && rows[0].includes(STUB_TEXT)) {
      throw new UnsupportedFileError(
        "This deck was exported in a format only newer Anki can read. Re-export it with “Support older Anki versions” ticked.",
      );
    }

    // Fields are separated by the ASCII unit separator.
    return rows
      .map((fields) => fieldsToLine(fields.split("\x1f")))
      .filter((line): line is string => line !== null);
  } finally {
    db.close();
  }
}
