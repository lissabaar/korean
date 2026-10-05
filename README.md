# Korean vocabulary app

Paste Korean text, get reviewable flashcards. Words are extracted and
categorised by a language model; definitions, readings, levels and example
sentences come from the Korean national dictionaries. Reviews are scheduled
by FSRS.

## How the pieces fit

```
  text ──▶ extract ──▶ dictionary ──▶ preview ──▶ commit ──▶ review
           (model)      (KRDict)      (you fix)   (saved)    (FSRS)
```

The model is only ever asked for things a dictionary cannot supply:
the dictionary form of an inflected word, which sense was meant in this
context, and which category the word belongs to. Definitions, translations,
examples, levels and hanja origin always come from the dictionary. A lemma
no dictionary recognises is rejected rather than guessed at — which is also
how bad morphological analysis gets caught automatically.

## Setting it up

Step-by-step instructions (in Russian) are in [SETUP.md](SETUP.md). Short
version — Node 22+, then:

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # fill in the keys, see the table below
npx prisma migrate deploy   # only for a fresh, empty database
npm run dev                 # http://localhost:3000
```

| Key | Where | Cost |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | [Neon](https://neon.tech) → Connect: pooled and direct strings | free tier |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | pay per use |
| `KRDICT_API_KEY` | [krdict.korean.go.kr](https://krdict.korean.go.kr/openApi/openApiRegister) | free, 50 000 requests/day |
| `STDICT_API_KEY` | [stdict.korean.go.kr](https://stdict.korean.go.kr/openapi/openApiInfo.do) | free, optional fallback |
| `BETTER_AUTH_SECRET` | `npx auth secret` or any 32-byte random string | — |

The dictionary keys arrive by email after a short form. They are issued per
service, so KRDict and STDICT need separate applications.

Better Auth's `Session`, `Account` and `Verification` models are generated,
not hand-written. After upgrading `better-auth`, run `npx auth generate`,
check the schema diff (it should only add or change auth models — it also
rewrites the file with CRLF line endings), then create a migration.

## Checking it works

**The dictionary field mapping.** Checked against live KRDict responses:
word, part of speech, level, hanja origin, definition and translation map
correctly. The search API returns no example sentences — those need a
second call to KRDict's view API, which is not wired up yet.

**Lemmatisation quality.** The analysis result reports how many words were
rejected for having no dictionary entry. That number is the accuracy metric
for the extraction prompt. More than roughly one word in ten means the
prompt needs work, not the dictionary. Words the dictionary never answered
for are reported separately as "unreachable" and say nothing about the
prompt.

## Layout

```
prisma/schema.prisma          entries, senses, cards, categories, relations
src/lib/
  auth.ts                     Better Auth config
  session.ts                  session helpers for pages and routes
  db.ts                       Prisma client singleton
  clients.ts                  Anthropic client, dictionary keys
  dictionary/krdict.ts        KRDict → STDICT lookup chain
  ingest/
    extract.ts                model-side analysis (structured outputs)
    categories.ts             fixed taxonomy and alias folding
    analyze.ts                text → candidates, homograph ranking, writes nothing
    commit.ts                 approved candidates → entries and cards
  import/                     browser-side: dropped files → analysis jobs
    read.ts                   images, CSV/TSV, text, subtitles; chunking
    anki.ts                   Anki .apkg/.colpkg (fflate + fzstd + sql.js)
  review/
    session.ts                learning vs review, exercise selection, FSRS
    answer.ts                 Hangul normalisation and answer grading
    distractors.ts            plausible wrong options for multiple choice
    queue.ts                  builds a review session (reads only)
    submit.ts                 grades an answer, advances the card
src/app/
  (app)/                      signed-in pages: home, /review, /add
  sign-in/, sign-up/
  api/auth/[...all]/          Better Auth handler
  api/ingest/analyze/         POST text or one image → candidates
  api/ingest/commit/          POST approved words → saved
  api/review/session/         GET today's cards
  api/review/answer/          POST one answer
```

## Not built yet

- example sentences from KRDict's view API
- hanja module
- generated texts and exercises
- sign-up restriction — required before putting the app on the internet
