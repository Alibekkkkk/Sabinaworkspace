# PHASE 7 — Manga / manhwa reading mode for Gaziz (P3)

## ⛔ Blocker — ask me first
Before building more than the infrastructure, ask me (via the report) which content to use. Allowed sources only: (a) original panels drawn/commissioned by the teacher; (b) openly licensed or public-domain comics (e.g. Creative Commons webcomics, Wikimedia Commons, Internet Archive PD works) with the licence and URL recorded; (c) teacher-written scripts rendered with original/placeholder art; (d) **link-out** to an official licensed reader (e.g. publisher apps) with the student reading there and doing tasks here. **Never include scans/screenshots of commercial manga or manhwa.**

## Goal
A reading experience in the style of manga/manhwa that teaches English: read a panelled story with speech bubbles, tap to understand, collect vocabulary, answer comprehension questions, and earn rewards — enabled **only for Gaziz** for now, switchable per student.

## Current state (verify)
`manga.html`, `js/manga/schema.js` (`validateManga`, `addProtectedMangaAnswers`), `content/manga/gaziz-demo.json` (1 chapter), 3 placeholder SVGs in `assets/manga/`; manifest flag `features.mangaReader: true` and `mangaFeatureFor: "gaziz"`; rules grant `protectedContent/.../manga` only when `studentCurriculum/$code/$lessonId/features/mangaReader === true`.

## Step 1 — Feature flag as a first-class concept
- `features` map per student in `studentCurriculum/$code/features` (and manifest default) with helper `hasFeature(student, "mangaReader")`. Portal/nav/manga page render only when true; direct URL access for others shows a friendly "not enabled" page and rules deny the data. Teacher toggle in dashboard (Feature flags panel: mangaReader, clipLab, whiteboard, listeningTrainer). Test: Gaziz yes; Sabina no; toggling works; rules tests.

## Step 2 — Content format v2
```
{ schemaVersion: 2, id, title, series?, level: "B1", genre: ["action","slice-of-life"],
  credits: { author, artist, licence, sourceUrl, rights: "original|CC-BY|public-domain|licensed-link" },
  readingDirection: "ltr" | "rtl" | "vertical",
  chapters: [ { id, title, summary, estimatedMinutes, pages: [ { id, image: "assets/manga/…", alt, panels: [
      { id, bbox:[x,y,w,h], bubbles: [ { id, type:"speech|thought|narration|sfx", speaker, text, simplified, translation?, 
        audio?, vocabulary:[{word, meaning, example}], grammarNote? } ] } ] } ],
    vocabulary:[…], questions:[ … ], boss: {…} } ] }
```
- `alt` text required for every image and panel summaries for screen readers; validator checks bbox inside the image, ids unique, every question references real bubbles/panels, no external image hosts unless listed in an allowlist.
- Panel/bubble authoring: add a **visual editor** to `tools/import-content.html` — upload/choose image, drag panel rectangles, add bubbles by clicking, type text; exports validated JSON; supports importing a simple script (CSV/Markdown) for quick text-first creation.

## Step 3 — Reader
- Modes: **Vertical scroll (manhwa)**, **Page flip (manga/comic)**, **Panel-by-panel guided view** (zooms into each panel in order; the best mode on phones). Remember last position per chapter. Reading direction toggle (LTR/RTL).
- Bubbles: overlay hotspots (accessible `<button>`s with the bubble text as accessible name, not just images). Tap/click → bottom sheet with: original text, **simplified English** version, optional translation (toggle, off by default for Gaziz's level), grammar note, "🔊 Read aloud" (neural audio if provided else `speechSynthesis` en-GB), "Save sentence".
- Words: tap any word in the text sheet → definition from bubble vocabulary/lesson deck; Save to deck/review queue.
- Reading aids: font size, high-contrast text sheet, "hide text until tapped" challenge mode, spoiler-free progress.
- Performance: lazy-load page images, `loading=lazy`, `decoding=async`, responsive sizes, ≤ 250 kB per page image (WebP/AVIF with fallback), preload next page; works offline via service-worker cache of the chapter.
- Theme: dramatic dark theme for the reader (CSS tokens), respects light mode and reduced motion; subtle page-turn/scroll animations only if allowed.

## Step 4 — Learning loop and games
- Pre-reading: 6–8 target words (previewed with images/examples).
- During: optional **"Fill the bubble"** (hide a word in a bubble; choose/type it), **"Who said it?"**, **"What happens next?"** (predict), inline mini-quiz after each page spread (1 question, skippable).
- After chapter: comprehension questions (gist MCQ, detail short answer, inference long answer with rubric, vocabulary in context), a **chapter boss quiz** (reuse Phase 5 Boss Battle), and a retell/summary writing task for teacher review.
- Rewards: XP per page and per correct answer, a **reading streak**, "chapters collected" shelf, badges; time spent contributes to the Phase 2 clock when launched in a lesson.
- Difficulty adaptation for Gaziz: read his level from placement + his lesson content (`content/gaziz.json` vocabulary) and select/generate: shorter vs longer bubbles, simplified toggle default, more glosses on lower accuracy, fewer on higher. Write the adaptation rules in `docs/MANGA.md` and unit-test the selector.

## Step 5 — Teacher view
Dashboard: Gaziz's pages read, time, words saved, quiz accuracy, comprehension answers awaiting review; ability to assign a chapter with due date.

## Tests
Schema validator (good/bad fixtures), bbox/hotspot geometry, reading-position persistence, mode switching, adaptation selector, rules tests for feature flag, browser tests for each mode with keyboard and touch emulation, overflow/overlap checks at 390 px.

## Acceptance criteria
- Only Gaziz sees the manga entry; another student cannot read the content by URL (rules test).
- With licensed/original content supplied by me (or the clearly labelled demo), I can read in all three modes, tap bubbles/words, save vocabulary, answer chapter questions and see rewards.
- Credits and licence are shown in the reader and recorded in JSON; no commercial pages in the repo (run a check of `assets/manga` and report file sources).

## Non-goals
No scraping of manga sites; no OCR of copyrighted pages.
