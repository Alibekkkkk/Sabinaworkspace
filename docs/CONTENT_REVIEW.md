# Content review

## Phase 10 (2026-11-10): applied

Every lesson now passes `npm run lint:content` and the new item checker `npm run review:content`, with no errors or warnings (checked in `tests/content-review.test.mjs`).

**The checker** (`scripts/review-content.mjs`) reads every exercise item. It reports:
- present perfect answers next to a finished time or a habit word;
- a negative hint with a positive answer, or an answer that does not use the verb in brackets;
- sentence builders whose words do not make the quoted sentence;
- correct answers missing from the options, repeated items, and repeated Word Match words;
- vocabulary examples that do not use the word;
- lessons that are too short.

**Listening sets.** Every student now has an approved set of 10 original sentences with Russian translations: `content/listening/<student>.json`, built by `npm run make:listening` from `scripts/data/listening-sentences.json`. Sabina's set was reviewed and approved. The listening page, the portal link and the lesson find a set by the lesson's content file, so lessons with generated ids (`lesson_1792…`) get theirs too.

| Student | What was wrong | What changed |
| --- | --- | --- |
| Sabina | Her test asked about a heat wave above 42 °C, 200 mm of rain, 400 hectares of burned forest, 11 days of firefighting and 38 °C cooling centres, but the 152-word passage covered only the flood. Its 18 other disaster words and the present perfect never appeared in it. Two duplicated sentence builders. | The passage became a 430-word article: the flood, then the heat wave, then the wildfire within six weeks, and what the town has learned. All 20 target words and the present perfect and past passive appear in it. Every sentence the reading questions rely on is unchanged and stays in the same paragraph. Two new reading questions; two new sentence builders. |
| Gaziz | Two answer keys clashed with habit words ("volunteers ___ (clean) the riverbank **every spring**" expected "have cleaned"). 13 of his 20 target words never appeared in the reading. | The two prompts now fit the present perfect ("twice this year", "since it launched"). A closing paragraph, "What can other cities learn?", uses all 13 words. |
| Abay | 30 sentence-builder prompts and the reading's video box used inline colours and sizes, which the site's security policy ignores in production. The passage used gerunds and infinitives only once. One unnatural test item ("The evidence must suggest…"). | Inline styles replaced by stylesheet classes (`reading-video`, `reading-tip`) and bold labels. A fifth paragraph uses enjoy playing, hope to become, recommend taking, suggest playing, decide to play and avoid gaming. Test item rewritten ("He must be right"). |
| Araylim 1 | Five mixed-practice items repeated earlier ones. A 180-word passage. | Five new items. Paragraph D, a revision study, uses all five of her tenses. |
| Araylim 2 | Half the size of the other lessons: 8 words, 7 reading questions, 8 test items and 4 sentences per builder. Two sentences in the passage did not make sense, and two test items were copies of reading questions. Homework: 9 questions, one bare "(might)" gap, and one answer key that was too strict. | Six new words (astronaut, gravity, debris, passenger, journey, commercial), paragraph D on the first tourist flight, four reading questions and two in-context questions. The test now has 8 / 6 / 5 / 10 items and each builder 13 sentences. The confusing sentences were rewritten. Homework: paragraph D on daily life on Mars, seven new questions, and both answer keys fixed. |
| Araylim 3 | The reading's video and tip box used inline styles. | Replaced by the same stylesheet classes as Abay's. |
| George | The passage (120 words) had no past simple, his Grammar II, and never used "athlete". Two repeated items, and "not going to have breakfast **this morning**". | Paragraph D, about his injury and comeback, is in the past simple and uses "athlete". Four items replaced. |

All seven reading passages are now 200 words or more. The test's text questions are answered by the lesson's own reading, and the homework answers by the homework text (both checked in tests).

**Live since 2026-11-10:** the new content was written into the six live lessons; Araylim 2 has no live lesson yet.

## Earlier proposals (Phase 2, not applied)
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
3. ~~Reading question types~~ built as `readingTasks` (see `docs/PHASE2-REPORT.md`); Sabina's seven tasks are drafts awaiting approval.
