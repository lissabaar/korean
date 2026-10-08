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
    resort.ts               "Re-sort with AI": plan + cost, then batches
    examples.ts             fill missing examples: KRDict view API first, AI after
    example-translations.ts English for example sentences (shared cache for dictionary ones)
    meanings.ts             fill missing English meanings
    verify.ts               re-check words saved while the dictionary was down
  plans.ts                  plan limits (DRAFT); prices are not shown anywhere — the pricing page was removed
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
    intro.ts                first meeting with a new word: start / skip 3 days
src/lib/import/             browser-only: dropped files → analysis jobs
  read.ts                   images (downscaled), CSV/TSV, text, subtitles; chunking
  anki.ts                   .apkg/.colpkg via fflate + fzstd + sql.js (lazy-loaded)
  reword.ts                 ReWord .reword export (zip + JSON)
scripts/copy-sqljs-wasm.mjs postinstall: puts sql.js's wasm in public/
src/app/(app)/              app pages: home, /learn, /review, /add, /categories,
                            /settings; layout starts an anonymous session
                            for first-time visitors
src/app/api/review/         session (GET) and answer (POST) routes
src/app/api/{words,categories,settings,starter-deck,dictionary}/
                            manual words (+ edit), category flags/rename/delete,
                            dictionary lookup for typed-in words (no AI)
```

Docs for the owner (Russian): `GUIDE.md` how the project is built — tech,
Next.js basics, data flows, every file (update it when files are added,
moved or change purpose), `SETUP.md` new machine, `VERCEL.md` deploys,
`PRICING.md` how plan numbers were derived, `PAYMENTS.md` plan for billing
(two businesses: RU cards via a Russian acquirer, foreign cards via a
merchant of record from Uruguay — never help route around sanctions).

## Comments — always, and detailed

The owner reads the code to understand it: she knows programming, not
Next.js/React in depth. Every source file starts with a block comment: what
it is (page / route handler / client component / library), what it does,
what calls it and what it calls. Every function, component and non-obvious
constant gets a comment saying what it does and why. Write comments in
English (repo convention); explanations in Russian go to `GUIDE.md`. New
code without these comments is not finished.

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
rows; by default only the first (order 0) gets cards, and the first is the
sense meant: `rankHomographs()` moves the best-matching sense to the front —
the user's meaning, else the context (gloss), else the dictionary's first.
Translation overlap decides, the English definition only when no
translation matches (definitions match common words by chance). The word
editor's "Meanings to learn" (`words/senses.ts`) ticks more senses: each
gets its own cards; unticking deletes that sense's cards. Senses missing
from the DB (words saved by verify.ts keep one) come from the dictionary
cache and are created when ticked.

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

**The dictionary lives in our database.** `KrdictEntry` holds the whole
KRDict (official download, CC BY-SA 2.0 KR — the app footer names it),
loaded by `npm run load-krdict -- "<folder of the JSON download>"` (replaces
the table; idioms/proverbs filed under a head word get code "<id>.<n>").
`cachedLookup`/`cachedLookupMany`/`cachedExamples` read it first
(`dictionary/local.ts`) — no network, no throttling; the API below is only
the fallback for an empty table or non-English lookups. It also has Russian
translations: `rankHomographs` matches a learner's Russian meaning against
them (`words()` keeps Cyrillic). Use `isKrdictCode`/`isApiCode`, never a
digits-only regex, for target codes.

**Every KRDict call goes through the shared cache.**
Use `cachedLookup` / `cachedLookupMany` / `cachedExamples` from
`dictionary/cached.ts`, never `lookup()` directly: the 50 000/day key quota
is shared by the whole service. Found entries are kept for good (owner's call: an entry does not change meaning), misses 7 days,
unreachable never. Typed-in lookups also count against the plan's
`dictionaryLookupsPerDay` (`consumeLookup`). AI-written examples are cached
across users in `GeneratedExample` (by lemma + English meaning).

**Unreachable dictionary.** KRDict answers in 1.5–3 s from Vercel and is
flaky from some networks: requests time out after 8 s; `cachedLookupMany`
retries a word up to 3 times (pauses 1.5 s, 4 s), trips a circuit breaker
after 6 words in a row with no answer, and stops after a 150 s budget (the
rest of the batch is marked unreachable at once) — retries must stay bounded, and the preview re-asks automatically once
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

**Learning goal.** `User.learningGoal` (2–10, default 5) right answers in a
row graduate a word; every step is picked from options except the last,
which is typed. `pickExercise(card, goal)` and `advanceLearning(card, ok, goal)`
take it; the client mirrors the switch when it requeues a card.

**Meet the word before the drill.** A LEARNING card with no
`Card.introducedAt` is first shown whole in the session (`intro` on
ReviewItem): "Start learning" sets introducedAt for every card of the sense;
"Skip for 3 days" sets `snoozedUntil` (studyScope's learn filter excludes
snoozed cards) and the session gets a replacement word. Answering a card
also sets introducedAt.

**Categories: AI by default, the user can pin them.**
- Add screen "Categories": AI sorts (default) / All into one (locked) / I
  pick for each word (forces review-first).
- Lines without Hangul above pasted Korean text are the learner's note
  (`sourceFromText`), sent with every part; the model returns
  `requestedCategory` when the note asks for one category, every word goes
  there and the category is saved `locked` (`ApprovedWord.lockCategory`).
- `Category.locked`: "Re-sort with AI" (`words/resort.ts`) never touches a
  word that is in any locked category. Re-sort targets only the user's
  existing categories ("uncategorised" as fallback), one category per word,
  shows the estimated cost first (`resortPlan`), runs in batches of 120,
  writes links with assignedByAi false (see the comment there).

**New words are picked at random.** `pickLearningCards()` in queue.ts:
words already started first, the rest a random pick from the whole pool
(oldest-first made an imported list come up in its own order). In the
session a repeated card goes back to a random later position (Review.tsx).

**A meaning the dictionary lacks.** When the user wrote a meaning and no
sense of any homograph shares a word with it or with the model's gloss
(`meaningMatches`, translation + Russian + English definition), the
dictionary does not have that sense (달달하다 "приторный" vs KRDict's only
"shiver"): the candidate is kept with the AI meaning (status ai,
`dictionaryMismatch`), and the preview offers "Use the dictionary entry".
Only with a user meaning: overlap of the user's meaning alone missed 102 of
581 genuine matches (synonyms, Russian forms) — the gloss bridges that.

**Images are read in pieces.** `imageSource` keeps the short edge at full
resolution (≤1568 px) and cuts the long edge into tiles of ≤1.15 MP with a
60 px overlap, max 6 per image — shrinking the whole screenshot made small
text unreadable ("0 words").

**Phrases mode** is words only / words & phrases / phrases only
(`phrases: false | true | "only"`; "only" also drops any word the model
returns).

**Examples are sentences.** A model "sentence" with no space (the word
itself, 부드러워) is not stored as an example (`isSentence` in commit.ts).
"Add example" in the word editor: dictionary examples (free, with shared
cached translations) or one AI-written with translation (metered); saved
with the word, a changed sentence drops its old translation.

**Public face and SEO.** A visitor without a session — and every crawler —
gets the server-rendered `Landing` (h1, how it works, JSON-LD), with
`StartAnonymous` only as its status line. `lib/site.ts` holds name/URL/
description; root metadata has a title template, Open Graph and canonical;
`app/robots.ts` disallows the API and personal pages (also noindex),
`app/sitemap.ts` lists /, /sign-up, /sign-in, /privacy. No analytics or
tracking — only strictly necessary storage, so no cookie banner;
`/privacy` must stay true when that changes.

**Look.** Light/dark switch in the nav (`ThemeToggle`, data-theme on
<html>, inline script in app/layout.tsx prevents a flash). Card text size
is `User.cardTextSize` (0–2, default 1), applied via TEXT_SIZES in Review.tsx.

**Example translations.** KRDict examples are Korean only; the example a
card shows gets English from the model (`words/example-translations.ts`,
metered). Translations of dictionary sentences are shared in
`ExampleTranslation`; sentences from the user's own text (source USER) are
never put there.

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
FREE_AI_CREDITS       # optional, default 20 per user
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
npm run test:scenarios             # every user scenario on the live DB with throwaway users
                                   # (~5 cents of AI); run after larger changes
npx auth generate                  # regenerate auth models after a better-auth upgrade
                                   # (rewrites schema.prisma with CRLF — check the diff)
```

Run Node through `npm run …`: the project `.npmrc` sets
`node-options=--use-system-ca`, needed on networks that re-sign TLS
(corporate proxies). Without it, calls to Anthropic fail with
`SELF_SIGNED_CERT_IN_CHAIN`. Where PowerShell blocks `npm.ps1`, use
`npm.cmd …` rather than changing the execution policy.

## What's not built yet

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
