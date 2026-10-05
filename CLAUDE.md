# Korean vocabulary app

Flashcard app for learning Korean. Paste text → AI extracts words → dictionary
looks them up → spaced repetition schedules reviews.

## Stack

- **Next.js** (App Router, TypeScript, `src/` layout)
- **Tailwind CSS v4** with custom design tokens in `globals.css`
- **Prisma 6** + PostgreSQL on Neon. Pinned to 6: Prisma 7+ drops
  `url = env(...)` in the datasource and the `prisma-client-js` generator,
  which this schema uses. Upgrading is a deliberate migration, not a bump.
- **Better Auth** for auth (not NextAuth)
- **Anthropic SDK** (`claude-sonnet-4-6`) — AI only supplements dictionaries,
  never replaces them. Extraction uses structured outputs
  (`messages.parse` + Zod schema); never go back to "please answer in JSON"
  in the prompt — the model then sometimes answers in prose.
- **ts-fsrs** for spaced repetition scheduling
- **fast-xml-parser** for dictionary XML responses
- **Zod** for the extraction response schema

## Project layout

```
prisma/schema.prisma        full data model — read before touching the DB
src/app/                    Next.js pages and API routes
src/components/             React client components
src/lib/
  ai-budget.ts              free AI credits, usage log, daily cap
  auth.ts                   Better Auth config
  auth-client.ts            client-side auth helpers ("use client")
  session.ts                server-side session helpers
  db.ts                     Prisma singleton
  clients.ts                Anthropic client + dictionary keys
  dictionary/krdict.ts      KRDict → STDICT lookup chain (both free, XML)
  ingest/
    extract.ts              model → lemmas + categories (no DB writes)
    categories.ts           fixed taxonomy, alias folding
    analyze.ts              text → WordCandidate[], homograph ranking (no DB writes)
    commit.ts               approved candidates → entries + cards
  review/
    session.ts              learning vs review phases, FSRS wrapper
    answer.ts               Hangul NFC normalisation, edit-distance grading
    distractors.ts          plausible wrong options for multiple choice
    queue.ts                cards → ReviewItem[] for a session (reads only)
    submit.ts               grade one answer, advance learning or FSRS
src/lib/import/             browser-only: dropped files → analysis jobs
  read.ts                   images (downscaled), CSV/TSV, text, subtitles; chunking
  anki.ts                   .apkg/.colpkg via fflate + fzstd + sql.js (lazy-loaded)
scripts/copy-sqljs-wasm.mjs postinstall: puts sql.js's wasm in public/
src/app/(app)/              signed-in pages (home, /review, /add); layout = auth + Nav
src/app/api/review/         session (GET) and answer (POST) routes
```

Docs: `SETUP.md` (Russian, for the owner) — setting up on a new machine.

## Key design rules — don't break these

**AI supplements, dictionaries decide.**
The model produces lemmas, context notes and category guesses.
Definitions, translations, examples, levels and hanja come from KRDict/STDICT.
A lemma with no dictionary entry is rejected, not saved.

**One card tests one thing.**
Cards hang off `Sense`, not `Entry`. A word with three senses → three sense
rows, but only the first sense gets cards by default.

**Two phases, not two difficulties.**
`LEARNING` (streak-based, no FSRS) and `SCHEDULED` (FSRS). Never put learning
drill results into the FSRS scheduler — it reads them as performance data.

**Exercise type is deterministic.**
`pickExercise()` in `review/session.ts` is a pure function of card state.
Never randomise it — FSRS needs consistent difficulty per card.

**Hangul is always NFC.**
Korean input from macOS IME is often NFD. Normalise before any string
comparison. See `review/answer.ts`.

**Unreachable is not unverified.**
A dictionary that did not answer (timeout) must never count as "no such
word". `lookup()` throws `DictionaryUnavailableError`, `lookupMany()` maps
the word to `null`, and the candidate gets status `unreachable`.

**The model picks the homograph, the dictionary supplies it.**
KRDict returns several entries for one spelling (공원: 公園 park, 工員
worker). The model returns a short English `gloss`; `rankHomographs()` in
`analyze.ts` orders the dictionary's entries by it. The gloss is never
stored as a translation. The preview lets the user override the pick.

**Grading happens on the server.**
`submit.ts` recomputes the exercise with `pickExercise()` and grades from
the card row; the client only sends what was picked or typed. Learning
answers write no `ReviewLog` (it is FSRS training data). `Card.learningSteps`
must round-trip through FSRS — ts-fsrs 5 needs it for relearning intervals.

**Files are parsed in the browser.**
Only note text or a downscaled JPEG (≤1568 px) reaches the server — an Anki
deck's media never leaves the machine, and requests stay far below hosting
body limits (~4.5 MB on Vercel). Big inputs are split into parts of 40
lines, analysed one request at a time so a stop keeps what was found.
Lines without Hangul are dropped before any model call.

**Registration is open; the AI is metered.**
Every model call goes through `ai-budget.ts`: `assertCanUseAi()` before,
`recordAiUsage()` right after (in `analyzeText`, before the dictionary step —
the money is spent either way). Users get `FREE_AI_CREDITS` (1 credit = 1
cent of model cost) plus `User.aiBonusCredits`; `UNLIMITED_AI_EMAILS` skip
the meter; `AI_DAILY_BUDGET_CREDITS` caps all free users together per UTC
day. Out of credits only blocks finding new words — never reviews. Any new
feature that calls the model must use the same two functions.

**Auth owns nothing in `clients.ts`.**
Prisma lives in `db.ts`; auth in `auth.ts`. Both import from `db.ts`.
Never create a second Prisma instance.

## Environment variables

```
DATABASE_URL          # Neon pooled string (host has -pooler)
DIRECT_URL            # same without -pooler; prisma migrate needs it
ANTHROPIC_API_KEY
KRDICT_API_KEY
STDICT_API_KEY        # optional fallback
BETTER_AUTH_SECRET
BETTER_AUTH_URL       # the site's own URL (http://localhost:3000 locally)
FREE_AI_CREDITS       # optional, default 100 per user
AI_DAILY_BUDGET_CREDITS # optional, default 300 across all free users
UNLIMITED_AI_EMAILS   # comma-separated; the owner's account
```

## Common commands

```bash
npm run dev                        # start dev server
npx prisma migrate dev --name x    # new migration
npx prisma studio                  # browse the DB in the browser
npm run build                      # typecheck + production build
npx auth generate                  # regenerate auth models after a better-auth upgrade
                                   # (rewrites schema.prisma with CRLF — check the diff)
```

Run Node through `npm run …`: the project `.npmrc` sets
`node-options=--use-system-ca`, needed on networks that re-sign TLS
(corporate proxies). Without it, calls to Anthropic fail with
`SELF_SIGNED_CERT_IN_CHAIN`. Where PowerShell blocks `npm.ps1`, use
`npm.cmd …` rather than changing the execution policy.

## What's not built yet

- Example sentences — KRDict's search API has none; needs its view API
  (`/api/view`, by `target_code`)
- Hanja module (schema has `SHARES_HANJA` relation type reserved)
- Synonym grouping for review (backlog)
- Spanish support (schema supports it, UI doesn't)

## Decisions already made

- **Database: PostgreSQL (Neon), not YDB.** Prisma has no YDB connector and
  YDB removed its PostgreSQL compatibility layer. The Neon project is in
  sa-east-1 (São Paulo) on purpose — chosen for where the app is used.
  Don't suggest moving it.
- **Hosting: not GitLab/GitHub Pages.** They serve static files only; this
  app needs a server (API routes, auth, secret keys). Vercel Hobby fits
  (free, personal use; when limits run out it pauses, never bills). If
  deployed, set the function region to `gru1` (São Paulo) next to Neon.

## Next.js version notes

@AGENTS.md
