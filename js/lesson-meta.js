// Lesson structure and scoring metadata shared by the lesson player and the portal.
// Points per stage are the caps the lesson player awards (see setScore in lesson.js);
// a lesson may override its stage list or total with `stages` / `maxScore` in its metadata.
export const DEFAULT_STAGES = [
  { id: 1, label: "Vocabulary", sub: "Cards", icon: "🌪️", points: 10 },
  { id: 2, label: "Word Match", sub: "Drag", icon: "🔗", points: 15 },
  { id: 3, label: "Interactive Video & Questions", sub: "Video + practice", icon: "📖", points: 25 },
  { id: 4, label: "Completing Sentence 1", sub: "Grammar", icon: "⏳", points: 10 },
  { id: 5, label: "Completing Sentence 2", sub: "Grammar", icon: "🛡️", points: 10 },
  { id: 6, label: "Sentence Builder 1", sub: "Build", icon: "🧩", points: 10 },
  { id: 7, label: "Sentence Builder 2", sub: "Build", icon: "🧱", points: 10 },
  { id: 8, label: "Choose the Tense", sub: "Mixed", icon: "🧭", points: 10 },
  { id: 9, label: "Test Your Knowledge", sub: "Timed test", icon: "⚡", points: 10 }
];

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function stagesMaxScore(stages) {
  if (!Array.isArray(stages)) return 0;
  return stages.reduce((sum, stage) => sum + positiveNumber(stage && stage.points), 0);
}

// Explicit lesson.maxScore wins; otherwise the sum of the stage points; 0 means "unknown".
export function resolveMaxScore(lesson) {
  if (!lesson) return 0;
  return positiveNumber(lesson.maxScore) || stagesMaxScore(lesson.stages || DEFAULT_STAGES);
}
