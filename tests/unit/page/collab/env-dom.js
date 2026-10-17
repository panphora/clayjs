// Node only: a jsdom window for real EditorViews outside jest, loaded with
// --import. Jest's jsdom environment does the same for the jest runs.
import { JSDOM } from "jsdom";
const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis && key !== "navigator") continue;
  let value;
  try { value = window[key]; } catch { continue; }
  Object.defineProperty(globalThis, key, { value: typeof value === "function" && !/^[A-Z]/.test(key) ? value.bind(window) : value, configurable: true, writable: true });
}
Object.defineProperty(globalThis, "window", { value: window, configurable: true, writable: true });
window.__hyperclayNoAutoExport = true;
