// sql.js (used to read Anki decks in the browser) loads its WebAssembly
// binary by URL. Serve it from public/ so the version always matches the
// installed package. Runs on every `npm install`.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm", "public/sql-wasm-browser.wasm");
