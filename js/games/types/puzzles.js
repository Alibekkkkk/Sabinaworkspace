// Crossword and Word Search with full keyboard play: arrow keys move around the grid (one tab stop for the whole grid),
// letters are typed or selected in place, and every cell has a spoken row, column and clue label.
import { button, el, liveRegion, meter } from "../ui.js";

// ---- Word search: pure selection rules --------------------------------------------------------------------------------
const reverse = text => [...text].reverse().join("");
const sameLine = (selected, point) => {
  const prior = selected[selected.length - 1]; if (!prior) return true;
  const rowStep = point.row - prior.row; const colStep = point.col - prior.col;
  if ((!rowStep && !colStep) || Math.abs(rowStep) > 1 || Math.abs(colStep) > 1) return false;
  if (selected.length > 1) return rowStep === selected[1].row - selected[0].row && colStep === selected[1].col - selected[0].col;
  return true;
};

// Adds a cell to the selection and says what happened: found, growing, or not a word (selection restarts at this cell).
export function selectCell(grid, items, found, selected, point) {
  let next = sameLine(selected, point) ? [...selected, point] : [point];
  const value = next.map(cell => grid[cell.row][cell.col]).join("");
  const open = items.filter(item => !found.has(item.id));
  const hit = open.find(item => item.answer === value || reverse(item.answer) === value);
  if (hit) return { selected: [], event: "found", item: hit, cells: next };
  if (!open.some(item => item.answer.startsWith(value) || reverse(item.answer).startsWith(value))) {
    next = [point]; const letter = grid[point.row][point.col];
    if (!open.some(item => item.answer.startsWith(letter) || reverse(item.answer).startsWith(letter))) return { selected: [], event: "nothing" };
    return { selected: next, event: "restart" };
  }
  return { selected: next, event: "growing", value };
}

function gridNav(cells, rows, cols, focusCell) {
  const handler = (event, row, col) => {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -col], End: [0, cols - 1 - col] }[event.key];
    if (!step) return false;
    let r = row + step[0]; let c = col + step[1];
    while (r >= 0 && r < rows && c >= 0 && c < cols) { if (cells.has(`${r},${c}`)) { event.preventDefault(); focusCell(r, c); return true; } if (event.key === "Home" || event.key === "End") break; r += step[0]; c += step[1]; }
    return true;
  };
  return handler;
}

export const wordSearch = {
  TYPE: "word-search",
  supports: game => game.type === "word-search",
  render(container, game, bus) {
    const items = game.questions; const grid = game.grid; const rows = grid.length; const cols = grid[0].length;
    const found = new Set(); let selected = []; let run = 0; let bestRun = 0; let done = false;
    const progress = meter("Words found", items.length); const live = liveRegion();
    const board = el("div", "puzzle-grid"); board.style.setProperty("--columns", String(cols)); board.setAttribute("role", "grid"); board.setAttribute("aria-label", "Letter grid. Use the arrow keys to move and Enter to select a letter.");
    const list = el("ul", "puzzle-words"); const wordNodes = new Map();
    for (const item of items) { const li = el("li", "", item.prompt); wordNodes.set(item.id, li); list.append(li); }
    const nodes = new Map(); let focusAt = "0,0";
    const focusCell = (r, c) => { focusAt = `${r},${c}`; for (const [key, node] of nodes) node.tabIndex = key === focusAt ? 0 : -1; nodes.get(focusAt).focus(); };
    const nav = gridNav(nodes, rows, cols, focusCell);
    grid.forEach((row, r) => { const rowNode = el("div", "puzzle-row"); rowNode.setAttribute("role", "row"); rowNode.style.display = "contents"; row.forEach((letter, c) => {
      const node = el("button", "puzzle-cell open", letter); node.type = "button"; node.tabIndex = r === 0 && c === 0 ? 0 : -1; node.setAttribute("role", "gridcell"); node.setAttribute("aria-label", `${letter}, row ${r + 1}, column ${c + 1}`); node.setAttribute("aria-selected", "false");
      node.addEventListener("click", () => choose(r, c)); node.addEventListener("keydown", event => { nav(event, r, c); });
      nodes.set(`${r},${c}`, node); rowNode.append(node); }); board.append(rowNode); });
    const feedback = el("p", "gm-feedback", "Select the letters of a word one after another."); feedback.setAttribute("aria-live", "polite");
    const clear = button("Clear selection", "button secondary", () => { resetMarks(); selected = []; feedback.textContent = "Selection cleared."; });
    const finishNow = button("Finish now", "button secondary", () => finish());
    const resetMarks = () => { for (const node of nodes.values()) { node.classList.remove("selected"); node.setAttribute("aria-selected", "false"); } };
    const mark = cells => { for (const cell of cells) { const node = nodes.get(`${cell.row},${cell.col}`); node.classList.add("selected"); node.setAttribute("aria-selected", "true"); } };
    container.replaceChildren(el("p", "gm-hint", "Words can run in any straight line, forwards or backwards."), progress.element, board, list, feedback, el("div", "gm-answer"), live.element);
    container.querySelector(".gm-answer").append(clear, finishNow);
    function choose(r, c) {
      if (done) return;
      const out = selectCell(grid, items, found, selected, { row: r, col: c }); selected = out.selected; resetMarks();
      if (out.event === "found") {
        found.add(out.item.id); run += 1; bestRun = Math.max(bestRun, run);
        for (const cell of out.cells) nodes.get(`${cell.row},${cell.col}`).classList.add("found");
        wordNodes.get(out.item.id).classList.add("found"); wordNodes.get(out.item.id).textContent = `${out.item.prompt}: ${out.item.answer} (found)`;
        bus.services.sound("good"); feedback.textContent = `Found ${out.item.answer}!`; progress.set(found.size);
        if (found.size === items.length) finish();
      } else if (out.event === "growing") { mark(out.selected); feedback.textContent = `Selected ${out.selected.length} letter${out.selected.length === 1 ? "" : "s"}: ${out.value}.`; }
      else if (out.event === "restart") { mark(out.selected); feedback.textContent = "That does not continue a word. A new selection starts here."; }
      else { feedback.textContent = "Not the start of a word on the list."; run = 0; }
      live.say(feedback.textContent);
    }
    function finish() { if (done) return; done = true; const answers = {}; for (const item of items) if (found.has(item.id)) answers[item.id] = item.answer; if (found.size === items.length) bus.services.celebrate("small"); bus.finish({ answers, bestRun, kind: "game" }); }
    return { destroy() { done = true; } };
  }
};

// ---- Crossword -------------------------------------------------------------------------------------------------------------
export const crossword = {
  TYPE: "crossword",
  supports: game => game.type === "crossword",
  render(container, game, bus) {
    const items = game.questions; const grid = game.grid; const rows = grid.length; const cols = grid[0].length;
    const inputs = new Map(); const wordsAt = new Map(); let active = items[0]; let done = false;
    const key = (r, c) => `${r},${c}`;
    for (const item of items) item.cells.forEach(cell => { const list = wordsAt.get(key(cell.row, cell.col)) || []; list.push(item); wordsAt.set(key(cell.row, cell.col), list); });
    const progress = meter("Letters filled", [...wordsAt.keys()].length); const live = liveRegion();
    const board = el("div", "puzzle-grid"); board.style.setProperty("--columns", String(cols)); board.setAttribute("role", "group"); board.setAttribute("aria-label", "Crossword. Type letters; the arrow keys move between squares.");
    const clueNodes = new Map(); const clues = el("ol", "puzzle-words");
    const focusCell = (r, c) => { for (const [k, node] of inputs) node.tabIndex = k === key(r, c) ? 0 : -1; inputs.get(key(r, c)).focus(); };
    const nav = gridNav(inputs, rows, cols, focusCell);
    const filled = () => [...inputs.values()].filter(node => node.value).length;
    const clueText = item => `${item.number} ${item.direction}: ${item.prompt}, ${item.answer.length} letters`;
    const select = (item, announce = true) => { active = item; for (const [id, node] of clueNodes) node.classList.toggle("is-active", id === item.id); for (const node of inputs.values()) node.classList.remove("in-word"); item.cells.forEach(cell => inputs.get(key(cell.row, cell.col)).classList.add("in-word")); if (announce) live.say(clueText(item)); };
    const wordFor = (r, c, prefer) => { const list = wordsAt.get(key(r, c)) || []; return list.includes(prefer) ? prefer : list[0]; };
    const numberAt = new Map(items.map(item => [key(item.cells[0].row, item.cells[0].col), item.number]));
    let first = true;
    grid.forEach((row, r) => row.forEach((_, c) => {
      const cell = el("div", "puzzle-cell");
      if (!wordsAt.has(key(r, c))) { cell.classList.add("blocked"); board.append(cell); return; }
      cell.classList.add("open");
      if (numberAt.has(key(r, c))) cell.append(el("span", String(numberAt.get(key(r, c))), "puzzle-number"));
      const input = el("input"); input.type = "text"; input.maxLength = 1; input.autocomplete = "off"; input.autocapitalize = "characters"; input.tabIndex = first ? 0 : -1; first = false;
      const owners = wordsAt.get(key(r, c));
      input.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}. ${owners.map(item => `Clue ${item.number} ${item.direction}: ${item.prompt}`).join(". ")}`);
      input.addEventListener("focus", () => { const item = wordFor(r, c, active); if (item !== active) select(item); else if (!active.cells.some(p => p.row === r && p.col === c)) select(item); });
      const afterType = () => {
        input.value = input.value.toLocaleUpperCase().replace(/[^A-Z]/g, "").slice(-1); progress.set(filled());
        if (input.value) { const idx = active.cells.findIndex(p => p.row === r && p.col === c); const nextCell = active.cells[idx + 1]; if (nextCell) focusCell(nextCell.row, nextCell.col); }
      };
      input.addEventListener("input", afterType);
      input.addEventListener("keydown", event => {
        if (nav(event, r, c)) return;
        if (/^[a-z]$/i.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); input.value = event.key.toUpperCase(); afterType(); return; } // also replaces a letter that is already there
        if (event.key === "Backspace" && !input.value) { const idx = active.cells.findIndex(p => p.row === r && p.col === c); const prev = active.cells[idx - 1]; if (prev) { event.preventDefault(); focusCell(prev.row, prev.col); inputs.get(key(prev.row, prev.col)).value = ""; progress.set(filled()); } }
        else if (event.key === " " && owners.length > 1) { event.preventDefault(); select(owners.find(item => item !== active) || owners[0]); }
        else if (event.key === "Tab" && !event.ctrlKey && !event.altKey) { const i = items.indexOf(active); const target = items[(i + (event.shiftKey ? items.length - 1 : 1)) % items.length]; event.preventDefault(); select(target); focusCell(target.cells[0].row, target.cells[0].col); }
      });
      inputs.set(key(r, c), input); cell.append(input); board.append(cell);
    }));
    for (const item of items) { const li = el("li"); const jump = button(`${item.number} ${item.direction}: ${item.prompt} (${item.answer.length})`, "gm-linkbtn", () => { select(item); focusCell(item.cells[0].row, item.cells[0].col); }); li.append(jump); clueNodes.set(item.id, li); clues.append(li); }
    const check = button("Check the crossword", "button", () => finish());
    container.replaceChildren(el("p", "gm-hint", "Type letters into the squares. Arrow keys move, Space switches across/down, Tab jumps to the next clue."), progress.element, board, el("h3", "gm-subhead", "Clues"), clues, check, live.element);
    select(items[0], false);
    function finish() {
      if (done) return; done = true; const answers = {};
      for (const item of items) answers[item.id] = item.cells.map(p => inputs.get(key(p.row, p.col)).value).join("");
      for (const item of items) { const right = answers[item.id] === item.answer; for (const p of item.cells) inputs.get(key(p.row, p.col)).classList.add(right ? "is-right" : "is-missed"); }
      for (const node of inputs.values()) node.disabled = true; check.disabled = true;
      bus.finish({ answers, bestRun: 0, kind: "game" });
    }
    return { destroy() { done = true; } };
  }
};
