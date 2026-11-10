# Lighthouse and axe baseline

Commit: `b768fdb` · Generated: 2026-11-10T16:41:12.716Z · Browser: `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` · Served from a local static server (no CDN, no HTTP caching headers, no compression), so performance numbers are indicative, not production numbers.

Reproduce with `npm run audit:web` (optionally `-- portal.html placement.html`; a subset run replaces the report with only those pages).

Scores are Lighthouse 0-100. P = Performance, A = Accessibility, BP = Best Practices, SEO.

| Page | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login / portal (`portal.html`) | 91 | 96 | 96 | 54 | 100 | 96 | 93 | 54 | 0 |
| Placement (`placement.html`) | 100 | 100 | 93 | 54 | 100 | 100 | 96 | 54 | 0 |
| Practice (`practice.html`) | 91 | 100 | 93 | 54 | 100 | 100 | 93 | 54 | 0 |
| Clip Lab (`clip.html`) | 88 | 96 | 96 | 54 | 99 | 96 | 96 | 54 | 0 |
| Manga reader (`manga.html`) | 80 | 100 | 93 | 54 | 99 | 100 | 93 | 54 | 0 |
| Lesson (`lesson.html`) | 69 | 100 | 93 | 54 | 97 | 100 | 93 | 54 | 0 |
| Homework (`homework.html`) | 93 | 100 | 93 | 54 | 100 | 100 | 93 | 54 | 0 |
| Teacher dashboard (`dashboard.html`) | 78 | 100 | 96 | 54 | 99 | 100 | 96 | 54 | 0 |
| Import tool (`tools/import-content.html`) | 100 | 96 | 96 | 54 | 100 | 96 | 96 | 54 | 1 |

## axe-core violations (390px wide, anonymous visitor)

### Login / portal (`portal.html`)

- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `#languageCorner`)

### Placement (`placement.html`)

No violations.

### Practice (`practice.html`)

No violations.

### Clip Lab (`clip.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Manga reader (`manga.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Lesson (`lesson.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `#languageCorner`)

### Homework (`homework.html`)

- **moderate** `page-has-heading-one` — Page should contain a level-one heading (1 element; e.g. `html`)

### Teacher dashboard (`dashboard.html`)

- **moderate** `landmark-one-main` — Document should have one main landmark (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (2 elements; e.g. `#teacherLogin > h1`, `#teacherLogin > p`)

### Import tool (`tools/import-content.html`)

- **serious** `aria-prohibited-attr` — Elements must only use permitted ARIA attributes (1 element; e.g. `#mmStage`)
- **moderate** `landmark-one-main` — Document should have one main landmark (1 element; e.g. `html`)
- **moderate** `region` — All page content should be contained by landmarks (3 elements; e.g. `h1`, `body > p:nth-child(2)`)

## Scope and limits

- `lesson.html`, `homework.html`, `dashboard.html` and the import tool need a signed-in student or teacher. Here they are measured in the state an anonymous visitor sees. Use `npm run dev` (Firebase emulators + seed data) to inspect the signed-in views by hand.
- SEO is 54 on every page on purpose: the pages carry `noindex, nofollow` because this is a private class portal, and Lighthouse penalises that. Do not 'fix' it.
- Lighthouse runs in a throttled simulated environment; re-run on the deployed site for production numbers.
