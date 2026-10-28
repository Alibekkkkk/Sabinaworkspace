# Phase 0 audit

Read-only source inspection performed on branch `araylim-4-academic` before implementation. This documents the checked-in source; it does not establish deployed Firebase rules or runtime behavior.

## Known-state checks

| Status | Finding and evidence | One-line fix |
|---|---|---|
| CONFIRMED | The portal reads `nd_student_code` and `nd_student_name` from `localStorage` and automatically enters the portal after checking that the code exists (`portal.html:171-175, 415-426`). A second user on the same browser can inherit the first user's portal identity. | Use tab-scoped identity by default and clear it and legacy keys on switch/sign-out. |
| CONFIRMED | The lesson uses shared legacy keys including `nd_session_code`, `nd_current_lesson`, `nd_state_sabina_v6`, `nd_draft_<lessonId>` and `nd_vocab_<lessonId>` (`lesson.html:479, 489, 689, 878-879, 896-897, 1830`). | Namespace persisted state by verified student code and lesson, migrating only after identity verification. |
| CONFIRMED | `changeSessionCode()` stores the entered code in `nd_session_code` and starts a session without first verifying the new code; the lesson also inherits that stored code (`lesson.html:826-827`). | Verify the new code and identity before changing session listeners or exposing session data. |
| CONFIRMED | Homework chooses a content filename from query parameters/code and falls back to `content/homework_sabina.json` if fetch fails (`homework.html:449-452`). | Fail closed with an explicit missing-content message; never substitute another student's content. |
| CONFIRMED | An exception in `initFirebase()` calls `startHomework()` from its catch handler (`homework.html:459`), and `startHomework()` renders content even if there is no verified Firebase session (`homework.html:467-478`). | Route all auth/database failures to an error state and stop rendering student work. |
| CONFIRMED | Homework answers are stored with question array indexes (`homework.html:350-365`). A stored version other than `homeworkVersion=6` resets answers and `submitted` and writes a new record (`homework.html:220, 465-468`). | Key answers by stable IDs and archive old attempts rather than resetting submitted records. |
| CONFIRMED | Homework annotation restore inserts saved HTML when it merely contains the current title (`homework.html:303-307`); annotation UI saves/restores HTML (`homework.html:265-306`). | Store annotation ranges/notes as structured data and render with DOM APIs or a strict allowlist. |
| CONFIRMED | Homework uses `showToast()` but no local `showToast` definition was found; some call sites guard it, while others do not (`homework.html:333`; guarded use at `homework.html:285`). | Define and use one shared notification helper, or replace calls with an accessible status message. |
| CONFIRMED | Dynamic `innerHTML` and inline handlers are used in lesson, homework, dashboard, and portal code. Examples include annotation HTML (`homework.html:303-307`), generated dashboard controls (`dashboard.html:732, 931, 1070`), and portal registration/card rendering (`portal.html:265, 385`). Escaping is inconsistent across the application. | Use text nodes/DOM APIs for data and delegated event handlers with validated data attributes. |
| CONFIRMED | The lesson's current Sabina-specific behavior uses a name substring for learned vocabulary (`lesson.html:904, 911, 1773`), the initial `activeContentName='sabina'` (`lesson.html:424`), hard-coded channel `nd_lesson_live_v4_sabina` and state key `nd_state_sabina_v6` (`lesson.html:874, 878-879`), and `/ 130` (`lesson.html:309`). | Use verified content metadata (`vocabMode`) and student-context-derived storage/channel names. |
| CONFIRMED | `workspaceName` is populated asynchronously after lesson boot (`lesson.html:752-799`), while vocabulary status checks the displayed name (`lesson.html:904, 911`). | Determine vocabulary mode from the loaded lesson content, not a display name. |
| CONFIRMED | The lesson checks teacher commands for `action==='reset'` (`lesson.html:830`), but dashboard sends `action:'resetStage'` (`dashboard.html:823-830`). The stage-specific reset command is therefore not handled by that lesson command branch. | Align the producer and consumer command schema and cover it with a test. |
| CONFIRMED | The lesson accepts `goto` only when client `cmd.ts > Date.now()-10000` (`lesson.html:804-805`), so clock skew can affect command handling. | Use Firebase server timestamps and an acknowledgement/queue protocol. |
| CONFIRMED | Lesson curriculum entries without `stages` are given `DEFAULT_STAGES` (`lesson.html:727-734`), and rendering uses those defaults (`lesson.html:1793`). Dashboard uses `totalStages=9` (`dashboard.html:722`). | Read stage definitions from the lesson/content source consistently. |
| CONFIRMED | The portal derives stage count from `lesson.stages || []`; if missing, it displays zero stages. It uses `lesson.maxScore || 80` for classwork, and homework falls back to `total || 16` / `maxScore || 16` (`portal.html:354-361`). | Use one content/manifest score source and remove independent fallbacks. |
| CONFIRMED | The lesson score pill is fixed at 130 (`lesson.html:309`); no `maxScore` or `stages` key is present in the inspected lesson JSON files. | Put score and stages in content metadata and read them on all pages. |
| CONFIRMED | The dashboard subscribes to the whole `sessions` tree (`dashboard.html:563`), and writes a single command node (`dashboard.html:823-830`). Rapid commands can replace one another. | Subscribe to compact summaries and queue commands under unique IDs. |
| CONFIRMED | Teacher email configuration is duplicated: dashboard uses one email (`dashboard.html:438, 491`), while lesson and homework each have a separate one-address list (`lesson.html:389`; `homework.html:222`). Setup lists three emails (`TEACHER_SETUP.md:10-13`). | Centralize the allowlist and client configuration, while enforcing authorization in database rules. |
| CONFIRMED | `TEACHER_SETUP.md` refers to `database.rules.json`, but no such rules file exists in the repository. | Add and emulator-test rules; explicitly document publication. |
| CONFIRMED | The portal registers by downloading all of `students` before choosing a code (`portal.html:247-256`). | Generate a code and atomically claim only `students/<code>`. |
| CONFIRMED | Lessons with absent/empty `assignedTo` are visible in both portal and lesson curriculum listing (`portal.html:348-352`; `lesson.html:724-734`). | Require explicit `audience:"all"` or a student assignment. |
| NEW | The checked-in `index.html` has no `noindex` meta; no `robots.txt` was present at Phase 0. Student names/content/answer data are present in site files such as `content/homework_sabina.json`. | Apply the privacy decision; add `noindex` and robots directives regardless. |
| NEW | `TEACHER_SETUP.md` states Gaziz and Sabina homeworks each have 16 questions (`TEACHER_SETUP.md:28`), while their files contain 15 each (`content/homework_gaziz.json`, `content/homework_sabina.json`). | Correct the setup documentation to match the checked-in question arrays. |
| NOT REPRODUCED | The known-state claim that three copies of `isAnswerCorrect()` exist is not supported by the checked-in sources: copies were found in `lesson.html:445-469` and `homework.html:235-259`; no third copy was located. | Extract the two observed implementations into one shared grader and search again before deleting duplicates. |
| CONFIRMED | The lesson and homework graders remove filler words, accept partial/prefix matches and use Levenshtein tolerance (`lesson.html:436-469`; `homework.html:226-259`). This can accept grammar errors; e.g. auxiliary/negation differences can be stripped. | Use exact normalized matches for grammar and reserve bounded fuzzy matching for reading responses. |
| CONFIRMED | `araylim_2` has thin groups: contextQ 2, testShort 1, testTfng/testComplete 2 each, several grammar `neg`/`q` groups of 2-3, and shuffled groups of 4; `araylim_2` and `araylim_3` both teach “to adapt” (`content/araylim_2.json:47, 77-174`; `content/araylim_3.json:28-33, 48-49`). | Preserve existing material; note the overlap and add new material without repeating it. |
| CONFIRMED | Sabina classwork `g10` includes “cycle lane,” “wind power,” and “Copenhagen”; test distractors include “structure,” “vulnerable,” and “ecological” (`content/sabina.json:347, 369-370, 385-387`). | Leave locked content unchanged and ask the teacher whether to revise it in a later, explicit content pass. |
| CONFIRMED | Sabina classwork test repeats three prompts verbatim from homework: the 42°C days, rainfall millimetres, and wildfire lives-lost questions (`content/sabina.json:390-399`; `content/homework_sabina.json:59-68`). Other classwork test items also concern the homework article's disasters. The classwork reading itself is “The Great Flood of Marlowe” (`content/sabina.json:85`). | Preserve as requested; ask whether the test is intended to assess the separate homework passage. |
| CONFIRMED | Some single-answer grammar prompts can permit more than one standard tense, while the existing answer data stores a single answer (e.g. `homework_george.json` and `homework_sabina.json` completion items). | Add explicit cues and accepted alternatives only after reviewing each item. |
| CONFIRMED | UK forms appear in the content (`organised`, `centres`, `defences`, `learned`, `burned`); the current graders do not implement a defined UK/US spelling-variant list (`content/sabina.json`, `content/homework_sabina.json`; grader lines above). | Add only an explicit, tested spelling-equivalence map. |

`TODO(verify)`: live rules and deployed database permissions; whether code-only registration is allowed by current rules; runtime behavior of Firebase auth failures and listener switching; browser behavior of restored annotations and inline event handlers; external video availability/embeddability; whether all apparent ambiguities are accepted alternatives in the teaching context.

## Requested follow-up checks

| Check | Result |
|---|---|
| Switch session via `changeSessionCode()` / inherited code | Confirmed: current local code can be used without verification at `lesson.html:826-827`; URL code also persists to local storage in `lesson.html:826`. |
| Homework `video` rendering | No `video` reference or iframe renderer was found in `homework.html`; the field exists in some JSON (`content/homework_abay.json:11`, `content/homework_araylim_3.json:11`). Browser rendering was not verified. |
| Araylim 3 YouTube ID | The file uses `a0_lo_GDcFw` (`content/homework_araylim_3.json:11`, and classwork `content/araylim_3.json`). The external video’s availability and embed permission are `TODO(verify)`. |
| MCQ option re-shuffle | Confirmed in code: `shuffle()` is used while rendering MCQ options (`homework.html:228, 350-355`); each rerender calls the renderer. Browser behavior was not exercised. |
| Stored XSS surfaces | Confirmed: dynamic HTML and inline event-handler construction occur in the listed files above; not every interpolated value has been proven attacker-controlled. Treat data rendering as unsafe until each site is converted/sanitized. |
| `resetStage` | Dashboard sends `resetStage`, but lesson consumer expects `reset`; not handled by that command path (`dashboard.html:823-830`; `lesson.html:830-840`). |
| Missing curriculum `stages`/`maxScore` | Lesson defaults stages to 9 (`lesson.html:394-404, 727-734`); portal displays no stages if absent and score defaults to 80 (`portal.html:354-361`); dashboard hard-codes 9 (`dashboard.html:722`). No explicit common `maxScore` fallback exists in lesson content. |
| Canonical-answer strict grading | Every stored canonical answer is an exact match to itself after normalization. The source does not establish that each answer is pedagogically unambiguous or that all valid alternatives are listed; those require content review. Current permissive grader behavior is documented above. |
| Exact duplicate prompts by classwork/homework pair | `abay`: 0; `araylim_1`: 0; `araylim_2`: 0; `araylim_3`: 0; `gaziz`: 1 (“What is the main idea of the article?”); `george`: 2 (“What is the coach doing right now?” and a train-every-day completion prompt); `sabina`: 3 (42°C days, rainfall millimetres, and wildfire lives-lost prompts). This is exact text matching only; semantic overlap can be higher. |

## Content inventory

Counts are JSON array lengths for classwork groups and homework `questions`; `g6`, `g7`, `sbPp`, `sbPs`, and `g10` group lengths are counted separately where present.

| File | Main item counts |
|---|---|
| `content/abay.json:1-342` | vocab 16; match 10; readingQ 20; contextQ 8; g6/g7/sbPp/sbPs/g10 each pos/neg/q/shuffled = 5/5/5/15; test MCQ/short/TFNG/complete = 8/6/5/10 |
| `content/araylim_1.json:1-309` | vocab 10; match 10; readingQ 12; contextQ 5; g6/g7/g10 = 8/6/6/12 each; sbPp/sbPs = 5/4/4/8 each; test = 10/8/6/12 |
| `content/araylim_2.json:1-174` | vocab 8; match 8; readingQ 7; contextQ 2; g6=5/2/2/4, g7=5/3/2/4, sbPp/sbPs=1/1/1/1, g10=5/2/2/4; test = 3/1/2/2 |
| `content/araylim_3.json:1-305` | vocab 10; match 10; readingQ 10; contextQ 5; g6/g7/sbPp/sbPs/g10 each 5/5/5/15; test = 8/6/5/10 |
| `content/gaziz.json:1-449` | vocab 20; match 10; readingQ 19; contextQ 8; g6/g7/sbPp/sbPs/g10 each 5/5/5/30; test = 8/6/5/10 |
| `content/george.json:1-343` | vocab 10; match 14; readingQ 10; contextQ 4; g6/g7/sbPp/sbPs/g10 each 5/5/5/20; test = 8/6/5/10 |
| `content/sabina.json:1-416` | vocab 20; match 10; readingQ 10; contextQ 4; g6/g7/sbPp/sbPs/g10 each 5/5/5/30; test = 8/6/5/10 |
| `content/homework_abay.json:1-147` | vocab 16; questions 10 |
| `content/homework_araylim_1.json:1-72` | vocab 8; questions 23 |
| `content/homework_araylim_2.json:1-55` | vocab 7; questions 9 |
| `content/homework_araylim_3.json:1-70` | vocab 10; questions 16 |
| `content/homework_gaziz.json:1-80` | vocab 9; questions 15 |
| `content/homework_george.json:1-83` | vocab 10; questions 16 |
| `content/homework_sabina.json:1-83` | vocab 10; questions 15 |

No stable question IDs are currently present. Existing classwork/homework overlap is reported above for Sabina and the curriculum note above for Araylim. Exhaustive semantic duplicate detection and a per-item linguistic adjudication are not reliable from string matching alone and remain `TODO(verify)` before any content is changed.

## Sabina classwork snapshot

The immutable originals are copied byte-for-byte to `content/_snapshots/sabina.pre-games.json` and `content/_snapshots/homework_sabina.pre-games.json`.

- Topic: natural disasters (`content/sabina.json:2-71, 85`).
- Grammar: present perfect (`g6`, `content/sabina.json:104-157`), past passive (`g7`, `content/sabina.json:159-267`), and present perfect versus past simple (`g10`, `content/sabina.json:324-378`).
- Vocabulary (20; emoji): blizzard ❄️, drought 🏜️, earthquake 🏚️, flood 🌊, heat wave 🥵, hurricane 🌀, tornado 🌪️, tsunami 🌊, wildfire 🔥, landslide ⛰️, avalanche 🏔️, volcano 🌋, eruption 💥, magnitude 📊, tremor 📳, crust 🪨, humid 💧, deforestation 🪓, atmosphere 🌍, evacuation 🚨 (`content/sabina.json:2-71`).
- Existing stages (nine): Vocabulary; Word Match; Interactive Video & Questions; Completing Sentence 1; Completing Sentence 2; Sentence Builder 1; Sentence Builder 2; Choose the Tense; Test Your Knowledge (`lesson.html:394-404`).
- Base score: lesson UI says `/ 130` (`lesson.html:309`); this is a hard-coded display, not metadata in Sabina's JSON.
- Special treatment: name-based pre-learned vocab behavior, fixed BroadcastChannel and state key (`lesson.html:874, 878-879, 904, 911, 1773`).
- Test/homework review note: homework is based on “The Summer the Weather Changed,” with the 42°C/400-hectare/11-day/lives-lost facts (`content/homework_sabina.json:9-15, 58-81`); classwork's reading is “The Great Flood of Marlowe” (`content/sabina.json:85`). Leave this content untouched pending teacher decision.
