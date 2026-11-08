(() => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function timestamp(value) {
    const time = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function cleanText(value, maxLength = 180) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  window.createWeeklyProgressSummary = function({
    studentName,
    studentCode,
    attempts = [],
    topics = {},
    homework = {},
    history = [],
    streak = 0,
    assignments = [],
    now = Date.now()
  }) {
    if (!String(studentCode || "").trim()) throw new Error("Select a student before generating a weekly summary.");

    const end = Number(now);
    if (!Number.isFinite(end)) throw new Error("A valid report date is required.");
    const start = end - WEEK_MS;
    const recentAttempts = (Array.isArray(attempts) ? attempts : [])
      .filter(attempt => {
        if (!attempt || typeof attempt !== "object") return false;
        const completedAt = timestamp(attempt && attempt.completedAt);
        return completedAt >= start && completedAt <= end;
      });
    const totalScore = recentAttempts.reduce((sum, attempt) => sum + finiteNumber(attempt.score), 0);
    const totalQuestions = recentAttempts.reduce((sum, attempt) => sum + finiteNumber(attempt.total), 0);
    const timeSpent = recentAttempts.reduce((sum, attempt) => sum + Math.max(0, finiteNumber(attempt.timeSpentSeconds)), 0);
    const recentHistory = (Array.isArray(history) ? history : [])
      .filter(item => item && item.actor === "student" && timestamp(item.ts) >= start && timestamp(item.ts) <= end)
      .sort((a, b) => timestamp(b.ts) - timestamp(a.ts))
      .slice(0, 8);
    const weakTopics = Object.entries(topics && typeof topics === "object" ? topics : {})
      .map(([name, stats]) => ({
        name: cleanText(name, 80),
        accuracy: finiteNumber(stats && stats.total) > 0
          ? Math.min(1, Math.max(0, finiteNumber(stats.score) / finiteNumber(stats.total)))
          : 0
      }))
      .filter(topic => topic.name)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);
    const homeworkItems = Object.entries(homework && typeof homework === "object" ? homework : {});
    const lines = [
      "Weekly learning summary",
      `Student: ${cleanText(studentName || "Student", 100)} (${cleanText(studentCode, 20)})`,
      `Period: ${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}`,
      `Practice: ${recentAttempts.length} games completed, ${totalQuestions ? Math.round(totalScore / totalQuestions * 100) : 0}% average accuracy, ${Math.round(timeSpent / 60)} minutes tracked.`,
      `Current streak: ${Math.max(0, finiteNumber(streak))} days.`
    ];

    if (homeworkItems.length) {
      lines.push("Current homework status (all assignments):");
      homeworkItems.forEach(([id, item]) => {
        const record = item && typeof item === "object" ? item : {};
        const status = record.submitted ? "submitted" : record.updatedAt ? "in progress" : "not started";
        const score = record.submitted
          ? ` (${finiteNumber(record.score)}/${finiteNumber(record.total)})`
          : "";
        lines.push(`- ${cleanText(id, 100)}: ${status}${score}`);
      });
    } else {
      lines.push("Homework: No homework activity recorded.");
    }

    // `assignments` is [{ title, state, label, completed }] prepared by the dashboard from js/schedule.js.
    const scheduled = (Array.isArray(assignments) ? assignments : [])
      .filter(item => item && typeof item === "object" && !item.completed)
      .map(item => ({ title: cleanText(item.title, 100), state: cleanText(item.state, 20), label: cleanText(item.label, 80) }))
      .filter(item => item.title && (item.state === "overdue" || item.state === "due-today" || item.state === "due-soon"));
    const overdue = scheduled.filter(item => item.state === "overdue");
    const upcoming = scheduled.filter(item => item.state !== "overdue");
    if (overdue.length) lines.push(`Overdue (${overdue.length}): ${overdue.map(item => `${item.title} - ${item.label}`).join("; ")}.`);
    if (upcoming.length) lines.push(`Due soon (${upcoming.length}): ${upcoming.map(item => `${item.title} - ${item.label}`).join("; ")}.`);

    if (weakTopics.length) {
      lines.push(`Topics to revisit (based on all recorded practice): ${weakTopics.map(topic => `${topic.name} (${Math.round(topic.accuracy * 100)}%)`).join(", ")}.`);
    }
    lines.push("Recent student activity:");
    if (recentHistory.length) {
      recentHistory.forEach(item => {
        lines.push(`- ${new Date(timestamp(item.ts)).toLocaleDateString()}: ${cleanText(item.detail) || "Activity recorded"}`);
      });
    } else {
      lines.push("- No student activity recorded in this period.");
    }

    return lines.join("\n");
  };
})();
