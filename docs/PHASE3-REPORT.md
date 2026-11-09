# Phase 3 report: listening dictation trainer

## What works now

- **Trainer page** (`listening.html`, `js/pages/listening.js`): choose a tutor (Nora, British female; Arthur, British male) and a level, then play rounds of up to 10 sentences. An original SVG character (idle with blinking, talking, happy, encouraging, thinking, celebrating) sits beside a speech bubble holding the sentence. With reduced motion the character keeps a still pose.
- **Gaps typed in place:** one input per hidden word, one star per letter, labelled "Gap 2 of 3, 7 letters". The full word moves focus on, Space or Enter moves on, Backspace in an empty gap goes back, Enter in the last gap checks. Phone keyboards: autocapitalise, spellcheck and autocomplete are off.
- **Checking:** case, curly quotes and surrounding punctuation are ignored; UK/US pairs (colour/color, defence/defense, organise/organize, 70+ pairs with inflections) and per-item `alternatives` are accepted. Each word is marked right or wrong with a mark and a word, not colour alone; a wrong word shows the correct spelling with the differing letters underlined and what was typed. One calm feedback sheet, no toasts.
- **Controls:** Replay, Slow, Previous, Skip, Hint (reveals letters; the word then no longer counts), Reveal word (counts as missed), Translation toggle (language remembered), Check, Next. Expert switches slow replay and letter counts off.
- **Levels:** Easy 1 to 2 gaps, Medium about half, Hard every word, Expert every word with no letter counts and no slow replay. Auto mode starts on Easy: 3 right sentences in a row go up, 2 wrong in a row go down; the student can override at any time.
- **After checking:** every word of the sentence is tappable: Look up (meaning from the item's glosses or the lesson vocabulary, else a clear "not stored yet") and Save to my words (the student's own deck, `studentProgress/<code>/vocabulary`, with the listening source). No third-party dictionary is called.
- **Round summary:** accuracy, stars 1 to 3 (90% / 70%), hardest words, best combo, XP and streak from the shared game engine. "Practise mistakes" replays only the sentences with a missed word, hiding only the missed words. Missed words enter the Practice review queue under "Listening".
- **Speaking (optional):** "Say it" uses `SpeechRecognition` (`en-GB`) where supported, behind a one-time plain-language consent screen. It shows the live transcript and which words were heard. It is coaching only; nothing is recorded or stored, and "Type instead" is always there. Browsers without it show a short message.
- **Voice:** if a sentence has mp3 files they play through an `AnalyserNode` that drives the character's mouth. Otherwise, or if a file cannot be played, the page uses `speechSynthesis` with the best British voice (Google UK English, Microsoft Sonia/Ryan natural voices) and says on screen which voice it is, or that the browser cannot speak at all.
- **Authoring:** `tools/import-content.html` has a "Listening pack helper": paste sentences, name target words, get Easy and Medium gaps (content words first, target words before the rest), a preview and valid JSON. `npm run lint:listening` validates packs.
- **Pipeline:** `scripts/generate-listening-audio.mjs` (Azure, Google, ElevenLabs; key from environment only) writes normal and slow mp3 files, estimated word timings (always flagged `timingsEstimated`) and provider terms in `audioCredits`. See limits below.
- **Entry points:** a "Listening" link in the portal's practice links and a "Listen & type" button on the lesson's Vocabulary stage, shown only when the lesson's manifest entry has a `listeningFile`.
- **Offline:** the service worker (shell cache v6) caches the page, scripts and packs (network first) and the mp3 files (cache first, own cache), so heard sentences play offline.
- **Progress:** `studentProgress/<code>/listening/<sentenceId>` stores `attempts`, `bestAccuracy`, `lastAt`, with rules for the node (own student only, bounded numbers, no extra fields).

## Evidence

| Check | Result | Repeat |
| --- | --- | --- |
| Unit tests | 210 pass, 15 new for listening: schema validator, gap generation, 52 answer-matching cases (contractions, curly quotes, UK/US, punctuation), alternatives, letter diff, adaptive levels, round summary, speaking comparison, voice choice, TTS request builders, estimated timings, "refuses to run without a key" | `npm test` |
| Rules tests | 27 pass, including the listening node and the saved-word source field | `npm run test:rules` |
| Browser test | one full student round driven by the keyboard (draft gate, tutor and level choice, auto-advance, Backspace, Check gating, per-word feedback, letter diff, word panel and saving to the deck, level up, summary, XP, review queue, per-sentence progress, mistakes round, hint, reveal, skip, slow, translation, remembered preferences, speaking consent, audio-failure fallback message, phone layout, authoring tool); console clean (no errors, no CSP violations, no dialogs). Four runs in a row passed | `npm run dev`, then `npm run test:listening-e2e` |
| Accessibility | axe: no violations on setup, question, feedback and word panel at 1440, 390 and 320 wide in light and dark (24 states); no horizontal scroll | script run during development, screenshots below |
| Screenshots | `docs/screenshots/phase3/` (desktop, mobile, narrow; light, dark; setup, question, feedback, word panel, checked) | |
| Secrets scan | no key patterns in the files added or changed in this phase; `.env` and `.env.*` are now git-ignored | `grep` over changed files |

## Not done or not verified

- **Neural audio was not generated.** No TTS key was provided, so no mp3 files exist and the trainer uses the labelled device voice. `scripts/generate-listening-audio.mjs` and its request builders are unit-tested, but the script has not been run against a live provider. Word timings from it are estimates (a syllable heuristic); REST endpoints do not return word boundaries.
- **Loudness normalisation and the ElevenLabs slow version need ffmpeg** on the machine running the script; without it the script warns and skips them.
- **Dashboard feed** (weak words, accuracy trend for the teacher) is not built. The data is saved (`listening` node and review queue entries with topic "Listening") but no dashboard card shows it yet.
- **Teacher "assign" entry point** and **time spent counting towards the lesson clock** are not built (the trainer is a separate page; the clock is teacher-controlled).
- **Combo multiplier and XP-costing hints:** XP comes from the shared engine (10 per correct word, bonus for a perfect round), so a combo multiplier would have shown numbers that do not match what is saved. Instead the best combo is shown, and a hinted or revealed word simply does not count towards the score.
- **Multi-word alternatives** (such as "it is" for "it's") cannot be typed into one gap; list single-word variants (for example "havent") in `alternatives`.
- Speech recognition was only checked for the consent and fallback screens, not with a real microphone.
- Translations in Sabina's draft pack are Russian only and written by me; they need your read-through. Kazakh was left out rather than guessed.

## Decisions for you

1. Approve (or edit) Sabina's draft pack: `content/listening/sabina.json`, then set `"status": "approved"`.
2. Provide a TTS provider and key (and say Azure, Google or ElevenLabs) so I can generate the real British audio, or run the script yourself.
3. Should the teacher dashboard get a listening card (weak words, accuracy trend) next?

## Suggested next phase

Phase 4 (whiteboard), or the dashboard listening card first because the data is already being saved.
