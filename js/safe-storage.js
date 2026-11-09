// localStorage and sessionStorage that never throw. Browsers can block storage entirely (private modes, blocked cookies), fill
// it up (quota), or lose it. This keeps a copy in memory for the rest of the visit, so the page keeps working, and reports the
// first failure so the page can tell the student their progress is only being saved online ("storage degraded").
const listeners = new Set();
let degraded = false;
function markDegraded(reason) { if (degraded) return; degraded = true; for (const listener of listeners) { try { listener(reason); } catch (error) { /* a listener must not break storage */ } } }

export const storageDegraded = () => degraded;
export function onStorageDegraded(listener) { listeners.add(listener); if (degraded) listener("already"); return () => listeners.delete(listener); }
export function resetStorageStateForTests() { degraded = false; listeners.clear(); }

function makeArea(name) {
  const memory = new Map();
  // Looked up on every call (a browser can allow storage again, and tests change it): cheap, and markDegraded only reports once.
  const native = () => { try { const area = globalThis[name]; if (!area) { markDegraded("missing"); return null; } return area; } catch (error) { markDegraded(error && error.name ? error.name : "blocked"); return null; } };
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      const area = native(); if (!area) return null;
      try { return area.getItem(key); } catch (error) { markDegraded("read"); return null; }
    },
    setItem(key, value) {
      const text = String(value); const area = native();
      if (area) { try { area.setItem(key, text); memory.delete(key); return; } catch (error) { markDegraded(error && error.name === "QuotaExceededError" ? "quota" : "write"); } }
      memory.set(key, text);
    },
    removeItem(key) { memory.delete(key); const area = native(); if (area) { try { area.removeItem(key); } catch (error) { markDegraded("write"); } } },
    key(index) { return this.keys()[index] ?? null; },
    get length() { return this.keys().length; },
    keys() {
      const found = new Set(memory.keys()); const area = native();
      if (area) { try { for (let i = 0; i < area.length; i += 1) found.add(area.key(i)); } catch (error) { markDegraded("read"); } }
      return [...found];
    }
  };
}

export const safeLocal = makeArea("localStorage");
export const safeSession = makeArea("sessionStorage");
