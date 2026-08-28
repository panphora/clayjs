/* clayjs standalone: the entry of the single-file build. https://clayjs.com/offline

   Twin of entries/clay.js. That bootstrap derives a base URL from its own script
   tag and imports the loader at runtime; this one is bundled together with the
   loader and every module it can ask for (see MODULES in loader-logic.js), so
   `plugins=` decides what runs, never what downloads. The bootstrap logic below
   (window.clay, `ready`, `__booted`, the retry path) is the same code as clay.js
   and must stay in step with it. */
import { boot } from "./loader.js";
import onDomReady from "./lib/dom-ready.js";
// The two generated satellites are classic scripts that assemble themselves onto
// window.clay when they run. Bundled, they run here, ahead of the bootstrap.
import "../entries/clay-data.js";
import "../entries/sap.js";

(function () {
  // Suppress every vendored bundle's window auto-export; the loader assembles
  // window.clay explicitly.
  window.__hyperclayNoAutoExport = true;

  // Merge into any window.clay a satellite already created; never replace it.
  var clay = window.clay = window.clay || {};
  // A second tag is a no-op: the original boot's `ready` promise survives.
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

  var params = new URL(script.src, location.href).searchParams;

  function domReady() {
    return new Promise(function (r) { onDomReady(r); });
  }

  // The module satellites, on the terms of their own entry scripts: each is a
  // promise on clay.loaded, the ones that touch document.body wait for DOM
  // ready, and events waits for dom because [onrender] handlers reach for its
  // element helpers the moment events lands.
  function satellite(name, promise) {
    var p = promise.catch(function (err) {
      console.error("clayjs: " + name + " failed to load:", err);
      throw err;
    });
    // Mark handled: a failed satellite must not emit an unhandled rejection.
    // Consumers who await clay.loaded[name] still get the error.
    p.catch(function () {});
    clay.loaded[name] = p;
  }

  clay.loaded = clay.loaded || {};
  satellite("dom", import("./dom/dom-helpers.js"));
  satellite("utils", import("./utils/index.js"));
  satellite("internals", import("./internals/index.js"));
  satellite("all", import("./dom/all.js").then(function (m) {
    window.All = m.default;   // interop carve-out, as in entries/all.js
    clay.All = m.default;
    return m.default;
  }));
  satellite("ui", domReady().then(function () { return import("./ui/index.js"); }));
  satellite("options", domReady().then(function () { return import("./options/options.js"); }));
  satellite("events", domReady()
    .then(function () { return clay.loaded.dom.catch(function () {}); })
    .then(function () { return import("./events/index.js"); }));

  boot(params, clay.__readyResolve).catch(function (err) {
    clay.__booted = false;
    console.error("clayjs failed to load:", err);
    // Settle the promise so `await clay.ready` fails loudly instead of hanging,
    // then mint a fresh one for a corrected retry tag. See entries/clay.js.
    var reject = clay.__readyReject;
    mintReady();
    if (reject) reject(err);
  });
})();
