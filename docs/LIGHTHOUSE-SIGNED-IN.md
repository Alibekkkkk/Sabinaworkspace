# Lighthouse and axe: signed-in pages

Commit: `6701451` + working tree · Generated: 2026-11-08T21:37:50.550Z · Measured against the local demo site (`npm run dev`) as the seeded student / teacher, so performance numbers are indicative (no CDN, no compression).

Reproduce: `npm run dev`, then `npm run audit:signed-in`.

| Page | Content loaded | Mobile P | A | BP | SEO | Desktop P | A | BP | SEO | axe serious/critical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lesson | yes | 61 | 98 | 93 | 54 | 98 | 93 | 100 | 54 | 0 |
| Homework | yes | 72 | 100 | 93 | 54 | 99 | 100 | 100 | 54 | 0 |
| Teacher dashboard | yes | 95 | 100 | 93 | 54 | 100 | 100 | 100 | 54 | 0 |

## axe-core violations (390px wide, signed in)

### Lesson

- **moderate** `heading-order` — Heading levels should only increase by one (1 element; e.g. `.reading-questions > h3:nth-child(2)`)
- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `.firebase-emulator-warning`)

### Homework

- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `.firebase-emulator-warning`)

### Teacher dashboard

- **moderate** `region` — All page content should be contained by landmarks (1 element; e.g. `.firebase-emulator-warning`)

SEO is low on purpose: the pages carry `noindex, nofollow` because this is a private class portal.
