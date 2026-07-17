/* clay-ui.js — clayjs satellite: toasts, modals, ask/confirm/tell dialogs, auto clay:save-* feedback. https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clay-ui: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  // Toasts and dialogs append to document.body, so `loaded.ui` must not resolve
  // before the DOM is ready (same gate as clay-events).
  function domReady() {
    return new Promise(function (r) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", r);
      else r();
    });
  }

  clay.loaded.ui = domReady()
    .then(function () { return import(base + "/src/ui/index.js"); })
    .catch(function (err) { console.error("clay-ui failed to load:", err); throw err; });
  // Mark handled: a blocked satellite must not emit an unhandled rejection.
  // Consumers who await clay.loaded.ui still get the error.
  clay.loaded.ui.catch(function () {});
})();
