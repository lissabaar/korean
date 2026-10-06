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
- **Anthropic SDK** (`claude-sonnet-4-6`, no thinking) — AI only supplements dictionaries,
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
  auth.ts                   Better Auth config (+ anonymous plugin)
  category-icons.ts         Bootstrap Icons defaults + picker suggestions (client-safe)
  guess-icon.ts             icon for a user-named category (server: full icon list)
  dictionary/labels.ts      KRDict level / part-of-speech labels → English
  dictionary/cached.ts      shared DB cache for KRDict + per-plan daily lookup limit
  plan-limits.ts            userPlan(): Free for everyone, Pro for UNLIMITED_AI_EMAILS
  auth-client.ts            client-side auth helpers ("use client")
  session.ts                server-side session helpers
  db.ts                     Prisma singleton
  clients.ts                Anthropic client + dictionary keys
  dictionary/krdict.ts      KRDict → STDICT lookup chain (both free, XML)
  words/
    manual.ts               word typed in by hand (source USER), no AI
    starter-deck.ts         ready-made deck for empty accounts (DRAFT content)
    merge-anonymous.ts      anonymous → real account on sign-up/sign-in
    edit.ts                 rename/merge/delete categories, edit/delete words
    examples.ts             fill missing examples: KRDict view API first, AI after
  plans.ts                  plan prices and credits (DRAFT) — pricing page + billing
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
src/app/(app)/              app pages: home, /learn, /review, /add, /categories,
                            /settings, /pricing; layout starts an anonymous session
                            for first-time visitors
src/app/api/review/         session (GET) and answer (POST) routes
src/app/api/{words,categories,settings,starter-deck,dictionary}/
                            manual words (+ edit), category flags/rename/delete,
                            dictionary lookup for typed-in words (no AI)
```

Docs for the owner (Russian): `SETUP.md` new machine, `VERCEL.md` deploys,
`PRICING.md` how plan numbers were derived, `PAYMENTS.md` plan for billing
(two businesses: RU cards via a Russian acquirer, foreign cards via a
merchant of record from Uruguay — never help route around sanctions).

## Key design rules — don't break these

**Two meanings, never one over the other.**
`Sense.translation` is English (dictionary, else AI); `Sense.userMeaning` is
what the user wrote, any language. Cards lead with English and show the
user's below (`User.myMeaningFirst` swaps them); typed answers accept both.
`words/meanings.ts` fills missing English (dictionary by target code first,
then AI checked against the dictionary) — run after saving and from Settings.

**Order of trust: the user's meaning, then the dictionary, then the AI.**
- A meaning the user wrote in the input (`userMeaning`) is kept and shown. The dictionary is still consulted; when the model judges the
  user's meaning wrong for the word (`userMeaningFits: false`) or corrects
  their spelling, the candidate gets a `conflict` and the user decides
  (`useDictionaryMeaning`, "Use dictionary for all").
- Definitions, examples, levels and hanja come from KRDict/STDICT whenever
  it has the entry.
- What the dictionary lacks — phrases, compounds, rare words — is kept with
  the model's `meaning` (status `ai`, stored with source AI, shown as "AI
  meaning"), not rejected. `commit.ts` `resolveEntry()` builds that entry.
- Phrases: with "Words & phrases" on, extraction returns `kind: "phrase"`
  for expressions and sentences, learned as one card. Typed answers ignore
  punctuation and spacing and allow about one typo per 7 characters.

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

**No login wall; AI needs an account.**
A first-time visitor gets an anonymous Better Auth user (created in the
browser by `StartAnonymous`, so crawlers never create rows). Everything works
for them except AI (`ai-budget.ts` refuses with scope `anonymous`). On
sign-up/sign-in the anonymous plugin calls `onLinkAccount` and then DELETES
the anonymous user — `moveAnonymousData()` must run first or the words go
with it. Pages in `(app)` use `currentUser()`, never a redirect to sign-in.

**Typed-in words are the user's own facts.**
The one exception to "dictionaries decide": `words/manual.ts` stores what
the user wrote with source USER (starter deck: source AI, since its draft
content was written by the assistant).

**One category per extracted word, never invented.**
The model picks exactly one from the built-in taxonomy plus the user's own
categories (only ones the user made or chose — categories the model created
in the past are not offered back). Free-form "secondary" categories produced
noise like "cutting" and are gone.

**Every word has a category.**
`words/edit.ts` keeps it so: deleting a category or clearing a word's
categories puts it in "uncategorised" — an ordinary category with its own
Learn/Review switches; it can only be deleted when empty. Renaming onto an
existing name merges the two.

**Study scope = direction × categories.**
`studyScope()` in `review/queue.ts`: RECALL (English → Korean) always,
RECOGNITION only if `User.askRecognition`. A word is learned if any of its
categories has `learnActive`, reviewed if any has `reviewActive`. Stats and
sessions both go through it. Sessions take a mode — `learn` (new words
only), `review` (scheduled only), `all` — from `/review?mode=`.

**Every KRDict call goes through the shared cache.**
Use `cachedLookup` / `cachedLookupMany` / `cachedExamples` from
`dictionary/cached.ts`, never `lookup()` directly: the 50 000/day key quota
is shared by the whole service. Found entries are kept 90 days, misses 7,
unreachable never. Typed-in lookups also count against the plan's
`dictionaryLookupsPerDay` (`consumeLookup`). AI-written examples are cached
across users in `GeneratedExample` (by lemma + English meaning).

**Unreachable dictionary.** KRDict answers in 1.5–3 s from Vercel and is
flaky from some networks: requests time out after 8 s, `cachedLookupMany`
trips a circuit breaker after 6 failures in a row (the rest of the batch is
marked unreachable at once), and the preview re-asks automatically once
and offers "Check again" (`/api/ingest/recheck`, no AI). Unreachable words
stay selected with the user's or the AI meaning — never silently dropped.

**Imports never need ticking.** Default mode "Add automatically": parts
run 3 at a time and each is committed as soon as it is read, so Stop keeps
everything read so far; finished parts are remembered per file in
localStorage and skipped when the same file is added again (resume).
Words the dictionary did not answer are saved with `Entry.needsCheck` and
verified in the background (`words/verify.ts`, `/api/verify`, run after an
import and on opening the home page) — dictionary data replaces the AI
placeholder, the user's meaning stays. "Let me review first" keeps the old
tick-and-save flow. Routes doing model + dictionary work allow 300 s.

**User text never goes into shared tables.** `DictionaryCache` holds only
dictionary answers; `GeneratedExample` is keyed by KRDict target code
(`krdict:<code>`), so words without a dictionary entry do not use it.

**Topic requests.** Input with no Hangul is a request ("weather words for
beginners"): `ExtractSource` kind `topic`, TOPIC_PROMPT; the dictionary still
rejects any word it does not know. Saved as material kind GENERATED.

**Learning goal.** `User.learningGoal` (2–5, default 3) right answers in a
row graduate a word; every step is picked from options except the last,
which is typed. `pickExercise(card, goal)` and `advanceLearning(card, ok, goal)`
take it; the client mirrors the switch when it requeues a card.

**Examples: dictionary first.**
`words/examples.ts` fetches from KRDict's view API (`fetchExamples`, free)
and only asks the model for words the dictionary cannot cover; AI examples
are stored with source AI and an English translation. In the view API's XML
`example` is parsed as an array (shared parser) — read `[0]`.

**The English meaning is the cue.**
English → Korean cards show the English meaning; the Korean definition joins
it only with `User.showKoreanDefinition` (or when there is no English, or
once the translation is hidden for a settled word).

**Cards don't repeat themselves.**
The answer side shows only what the question side did not (an English →
Korean card's meaning and Korean definition are not shown again). Its
example is the first one saved — the sentence from the user's own text when
the word came from one.

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
FREE_AI_CREDITS       # optional, default 50 per user
AI_DAILY_BUDGET_CREDITS # optional, default 300 across all free users
UNLIMITED_AI_EMAILS   # comma-separated; the owner's account
GOOGLE_CLIENT_ID      # optional; with the secret, shows "Continue with Google"
GOOGLE_CLIENT_SECRET
```

**Pronunciation** uses the browser's speech synthesis (`SpeakButton`,
`speakKorean`) — free and offline; `User.autoPlayAudio` speaks the word
after each answer. Cloud TTS would be the upgrade if quality is not enough.

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

- **Re-sort into categories** (owner's request): after the user reshapes
  their categories, the model re-assigns every word to the current set.
  Must show the expected AI cost first and go through `ai-budget.ts`.

- Starter deck content is a 10-word draft — replace with a real,
  dictionary-checked deck
- Billing: plans exist only as a placeholder page; see PAYMENTS.md
- KRDict's 50 000 requests/day are shared by all users — cache lookups
  before growth
- Anonymous users that never sign up are never cleaned up
- Email verification: off (needs a mail provider such as Resend + a domain)

- Example sentences — KRDict's search API has none; needs its view API
  (`/api/view`, by `target_code`)
- Hanja module (schema has `SHARES_HANJA` relation type reserved)
- Synonym grouping for review (backlog)
- Spanish support (schema supports it, UI doesn't)

## Decisions already made

- **Model: Sonnet 4.6, not 5.5.** 5.5 was tried: its thinking cannot be
  turned off, and on real imports it averaged ~4 800 output tokens per call
  vs ~360 on 4.6 (≈5× the cost). Don't switch back without re-measuring
  in `AiUsage`.
- **Prompt caching: not used.** The stable prompt is ~526 tokens; Sonnet 4.6
  caches only from 1024, and most of the cost is output anyway. Revisit on
  a model switch (Sonnet 5.5 is ~33% cheaper and caches from a lower
  minimum, but its thinking cannot be turned off — re-tune and re-test).

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
