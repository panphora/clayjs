/* clayjs bootstrap. https://clayjs.com */
(function () {
  // Suppress every vendored bundle's window auto-export; the loader assembles
  // window.clay (and a scoped compat shim) explicitly.
  window.__hyperclayNoAutoExport = true;

  // Merge into any window.clay a satellite already created; never replace it.
  var clay = window.clay = window.clay || {};
  // A second core tag is a no-op: the original boot's `ready` promise survives.
  // A FAILED boot resets the sentinel so a corrected tag can retry; the retry
  // resolves the ORIGINAL `ready` promise via the stashed resolver.
  if (clay.__booted) return;

  if (!clay.ready) {
    clay.ready = new Promise(function (r) { clay.__readyResolve = r; });
  }

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clayjs: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  clay.__booted = true;

  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));
  import(base + "/src/loader.js")
    .then(function (m) { return m.boot(base, url.searchParams, clay.__readyResolve); })
    .catch(function (err) {
      clay.__booted = false;
      console.error("clayjs failed to load:", err);
    });
})();
