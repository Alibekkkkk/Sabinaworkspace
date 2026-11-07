import { assessPlacement, PLACEMENT_QUESTIONS } from "./placement.js";

const form = document.getElementById("placementForm");
const questionList = document.getElementById("questionList");
const result = document.getElementById("placementResult");

PLACEMENT_QUESTIONS.forEach((question, questionIndex) => {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "placement-question";
  const legend = document.createElement("legend");
  legend.textContent = `${questionIndex + 1}. ${question.prompt}`;
  fieldset.append(legend);

  question.options.forEach((option, optionIndex) => {
    const label = document.createElement("label");
    label.className = "placement-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `question-${questionIndex}`;
    input.value = String(optionIndex);
    input.required = true;
    label.append(input, document.createTextNode(option));
    fieldset.append(label);
  });
  questionList.append(fieldset);
});

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const answers = PLACEMENT_QUESTIONS.map((_, index) => formData.get(`question-${index}`));
  const assessment = assessPlacement(answers);
  document.getElementById("resultTitle").textContent = `${assessment.level} · ${assessment.title}`;
  document.getElementById("resultScore").textContent = `You answered ${assessment.score} of ${assessment.total} correctly.`;
  document.getElementById("resultGuidance").textContent = assessment.guidance;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("tryAgain").addEventListener("click", () => {
  form.reset();
  result.hidden = true;
  form.querySelector("input")?.focus();
});
