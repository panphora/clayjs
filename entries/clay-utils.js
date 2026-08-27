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
  // Query and fragment off first, then step out of the tarball's entries/ directory
  // so package-path CDNs resolve src/. See clay.js for the full reason on both.
  var path = url.href.split("#")[0].split("?")[0];
  var base = path.slice(0, path.lastIndexOf("/"));
  if (url.pathname.slice(0, url.pathname.lastIndexOf("/")).slice(-8) === "/entries") {
    base = base.slice(0, -8);
  }

  clay.loaded.utils = import(base + "/src/utils/index.js")
    .catch(function (err) { console.error("clay-utils failed to load:", err); throw err; });
  // Mark handled: see clay-ui.js.
  clay.loaded.utils.catch(function () {});
})();
