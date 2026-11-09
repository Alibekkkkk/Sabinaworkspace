// Per-student feature flags. A teacher switches them on or off for one student at studentFeatures/<code>/<flag>.
// An explicit true or false always wins; without one, the flag falls back to the lesson's own marker (the older way the
// manga reader was enabled) and then to the default below. Pure functions: no DOM, no Firebase.
export const FEATURES = Object.freeze({
  mangaReader: { label: "Manga reader", description: "The manga reading mode and its story content.", default: false },
  clipLab: { label: "Clip Lab", description: "Video clips with interactive study text.", default: true },
  whiteboard: { label: "Whiteboard", description: "The class board and the student's own board.", default: true },
  listeningTrainer: { label: "Listening trainer", description: "Dictation and shadowing practice.", default: true }
});
export const FEATURE_NAMES = Object.freeze(Object.keys(FEATURES));

export const isFeature = name => Object.hasOwn(FEATURES, name);

// flags: studentFeatures/<code> (may be null); lessonFeatures: a lesson record's own `features` object (may be undefined).
export function hasFeature(flags, name, lessonFeatures = null) {
  if (!isFeature(name)) return false;
  if (flags && typeof flags[name] === "boolean") return flags[name];
  if (lessonFeatures && typeof lessonFeatures[name] === "boolean") return lessonFeatures[name];
  return FEATURES[name].default;
}

// Every flag with its effective value and where the value came from, for the teacher's panel.
export function describeFlags(flags, lessonFeatures = null) {
  return FEATURE_NAMES.map(name => {
    const explicit = flags && typeof flags[name] === "boolean";
    const fromLesson = !explicit && lessonFeatures && typeof lessonFeatures[name] === "boolean";
    return { name, ...FEATURES[name], enabled: hasFeature(flags, name, lessonFeatures), source: explicit ? "teacher" : fromLesson ? "lesson" : "default" };
  });
}

// The lesson markers of a student's whole curriculum folded into one object: a flag is on if any visible lesson turns it on
// and no lesson turns it off. Used only to show the teacher where an "on" came from.
export function mergeLessonFeatures(lessons) {
  const out = {};
  for (const lesson of Object.values(lessons || {})) {
    if (!lesson || lesson.published === false || !lesson.features) continue;
    for (const name of FEATURE_NAMES) if (typeof lesson.features[name] === "boolean" && out[name] !== true) out[name] = lesson.features[name];
  }
  return out;
}

export function notEnabledMessage(name) {
  const label = isFeature(name) ? FEATURES[name].label : "This feature";
  return `${label} is not switched on for your account. If you think it should be, ask your teacher.`;
}

// Manifest defaults (content/manifest.json): { features: { mangaReader: true } } on an entry means "this lesson turns it on".
export function manifestFeatures(entry) {
  const out = {};
  if (entry && entry.features && typeof entry.features === "object") for (const name of FEATURE_NAMES) if (typeof entry.features[name] === "boolean") out[name] = entry.features[name];
  return out;
}
