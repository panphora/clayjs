import { ownsAttr, paintsOf, stripPaints } from "../vendor/sap-ownership.vendor.js";

// Values a derive engine (sapjs) paints from the page's records: attr:, class:,
// css:, text and show output inside a [sap] root. They are saved like any other
// content, but they are never an edit: comparisons, the dirty gate, undo and
// merges leave them out, and the engine repaints them after every merge, before
// anything records a baseline. Which parts of an element are painted is read
// from its own attributes, so the same answer holds for the live page, a
// snapshot clone and a parsed frame. No expression is evaluated here.

export const isDerivedAttr = (el, name) => ownsAttr(el, name);

export const ownsDerivedText = (el) => !!el && el.nodeType === 1 && !!paintsOf(el)?.text;

/** Remove every painted value from a detached tree, in place. Never the live page. */
export const stripDerived = (root) => stripPaints(root);

function withoutTokens(value, owned, split, join, nameOf) {
  return split(value || "").map((t) => t.trim()).filter((t) => t && !owned.includes(nameOf(t))).sort().join(join);
}

// A class or style change that only touched painted tokens.
function onlyPaintedTokens(el, name, before, after) {
  const p = paintsOf(el);
  if (!p) return false;
  if (name === "class") {
    if (!p.classes.length) return false;
    const rest = (v) => withoutTokens(v, p.classes, (s) => s.split(/\s+/), " ", (t) => t);
    return rest(before) === rest(after);
  }
  if (!p.vars.length) return false;
  const rest = (v) => withoutTokens(v, p.vars, (s) => s.split(";"), ";", (t) => t.split(":")[0].trim());
  return rest(before) === rest(after);
}

/** True when a mutation-hub change only rewrote painted output. */
export function isDerivedChange(change) {
  if (change.__derived !== undefined) return change.__derived;
  const el = change.element;
  let derived = false;
  if (el && el.nodeType === 1) {
    if (change.type === "attribute") {
      const name = change.attribute;
      derived = isDerivedAttr(el, name) ||
        ((name === "class" || name === "style") && onlyPaintedTokens(el, name, change.oldValue, change.newValue));
    } else if (change.type === "characterData") {
      derived = ownsDerivedText(el);
    }
  }
  change.__derived = derived;
  return derived;
}

const engines = new Set();
let mountedOnce = false;
const mountWaiters = [];

/** Run every registered engine's repaint, synchronously. Live sync calls it right after a merge applies. */
export function repaintDerived() {
  for (const repaint of [...engines]) {
    try {
      repaint();
    } catch (err) {
      console.error("clayjs: a derived repaint failed:", err);
    }
  }
}

/** Calls fn once an engine has finished its first pass, or after timeoutMs without one. */
export function afterDerivedMount(fn, timeoutMs) {
  if (mountedOnce || typeof document === "undefined" || !document.querySelector("[sap]")) return fn();
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    fn();
  };
  mountWaiters.push(once);
  setTimeout(once, timeoutMs);
}

export const derived = {
  register(repaint) {
    engines.add(repaint);
    return () => engines.delete(repaint);
  },
  mounted() {
    mountedOnce = true;
    for (const fn of mountWaiters.splice(0)) fn();
  },
};
