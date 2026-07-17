/* all.js — clayjs satellite: All(selector) chainable querySelectorAll wrapper. https://clayjs.com */
(function () {
  var clay = window.clay = window.clay || {};
  clay.loaded = clay.loaded || {};

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("all.js: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));

  clay.loaded.all = import(base + "/src/dom/all.js")
    .then(function (m) {
      var All = m.default;
      window.All = All;   // interop carve-out (§2.3)
      clay.All = All;
      return All;
    })
    .catch(function (err) { console.error("all.js failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.all.catch(function () {});
})();
