# Lighthouse and axe: signed-in pages

Commit: `7bc51bd` + working tree · Generated: 2026-11-09T17:15:56.705Z · Measured against the local demo site (`npm run dev`) as the seeded student / teacher, so performance numbers are indicative (no CDN, no compression).

Reproduce: `npm run dev`, then `npm run audit:signed-in`.

| Page | Content loaded | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lesson | yes | 74 | 98 | 93 | 54 | 99 | 94 | 100 | 54 | 0 |
| Homework | yes | 98 | 100 | 93 | 54 | 100 | 100 | 100 | 54 | 0 |
| Teacher dashboard | yes | 94 | 100 | 93 | 54 | 100 | 100 | 100 | 54 | 0 |

## axe-core violations (390px wide, signed in)

### Lesson

- **moderate** `heading-order` — Heading levels should only increase by one (1 element; e.g. `.reading-questions > h3:nth-child(2)`)
- **moderate** `region` — All page content should be contained by landmarks (2 elements; e.g. `.section-bar`, `.firebase-emulator-warning`)

### Homework

- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `.firebase-emulator-warning`)

### Teacher dashboard

- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `.firebase-emulator-warning`)

SEO is low on purpose: the pages carry `noindex, nofollow` because this is a private class portal.
