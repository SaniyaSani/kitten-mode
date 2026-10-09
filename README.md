# Kitten Mode

A calm, beginner-first lecture companion: record or upload a lecture, get a timestamped transcript, tidy notes, "Kitten Mode" explanations, and a personal course notebook that keeps lectures, materials, questions and tasks connected.

## Run
    node server.mjs            # Node >= 20, no dependencies.  http://localhost:8787  (PORT=... to change)
    ANTHROPIC_API_KEY=...      # optional: AI explanations, "explain this passage", AI rescue card
    # speech-to-text (optional): see stt.mjs (local whisper.cpp, or OpenAI with explicit consent)
    # PDF/slide text (optional but recommended): `pdftotext` (poppler-utils) and `unzip` on the server

The app is ES modules, so it must be served over http (the server does this). Opening index.html from disk will not work.

## Test
    npm run test:lib           # pure logic (search, placement, tasks, highlighting, KB)
    npm test                   # LLM stages with a faked model
    pip install playwright reportlab python-pptx && playwright install chromium
    PORT=8799 node server.mjs &   &&   bash e2e/run.sh        # 51 browser checks incl. the 19-step scenario, mobile, migration, failure states
    npm i axe-core && python3 e2e/axe.py                       # WCAG 2.x AA audit (0 violations at time of writing)

## Layout
- `server.mjs` static files + `/api/status|analyze|rescue|explain|extract|transcribe|job`. `stages.mjs` prompts, `llm.mjs` provider, `stt.mjs` transcription.
- `public/js/store.js` persistence (in-memory documents written through to IndexedDB `kitten` v2: stores `a` audio chunks, `kv` documents, `files` blobs; migrates `localStorage['kitten.v2']`, leaves it untouched). `lib.js` pure logic. `core.js` router/events/dialogs. `kb*.js` built-in vocabulary (28 concepts).
- Views: `v-home` (home, course, concept), `v-lecture` (7 tabs, Kitten cards, rescue), `v-notes` (block editor), `v-materials` (Inbox, extraction, viewer), `v-tasks`, `v-search`, `v-capture` (record/upload/processing), `select.js` + `actions.js` (selection actions), `player.js`.

## Data model (all in IndexedDB, one document per key `collection:id`)
semester → course → module(week) → lecture. Lecture: raw `segments[]` (never rewritten; corrections live in `segment.edit`, clean-note edits in `cleanEdits`, additions in `cleanAdds`). Note: ordered `blocks[]` (p, h2, h3, ul, todo, code, callout, quote, img, ref) + revisions. Material: blob in `files`, `extract{state,pages[]}`, `status inbox|filed`, `suggestion`. Task: `kind confirmed|suggested|personal|question`. Everything cites with `ref` objects (`seg`, `audio`, `material+page`, `note`, `concept`, `task`, `lecture`) opened by one function, so links land on the exact source.

## Honest limits
No speaker separation, no OCR (scanned PDFs and images are kept but not searched), `.docx`/`.ppt` text not read, flashcards are stored but have no review mode yet, no sync between devices (export a JSON backup from Privacy & data), search is keyword + concept aliases (not semantic), explanations outside the built-in vocabulary need an API key.

## Deploy
**GitHub:** `git init && git add . && git commit -m "Kitten Mode" && git remote add origin <url> && git push -u origin main`. CI (`.github/workflows/ci.yml`) runs all tests.

**Cloudflare Pages** (front-end + AI endpoints): connect the repo, build command empty, output directory `public`. Add the secret `ANTHROPIC_API_KEY` (Settings → Variables) to switch on AI explanations. `functions/api/[[path]].js` serves `/api/status|analyze|rescue|explain`. Local try-out: `npx wrangler pages dev public` (put the key in `.dev.vars`).
Not available on Cloudflare: PDF/PPTX text reading and speech-to-text (they need `pdftotext`/`unzip`/whisper). Files are still stored and marked "text not read". For those, run `server.mjs` on a small VPS/container instead.
**Protect it:** there is no login. Put Cloudflare Access in front, otherwise anyone who finds the URL can spend your API credits. Your notes live in each visitor's own browser, not on the server.
