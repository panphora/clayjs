/* clayjs bootstrap. https://clayjs.com */
(function () {
  // Suppress every vendored bundle's window auto-export; the loader assembles
  // window.clay (and a scoped compat shim) explicitly.
  window.__hyperclayNoAutoExport = true;

  var readyResolve;
  var clay = { ready: new Promise(function (r) { readyResolve = r; }) };
  window.clay = clay;

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("clayjs: could not determine my own URL (load me with a classic <script src=...>, not type=\"module\")");
    return;
  }
  var url = new URL(script.src, location.href);
  var base = url.href.slice(0, url.href.lastIndexOf("/"));
  import(base + "/src/loader.js")
    .then(function (m) { return m.boot(base, url.searchParams, readyResolve); })
    .catch(function (err) { console.error("clayjs failed to load:", err); });
})();
