/* clay-events.js — clayjs satellite: onclickaway, onclickchildren, onclone, onmutation, onpagemutation, onrender. https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-events: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  // The mutation-backed attrs subscribe to a hub that observes document.body, so
  // wait for DOM ready before importing (same gate as clay.js).
  function domReady() {
    return new Promise(function (r) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", r);
      else r();
    });
  }

  clay.loaded.events = domReady()
    .then(function () { return import(base + "/src/events/index.js"); })
    .catch(function (err) { console.error("clay-events failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.events.catch(function () {});
})();
