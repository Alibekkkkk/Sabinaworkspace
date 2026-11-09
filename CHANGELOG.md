# Changelog

Nothing here has been pushed or deployed; all work is on branch `araylim-4-academic`. Newest first. Reports with evidence: `docs/PHASE*-REPORT.md`.

## Phase 8: hardening, performance, offline, docs
- Offline and install: generated precache list with a content-hash version, stale-while-revalidate shell, network-first content, limited audio and image caches, "New version available" banner, PNG and maskable icons, shortcuts, connection banner on every student page.
- Performance: per-page size budgets (tested), `lighthouserc.json`, `npm run perf:budgets`, deferred Firebase SDK, preconnect, generated module preload hints, diagnostic scripts.
- Security: gate tests for HTML-string writes, `eval`, inline handlers, `noopener`, CSP, secrets; hosting headers in `firebase.json`; rules threat-list tests; teacher export and delete of a student's data; `docs/PRIVACY.md`.
- Robustness: global error boundary with copyable codes and teacher view, safe browser storage, second-tab and clock-skew warnings, sign-in that works with blocked storage.
- Languages: English, Russian (draft) and Kazakh (draft) dictionaries and a picker for the shared interface.
- Tests and CI: end-to-end runner (`npm run test:e2e`), coverage script, GitHub Actions workflow.
- Docs: README, TEACHER_SETUP, ARCHITECTURE, KNOWN-LIMITATIONS, ACCEPTANCE, PERFORMANCE, PRIVACY.

## Phase 7: Manga reader
Feature flags per student; content format v2 with credits and rights; reader with scroll, page flip and panel modes, bubble sheet, aids, offline copy; learning loop (words first, page questions, chapter questions, boss, retell); teacher card with assignments; authoring tools (script, CSV, visual editor). Real stories will use original art.

## Phase 6: Clip Lab and Clips tab
Clip schema v2 and nine exercise types, interactive transcript and player wrapper, clip maker, Clips tab with filters and due dates, completion records and teacher card.

## Phase 5: Games
Game engine with XP, levels, gems, streaks, weekly quests and badges; sixteen game modules; lesson stages and game mode; hints cost XP; mastery card for the teacher.

## Phase 4: Whiteboard
Vector whiteboard with shared and personal boards, teacher modes, snapshots, export, templates, devices checks.

## Phases 0 to 3
Hygiene and security (strict CSP, protected content, student binding), design system and redesigned core pages, lesson clock and sections, listening trainer.
