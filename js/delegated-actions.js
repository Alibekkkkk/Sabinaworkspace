const ACTION_EVENTS = new Set(["click", "change", "input", "keydown"]);
const delegatedClickCallbacks = new WeakMap();

export function installDelegatedActions(actions) {
  if (!actions || Object.getPrototypeOf(actions) !== Object.prototype) {
    throw new TypeError("Delegated actions must be a plain object.");
  }

  const events = new Set();
  for (const [name, action] of Object.entries(actions)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) ||
        !action ||
        !ACTION_EVENTS.has(action.event) ||
        typeof action.run !== "function") {
      throw new TypeError(`Invalid delegated action: ${name}`);
    }
    events.add(action.event);
  }

  for (const eventName of events) {
    document.addEventListener(eventName, event => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest("[data-action]");
      if (!element || !document.documentElement.contains(element)) return;

      const name = element.dataset.action;
      if (!Object.hasOwn(actions, name)) return;
      const action = actions[name];
      if (action.event !== event.type ||
          element.dataset.actionEvent && element.dataset.actionEvent !== event.type) return;

      action.run(element, event);
    });
  }
}

export function readActionParam(element, name, pattern) {
  const value = element.dataset[name];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

export function readActionEnum(element, name, values) {
  const value = element.dataset[name];
  return values.includes(value) ? value : null;
}

export function readActionInteger(element, name, min, max) {
  const value = element.dataset[name];
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

export function registerDelegatedClick(element, callback) {
  if (!(element instanceof Element) || typeof callback !== "function") {
    throw new TypeError("Delegated click callbacks require an element and a function.");
  }
  element.dataset.action = "registered-click";
  delegatedClickCallbacks.set(element, callback);
}

export function runRegisteredClick(element, event) {
  const callback = delegatedClickCallbacks.get(element);
  if (callback) callback(event);
}
