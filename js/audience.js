// A lesson is visible to a student only when it is explicitly shared with everyone
// (`audience: "all"`) or the student's code is listed in `assignedTo`.
// An empty or missing `assignedTo` with no audience means "nobody", never "everybody".
export function isLessonVisibleTo(lesson, code) {
  if (!lesson || typeof lesson !== "object") return false;
  if (lesson.audience === "all") return true;
  return Boolean(code) && Array.isArray(lesson.assignedTo) && lesson.assignedTo.includes(code);
}
