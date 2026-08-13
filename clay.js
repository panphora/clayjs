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

  function mintReady() {
    clay.ready = new Promise(function (res, rej) {
      clay.__readyResolve = res;
      clay.__readyReject = rej;
    });
    // Nobody may be awaiting a failed boot's promise, and an unhandled rejection
    // in the console is noise on top of the error we already logged.
    clay.ready.catch(function () {});
  }

  if (!clay.ready) mintReady();

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
      // Settle the promise so `await clay.ready` fails loudly instead of hanging
      // forever with nothing to catch. Then mint a fresh one: a promise settles
      // once, so without this the corrected retry tag would call __readyResolve on
      // an already-rejected promise and every later await would keep throwing even
      // though the retry succeeded.
      var reject = clay.__readyReject;
      mintReady();
      if (reject) reject(err);
    });
})();
