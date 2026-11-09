# Content review: proposals for your approval

Nothing in this file has been applied. `npm run lint:content` reads the migrated lesson files and reports the items below; it never edits lesson text. The only change made to `content/*.json` in Phase 2 is the added `schemaVersion: 2` and `sections` block (a snapshot of every original file is in `content/_snapshots/*.pre-sections.json`).

## 1. Estimated times to confirm

The migration filled in starting estimates. Please check them or change them per student in the dashboard (Lesson clock card, "Section times").

| Lesson file | Vocabulary | Grammar | Reading | How it was chosen |
| --- | --- | --- | --- | --- |
| abay | 20 min | 20 min | 45 min | vocabulary: 5 + one minute per word; grammar: flat 20; reading: words / 120 wpm + 1.5 min per question |
| araylim_1 | 15 | 20 | 25 | same rule |
| araylim_2 | 15 | 20 | 15 | same rule |
| araylim_3 | 15 | 20 | 25 | same rule |
| gaziz | 25 | 20 | 45 | same rule |
| george | 15 | 20 | 20 | same rule |
| sabina | 25 | 20 | 20 | same rule |

The 45-minute reading estimates (abay, gaziz) are driven by the number of questions (28 and 27) rather than the passage length, so they may be longer than you want for one section.

## 2. Reading passages that do not use the target vocabulary

The Phase 2 rule is that the passage must reuse the lesson's target words. These lessons break it:

- **sabina** (19 of 20 words missing): blizzard, drought, earthquake, heat wave, hurricane, tornado, tsunami, wildfire, landslide, avalanche, volcano, eruption, magnitude, tremor, crust, humid, deforestation, atmosphere, evacuation. The passage is a short flood story (152 words) and the vocabulary list is about natural disasters in general. Proposal: either shorten the vocabulary to the words the passage uses, or lengthen the passage so each target word appears once or twice. I have not rewritten either.
- **gaziz** (13 of 20 missing): environment, community, to improve, to increase, to provide, to affect, benefit, cost, issue, solution, resource, to develop, to support.
- **george** (1 missing): athlete.
- abay, araylim_1/2/3: every target word appears in the passage.

The check matches common endings (-s, -es, -ed, -ing, -ly). Irregular forms ("ran" for "run") are not recognised, so a few reported words may be present in an irregular form.

## 3. Grammar topic missing

No grammar section has a `topic`, so the linter cannot yet check that the passage contains the target structure at least three times. To enable it, set `sections[].topic` for the grammar section of each lesson (for example `"present perfect"`, `"past simple"`, `"gerund and infinitive"`, `"passive voice"`). Patterns for those four topics are in `scripts/lint-content.mjs` (`GRAMMAR_PATTERNS`); other topics need a pattern added. Which topic does each student's lesson teach? Tell me and I will add the field.

## 4. Not yet checked

- **CEFR word level.** The check needs an openly licensed word list. The New General Service List (CC BY-SA 4.0) is the suggested one; save it as `content/wordlists/ngsl.txt` (one word per line or space separated) and the linter will start reporting words above the lesson level. It was not downloaded here.
- **Question answers derivable from the text.** The linter checks that short-answer questions have an accepted answer written in the passage; paraphrased answers appear as warnings to read, not errors.

## 5. Features from the Phase 2 brief that are not built yet

These change lesson content or add authoring tools, so they need your approval of the design first:

1. ~~Vocabulary word families~~ built (see `docs/PHASE2-REPORT.md`). Sabina's seven families are drafts awaiting approval. An openly licensed derivation list (optional `content/wordlists/derivations.txt`) would let the linter confirm forms that do not share a stem with the headword.
2. **Grammar exercise ladder** (notice, gap, build, correct, transform, produce) with rule cards and L1 error notes: needs new items per topic.
3. **Reading question types** (long answer with rubric, true/false/not given with evidence quote, find-the-sentence, opinion question).
