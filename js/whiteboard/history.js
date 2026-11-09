// Per-user undo/redo for the whiteboard. A command records, for every object it touched, the object before and after
// (null = did not exist / is deleted). Undo applies the "before" side. Because several people can edit one board
// (last writer wins), an entry is skipped when somebody else changed that object after this user's own edit.
export const HISTORY_LIMIT = 100;

export function createHistory(limit = HISTORY_LIMIT) {
  const undoStack = []; const redoStack = [];
  const clone = value => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)));

  function record(before, after) {
    const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const command = { before: {}, after: {} };
    for (const id of ids) {
      const a = clone(before[id]); const b = clone(after[id]);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      command.before[id] = a; command.after[id] = b;
    }
    if (!Object.keys(command.before).length) return false;
    undoStack.push(command); redoStack.length = 0;
    if (undoStack.length > limit) undoStack.shift();
    return true;
  }

  // `current(id)` returns the live object or null. Returns { apply: { id: object|null }, skipped: [id] } or null.
  function step(from, to, side, expected, current) {
    const command = from.pop();
    if (!command) return null;
    const apply = {}; const skipped = [];
    for (const id of Object.keys(command[side])) {
      const live = current(id);
      const want = command[expected][id];
      const same = (live === null && want === null) || Boolean(live && want && live.at === want.at);
      if (!same) { skipped.push(id); delete command[side][id]; delete command[expected][id]; continue; }
      apply[id] = clone(command[side][id]);
    }
    if (Object.keys(apply).length) to.push(command);
    if (!Object.keys(apply).length && !skipped.length) return null;
    return { apply, skipped };
  }

  return {
    record,
    undo: current => step(undoStack, redoStack, "before", "after", current),
    redo: current => step(redoStack, undoStack, "after", "before", current),
    dropLast: () => { undoStack.pop(); },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear: () => { undoStack.length = 0; redoStack.length = 0; },
    size: () => ({ undo: undoStack.length, redo: redoStack.length })
  };
}
