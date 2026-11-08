# Lighthouse and axe baseline

Commit: `74a08fd` · Generated: 2026-11-08T20:04:27.219Z · Browser: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` · Served from a local static server (no CDN, no HTTP caching headers, no compression), so performance numbers are indicative, not production numbers.

Reproduce with `npm run audit:web` (optionally `-- portal.html placement.html`; a subset run replaces the report with only those pages).

Scores are Lighthouse 0-100. P = Performance, A = Accessibility, BP = Best Practices, SEO.

| Page | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login / portal (`portal.html`) | 86 | 100 | 96 | 54 | 99 | 100 | 96 | 54 | 0 |
| Placement (`placement.html`) | 92 | 100 | 93 | 54 | 99 | 100 | 96 | 54 | 0 |
| Practice (`practice.html`) | 100 | 100 | 96 | 54 | 100 | 100 | 96 | 54 | 0 |
| Clip Lab (`clip.html`) | 95 | 100 | 96 | 54 | 99 | 100 | 96 | 54 | 0 |
| Manga reader (`manga.html`) | 97 | 100 | 96 | 54 | 100 | 100 | 96 | 54 | 0 |
| Lesson (`lesson.html`) | 85 | 100 | 96 | 54 | 99 | 91 | 96 | 54 | 0 |
| Homework (`homework.html`) | 93 | 100 | 96 | 54 | 100 | 100 | 96 | 54 | 0 |
| Teacher dashboard (`dashboard.html`) | 83 | 100 | 96 | 54 | 99 | 100 | 96 | 54 | 0 |
| Import tool (`tools/import-content.html`) | 96 | 100 | 96 | 54 | 100 | 100 | 96 | 54 | 0 |

## axe-core violations (390px wide, anonymous visitor)

### Login / portal (`portal.html`)

No violations.

### Placement (`placement.html`)

No violations.

### Practice (`practice.html`)

No violations.

### Clip Lab (`clip.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Manga reader (`manga.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Lesson (`lesson.html`)

- **moderate** `landmark-unique` — Landmarks should have a unique role or role/label/title (i.e. accessible name) combination (1 element; e.g. `.sidebar`)
- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (4 elements; e.g. `.mark`, `#syncPill`)

### Homework (`homework.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Teacher dashboard (`dashboard.html`)

- **moderate** `landmark-one-main` — Document should have one main landmark (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (2 elements; e.g. `#teacherLogin > h1`, `#teacherLogin > p`)

### Import tool (`tools/import-content.html`)

- **moderate** `landmark-one-main` — Document should have one main landmark (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (3 elements; e.g. `h1`, `body > p:nth-child(2)`)

## Scope and limits

- `lesson.html`, `homework.html`, `dashboard.html` and the import tool need a signed-in student or teacher. Here they are measured in the state an anonymous visitor sees. Use `npm run dev` (Firebase emulators + seed data) to inspect the signed-in views by hand.
- SEO is 54 on every page on purpose: the pages carry `noindex, nofollow` because this is a private class portal, and Lighthouse penalises that. Do not 'fix' it.
- Lighthouse runs in a throttled simulated environment; re-run on the deployed site for production numbers.
