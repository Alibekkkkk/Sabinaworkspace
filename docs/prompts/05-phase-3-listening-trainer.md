# PHASE 3 — Listening dictation trainer with a British-voice character (P2)

## Goal
A TikTok/Duolingo-style listening trainer: an animated character says a sentence in a clear, eloquent **British** voice; the sentence appears with some words hidden as star placeholders; the student types the missing words in place; the app gives per-word feedback and lets them save new words. Optional speaking (shadowing) uses speech recognition.

## Reference (from the screenshot the teacher provided — reproduce the interaction, not the branding)
Large centred sentence; hidden words shown as `*` per letter; a typing cursor in the current gap; a mic button; a difficulty chip ("Easy"); controls: back, replay, Skip, Next; tapping a word offers "Look up" and "Save"; a translation line under the sentence (in the student's language). Do not copy any third-party sentences, UI assets or logos.

## Pedagogical notes (apply them)
- Dictation trains decoding connected speech. Start with content words; later hide function words/weak forms ("have", "to", "of") because these are hardest to hear.
- Use sentences built from the student's current lesson vocabulary/grammar (Phase 2 sections) at their CEFR level (from placement).
- Provide slow audio and per-word replay to reduce frustration.

## Step 1 — Data and schema
`content/listening/<student-or-pack>.json`:
```
{ "schemaVersion": 1, "id": "…", "title": "…", "level": "B1",
  "voice": { "id": "en-GB-SoniaNeural", "provider": "azure", "character": "nora" },
  "items": [ {
    "id": "l1-001", "text": "You can grip and grasp at fear and it ruins the enjoyment.",
    "audio": { "normal": "audio/l1-001.mp3", "slow": "audio/l1-001-slow.mp3" },
    "wordTimings": [ {"i":0,"start":0.00,"end":0.25}, … ],
    "gaps": { "easy": [4,8], "medium": [1,3,4,8], "hard": "all" },
    "translation": { "ru": "…", "kk": "…" },
    "lessonTags": ["vocabulary:grasp","grammar:present simple"],
    "credits": "original / licence"
  } ] }
```
- Validator (`js/listening/schema.js` + tests): ids unique; gap indices within range; audio paths exist; text length ≤ 25 words; no copyrighted sources recorded; translation optional.
- Authoring: extend `tools/import-content.html`: paste sentences → auto-pick gaps by difficulty (content words first, then function words) → preview → export JSON. Generate gaps from the lesson's target vocabulary when tags are present.

## Step 2 — Audio generation pipeline (British, eloquent, consistent)
- Browser `speechSynthesis` voices vary by device and often sound poor; treat it only as a fallback (`lang="en-GB"`, pick best `Google UK English`/`Microsoft Sonia/Ryan` voice if present).
- Primary: pre-generate neural TTS audio with a script `scripts/generate-listening-audio.mjs` that reads a provider key from env (`TTS_PROVIDER`, `TTS_KEY`, never committed), supports Azure (`en-GB-SoniaNeural`, `en-GB-RyanNeural` with SSML prosody), Google (`en-GB-Neural2-*`) and ElevenLabs. Output normal + 0.75× slow mp3 (loudness-normalised), plus word timings when the provider supplies boundaries (else estimate by forced alignment or syllable heuristics, flagged).
- Store files under `content/audio/` (size budget: ≤ 60 kB per sentence); add to `sw.js` runtime cache (cache-first, with versioned names); respect provider terms for redistribution — record the provider/licence in `credits`. If I haven't provided a key, ship the fallback voice and mark audio generation as ❌ "needs key" in the report. **Do not fabricate or fake audio.**

## Step 3 — Character tutor
- An original SVG/Lottie character (no existing mascots) with states: idle (blink), talking (mouth shapes driven by audio amplitude via Web Audio `AnalyserNode`, or by `wordTimings`), happy, encouraging, thinking, celebrating. Optional 2–3 characters the student picks (e.g. "Nora" British female, "Arthur" British male) tied to voices.
- `prefers-reduced-motion`: swap to static poses.
- Speech bubble shows the sentence with the hidden words; an `aria-live="polite"` region mirrors state for screen readers.

## Step 4 — Dictation UI and logic
- Gaps: one `<input>` per hidden word, width ≈ word length, placeholder `*****` (one star per letter), `aria-label="Gap 2 of 3, 7 letters"`; auto-advance on space/Enter/length reached; Backspace at start returns to the previous gap; Tab order natural; works with mobile keyboards (autocapitalize off, spellcheck off, autocomplete off).
- Controls: ▶ Replay, 🐢 Slow, ⏮ Previous, ⏭ Skip, Next, 💡 Hint (reveal first letter, costs XP), 👁 Reveal word, 🌐 Translation toggle (language remembered), ✓ Check.
- Checking: normalise case/curly quotes/trailing punctuation, accept UK/US spelling pairs (`colour/color`), contractions (`it's/it is` only if item allows), numerals vs words per item `alternatives`. Per-word green/red with the correct spelling shown; show where letters differ (diff on the word). No negative toast spam; one calm feedback sheet.
- After checking: the sentence is shown fully; every word is tappable → popover: meaning (from lesson vocab if present, else an on-device dictionary stub or teacher-supplied gloss), "Save to my words" (adds to personal deck and review queue). Do **not** call a third-party dictionary API without CSP/privacy review.
- Levels: **Easy** 1–2 gaps; **Medium** ~50 %; **Hard** all words typed from audio; **Expert** no text shown + no slow replay. Auto-adapt: 3 correct in a row → up; 2 wrong in a row → down; student can override.
- Session structure: 8–10 sentences per round → round summary (accuracy, hardest words, stars 1–3, XP) → "Practise mistakes" mini round.
- Gamification: XP per correct word, combo multiplier, daily streak contribution, gems; mistakes enter `reviewQueue`.

## Step 5 — Speaking / shadowing (optional layer)
- Use Web Speech API `SpeechRecognition` (`lang="en-GB"`) where supported (Chrome/Edge/Safari); feature-detect; fall back to typing only. Show the live transcript; compare word-by-word to the target (alignment via Levenshtein on tokens) and highlight misses; score is coaching, not grading.
- **Privacy:** recognition audio may be sent to the browser vendor. Show a one-time plain-language consent screen before first use; do not store audio; store only the text and score; parental/teacher note in docs. Provide a "type instead" button always.

## Step 6 — Integration
- Entry points: portal ("Listening"), lesson Vocabulary/Grammar section ("Listen & type"), practice hub, teacher assign. Time spent contributes to the Phase 2 section clock if started inside a lesson.
- Save progress in `studentProgress/$code/listening/{itemId: {attempts, bestAccuracy, lastAt}}` (rules with caps) and feed the dashboard (weak words, accuracy trend).
- Offline: cached items playable without network (service worker).

## Tests
- Unit: gap generation, normalisation/answer matching (≥ 50 cases incl. contractions/UK-US), adaptive level logic, schema validator, diff display function.
- Component/browser: keyboard flow through gaps; screen-reader labels; mobile viewport; fallback when audio fails (clear message + TTS fallback); fallback when SpeechRecognition unsupported.
- Rules tests for the progress node.

## Acceptance criteria
- I can open the trainer, hear the sentence (real British neural audio if a key was provided, otherwise the clearly labelled fallback), see star gaps, type the words in place, get per-word feedback, tap words to save them, replay slow, change levels, and finish a round with a summary.
- Works on a phone-sized screen and with keyboard only; passes axe; no console errors; no secrets in git (prove with a secrets scan).

## Non-goals
No video; no free-form speaking assessment scoring beyond the coaching view.
