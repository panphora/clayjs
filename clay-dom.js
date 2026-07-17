/* clay-dom.js — clayjs satellite: Element prototype helpers (nearest, el, val, text, exec, cycle, show/hide). https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-dom: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  clay.loaded.dom = import(base + "/src/dom/dom-helpers.js")
    .catch(function (err) { console.error("clay-dom failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.dom.catch(function () {});
})();
