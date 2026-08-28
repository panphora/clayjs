# clayjs

> clayjs makes an HTML file malleable: the page you are looking at can be edited like a
> document and saved, whole, back into its own file. One script tag, no build step, no
> account. The document is the app AND the database: state lives in the DOM, and a save
> is one POST of the entire serialized document to the host that holds the file.

This file is the complete reference for agents, condensed from https://clayjs.com/docs,
https://clayjs.com/advanced, and https://clayjs.com/plugins. Human-readable versions live
at those URLs. clayjs is MIT-0 licensed. npm builds for bundlers: @panphora/clayjs.

## The one-paragraph integration

To make a static HTML file malleable: add
`<script src="https://clayjs.com/v1/clay.js"></script>` as the last element inside `<body>`.
Add an `autosave` attribute to the `<html>` element. Add an `editable` attribute to each
element a person should edit as rich text (headings, paragraphs, note containers). Add a
`persist` attribute to any form control whose value should survive saving. Mark page UI
that should never be written to disk with `clay="no-save no-watch"`. Do not write any
save logic or add a save button: clayjs saves the whole document automatically, and the
host writes it to disk.

## Hosts (who writes the file)

clayjs is client-side; a host accepts the save and writes bytes:

- HTML Clay, a small desktop app (https://htmlclay.com): serves local `.htmlclay` files
  at http://127.0.0.1, writes saves back to disk, keeps automatic version history.
- hyperclay.com: hosts the same files online.
- Your own server: implement one route (see "The endpoint spec" below, ~20 lines).

## Loading

```html
<script src="https://clayjs.com/v1/clay.js"></script>
```

The default build includes the save lifecycle and rich text (`editable`). Plugins load
conditionally through the URL, in the browser only:

- `?plugins=` comma-separated plugins to add, e.g. `clay.js?plugins=sync,undo`
- `?exclude=` remove a default-on plugin, e.g. `clay.js?exclude=richclay`

Loadable plugins: `richclay` (default on), `indicator`, `sync`, `sortable`, `undo`,
`cms`, `quickcrop`, `upload`, `wire`, `demo`.

Everything else is a separate library ("satellite") with its own script tag: clay-ui,
clay-events, clay-options, clay-dom, all.js, clay-utils, clay-internals, clay-data,
sap.js. To call a satellite from an inline script right after its tag, wait for it:
`await clay.loaded.ui` (or `.dom`, `.all`, `.utils`, `.events`, `.options`, `.data`,
`.sap`, `.internals`).

Offline: `https://clayjs.com/v1/clay.standalone.js` is the whole library in one
readable file (core, every plugin, every satellite), built from the same source.
Download it, keep it beside the HTML file, and load it with the same query params:
`<script src="clay.standalone.js?plugins=sync"></script>`. `plugins=` then decides
what runs, not what downloads, and every `clay.loaded.*` promise exists without a
satellite tag. `/<version>/clay.standalone.js` is a pinned copy; the npm tarball
carries it at `dist/clay.standalone.js`; the file's first line names its version.
Two things still reach the network, both opt-in: the CMS sidebar's font comes from
jsDelivr and falls back to the system monospace, and autosave debugging
(`localStorage` key `clay:debug:autosave`) imports its diff library from esm.sh.
Saving still needs a host that writes the file; HTML Clay does that on the machine
itself, with no network.

## Core API: window.clay

- `clay.ready` — Promise that resolves once clayjs has booted (core loaded, plugins
  attached). In inline scripts, `await clay.ready` before touching anything else.
  `clay:ready` fires on `document` at the same moment.
- `clay.save()` — snapshot the page and save it. Skips when nothing changed. Returns
  `Promise<{ok, msg, msgType, code, etag}>`; check `ok`. `msgType` is `success`,
  `error`, `skipped` (nothing was sent), or `unknown` (the request timed out, so the
  write may or may not have landed). A host may answer with its own severity, such as
  `warning`. Never rejects.
- `clay.save.force()` — save even when nothing appears to have changed.
- `clay.getHTML()` — the exact HTML string a save would send, after all cleanup.
- `clay.addDocumentTransform(fn)` — register a callback that receives the cloned
  document before serialization. The live page is never touched. Runs on every change
  check too, so keep it pure and repeatable (no timestamps, counters, or network).
- `clay.onSnapshot(fn)` — like `addDocumentTransform`, but runs for every snapshot,
  including live-sync broadcasts.
- `clay.isEditMode` — whether this session may edit.
- `clay.isOwner` — whether the platform's owner cookie is set (URL and global overrides
  don't affect it, unlike `isEditMode`).
- `clay.toggleEditMode()` — flip between edit and view mode (reloads the page).
- `clay.cacheBust(el)` — re-download one resource by stamping `?v=` onto its `href` or
  `src`.
- `clay.Mutation` — the shared mutation hub (one MutationObserver for the whole page,
  region rules applied). `clay.Mutation.onAnyChange(opts, cb)` respects
  `clay="no-watch"` regions.
- `clay.morph(oldEl, newEl)` — content-based DOM morphing engine: morphs `oldEl` in
  place to match `newEl`, preserving focus, inputs, and animations (sync plugin).
- `clay.undo` — document-wide undo singleton: `clay.undo.undo()` / `clay.undo.redo()`
  (undo plugin).
- `clay.cms` — the content panel: `clay.cms.open()` (cms plugin).
- `clay.RichClay` — the rich-text editor class behind `editable` (richclay plugin).
- `clay.quickcrop(file, opts)` — crop modal: resolves `{blob, dataURL, width, height}`,
  or `null` if cancelled (quickcrop plugin).
- `clay.upload` — pick a file and get it into the page (upload plugin).
- `clay.wire` — per-file control channel to a process on the user's machine: `send`,
  `cancel`, `get`, `list`, `isBusy`, `on` (wire plugin).
- `clay.region` — region policy helpers and strip selectors (see clay.internals.region;
  the same object, also published as `STRIP_FROM_SAVE`-style constants).

In view mode the edit-only members are absent: `window.clay` holds just `ready`,
`toggleEditMode`, `isEditMode`, `isOwner`, `Mutation`, and `region` (plus `morph`/`cms`
when those plugins load). Feature-detect with `'save' in clay`.

Stability contract (since 1.0.0): `clay.*` from clay.js and `clay.*` from a satellite
are stable; no name changes without a major version. Anything else under `src/` is
reachable by direct import but may change in any release.

## The HTML surface (attributes)

- `editable` (any element except a custom element) — rich text editing with a floating
  toolbar (richclay, default on). Tokens combine:
  `editable="single-line no-toolbar toolbar-on-select"`. A hyphenated tag is skipped,
  because `editable` is a common boolean property on a component and means something
  else there; such an element opts in with `clay-editable` instead. Native
  `contenteditable` also works for plain text.
- `persist` (form controls) — writes the control's current value into the HTML so it
  survives the save. `password`, `hidden`, and `file` inputs are always skipped, so a
  secret cannot be written into the file by adding one attribute.
- `trigger-save` (buttons) — clicking calls `clay.save()`. Put it on a
  `<button type="button">`; on a link the navigation can outrun the save (use
  `<a href="#" onclick="event.preventDefault(); clay.save()">` if you must).
- `autosave` (`<html>`) — save automatically after edits settle, debounced and
  throttled. ⌘S / Ctrl+S always works too.
- `clay="…"` (any element) — region control; see the region reference below.
- `merge="name"` (JSON script tags, sync plugin) — multi-writer safety for JSON stored
  in a script tag. Incoming saves three-way merge the JSON per key against the last
  synced version instead of replacing the blob, so unsaved local keys survive. Arrays
  merge by identity (`id`-style fields; name your own with `merge-key="taskId"`).
  Bodies may use relaxed JSON (unquoted keys, single quotes, trailing commas,
  comments). Requires a JSON `type` attribute.
- `editmode:contenteditable` (any element) — editable for the owner, inert for
  visitors.
- `editmode:onclick` (any element) — the `onclick` runs only for the owner; saved inert
  so it never runs for visitors.
- `editmode:resource` (style, link, script) — active for the owner, saved with an inert
  `type` so visitors never load it.
- `viewmode:disabled` / `viewmode:readonly` (form controls) — disabled or read-only for
  visitors, live for the owner.
  (The `editmode:`/`viewmode:` attributes are enforced by a save transform, which view
  mode never loads. They hold for any file an owner has saved; save once after adding
  them.)
- `onbeforesave` / `onbeforesnapshot` / `onaftersave` (any element) — inline hooks into
  the save. `onbeforesave` and `onbeforesnapshot` run on the clone for every change
  check, not only for saves that ship: keep them pure and repeatable (no counters, no
  logging, no network). `onbeforesnapshot` also runs for live-sync broadcasts.
  Example: `<div onbeforesave="this.removeAttribute('data-temp')">…</div>`
- `refetch-on-save` (link/style) — reload a stylesheet that is generated on save,
  without a flash: `<link rel="stylesheet" href="style.css" refetch-on-save>`.
- `savestatus` (`<html>`, set by clayjs) — read-only state for your CSS: `saving`,
  `saved`, `error`, `offline`.

## Region reference (the clay attribute)

One attribute controls how any element takes part in saving. Keywords combine with
spaces: `clay="freeze no-undo"`.

- `no-save` — lives on the page, never written to disk; live sync leaves your copy
  alone. Use for search boxes, connection badges, edit toolbars.
- `no-snapshot` — invisible to save AND to sync; every device keeps its own copy. Use
  for per-device panel state.
- `freeze` — saved exactly as authored; runtime changes to its contents are ignored.
  Use for clocks, tickers, computed summaries.
- `no-trigger-autosave` — saved normally and still counted as unsaved work, but edits
  here don't start an autosave; live sync protects it until you save. Use for heavy
  editors you save by hand.
- `no-dirty` — saved normally, but its content is disposable: no autosave, no
  unsaved-changes warning, and live sync may replace it. Use for regions that render
  themselves (filter bars, projections, drag previews).
- `no-watch` — the mutation system ignores it entirely (implies no autosave trigger, no
  undo). Use for third-party widgets that churn the DOM.
- `no-undo` — changes here aren't recorded in undo history.

Recipes: UI chrome (toolbars, badges) → `clay="no-save no-watch"`. Live or computed
text (clocks) → `clay="freeze"`. Third-party embeds → `clay="no-watch"`. Heavy editors,
batch the saves → `clay="no-trigger-autosave"`. Self-rendering UI → `clay="no-dirty"`.

`no-trigger-autosave` vs `no-dirty`: ask whether a change in that region is work you
would be upset to lose. If yes, `no-trigger-autosave` (waits for your save, warns on
close, sync will not overwrite it). If the region renders itself from other content,
`no-dirty` (a sync frame may replace it with no warning). A region that mixes both wants
two elements, one of each.

## Events (on document)

- `clay:ready` — clayjs finished booting; detail `{clay}`.
- `clay:save-saving` — a save has been in flight for 500ms (fast saves skip straight to
  the result); detail `{msg, timestamp}`.
- `clay:save-saved` — the server confirmed the write; detail `{msg, timestamp}`.
- `clay:save-error` — the server answered with a problem; detail `{msg, timestamp}`.
- `clay:save-offline` — the browser is offline (clayjs re-saves when the connection
  returns); detail `{msg, timestamp}`.
- `clay:snapshot-ready` — a snapshot has been cloned, before any stripping. Mutating
  `detail.documentElement` changes what is saved and broadcast.
- `clay:sync-applied` — a live-sync update landed (sync plugin); detail `{seq, source}`,
  where `source` is `peer` (another open copy) or `disk` (the file changed underneath
  you).
- `clay:sorted` — a drag-drop reorder landed (sortable plugin); fires on the container
  and bubbles; detail `{item, from, to, oldIndex, newIndex}`.
- `clay:view-save-attempt` — a visitor clicked a `[trigger-save]` element in view mode;
  show your own notice.

## Edit mode (who may edit)

Saving requires edit mode. On the platforms you never think about this: hyperclay.com
arms it with a cookie for the owner, and Hyperclay Local and HTML Clay arm it for local
files automatically. Resolution order:

1. `?editmode=true` / `?editmode=false` in the URL
2. `window.clayEditMode` set before clay.js loads
3. A save token the host put on the root element
4. The platform's owner cookie

Serving files from your own server? Arm it yourself:

```html
<script>window.clayEditMode = true</script>
<script src="https://clayjs.com/v1/clay.js"></script>
```

Edit mode is client-side behavior. Whether a save is accepted is always the server's
decision.

## The endpoint spec (host it yourself)

A clayjs server implements one route:

- Route: `POST /_/save`
- Body: the file's full HTML, as plain text. Always; this route has exactly one body
  shape on every host.
- Header: `Document-URL`, the URL of the page being saved (also sent as `Page-URL`, the
  older spelling; read either).
- Success: `200` with JSON `{ "msg": "Saved" }`
- Failure: any non-2xx with JSON `{ "msg": "why" }`

A complete server in about 20 lines of Express:

```js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const app = express();
app.use(express.static(root));
app.use(express.text({ type: "*/*", limit: "10mb" }));

app.post("/_/save", async (req, res) => {
  try {
    const page = decodeURIComponent(new URL(req.get("Document-URL")).pathname);
    const file = path.join(root, page.endsWith("/") ? page + "index.html" : page);
    // a save may only ever write inside the folder you are serving
    if (!file.startsWith(root + path.sep)) return res.status(403).json({ msg: "Outside the folder" });
    await fs.writeFile(file, req.body);
    res.json({ msg: "Saved" });
  } catch {
    res.status(500).json({ msg: "Couldn't save" });
  }
});

app.listen(4600);
```

On your own host nothing arms edit mode for you, so set `window.clayEditMode` before the
script tag. Two details you may ignore: every save also carries a
`Save-Trigger: user|auto` header (whether a person triggered it), and HTML Clay uses a
token variant, `POST /_/save/{token}`, read from `<html htmlclaytoken>`.

## Plugins

- `richclay` (default on) — the `editable` attribute: floating toolbar, clean HTML
  output. Tokens: `single-line`, `no-toolbar`, `toolbar-on-select`. In the saved file
  the attribute is an inert marker; no editor chrome is written to disk.
- `indicator` — a ready-made save-status chip driven by the `clay:save-*` events.
- `sync` — live sync: outside file changes and other open tabs merge into the page in
  place, preserving focus, caret, and unsaved dirty regions. Powers `clay.morph` and
  the `merge="name"` JSON script-tag merging.
- `sortable` — drag-drop reordering; fires `clay:sorted`.
- `undo` — document-wide undo/redo built on DOM mutations: moves, deletions, and
  attribute changes all reverse cleanly. Respects `clay="no-undo"`.
- `cms` (`?plugins=cms`) — a content sidebar that builds itself from your page. Declare
  content with a rules tag; whoever has edit access sees friendly fields (text, rich
  text, images, lists), not markup:

  ```html
  <script src="https://clayjs.com/v1/clay.js?plugins=cms"></script>
  <script data-rules-name="cms" data-rules-version="1" type="application/json">
  {
    "title":    ".page-title",
    "intro":    "p.intro",
    "avatar":   "img.avatar@src",
    "tags":     "ul.tags li[]",
    "products": [".product", { "name": ".name", "price": ".price" }]
  }
  </script>
  ```

  Each entry is a field: a name, then the selector it edits. `@src` becomes an
  image-upload control, `li[]` a reorderable list, and the `products` shape a list of
  cards. Open the sidebar with `?cms=true` on the URL or `clay.cms.open()`. The same
  rules tag can carry more tokens (`data-rules-name="api cms"`) to also power the data
  library's JSON API.
- `quickcrop` (loads with cms, or ask by name) — crop modal for image uploads:
  `const shot = await clay.quickcrop(file, { aspect: 16/9 })` resolves
  `{blob, dataURL, width, height}` or `null` if cancelled. The CMS uses it for any
  image field marked `data-hcms-crop="1:1"` (aspects: `1:1`, `16:9`, `free` on the
  attribute; a plain number in code).
- `upload` (ask by name) — a file picker that gets the chosen file into the page.
- `wire` (`?plugins=wire,sync`) — a per-file control channel between the page and a
  process running in the user's terminal (see `htmlclay wire serve <file> -- <cmd>`).
  The page sends a request, the process answers with progress, and the process edits
  the file; HTML never travels over the wire. The change reaches the open page as an
  ordinary external file change, through live sync.

  ```js
  const run = clay.wire.send({ ask: "tighten the intro" });
  clay.wire.on((state, frame) => console.log(state.state, frame && frame.text));
  const outcome = await run.done;
  ```

  `send` returns its handle immediately; `handle.done` resolves with the final
  snapshot and never rejects. `on` takes a function, not an event name, and returns
  its own unsubscribe. A listener's second argument is the inbound frame when one
  caused the update, which today means `wire/status` and nothing else: `state.text`
  is sticky across later states, so the frame is the only way to tell a new status
  line from the same line arriving again.

  Also `cancel`, `get`, `list`, `isBusy`. Works in view mode too.
- `demo` — saves into browser storage instead of a host; used by clayjs.com's live
  demos. `clay.demo.reset()` forgets the browser copy.

## Satellites (separate libraries, one script tag each)

- `clay-ui.js` — ready-made toasts, modals, and ask/confirm/tell dialogs. Listens to
  `clay:save-*` events automatically, so adding it upgrades save feedback for free.
- `clay-events.js` — HTML attributes for the events HTML forgot: `onclickaway`,
  `onclickchildren`, `onrender`, `onmutation`, `onclone`.
- `clay-options.js` — declarative show/hide: an ancestor carries a state attribute
  (`view="kanban"`), descendants opt in or out with `option:view` / `option-not:view`.
- `clay-dom.js` — small prototype helpers for DOM-first apps: `el.nearest.menu`,
  `el.val.title`, `el.exec.action()` (getter proxies reading the nearest element with
  that attribute or class), and `el.cycle(1, "state")`.
- `all.js` — a chainable wrapper over querySelectorAll:
  `All(".card").css({ opacity: 1 }).onclick(e => …)`. Events are property-form
  (`.onclick`, `.oninput`); classes go through `.classList`. Zero dependencies.
- `clay-utils.js` — the small stuff: throttle, debounce, cookies, slugify.
- `clay-data.js` — the page's content in and out as JSON: `clay.extractData()` reads
  the page into structured JSON, `clay.applyData(data)` writes JSON back. The same
  mapping powers a read-only `/_/api` endpoint on hosts that support it (HTML Clay,
  hyperclay.com), so a malleable file can double as an API. Declare the mapping with a
  rules tag (`data-rules-name="api"`), same dialect as the CMS rules above. From an
  inline script: `await clay.loaded.data`, then `const data = clay.extractData()`.
- `sap.js` — reactive templates with the DOM itself as the state: attributes and
  elements are the source of truth, templates re-render when the DOM they depend on
  changes. No virtual DOM, no store.
- `clay-internals.js` — the pieces clayjs builds itself out of, for code that sits
  inside the save lifecycle (see below).

## clay.internals (low level)

One extra script tag, `<script src="https://clayjs.com/v1/clay-internals.js"></script>`;
`clay.loaded.internals` resolves when ready. Lower level than `clay.*` deliberately.

- `captureSnapshot()` — the cloned document element, with form values synced,
  `onbeforesnapshot` handlers run, and `no-snapshot` regions plus browser-extension
  noise removed. The shared base every lane starts from.
- `captureForSave()` — the exact bytes a save would send, stripping and all.
- `addDocumentTransform(fn)` — same registry as `clay.addDocumentTransform`. Runs on
  the clone during save preparation and on every change check; keep it pure and
  repeatable, or the page never reads clean and autosave never stops.
- `region.resolveRegionPolicy(node)` — the resolved region axes for a node:
  `{watched, autosaveTriggered, dirtyTracked, undoable, persist, extension}`.
  `autosaveTriggered` is whether an edit here starts a save by itself; `dirtyTracked`
  is whether it counts as unsaved work at all. They differ only inside
  `no-trigger-autosave`; `no-dirty` clears both.
- `region.isInert(node)` — whether a node is invisible to the whole mutation system
  (`no-watch` and extension noise).
- `region.isSnapshotRemoved(node)` — whether a node is dropped from every snapshot
  (`no-snapshot`). Ancestor-aware.
- `region.addRegionToken(el, token)` — add one token to an element's `clay` attribute,
  keeping the tokens already there: `addRegionToken(toolbar, "no-save")`.
- `region.PERSIST` / `region.REGION_ATTRS` — the persist values (`full`, `frozen`,
  `none`) and the canonical token list.
- `region.selectors` — `stripFromSave`, `stripFromComparison`, `stripFromDirtyCheck`,
  `noTriggerAutosave`, `snapshotRemove`, `freeze`: the selectors clayjs itself strips
  with, legacy spellings included.
- `save.saveHtml(html, cb)` — send an HTML string to the save endpoint. Bypasses the
  snapshot pipeline entirely: nothing is stripped and no hook runs. Resolves
  `{ok, msg, msgType, code, etag}`; never rejects.
- `save.replacePageWith(url, cb)` — fetch another URL's HTML and save it over the
  current file. Same result shape.
- `save.isSaveInProgress()` — whether a save is in flight right now. Check it before
  `saveHtml`; firing into an in-flight save is how you lose an edit.

Writing a custom attribute that touches the save? Ask clayjs what a region means
instead of matching `[no-save]` yourself:

```js
await clay.loaded.internals;
const { resolveRegionPolicy, addRegionToken, PERSIST } = clay.internals.region;

clay.internals.addDocumentTransform(clone => {
  for (const el of clone.querySelectorAll("[count-of]")) {
    if (resolveRegionPolicy(el).persist !== PERSIST.FULL) continue;
    el.textContent = clone.querySelectorAll(el.getAttribute("count-of")).length;
  }
});
```

Derive from the document, don't stamp the clock: a transform that writes something new
each run (a timestamp) leaves the page permanently dirty.

## Pages

- https://clayjs.com — the tutorial
- https://clayjs.com/get-started — zero to a saving file in four steps
- https://clayjs.com/docs — the reference
- https://clayjs.com/advanced — regions, save hooks, satellites
- https://clayjs.com/plugins — the heavyweight plugins
- https://htmlclay.com — the desktop app; https://htmlclay.com/features — everything it does
- https://github.com/panphora/clayjs — source
