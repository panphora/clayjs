/* clay-internals.js — clayjs satellite: clay.internals = the supported low-level surface (snapshot, region policy, save lane). https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-internals: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  // No DOM gate: nothing here touches document.body at import time, unlike clay-ui.
  clay.loaded.internals = import(base + "/src/internals/index.js")
    .catch(function (err) { console.error("clay-internals failed to load:", err); throw err; });
  // Mark handled: a blocked satellite must not emit an unhandled rejection.
  clay.loaded.internals.catch(function () {});
})();
