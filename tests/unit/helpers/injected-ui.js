import { RUNTIME_ONLY } from "../../../src/ui/bevel-controls.js";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Records every setProperty call made while `run` executes. jsdom drops light-dark(),
 * color-mix() and translate values from el.style, so a declaration can be written and
 * still be invisible to el.style; the call log is the only honest record of it.
 */
export function capture(run) {
  const calls = [];
  const proto = window.CSSStyleDeclaration.prototype;
  const original = proto.setProperty;
  proto.setProperty = function (name, value, priority) {
    calls.push({ style: this, name, value, priority });
    return original.call(this, name, value, priority);
  };
  let result;
  try {
    result = run();
  } finally {
    proto.setProperty = original;
  }
  if (result && typeof result.then === "function") {
    throw new Error("capture(run) takes a synchronous run; use captureAsync");
  }
  return calls;
}

export async function captureAsync(run) {
  const calls = [];
  const proto = window.CSSStyleDeclaration.prototype;
  const original = proto.setProperty;
  proto.setProperty = function (name, value, priority) {
    calls.push({ style: this, name, value, priority });
    return original.call(this, name, value, priority);
  };
  try {
    await run();
  } finally {
    proto.setProperty = original;
  }
  return calls;
}

/** The last value written for `name` on `el` in a capture log, or null. */
export function last(calls, el, name) {
  const hits = calls.filter((call) => call.style === el.style && call.name === name);
  return hits.length ? hits[hits.length - 1].value : null;
}

/**
 * The hostile-CSS contract for everything ClayJS draws: runtime-only, no class, no id,
 * every inline declaration !important. `skip` leaves out nodes the caller owns (a crop
 * stage, dialog content). Returns the number of HTML elements checked so a caller can
 * assert it checked something.
 */
export function expectHostileProof(root, { skip = () => false } = {}) {
  const nodes = [root, ...root.querySelectorAll("*")].filter((el) => el.namespaceURI === HTML_NS && !skip(el));
  for (const el of nodes) {
    expect([el.tagName, el.getAttribute("class")]).toEqual([el.tagName, null]);
    expect([el.tagName, el.getAttribute("id")]).toEqual([el.tagName, null]);
    expect([el.tagName, el.getAttribute("clay")]).toEqual([el.tagName, RUNTIME_ONLY]);
    expect(el.style.length).toBeGreaterThan(0);
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style.item(i);
      expect([el.tagName, prop, el.style.getPropertyPriority(prop)]).toEqual([el.tagName, prop, "important"]);
    }
  }
  return nodes.length;
}

/**
 * Every declaration written on `root` or inside it was !important and resolved: no var()
 * reaches the page. Calls on other style objects (jsdom's own getComputedStyle fills one
 * property by property) are not ours and are skipped.
 */
export function expectCallsResolved(calls, root) {
  const styles = new Set([root, ...root.querySelectorAll("*")].map((el) => el.style));
  const ours = calls.filter((call) => styles.has(call.style));
  expect(ours.length).toBeGreaterThan(0);
  for (const call of ours) {
    expect([call.name, call.priority]).toEqual([call.name, "important"]);
    expect(String(call.value)).not.toMatch(/var\(/);
  }
}

/** A page stylesheet that fights back, the way the first browser run of the notice met one. */
export function hostileSheet() {
  const style = document.createElement("style");
  style.textContent =
    "* { --bevel-ink: red !important; --clay-notice-bg: red !important; --clay-presence-bg: red !important; --clay-section-bg: red !important; --clay-indicator-bg: red !important }" +
    " button, div, span, input, textarea { all: unset !important; font-family: 'Comic Sans MS' !important; color: red !important; background: red !important }";
  document.head.appendChild(style);
  return () => style.remove();
}
