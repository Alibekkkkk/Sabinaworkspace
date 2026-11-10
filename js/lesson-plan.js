// The section list of a classwork lesson (content schema v3). Every lesson has the same order:
//   Vocabulary, Word Match, Reading Comprehension, Games, Listening Training, Grammar I…N, Test Your Knowledge.
// The grammar sections come from the content's `grammar` list, one per topic, named after it; their exercises are the
// existing exercise keys (g6, sbPp, …) so the games engine and question ids keep working. Pure functions: no DOM.

// Section ids are numbers because student progress and the database rules use numbers. 1, 2, 3 and 9 keep the ids they had
// before v3, so earlier vocabulary, matching, reading and test progress still counts. Grammar sections are 21…29.
export const SECTION_ID = Object.freeze({ vocab: 1, match: 2, reading: 3, test: 9, games: 10, listening: 11 });
export const GRAMMAR_BASE_ID = 20;
export const MAX_GRAMMAR_SECTIONS = 9;
export const MAX_SECTION_ID = GRAMMAR_BASE_ID + MAX_GRAMMAR_SECTIONS; // 29: the database rules allow up to 40

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export const roman = index => ROMAN[index] || String(index + 1);

const ICONS = Object.freeze({ vocab: "vocabulary", match: "match", reading: "reading", games: "games", listening: "listening", grammar: "grammar", test: "test" });

// Points per section; a grammar section earns 10 for each of its exercises.
export const POINTS = Object.freeze({ vocab: 10, match: 15, reading: 25, games: 10, listening: 10, grammarExercise: 10, test: 10 });

// Which clock section (the timer cards at the top of the lesson) each lesson section belongs to.
export const CLOCK_SECTION = Object.freeze({ vocab: "vocabulary", match: "vocabulary", reading: "reading", games: "games", listening: "listening", grammar: "grammar", test: "test" });

// An exercise is "complete" (type the missing words: items have p and a) or "build" (put words in order: items have
// prompt and correct). Both group their items as pos, neg, q and shuffled.
const GROUPS = ["pos", "neg", "q", "shuffled"];
export function exerciseKind(data) {
  if (!data || typeof data !== "object") return null;
  const items = GROUPS.flatMap(group => (Array.isArray(data[group]) ? data[group] : []));
  if (!items.length) return null;
  if (items.every(item => item && Array.isArray(item.correct))) return "build";
  if (items.every(item => item && typeof item.p === "string" && typeof item.a === "string")) return "complete";
  return null;
}
export function exerciseSize(data) {
  return GROUPS.reduce((sum, group) => sum + (Array.isArray(data && data[group]) ? data[group].length : 0), 0);
}

// Scoring id of one exercise inside a grammar section: section 21, exercise 0 → 210. Never a section id itself.
export const exerciseScoreId = (sectionId, index) => sectionId * 10 + index;

// content: a classwork lesson. options.listening / options.games: false hides that section (default: shown).
export function buildLessonPlan(content, { listening = true, games = true } = {}) {
  const plan = [];
  const add = (key, label, extra = {}) => plan.push({ id: SECTION_ID[key], key, label, icon: ICONS[key], clock: CLOCK_SECTION[key], ...extra });
  add("vocab", "Vocabulary", { points: POINTS.vocab });
  add("match", "Word Match", { points: POINTS.match });
  add("reading", "Reading Comprehension", { points: POINTS.reading });
  if (games) add("games", "Games", { points: POINTS.games });
  if (listening) add("listening", "Listening Training", { points: POINTS.listening });
  grammarTopics(content).forEach((topic, index) => {
    const id = GRAMMAR_BASE_ID + index + 1;
    plan.push({
      id, key: `grammar-${index + 1}`, kind: "grammar", label: `Grammar ${roman(index)}: ${topic.title}`, shortLabel: `Grammar ${roman(index)}`,
      icon: ICONS.grammar, clock: CLOCK_SECTION.grammar, topic,
      exercises: topic.exercises.map((key, exerciseIndex) => ({ key, kind: exerciseKind(content[key]), scoreId: exerciseScoreId(id, exerciseIndex), points: POINTS.grammarExercise })),
      points: topic.exercises.length * POINTS.grammarExercise
    });
  });
  add("test", "Test Your Knowledge", { points: POINTS.test });
  for (const section of plan) if (!section.kind) section.kind = section.key;
  return plan;
}

// The grammar topics a lesson can show: those whose exercises all exist. Lessons without a `grammar` list (older content)
// get one generic topic per exercise key that exists, so they still open.
export function grammarTopics(content) {
  const list = Array.isArray(content && content.grammar) ? content.grammar : [];
  const valid = list.filter(topic => topic && typeof topic.title === "string" && Array.isArray(topic.exercises) && topic.exercises.length && topic.exercises.every(key => exerciseKind(content[key])));
  if (valid.length) return valid.slice(0, MAX_GRAMMAR_SECTIONS);
  return ["g6", "g7", "sbPp", "sbPs", "g10"].filter(key => exerciseKind(content && content[key])).map(key => ({ id: key.toLowerCase(), title: exerciseKind(content[key]) === "build" ? "Sentence Builder" : "Complete the Sentences", exercises: [key] }));
}

// Everything that earns points, as { id, points }: whole sections, except grammar, which scores per exercise.
export function scoreUnits(plan) {
  return plan.flatMap(section => (section.kind === "grammar" ? section.exercises.map(exercise => ({ id: exercise.scoreId, points: exercise.points })) : [{ id: section.id, points: section.points }]));
}
export const planMaxScore = plan => scoreUnits(plan).reduce((sum, unit) => sum + unit.points, 0);

// A section is done when its own key is done or, for grammar, when every exercise is done. done: { "<lesson>_<id>": true }.
export function sectionDone(section, lessonId, done) {
  if (!section) return false;
  if (section.kind === "grammar") return section.exercises.length > 0 && section.exercises.every(exercise => Boolean(done && done[`${lessonId}_${exercise.scoreId}`]));
  return Boolean(done && done[`${lessonId}_${section.id}`]);
}

export function neighbours(plan, sectionId) {
  const index = plan.findIndex(section => section.id === sectionId);
  return { previous: index > 0 ? plan[index - 1] : null, next: index >= 0 && index < plan.length - 1 ? plan[index + 1] : null };
}

// Older saves and teacher commands may name a stage that no longer exists (the v2 grammar stages 4 to 8): send those to the
// first grammar section, and anything else unknown to the start.
export function resolveSectionId(plan, requested) {
  const id = Number(requested);
  if (plan.some(section => section.id === id)) return id;
  if (id >= 4 && id <= 8) { const grammar = plan.find(section => section.kind === "grammar"); if (grammar) return grammar.id; }
  return plan.length ? plan[0].id : SECTION_ID.vocab;
}

// Problems with a lesson's `grammar` list, for the content linter and the import tool.
export function validateGrammar(content) {
  const errors = [];
  const list = content && content.grammar;
  if (list === undefined) return ["grammar: the list of grammar topics is missing."];
  if (!Array.isArray(list) || !list.length) return ["grammar: must list at least one topic."];
  if (list.length > MAX_GRAMMAR_SECTIONS) errors.push(`grammar: at most ${MAX_GRAMMAR_SECTIONS} topics.`);
  const ids = new Set(); const used = new Set();
  list.forEach((topic, index) => {
    const where = `grammar[${index}]`;
    if (!topic || typeof topic !== "object") { errors.push(`${where}: must be an object.`); return; }
    if (typeof topic.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(topic.id)) errors.push(`${where}: id must be 1-40 characters of a-z, 0-9 and -.`);
    else if (ids.has(topic.id)) errors.push(`${where}: duplicate id "${topic.id}".`); else ids.add(topic.id);
    if (typeof topic.title !== "string" || !topic.title.trim() || topic.title.length > 60) errors.push(`${where}: title is required (at most 60 characters).`);
    if (!topic.rule || typeof topic.rule.formula !== "string" || !topic.rule.formula.trim()) errors.push(`${where}: rule.formula is required.`);
    if (topic.rule && topic.rule.points !== undefined && (!Array.isArray(topic.rule.points) || topic.rule.points.some(point => typeof point !== "string"))) errors.push(`${where}: rule.points must be a list of strings.`);
    if (!Array.isArray(topic.exercises) || !topic.exercises.length) errors.push(`${where}: exercises must name at least one exercise key.`);
    else for (const key of topic.exercises) {
      if (!exerciseKind(content[key])) errors.push(`${where}: "${key}" is not a complete-the-sentence or sentence-builder exercise in this lesson.`);
      else if (used.has(key)) errors.push(`${where}: "${key}" is already used by another topic.`); else used.add(key);
    }
  });
  return errors;
}
