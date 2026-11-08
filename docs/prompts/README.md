# Agent prompt set (prioritized)

## How to use
1. Open `00-master-context.md` and paste it into the VS Code agent as the first message of a **new chat**.
2. In the same chat, paste ONE phase file. Wait until the agent reports its ✅/❌ checklist.
3. Review the result yourself (open the site, click through). Then start a **new chat** for the next phase (paste master context again).
4. Never paste two phases at once. If a phase is too big for one session, tell the agent to stop at a sub-step boundary (each phase is split into numbered steps with a commit per step).

| Order | File | Priority | Purpose |
|---|---|---|---|
| 0 | `00-master-context.md` | always | Shared rules, repo facts, definition of done |
| 1 | `01-phase-0a-hygiene-security.md` | P0 | Line endings, inline handlers, innerHTML, strict CSP, rules, teacher list |
| 2 | `02-phase-0b-leftovers.md` | P0 | Placement saving, leaderboard, scheduling, Lighthouse, login/placement layout bugs |
| 3 | `03-phase-1-redesign-core-pages.md` | P1 | Redesign lesson, dashboard, homework on the design system |
| 4 | `04-phase-2-timer-and-sections.md` | P1 | Precision lesson timer, standard Vocabulary/Grammar/Reading sections with timing |
| 5 | `05-phase-3-listening-trainer.md` | P2 | British-voice character dictation trainer |
| 6 | `06-phase-4-whiteboard.md` | P2 | Full whiteboard |
| 7 | `07-phase-5-game-engine.md` | P3 | Gamification of real lesson stages |
| 8 | `08-phase-6-clip-lab.md` | P3 | Video clips |
| 9 | `09-phase-7-manga-reader.md` | P3 | Gaziz manga/manhwa reader (blocked on content) |
| 10 | `10-phase-8-hardening-release.md` | P4 | PWA, perf, e2e, docs, final report |

## Why this order
- 0A/0B first: the security and repo-hygiene problems make every later diff harder to review and ship real XSS risk.
- Redesign (1) before new features so new features are built once, on the final design system.
- Timer + sections (2) and listening (3) are used in every class; whiteboard (4) next.
- Media-heavy phases (6, 7) need content/licence decisions from you and come last.

## What YOU must provide (blockers)
- Phase 3: a TTS provider choice and an API key kept OUTSIDE the repo (Azure / Google / ElevenLabs), or permission to use browser voices only.
- Phase 6: which clips you want (official embeds only).
- Phase 7: licensed/public-domain manga titles, or teacher-made panels.
- Your answer to: should the shared whiteboard be teacher-controlled only, or allow student drawing by default?
