/* clay-options.js — clayjs satellite: option:/option-not:/show-when:/hide-when: visibility. https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-options: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  // Subscribes to the mutation hub (observes document.body); wait for DOM ready.
  function domReady() {
    return new Promise(function (r) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", r);
      else r();
    });
  }

  clay.loaded.options = domReady()
    .then(function () { return import(base + "/src/options/options.js"); })
    .catch(function (err) { console.error("clay-options failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.options.catch(function () {});
})();
