export const PLACEMENT_QUESTIONS = [
  {
    prompt: "Choose the correct greeting.",
    options: ["Good morning.", "Good mornings.", "A good morning is."],
    answer: 0
  },
  {
    prompt: "My sister ___ from Kazakhstan.",
    options: ["am", "is", "are"],
    answer: 1
  },
  {
    prompt: "We ___ English every Tuesday.",
    options: ["study", "studies", "studying"],
    answer: 0
  },
  {
    prompt: "There ___ two books on the table.",
    options: ["is", "are", "be"],
    answer: 1
  },
  {
    prompt: "Yesterday, I ___ my grandmother.",
    options: ["visit", "visited", "have visit"],
    answer: 1
  },
  {
    prompt: "You ___ wear a seat belt in a car.",
    options: ["should", "would", "might to"],
    answer: 0
  },
  {
    prompt: "I have lived here ___ 2022.",
    options: ["for", "since", "during"],
    answer: 1
  },
  {
    prompt: "If it rains tomorrow, we ___ at home.",
    options: ["stay", "stayed", "will stay"],
    answer: 2
  },
  {
    prompt: "The report ___ by the class yesterday.",
    options: ["finished", "was finished", "has finishing"],
    answer: 1
  },
  {
    prompt: "She asked me where I ___.",
    options: ["live", "lived", "do live"],
    answer: 1
  },
  {
    prompt: "By the time we arrived, the film ___.",
    options: ["had started", "has started", "was start"],
    answer: 0
  },
  {
    prompt: "Despite ___ tired, he finished the assignment.",
    options: ["he was", "being", "to be"],
    answer: 1
  }
];

const LEVELS = [
  { minimum: 0, level: "A1", title: "Beginner foundations", guidance: "Start with everyday words, basic sentence patterns, and present-tense practice." },
  { minimum: 4, level: "A2", title: "Elementary", guidance: "Build confidence with common situations, past events, and practical vocabulary." },
  { minimum: 7, level: "B1", title: "Intermediate", guidance: "Practise longer explanations, connected ideas, and a wider range of grammar." },
  { minimum: 10, level: "B2", title: "Upper-intermediate challenge", guidance: "Work on precision, complex sentence patterns, and nuanced vocabulary." }
];

export function assessPlacement(answers) {
  const score = PLACEMENT_QUESTIONS.reduce((total, question, index) => (
    Number(Array.isArray(answers) ? answers[index] : answers && (answers[index] ?? answers[`question-${index}`])) === question.answer
      ? total + 1
      : total
  ), 0);
  let level = LEVELS[0];
  LEVELS.forEach(candidate => {
    if (score >= candidate.minimum) level = candidate;
  });
  return {
    score,
    total: PLACEMENT_QUESTIONS.length,
    level: level.level,
    title: level.title,
    guidance: level.guidance
  };
}
