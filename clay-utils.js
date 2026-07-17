/* clay-utils.js — clayjs satellite: clay.utils = { throttle, debounce, cookie, slugify, copyToClipboard }. https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-utils: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  clay.loaded.utils = import(base + "/src/utils/index.js")
    .catch(function (err) { console.error("clay-utils failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.utils.catch(function () {});
})();
