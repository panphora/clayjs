# Building malleable documents with ClayJS

This is the complete reference for building malleable documents with ClayJS: one HTML file that is the whole app, edits itself in place, saves itself back to its host, and merges edits from other tabs, other people and agents. Read it top to bottom once. After that, [A document, line by line](https://clayjs.com/docs/guide/walkthrough/), [Structuring an app](https://clayjs.com/docs/guide/architecture/) and [Pre-ship checklist](https://clayjs.com/docs/guide/checklist/) are the parts to return to.

It is written for a developer or an LLM building full apps with inline editing and inline controls: kanban boards with card detail, block writers, finance trackers, CRMs, flashcards, trackers. It covers the CMS plugin only in passing ([The CMS, in passing](https://clayjs.com/docs/guide/components/#the-cms-in-passing)), because an app whose product is editing should not route editing through a form sidebar.

Every behavior stated here was read from ClayJS 1.8.2 source or executed. The four example files below are complete, tested apps that this guide quotes. A [test suite](https://github.com/panphora/clayjs/tree/main/tests/unit/guide-examples) boots each one in jsdom with the real loader and checks what it saves, how it merges a peer's edit, and what a viewer receives. Open any of them and view source, or download one and open it in HTML Clay to edit it:

| File | What it shows |
|---|---|
| [`examples/skeleton.html`](https://clayjs.com/examples/skeleton.html) | The smallest correct app: a sortable reading list with persisted checkboxes, a derived summary, a tab-local filter, sync and undo. Start every new file from it. |
| [`examples/kanban.html`](https://clayjs.com/examples/kanban.html) | Columns and cards with cross-column drag, a card detail view that is the card itself, checklists, an activity log, a filter, undo. |
| [`examples/writer.html`](https://clayjs.com/examples/writer.html) | A block document: rich text blocks, headings, callouts, to-do blocks, dividers, images with upload, a gutter with drag handle and block menu, a slash menu, an outline and a word count. |
| [`examples/finance.html`](https://clayjs.com/examples/finance.html) | A budget built on sap.js: categories with budgets, transactions, computed totals saved into the file, search, CSV import and export. |

Code in this guide assumes the loader URL `https://clayjs.com/v1/`. [Add ClayJS to a page](https://clayjs.com/docs/guide/loading/) covers versions. This guide is also served as plain Markdown at [clayjs.com/guide.md](https://clayjs.com/guide.md) for agents, and its ideas are drawn as diagrams in the [visual guide](https://clayjs.com/docs/guide/visual-guide/).

---

## A document, line by line

Start every app from [`examples/skeleton.html`](https://clayjs.com/examples/skeleton.html). It is a reading list with sortable rows, a checkbox and a title per row, an Add button, a summary line and a filter.

#### The html element and autosave

```html
<!DOCTYPE html>
<html lang="en" autosave>
```

`autosave` turns on autosave for edit mode. Autosave is decided at boot. ([Autosave](https://clayjs.com/docs/guide/saving/#autosave))

#### Hiding edit controls before ClayJS runs

```html
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reading list</title>
<style>
  html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
  /* app styles */
</style>
```

The fallback CSS rule hides `show-when:editmode="true"` controls before ClayJS runs. Without it, a viewer of a never-saved file sees the edit buttons for a moment, or for good with JavaScript off. ([Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options))

```html
</head>
<body>
```

#### The record

```html
<main id="app">
```

`<main id="app">` is the record, the part of the page that ClayJS saves. ([Identity](https://clayjs.com/docs/guide/record/#identity))

```html
  <h1 editmode:contenteditable inert-contenteditable="plaintext-only">Reading list</h1>
```

`editmode:contenteditable` makes the text editable in edit mode. The file is written in its saved form with `inert-contenteditable`, so a viewer gets inert text from the very first open. ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers))

```html
  <ul id="items" sortable="items">
    <li data-id="r-mmm"><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled disabled checked> <span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">The Mythical Man-Month</span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
```

Each row has a `data-id`, its text is `editmode:contenteditable`, and its checkbox is `persist viewmode:disabled`. The saved file includes `disabled` so a viewer gets disabled checkboxes from the first open. ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers))

```html
    <li data-id="r-sicp"><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled disabled> <span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">Structure and Interpretation of Computer Programs</span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
  </ul>
  <button type="button" data-action="add" show-when:editmode="true">+ Add book</button>
</main>

```

#### Templates for new rows

```html
<template id="item-tpl">
  <li><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled> <span class="title" editmode:contenteditable contenteditable="plaintext-only"></span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
```

Templates are blueprints. `item-tpl` holds a new row in its active form (`contenteditable="plaintext-only"`, no `disabled`), because a clone is inserted while the owner is editing and the mode transform never touches template content. ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers))

```html
</template>

```

#### Editor-only controls

```html
<template id="chrome-tpl">
  <p id="summary"></p>
  <input type="search" id="filter" placeholder="Filter" aria-label="Filter">
  <style id="view-state"></style>
```

`chrome-tpl` holds the summary, the filter and the `#view-state` style outside the record, so the filter stays out of the saved file. ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state))

```html
</template>

```

#### Loading ClayJS

```html
<script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
<script src="https://clayjs.com/v1/clay-options.js"></script>
<script src="https://clayjs.com/v1/clay-ui.js"></script>
```

The script tags load core with `sync,sortable,undo,indicator`, `exclude=richclay` because this app has no rich text, and then the `clay-options` and `clay-ui` satellites. ([Add ClayJS to a page](https://clayjs.com/docs/guide/loading/))

#### Starting the app

```html
<script>
clay.start(() => {
  const items = document.getElementById("items");
```

`clay.start` runs the app code once, after boot. A live-sync merge can re-insert the script, and the repeat call does nothing. ([Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once))

```html
  const newId = (prefix) => prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
```

`newId` makes ids from a timestamp and random suffix. `crypto.randomUUID` exists only in secure contexts, so it fails on a file served over plain http from another machine. ([Identity](https://clayjs.com/docs/guide/record/#identity))

```html
  const command = (label, fn) => (clay.undo ? clay.undo.commit(label, fn) : fn());

```

`command` wraps every record write in an undo step when the undo plugin is loaded. ([undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo))

```html
  clay.onSnapshot?.((root) => {
    for (const el of root.querySelectorAll(".sortable-chosen, .sortable-ghost, .sortable-drag")) {
      el.classList.remove("sortable-chosen", "sortable-ghost", "sortable-drag");
      if (!el.classList.length) el.removeAttribute("class");
    }
    for (const el of root.querySelectorAll('[draggable="false"]')) el.removeAttribute("draggable");
    for (const el of root.querySelectorAll('[style=""]')) el.removeAttribute("style");
  });
```

The `onSnapshot` hook strips Sortable's drag residue (`draggable="false"`, empty `style`, drag classes) from every snapshot, so a drag never writes it into the file. ([Hooks](https://clayjs.com/docs/guide/saving/#hooks))

```html
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  const chrome = document.createElement("div");
  chrome.setAttribute("clay", "editor-ui");
  chrome.append(document.getElementById("chrome-tpl").content.cloneNode(true));
  items.before(chrome);
  const filter = chrome.querySelector("#filter");
  filter.value = new URLSearchParams(location.hash.slice(1)).get("q") || "";
  filter.addEventListener("input", () => {
    history.replaceState(null, "", filter.value ? "#q=" + encodeURIComponent(filter.value) : location.pathname + location.search);
    render();
  });

```

`chrome-tpl` is cloned once into a `clay="editor-ui"` wrapper. Because the summary, the filter and `#view-state` live there, none of them is saved, synced or undone. ([Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute))

#### Keeping derived text in step

```html
  function render() {
    const rows = [...items.querySelectorAll(":scope > li")];
    const done = rows.filter((li) => li.querySelector("input").hasAttribute("checked")).length;
    setText(chrome.querySelector("#summary"), `${done} of ${rows.length} read`);
    const q = filter.value.trim().toLowerCase();
    const hidden = q ? rows.filter((li) => !li.textContent.toLowerCase().includes(q)) : [];
    setText(chrome.querySelector("#view-state"), hidden.map((li) => `#items > [data-id="${CSS.escape(li.dataset.id)}"]{display:none}`).join("\n"));
  }

```

`render` derives the summary and the filter style from the record. It writes only when text changes, because writing the same text is still a mutation. ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values))

```html
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !clay.isEditMode) return;
    if (button.dataset.action === "add") {
      const li = document.getElementById("item-tpl").content.firstElementChild.cloneNode(true);
      li.dataset.id = newId("r");
      command("Add book", () => items.append(li));
      li.querySelector(".title").focus();
    }
    if (button.dataset.action === "remove") {
      const li = button.closest("li");
      clay.confirm("Remove this book?").then(() => command("Remove book", () => li.remove()), () => {});
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches?.('[contenteditable="plaintext-only"]')) {
      event.preventDefault();
      event.target.blur();
    }
  });

  window.addEventListener("hashchange", () => { filter.value = new URLSearchParams(location.hash.slice(1)).get("q") || ""; render(); });
  clay.effect(render);
```

`clay.effect(render)` runs `render` now and again after any change to the document: local typing, a drag, a merge, undo or redo. `render` writes only into the chrome, and an effect's own writes never re-trigger it. ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code))

```html
});
</script>
</body>
</html>
```

The test suite checks that this file opens clean, saves only the record and never the filter or chrome, keeps undo and the screen in step, mints unique ids, merges peer edits beside unsaved local edits, and gives viewers inert text and disabled checkboxes.

---

## 1. The model

### 1.1 Saved file and open page

A malleable document exists in two forms: the saved file and the open page.

- **The saved file** is the bytes on the host. A visitor downloads these exact bytes. They must be correct and complete with no JavaScript running: the content, its order, the state of every checkbox, and any totals the reader needs.
- **The open page** is the live DOM in one browser tab. It holds the saved content plus everything the tab adds at runtime: editing toolbars, a filter box, an open dialog, selection, computed badges, and drag ghosts.

A save turns the open page back into the saved file. ClayJS clones the whole document, removes everything marked as runtime-only, applies a few transforms, serializes the full HTML, and posts it to the host (`POST /_/save`). There is no partial save and no separate data store. **The document is the database.**

### 1.2 Record, chrome and derived DOM

Every element on an open page is record, chrome, or derived DOM. Decide which before you write it.

| Kind | What it is | Where it lives | Saved | Sent to peers | Edited by people |
|---|---|---|---|---|---|
| **Record** | The work: card titles, checklist items, amounts, block text, order | Ordinary elements, attributes, text, and `persist` control values | yes | yes | yes |
| **Chrome** | UI for editing: buttons, grips, toolbars, menus, filter boxes, status text | Authored in the file, hidden from viewers with `show-when:editmode="true"`. UI a script fills or changes goes in `clay="editor-ui"` ([Chrome](https://clayjs.com/docs/guide/architecture/#chrome)) | hidden: yes, `editor-ui`: no | hidden: yes, `editor-ui`: no | no |
| **Derived** | Values computed from the record: counts, progress, totals, outlines, a status pill's colour | sapjs paints (`attr:`, `class:`, `css:`, `text`, `show`, [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)), `clay="editor-ui"` (tab only), or `clay="no-dirty"` (saved, remote wins) | paints and `no-dirty`: yes | `no-dirty` only; paints are repainted, never merged | no |

Nearly every bug in a malleable file happens when one kind leaks into another: chrome that a script changes gets saved into the file, a derived count gets merged as if someone typed it, or a record is edited only in a copy that never reaches the DOM.

### 1.3 Rules for DOM state

Follow these rules to keep record, chrome, and derived state separate.

1. **The DOM is the record.** Everything durable is an element, an attribute, text, child order, or the value of a control marked `persist`. Never keep the authoritative copy in a JavaScript object.
2. **Chrome is authored in the file and hidden from viewers with `show-when:editmode="true"`.** This default needs no script and is in place before ClayJS loads. Use `clay="editor-ui"` only for UI a script fills or changes while the page is open, or that viewers must not receive ([Chrome](https://clayjs.com/docs/guide/architecture/#chrome)).
3. **Derived values are recomputed, never stored as edits.** Store the value once as the record (`bind`), and declare every other place it shows as a sapjs paint: `attr:data-state="item.state"`, `class:done="item.done"`, `text`, `show` ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)). ClayJS loads the sapjs core for any page with a `[sap]` root and treats painted values as derived. Without sapjs, write derived values into `editor-ui` elements, or into `clay="no-dirty"` elements when the saved file must show them. Never copy a record into a second attribute with a script. The copy goes stale in the file, and a merge brings the stale copy back.
4. **Every repeated item has a unique `data-id` from birth.** Mint a fresh one on every create and every duplicate. Sync pairs elements by it.
5. **Per-tab state stays out of the record.** Keep which card is open, the filter, and the current view in the URL hash, `localStorage`, or memory. Paint them through `ephemeral` attributes ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)), a runtime `<style>`, or `editor-ui` elements.
6. **A command writes the record once, in one place, wrapped in an undo commit.** The mutation is what autosave, undo, and sync see.
7. **Adopt the file as it is on load.** Never rewrite the record at boot. Doing so makes the page dirty, can fall outside the save baseline, and races peers.
8. **Reconcile after changes you did not make.** A peer's frame, an agent's disk edit, and an undo replay change the DOM under you. Rebuild derived and chrome state on `clay:sync-applied` and on undo and redo.

### 1.4 What the host does

ClayJS runs in the page, while a **host** serves the file and accepts saves. The client never decides who may write: it sends the save, and the host accepts or refuses it. Hosts that run ClayJS pages today:

- **HTML Clay**, the desktop app that makes `.htmlclay` files open and save like documents. Single user, local disk.
- **Hyperclay Local**, the desktop sync client. Local folder, device sync to hyperclay.com.
- **hyperclay.com**, hosted files with accounts, teams, share links, presence, and version history.
- **Any server** that implements `POST /_/save` (and optionally `/_/meta`, `/_/sync`, `/_/upload`). A plain static server or a file opened from disk can view the file but cannot save it.

[Hosts, assets and privacy](https://clayjs.com/docs/guide/hosts/) covers what each host adds.

---

## 2. Add ClayJS to a page

### 2.1 The loader tag

```html
<script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
```

- It must be a **classic script** with a `src`. The loader finds its own URL through `document.currentScript` to locate its modules. As `type="module"` or pasted inline it logs an error and never boots.
- **`/v1/`** is the rolling 1.x alias, cached for 10 minutes: files get fixes automatically. **`/1.8.2/`** and every exact version are immutable for a year: use one when a file must never change behavior.
- **Every tag on the page uses the same prefix.** Satellites import ClayJS modules relative to their own URL. `clay.js` from `/1.8.2/` with `clay-ui.js` from `/v1/` gives two copies of shared modules: transforms registered through one are invisible to the other, and save feedback appears twice.
- npm and jsDelivr package paths work too (`@panphora/clayjs`).
- Put the tags at the end of `<body>`. The loader waits for DOMContentLoaded anyway.

`plugins=` and `exclude=` are comma lists. Only the first of each parameter counts. Unknown names warn and are ignored.

### 2.2 Plugins

| Plugin | Default | Loads in view mode | Adds |
|---|---|---|---|
| `richclay` | on | no | the `editable` attribute, `clay.RichClay` |
| `source` | on | no | byte-preserving saves, `clay.source` |
| `sync` | off | yes | live sync, `clay.conflicts`, `clay.morph`, presence and the editing marker |
| `live` | off | yes | `clay.live(name)`: a `clay="live"` JSON tag as a live object |
| `sortable` | off | no | the `sortable` attribute, `window.Sortable`, `clay:sorted` |
| `undo` | off | no | `clay.undo` (whole-page undo, takes Cmd+Z for the window) |
| `indicator` | off | no | the save status chip |
| `upload` | off | no | `clay.upload` |
| `quickcrop` | off | yes | `clay.quickcrop` |
| `cms` | off | yes | `clay.cms`; implies `quickcrop` and `upload` |
| `wire` | off | yes | `clay.wire`, the channel to a local agent process |
| `message` | off | yes | `message-form`: a visitor's contact form to the owner, `clay.message` ([message: contact forms](https://clayjs.com/docs/guide/components/#message-contact-forms)) |
| `ai-edit` | off | no | select text, ask an agent to rewrite it; implies `wire` |
| `demo` | off | yes | fakes saving into `localStorage` for public demos |
| `visitor-drafts` | off | yes | `clay.visitorDrafts`; in draft mode the draft store, the download prompt and the intro area; outside it only the owner chip, fetched when the owner edits ([Free documents for visitors](https://clayjs.com/docs/guide/free-documents/)) |
| `derive` | on for any page with a `[sap]` root | yes | the sapjs core: records and paints, treated as derived ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)) |

- Edit-only plugins never load in view mode, even when named. Their members are absent there: test `clay.isEditMode` or `'save' in clay`, never the presence of `clay.RichClay` alone.
- `exclude` wins over implications. `exclude=wire` also drops `ai-edit`.
- Load order is fixed regardless of how you list them.
- `exclude=richclay` when the app has no rich text. `exclude=source` saves one request and about 48 KB, at the cost of saves reprinting the whole document instead of keeping hand formatting.
- Nothing implies `undo`, on purpose: it intercepts Cmd+Z in every text field on the page ([undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo)).
- `page` in view mode loads its reader half and nothing it implies: a Document on `plugins=page` resolves to `page-view`, with no live data service, no generic `sync` and no `upload`. Name `sync` as well (`plugins=page,sync`) when the reader should take its saved files from sync's lane instead of its own.
- `derive` loads by itself when the page has a `[sap]` root at boot, and stays idle when full sapjs is on the page. `exclude=derive` opts out; `plugins=derive` loads it for a page that adds its `[sap]` root later.
- `visitor-drafts` loads its draft store only in draft mode. A reader or an owner editing the original gets a small module that publishes an inert `clay.visitorDrafts` and, for the owner, the owner chip. Named on a page with no `visitor-drafts` slot, no `api` rules tag, or a rules tag this version cannot read (not `data-rules-version="1"`, or not JSON), it warns in the console and draws nothing. [Free documents for visitors](https://clayjs.com/docs/guide/free-documents/) covers the opt in.

**A good default for apps:** `?plugins=sync,sortable,undo,indicator`, plus `upload` for images or attachments, plus `exclude=richclay` when there is no rich text.

### 2.3 Satellites

Satellites are separate classic script tags. Each publishes a promise on `clay.loaded`.

| Tag | Promise | Adds | Section |
|---|---|---|---|
| `clay-ui.js` | `clay.loaded.ui` | `clay.toast`, `toastPersistent`, `ask`, `confirm`, `tell`, `snippet`, `modal`; automatic save feedback toasts | [clay-ui: toasts and dialogs](https://clayjs.com/docs/guide/components/#clay-ui-toasts-and-dialogs) |
| `clay-options.js` | `clay.loaded.options` | `show-when:`, `hide-when:`, `option:`, `option-not:` visibility | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options) |
| `clay-events.js` | `clay.loaded.events` | `onclickaway`, `onclickchildren`, `onclone`, `onmutation`, `onglobalmutation`, `onrender` | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `clay-dom.js` | `clay.loaded.dom` | `el.nearest`, `el.val`, `el.text`, `el.exec`, `cycleAttr`, `clay.dom.createContentView` | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `all.js` | `clay.loaded.all` | `All(selector)` collection helper | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `clay-utils.js` | `clay.loaded.utils` | `clay.utils.debounce`, `throttle`, `cookie.get/remove`, `slugify`, `copyToClipboard` | |
| `clay-internals.js` | `clay.loaded.internals` | `clay.internals`: capture, transforms, raw save | |
| `clay-data.js` | `clay.loaded.data` | `clay.extractData`, `clay.applyData` | [Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export) |
| `sap.js` | `clay.loaded.sap` | `Sap`, the reactive attribute layer | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |

Satellites do not wait for `clay.ready` and work without `clay.js` at all, including in view mode and on a static host. Await the promise before using what it adds: `await clay.loaded.ui` before `clay.toast` in code that runs early. Code inside a `clay.ready` callback can usually use `clay.toast?.(...)` safely, since the satellites finish loading at about the same time, but the optional call costs nothing.

`clay.standalone.js` bundles the loader, every plugin and every satellite into one 2 MB file for offline use. `plugins=` still decides what runs. With it, remove the satellite tags and always `await clay.loaded.sap` or `.data` before use.

In Hyperclay Local and HTML Clay a document needs no special loading to work offline: keep the ordinary `https://clayjs.com/v1/` tags and the host serves them from the release it bundles. `clay.standalone.js` stays the option for a file opened with no host at all. [Offline in a local host](https://clayjs.com/docs/guide/hosts/#offline-in-a-local-host) has the route and what a host must do.

### 2.4 `clay.ready`

`clay.ready` is a promise that resolves with `window.clay` once boot is done and every plugin has loaded. `clay:ready` fires on `document` at the same moment. Before it resolves, members like `clay.save` and `clay.undo` do not exist. Start app code with `clay.start(...)`: it waits for `clay.ready` and runs once per page ([Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once)).

`clay.plugins` is the frozen list of plugin names in the plan the loader resolved, late plugins included. It says what the page asked for, not what has finished loading.

`clay.ready` says the loader is done, not that a plugin has finished its own startup. The page plugin is the one that keeps going: it exports no `ready`, so `clay.ready` fires while the article's saved content is still what the person sees. `clay.page.ready` is that plugin's boot, and `clay.page.status` is its current result, `{ phase, reason, installId, at }`. Await it before touching `clay.page`:

```js
clay.start("document-ui", async () => {
  const boot = await clay.page?.ready;
  if (boot?.phase !== "ready") return;
  document.documentElement.setAttribute("document-ready", "true");
});
```

Phases are `loading` (the saved article is read and validated), `joining` (the editor's code downloads beside the room join, plus capability, the first save and the page handle), `adopting` (the editor is mounted and the saved article is adopted into the room), then `ready` (input enabled) or a settled `blocked` or `error`. Each boundary is a `performance.mark` carrying `{ detail: { installId } }`:

| Mark | Exact boundary |
|---|---|
| `document:boot` | an installation starts, before the source is validated |
| `document:assets-ready` | the editor's code is in hand |
| `document:authority-ready` | the capability and first-save gates passed, the page handle is admitted and the binding is created |
| `document:input-ready` | adoption succeeded and editable was enabled on the current mounted view |

A failed or cancelled installation never emits `document:input-ready`. Blocked readiness still resolves: `clay.page.ready` settles, `clay.page.status.phase` is `blocked` with a `reason`, the saved article stays as the host served it, and no editable page appears. [When an edit is ready to type in](https://clayjs.com/docs/guide/edit-mode/#when-an-edit-is-ready-to-type-in) covers the reasons and what a page can offer instead.


You can set configuration before the tag, and the loader merges into it: `window.clay = { saveToast: true }`.

### 2.5 Theming ClayJS's own UI

ClayJS draws a few things on your page: dialogs (`clay.ask`, `clay.confirm`, `clay.tell`, `clay.snippet`, `clay.modal`) and the people plugin's name prompt. By default they take your page's font, and on a page with a plain solid background, its background and text colours. Everything else comes from ClayJS's own built-in look.

To match them to your design, set `window.clayTheme` before the loader tag:

```html
<script>
window.clayTheme = {
  tokens: { font: "Inter, sans-serif", text: "#263d4e", surface: "#ffffff", border: "#e0e7ee", accent: "#0c2635", accentText: "#ffffff", radius: "8px" },
  parts: { "dialog.title": { base: { "font-size": "18px", "font-weight": "600" } } }
};
</script>
<script src="https://clayjs.com/v1/clay.js?plugins=people"></script>
```

- **Tokens** set the basics: `font`, `headingFont`, `text`, `mutedText`, `background`, `surface`, `border`, `accent`, `accentText`, `danger`, `dangerText`, `success`, `warning`, `radius`, `shadow`, `overlay`, `spacing`, `buttonHeight`. Each is a CSS value, and `var(--your-variable, fallback)` works. A page can also set a token in CSS as `--clay-ui-<name>` (`--clay-ui-accent-text` for `accentText`). `spacing` is one length, such as `20px`.
- **Parts** set anything else. Every element ClayJS draws has a stable name, such as `dialog.panel`, `dialog.title`, `button.primary` or `people.choice`, and each takes `base`, `hover`, `active`, `focus` and `disabled` declarations. A part names its surface, so `people.title` overrides `dialog.title` in the name prompt only. The names are in `data-clay-part` on each element, and the full list is in `docs/injected-ui.md`.
- A value wins in this order: `tokens`, then `--clay-ui-*` properties, then the page's sampled font and colours, then the built-in look.
- `window.clayTheme = false` keeps the exact built-in look. After loading, `clay.theme(options)` replaces the theme, `clay.theme(false)` and `clay.theme(null)` restore the built-in look or the default, and `clay.theme()` returns the current one. A change affects the next dialog, not one already open.

Your stylesheet still cannot reach these elements: every declaration is inline and `!important`, so a stray `button { ... }` rule never breaks a prompt. On a phone, dialog buttons stay at least 44px tall whatever the theme asks for.

### 2.6 Plugins that load late

`source`, `sortable` and `menu` load after `clay:ready`, one at a time, in the order the plan resolves them. Nothing on first paint or on the first keystroke waits for them, and a late plugin that fails to load is logged and left absent, like any other.

Each late plugin fires `clay:plugin-ready` on `document` once its own `ready` settles, with `detail.plugin` naming it. That event is where a page tunes something the plugin built for itself: the Kanban waits for `sortable` and then sets the drag delay its cards need on a phone.

```js
document.addEventListener("clay:plugin-ready", (event) => {
  if (event.detail.plugin !== "sortable") return;
  for (const list of document.querySelectorAll("ol.cards")) {
    const sortable = window.Sortable?.get?.(list);
    sortable?.option("delay", 220);
    sortable?.option("delayOnTouchOnly", true);
  }
});
```

Do not read `window.Sortable` in a `clay.ready` callback: the plugin may not have arrived. `clay.plugins` tells you it is coming; `clay:plugin-ready` tells you it is here.

### 2.7 Libraries on demand

`clay.assets.load(name)` resolves a library from the same release that served `clay.js`, the first time a page asks for it: no vendor URL in the document, and a copy served by another host, or opened from disk, still finds it. The names are `overtype`, `marked` and `highlight`, plus one grammar per `highlight/<language>` for `bash`, `css`, `javascript`, `json`, `python` and `xml`. `clay.assets.names()` lists them.

```js
const { Marked } = await clay.assets.load("marked");
const { default: hljs } = await clay.assets.load("highlight");
const { default: javascript } = await clay.assets.load("highlight/javascript");
hljs.registerLanguage("javascript", javascript);
```

`overtype` resolves the vendored OverType editor with its toolbar buttons, `marked` the `Marked` class, and `highlight` the core with no grammar of its own, so a page registers only the grammars it uses. One load per name: a second call before the first settles shares it, a failed one is forgotten and can be tried again, and an unknown name rejects with `clay.assets: no asset named "<name>"`. The [`window.clay` reference](https://clayjs.com/docs/api/) lists what each name resolves to.

---

## 3. Edit mode and view mode

### 3.1 How the mode is decided

`clay.isEditMode` is decided once at load, by the first of these that applies:

1. `?editmode=true` or `?editmode=false` in the URL. Only the literal `true` means edit.
2. `<html viewonly>` in the file means view. So does a response carrying only the pre-1.9.0 token `htmlclaytoken` (an out-of-date HTML Clay, which also shows an update bar).
3. `window.clayEditMode`, set by a script before boot.
4. A `savetoken` attribute the host put on `<html>` (HTML Clay 1.9.0 and newer).
5. **Draft mode**, on a page that opted in ([Free documents for visitors](https://clayjs.com/docs/guide/free-documents/)): the visitor gets the editing UI and their work stays in their own browser. `?editmode=false`, a `viewonly` attribute, a stale token, `window.clayEditMode` or a save token all turn it off, and only the owner cookie plus `?editmode=true` edits the original, except on a `viewonly` document or one with a stale token, where `?editmode=true` is the plain edit mode it always was ([The mode ladder](https://clayjs.com/docs/guide/free-documents/#the-mode-ladder)).
6. The `isAdminOfCurrentResource` cookie (hyperclay.com, Hyperclay Local).

Edit mode only asks for the editing UI. On a host that has not authorized this person every save is refused (`savestatus="error"`). The host decides who writes.

`clay.isOwner` reflects the cookie alone. On HTML Clay an editable page has `isOwner === false`. Use `clay.isEditMode` for "can edit", never `isOwner`.

`clay.toggleEditMode()` flips `?editmode=` and reloads.

### 3.2 The root attributes

At load ClayJS sets `editmode="true|false"` and `pageowner="true|false"` on `<html>`, in both modes. In edit mode it also sets `savestatus` (`saving`, `saved`, `error`, `offline`, `conflict`) once the page has settled. **All three are removed from every save,** as are the host's `savetoken` and `documentetag`. The saved file's `<html>` carries none of them.

Consequence: before ClayJS runs, `editmode` is **absent**, not `"false"`. CSS keyed on `html[editmode="false"]` shows edit chrome to visitors until boot. Key on `html:not([editmode="true"])` instead.

### 3.3 Showing and hiding edit controls: clay-options

Load `clay-options.js` and mark edit-only controls with `show-when:editmode="true"`:

```html
<button type="button" data-action="add" show-when:editmode="true">+ Add book</button>
```

The satellite compiles each distinct pattern into one CSS rule in `<style data-name="option-visibility">` in `<head>`, so showing and hiding costs no JavaScript and respects the element's own `display` when shown. That style is saved. After the first save, a viewer's browser hides edit controls at first paint, before any script runs.

**Before the first save** there is no saved rule. Add the fallback rule to your own stylesheet in every file, as the skeleton does:

```css
html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
```

The family:

| Attribute | Visible when |
|---|---|
| `show-when:NAME="a\|b"` (alias `option:NAME`) | the element or any ancestor has `NAME` equal to `a` or `b` |
| `hide-when:NAME="a\|b"` | hidden when the element or any ancestor has `NAME` equal to one of them; shown otherwise, including when no ancestor has `NAME` |
| `option-not:NAME="a"` | some ancestor has `NAME` with a value other than `a`; hidden when no ancestor has `NAME` |

- It matches **any** ancestor, not the nearest. Nested views need different attribute names (`view` on the app, `cardview` on a card).
- It compares literal strings only. Expressions belong to sap's `show=` ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).
- `show-when:savestatus="error|offline"` shows a "not saved" warning. `show-when:pageowner="true"` shows owner links.
- For content only viewers should see, use `hide-when:editmode="true"`: it is visible when `editmode` is absent. `show-when:editmode="false"` is hidden until boot and then appears.
- The attribute you switch views with is ordinary saved content. Setting `view="list"` on a saved element saves it and syncs it to every collaborator. [Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state) covers tab-local views.

### 3.4 Mode attributes: one file for editors and viewers

Four attributes make an element behave differently by mode. A **save transform** writes the inert form into the file, and **edit mode** activates it on load. View mode never loads the code, so a viewer sees exactly what the file holds.

| Attribute | In the saved file | In edit mode |
|---|---|---|
| `editmode:contenteditable` | `contenteditable` renamed to `inert-contenteditable` (value kept) | `contenteditable` restored |
| `editmode:onclick` | `onclick` renamed to `inert-onclick` | `onclick` restored |
| `editmode:resource` on `<script>`, `<style>`, `<link>` | `type` prefixed `inert/` | the `inert/` prefix stripped and the element re-inserted so it runs |
| `viewmode:disabled`, `viewmode:readonly` on controls | `disabled` / `readonly` added | removed |

There is no general `editmode:<anything>`; these four are all.

```html
<span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">Title</span>
<input type="checkbox" persist viewmode:disabled disabled>
<input type="number" bind="amount" persist viewmode:readonly readonly value="72">
<script editmode:resource type="inert/text/javascript" src="board-editor.js"></script>
```

**Author records in the saved form**, as above. A file written with live `contenteditable` or without `disabled` gives every viewer editable text and live checkboxes until the owner's first save rewrites it. The test suite checks the examples' view mode from the very first open.

**Write templates in the active form.** The transform does not reach `<template>` content, and a clone is inserted while the owner is editing. A clone carrying `inert-contenteditable` would not be editable until reload. On the next save the transform converts the clone like any other element.

```html
<template id="item-tpl">
  <li><input type="checkbox" persist viewmode:disabled> <span class="title" editmode:contenteditable contenteditable="plaintext-only"></span></li>
</template>
```

`contenteditable="plaintext-only"` is the right value for titles, labels and cells: no formatting, no pasted markup. Make Enter blur instead of inserting a line break, as in the skeleton's keydown handler. Use `editable` ([richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable)) only where rich text is the point.

### 3.5 What a viewer gets

In view mode `window.clay` keeps `ready`, `isEditMode`, `isOwner`, `toggleEditMode`, `Mutation`, `region`, `readData`, `writeData` and `hasUnsavedChanges` (always `false`), plus whatever view-mode plugins and satellites add (`clay.conflicts` and `clay.morph` with `sync`, `clay.cms`, `clay.quickcrop`, `clay.toast` and the rest). There is no `save`, `getHTML`, `addDocumentTransform`, `onSnapshot`, `undo`, `RichClay`, `upload`, and no `markDirty` unless `sync` is loaded (it is harmless there).

- Call edit-only APIs as optional calls (`clay.addDocumentTransform?.(fn)`), or return early with `if (!clay.isEditMode) return`. An unguarded call throws and kills the rest of the script for viewers.
- Click handlers run for viewers too. Hidden buttons cannot be clicked, but guard edit actions anyway, as the examples do with `if (!clay.isEditMode) return`.
- A viewer can still use read-only interactions: open a card, filter, search, export, scroll the outline. Those are chrome and tab-local state, so they work the same in both modes.
- With `sync` loaded a viewer rides the saved lane and receives each accepted save, so a published page updates live ([What sync is](https://clayjs.com/docs/guide/live-sync/#what-sync-is)).
- A click inside `[trigger-save]` in view mode dispatches `clay:view-save-attempt`, so you can explain why nothing saved.

### 3.6 When an edit is ready to type in

Edit mode is decided at load, but a `page` document is ready later. `clay.page.ready` resolves when its editor is the thing on the page and accepts typing, and `clay.page.status` holds that boot result, `{ phase, reason, installId, at }`. `clay.ready` does not wait for it: `plugins/page.js` exports no `ready`, so `await clay.ready` can resolve while the saved article is still on screen. Late plugins do wait, so a page that ships with them needs nothing extra.

The boot marks say where it got to, each a `performance.mark` with `{ detail: { installId } }`:

- `document:boot`: an installation starts, before the source is validated.
- `document:assets-ready`: the editor's code is in hand.
- `document:authority-ready`: the capability and first-save gates passed, the page handle is admitted and the binding is created. Writer election and the article's feature views are still ahead.
- `document:input-ready`: adoption succeeded and editable was enabled on the current mounted view. A failed or cancelled installation never emits it.

Blocked readiness settles without producing an editable page, and that is an answer rather than an error: `clay.page.ready` resolves, `clay.page.status.phase` is `blocked`, `reason` names the boundary (`missing-capability`, `first-save-refused`, `first-save-conflict`, `admission-failed`, `editor-assets-failed`, `mount-failed`, `adoption-refused`, `adoption-timeout`, `adoption-error`, `page-replaced`, `view-detached`, `no-page`, `ambiguous-page`, `invalid-page-source`, `invalid-page-json`, `unsupported-page-format`, `missing-page-store`, `boot-incomplete`), and nothing takes a keystroke: the saved article stays as the host served it, or an editor that was already mounted is left read-only because the page was replaced. Design the fallback around the phase, not around a caught exception:

```js
const boot = await clay.page?.ready;
if (boot?.phase !== "ready") document.documentElement.setAttribute("read-only", "true");
```

`clay.page.install()` starts a fresh installation with its own id, disposing the last one, which is how a page retries after a failure without a reload.

### 3.7 The page editor on a phone

At widths up to 560 px the page editor's toolbar keeps four controls: Bold, Italic, Link and More. Each is at least 44 by 44 CSS px, in a 204 px bar with 4 px gaps and 8 px padding, and the selection bubble is hidden so two bars never appear at once.

More holds the rest: Strikethrough, Code, bulleted, numbered and checklist lists, Turn into, Insert, Move up, Move down, Indent and Outdent. Turn into and Insert open the same pickers the desktop uses, and the move and indent actions apply to the caret's block when nothing more is selected.

The bar is placed from the visual viewport, not from the layout viewport: its top and its horizontal bounds come from the visible area, so an on-screen keyboard cannot cover it and panning the visual viewport moves it with the page. The safe-area inset is read once per layout frame. A menu stays inside that same viewport, opens above the bar when there is room, and scrolls internally. Desktop layouts are unchanged.

### 3.8 The keyboard route in the page editor

Escape closes an open menu or the link popover first, and puts focus back on the control that opened it, or the editor.

From a block selection, Escape leaves the writing surface for the first toolbar control while keeping the selection, so the keyboard is never trapped in contenteditable. In the toolbar, Left and Right move between controls and Escape returns to the editor. The toolbar is a single tab stop with a roving tabindex: Tab leaves it forward and Shift-Tab backward. Inside a table, Tab moves across its cells and Shift-Tab back; the editor takes Tab for nothing else.

A table's column resize handle is a focusable vertical separator named for its column, with `aria-valuemin` 48, `aria-valuemax` 1200 and the current width in `aria-valuenow`. Left and Right preview a 10 px change, Shift makes the step 50 px, Home and End preview the minimum and the maximum, Enter commits, and Escape cancels. Repeated keydowns preview, and the keyup that ends the repeat, Enter or leaving the handle commits one command, so a held arrow key is one undo item. Double-click fits the column and pointer dragging is unchanged. A phone keeps the column's Width menu (Wider, Narrower, Fit to content, and Reset width once the column has a width) for the same job.

---

## 4. What gets saved

### 4.1 What a save writes

A save writes the current document with these changes:

- Subtrees marked `no-save`, `no-snapshot` or `editor-ui` are removed.
- `freeze` elements are written with the inner HTML they had when they first appeared (at load, or when inserted later). Their contents are a per-tab scratchpad.
- Mode attributes go inert ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers)). Root attributes `editmode`, `pageowner`, `savestatus`, `savetoken`, `documentetag` are removed.
- `persist` controls write their live values ([`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls)).
- Runtime residue of ClayJS's own editors (richclay attributes, toolbars) and of browser extensions (password managers, Grammarly, Dark Reader) is stripped.
- Your hooks run ([Hooks](https://clayjs.com/docs/guide/saving/#hooks)).

Everything else on the page is written as it is. That includes things builders forget:

- Classes and attributes toggled for UI: `.selected`, `aria-expanded`, `<details open>`, `hidden`. Mark them `ephemeral` instead ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)). `<dialog open>` is the exception: it is never saved.
- Inline styles from libraries and helpers: Sortable's `draggable="false"` and `style=""`, `el.hide()`, `All(...).css()`, `body.style.overflow = "hidden"` from an open modal or crop dialog.
- Any element a script inserted outside an excluded region.

Never saved: JavaScript objects, `localStorage`, canvas pixels, scroll position, focus, selection, shadow DOM content (only the host element's light DOM and attributes), iframe content, the live value of a control without `persist`, and password, hidden and file input values even with `persist`.

### 4.2 Regions: the `clay` attribute

`clay="token token"` on an element applies to it and all its descendants. The bare attribute form (`<div no-save>`) means the same.

| Token | Saved file | Sent to peers | Starts autosave | Counts as unsaved | In undo | Use for |
|---|---|---|---|---|---|---|
| (none) | current | yes | yes | yes | yes | the record |
| `editor-ui` | removed | no | no | no | no | **UI a script fills or changes at runtime, and tab-only derived values** ([Chrome](https://clayjs.com/docs/guide/architecture/#chrome)) |
| `no-save` | removed | carried in the bytes, never applied | no | no | yes | rarely; prefer `editor-ui` |
| `no-snapshot` | removed | no (each tab keeps its own) | no | no | yes | part of `editor-ui` |
| `freeze` | element current, contents as when it appeared | element yes, contents never | no | no | yes | a scratchpad: per-tab generated content in a saved element ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) |
| `no-dirty` | current | yes, **remote wins** | no | no | yes | derived values the saved file must show ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) |
| `no-trigger-autosave` | current | yes | no | **yes** | yes | a heavy editor whose saves you batch yourself ([Manual-save pages and batching](https://clayjs.com/docs/guide/saving/#manual-save-pages-and-batching)) |
| `no-watch` | current | yes, remote wins | no | no | no | rarely: high-frequency content that is disposable |
| `no-undo` | current | yes | yes | yes | no | content with its own undo (richclay sets it at runtime) |
| `no-data` | current | yes | yes | yes | yes | content the data API and `extractData` must skip |
| `live` | the store's current value, at checkpoints | never through the merge; the `live` plugin carries it ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | no | no | no | a `clay="live"` JSON tag |

`editor-ui` bundles `no-data no-save no-snapshot no-watch no-undo`. **When chrome needs a region, use `editor-ui`, not `no-save`.** A `no-save` element is still inside the snapshot live sync sends to peers. Peers never apply it, but its text travels to every edit-mode tab (viewers receive the saved file, without it), and `no-save` alone still records undo steps. Older docs advised `clay="no-save no-watch"` for chrome; `editor-ui` replaces that.

Legacy spellings still work: `save-remove` is `no-save no-undo`, `save-ignore` is `no-dirty no-undo`, `save-freeze` is `freeze no-undo`, `mutations-ignore` is `no-watch`, `snapshot-remove` is `no-snapshot`.

Traps in this table:

- **An edit inside `no-watch` or `no-dirty` is invisible to `clay.save()` and the close warning.** `save()` answers "No changes to save" and closing the tab loses it silently. It is saved only when some other change triggers a save, or by `clay.save.force()`. Never put typed work there.
- **`freeze` is a scratchpad.** The element belongs to the document: its attributes save, it syncs, moves and merges like any element. Its contents belong to this tab: a runtime change inside is never saved, not even by `clay.save.force()`, and never reaches a peer. Every save restores the contents the element had when it first appeared.
- **A scratchpad from a peer arrives empty.** When a peer adds a record that contains a frozen element, it is inserted without contents. Fill scratchpads from code that runs on every change (a sap `effect`, or your render function), never once at boot.
- **Fill a scratchpad after `clay.ready`, and insert new ones empty.** The contents are captured when the element first appears, so content written before boot, or present in a cloned element when it is inserted, becomes its saved contents. Empty the scratchpads in a copied record before inserting it.
- An `editor-ui` root disappears from the saved file, so it cannot be authored in the file. Create it at runtime from a `<template>`, every load. That includes elements inside the `<template>`: mark the blueprint `editor-ui` and the first save empties the template, so the next load has no chrome to clone. Leave the blueprint unmarked and set `clay="editor-ui"` on each clone as you insert it.
- Mark a region by setting the attribute on creation, or with `clay.region.addRegionToken(el, "editor-ui")`.

### 4.3 `persist`: form controls

A control's typed value is a property, not an attribute, and serialization only sees attributes. Without `persist`, a typed value is lost on save: the file keeps the authored `value`. Put `persist` on every `<input>`, `<textarea>` and `<select>` whose value is record.

```html
<input type="checkbox" persist viewmode:disabled disabled checked>
<input type="number" step="0.01" persist value="312.40">
<textarea persist></textarea>
<select persist><option>todo</option><option selected>doing</option></select>
```

- On `input` (text-like fields) and `change` (checkbox, radio, select) ClayJS mirrors the live value into `value`, `checked` or `selected`. A textarea's value goes into a `data-value` attribute while typing and becomes its text content in the save.
- A snapshot also copies every persist control's live state, so a value set from script with no event is saved too.
- Password, hidden and file inputs are never persisted. An authored `value` on them is still in the file.
- `persist` goes on the control itself, never on a wrapper.
- A persist control's value change counts as an edit and starts autosave.
- Do not persist a filter or search box. Those are tab-local: put them in chrome ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).

**After undo, redo or a merge, ClayJS puts each control's display back in step with its attributes.** A control the user has touched shows its live property, not its attribute, so a merge and the undo plugin copy `checked`, `value` and `selected` back onto the property (undo does this for `persist` controls outside `no-undo` regions). A merge leaves the focused text field alone; undo, which the user asked for, restores it too.

### 4.4 Where to keep data that is not visible text

In order of preference:

1. **Attributes on the element they describe.** `<li class="card" data-id="c-7f3a" data-due="2026-11-02" data-points="3">`. Saved, merged per attribute, readable by agents, moves with the element. The default.
2. **Hidden elements inside the record.** `<ul hidden class="archive">`, the card detail inside the card ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)). Same properties, good for archived items and detail fields.
3. **A JSON script with `merge`.** For data that markup expresses badly (formula grids, chart series, settings objects):

   ```html
   <script type="application/json" id="model" merge="store">{"series":[{"id":"s1","points":[3,5,8]}]}</script>
   ```

   ```js
   function writeModel(model) {
     document.getElementById("model").textContent = JSON.stringify(model).replace(/</g, "\\u003c");
   }
   ```

   Always escape `<`: a value containing `</script>` ends the element early and corrupts the file on reload. Re-parse on every `clay:sync-applied`, because a merge changes the text, not your parsed object. When two writers change the same key, the incoming value wins and the lost value shows in the conflict notice ([Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync)).
4. **A live JSON script (`clay="live"`)** for state that changes faster than a save: game boards, scores, cursors ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)).
5. **`<template>` content: never for mutable data.** It is saved, but edits there never trigger autosave.

### 4.5 Identity

Live sync and undo pair elements across versions by **`data-id`, then `id`**, used only when the value is unique on its side and the tag names match. Without an id, elements pair by content, which works for distinct text and fails for identical new items.

- **Every repeated item gets a unique `data-id` when it is created.** Two people adding an item at the same place without ids: with distinct text both usually land; with similar text ("New card", "New task") one is dropped into the conflict ledger; with identical or blank text one is dropped **with no ledger record**. With ids both always land.
- **A clone gets a fresh id.** A duplicated `data-id` counts as no id at all. Re-id the clone and every id-carrying descendant, as the writer's duplicate command does:

  ```js
  const copy = block.cloneNode(true);
  copy.querySelectorAll('[clay~="editor-ui"]').forEach((el) => el.remove());
  copy.querySelectorAll("[data-richclay-active]").forEach((el) => clay.RichClay.stripElement(el));
  copy.dataset.id = newId("b");
  copy.querySelectorAll("li[data-id]").forEach((li) => { li.dataset.id = newId("t"); });
  ```

- **Templates carry no `data-id`.** The command that clones a template assigns one. For a plain "add an item" button, `<button add-from="#item-tpl" add-to="#list">` does the clone, the id and the focus with no script.
- **Never stamp ids on open.** Opening an old file must not rewrite it. Add an id when an item is created or first changed.
- **Make ids without `crypto.randomUUID`** unless the file is only ever served over https or localhost: it is missing in insecure contexts. The examples use `prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`.
- Ids are also how commands find records: `` board.querySelector(`.card[data-id="${CSS.escape(id)}"]`) ``. Never find a record by position.

### 4.6 Assets

An image's durable form is its `src`. Upload the file and write the returned URL ([upload and quickcrop](https://clayjs.com/docs/guide/components/#upload-and-quickcrop)). Where the host cannot store files, embed a `data:` URL, which works anywhere but makes every save carry the bytes. Keep embedded images small. Every host returns a host path such as `/_/uploads/assets-<name>/photo-ab12.png`, which keeps working on that host when the document is renamed or moved. A document opened straight from disk shows those images broken; Export as zip takes a document with its files.

### 4.7 Ephemeral state: per-tab state on saved elements

A selected card, a row being dragged, an open section: state that belongs to this tab but sits on a saved element. A class or attribute toggled for it is an edit like any other: it marks the page unsaved, starts an autosave, adds an undo step, reaches every peer and lands in the file. Mark it ephemeral instead:

```html
<li class="card ephemeral-selected:ring-2" data-id="c-7f3a">…</li>
<details ephemeral:open><summary>Notes</summary>…</details>
```

```js
clay.ephemeral.toggle(card, "selected");   // add, remove, toggle(el, word, force), has
```

- **`ephemeral="selected dragging"`** holds words a script sets for this tab. Style it with `[ephemeral~="selected"]`, or with the Tailwind variant `ephemeral-selected:` (`@plugin "@panphora/clayjs/tailwind";`; Hyperclay's on-save Tailwind has it built in).
- **`ephemeral:NAME`** makes the element's own `NAME` attribute tab-only: `<details ephemeral:open>`, `<button ephemeral:aria-expanded>`. The marker is saved; the attribute it names is removed from the saved file. Tailwind's own `open:` and `aria-expanded:` variants style these.
- **`open` on `<dialog>`** is tab-only with no marker: `showModal()` sets it, and a dialog saved open is always a bug.
- None of it is saved, sent to peers, undone or counted as a change, and an incoming merge, from a peer or from the file on disk, never writes or removes it on an element this tab already has. The router's `route-active` gets the same treatment.
- Identity (`class`, `id`, `data-id`), region attributes (`clay`, `no-save`, `freeze` and the rest) and form state (`value`, `checked`, `selected`, which `persist` owns) can never be made ephemeral.
- Because ephemeral changes are not changes, `onmutation` and `onglobalmutation` handlers do not fire for them. Update anything derived from a selection in the same function that changes it.

Use `ephemeral` for state on one element. State that comes from the URL hash and spans many records (the open card, a filter) is still painted with a runtime stylesheet ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).

---

## 5. Saving

### 5.1 Edit mode and the save path

In edit mode ClayJS saves the whole document to `POST /_/save` on the page's origin (or `/_/save/<savetoken>` on HTML Clay). Cmd+S (Ctrl+S elsewhere) and a click inside any `[trigger-save]` element call `clay.save()` on every edit-mode page, with or without autosave. A close warning appears whenever there are unsaved changes.

#### 5.1.1 The saved title

A page's `<title>` is part of the saved file, and it is derived rather than authored. The save projection reads the captured model and takes the first top-level H1, with whitespace runs collapsed and trimmed; a page with no top-level H1 is `Untitled`. The server checkpoint renderer uses the same function on the same model, so a checkpoint written by a room does not describe different content from the file the client would have saved.

`<meta name="clay-seo-title-mode" content="custom">` in `<head>` is the opt-out: the authored `<title>` is left exactly as it is, and nothing derived rewrites it. The SEO panel's title field writes that marker when you set a custom title, and removing the marker returns the document to a derived title on the next save.

The file's name is not derived from anything. ClayJS never renames a document, and a save writes bytes to the route the host already serves, so the file name, the downloaded name and the path in a local folder are exactly what they were. Title changes are content changes; renaming a file is a host or a person's decision.

### 5.2 Autosave

`<html autosave>` present at load turns on autosave. Adding or removing it later changes nothing.

- A watched DOM change or a `persist` input starts a 1500 ms debounce. Continuous changes save at most 10 s after the first one. Saves are throttled to one per 1.2 s.
- Measured: one edit saves at about 1.5 s; 50 edits in a second save once at about 2.5 s; an edit every 300 ms saves at about 10 s.
- Template content edits never trigger it.
- A save that fails (500, network) is **not retried** until the next edit or the browser's `online` event. `savestatus="error"` stays up. If your app can sit idle after a failure, retry yourself:

  ```js
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && document.documentElement.getAttribute("savestatus") === "error") clay.save();
  });
  ```

**The load-settle window.** At load ClayJS takes a baseline of the document and retakes it once the page has been quiet for 500 ms (at most 3 s), unless the person typed or a save ran. Then it sets `savestatus="saved"` and fires `clay:baseline-settled`. Anything app code writes into the record during that window is absorbed into the baseline: it is not saved, not autosaved, and not counted as unsaved. It reaches the file only when some later edit triggers a save. So:

- Do not seed defaults, migrate a schema, or stamp ids at startup. Author defaults in the file.
- If an app truly must write at startup, write after `clay:baseline-settled` (or once `<html savestatus>` exists), or follow the write with `await clay.save.force()`.

### 5.3 Manual-save pages and batching

For a long-form writer where each autosave is unwelcome, omit `autosave`. Cmd+S, `[trigger-save]` and the close warning still work. Save when the tab hides:

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && clay.isEditMode && clay.hasUnsavedChanges()) {
    clay.save.flush({ keepalive: true }).catch(() => {});
  }
});
```

A collaborative page should keep autosave on: peers see an edit only after it saves ([What sync is](https://clayjs.com/docs/guide/live-sync/#what-sync-is)).

To batch saves inside an autosaving page, wrap the heavy region in `clay="no-trigger-autosave"`: edits there still count as unsaved and still warn on close, but never start a save. Your own `clay.save()` (on blur, or every 30 s) writes them, and so does any save another edit triggers.

`clay.Mutation.pause()` and `resume()` hide DOM mutations from the mutation hub's listeners (autosave's mutation trigger among them) for the duration, but the next save still writes them. They do not pause input: `input` and `change` events on controls, including synthetic ones, still mark the page dirty and start autosave. Pair them in `try/finally`; an unbalanced pause silences mutation-driven autosave for the rest of the session.

### 5.4 The save API

`clay.save()` returns `Promise<{ ok, msg, msgType, code, etag }>` and never rejects. One exception to that shape in 1.8.2: when capturing the page fails (a registered hook threw, [Hooks](https://clayjs.com/docs/guide/saving/#hooks)) the result has no `ok` field at all, only `msgType: "error"`.

| Result | Meaning |
|---|---|
| `ok: true`, `msgType: "success"` (or `"warning"`) | the host accepted these bytes |
| `ok: false`, `msgType: "skipped"`, `msg: "No changes to save"` | nothing in the dirty domain changed |
| `ok: false`, `msgType: "skipped"`, `msg: "Save already in progress"` | a save is in flight; these bytes are queued and sent after it |
| `ok: false`, `msgType: "conflict"` | HTTP 412: the file changed elsewhere ([Conflicts on save (412)](https://clayjs.com/docs/guide/saving/#conflicts-on-save-412)); also carries `changedBy`, `afterTimeout`, `conflictEtag` |
| `ok: false`, `msgType: "error"` | the host refused or the network failed |
| `ok: false`, `msgType: "unknown"` | 12 s timeout; ClayJS asks the host whether it landed |

**Branch on `msgType`, not `ok`.** `ok: false` also means "nothing to save" and "queued behind another save". To know that the host holds what the page holds now, use flush:

- `clay.save.flush({ keepalive, timeoutMs })` resolves `{ state: "view" | "clean" | "saved", etag }` only when the host holds the current bytes. It rejects with `err.state` of `failed`, `conflict` or `blocked`. It waits out the settle window and any in-flight save and retries while the page keeps changing.
- `clay.save.force()` saves without the dirty check: it writes `no-dirty` and `no-watch` edits. (Template content edits need no force: `save()` and the close warning see them; only autosave does not.)
- `clay.save.overwrite()` re-reads the host's current version stamp and force-saves over it. It is "keep mine" after a conflict.
- `clay.getHTML()` returns exactly the bytes a save would send. It runs your `onbeforesnapshot` and `onbeforesave` hooks and closes the open undo batch, so do not call it on every keystroke.
- `clay.hasUnsavedChanges()` is synchronous and costs one full capture of the document.
- `clay.registerUnsavedState({ id, isPending })` registers work held outside the DOM (a form not yet applied) so the close warning and `flush` respect it. Call the returned `changed()` when it changes and `dispose()` when done.
- `clay.markDirty()` tells the dirty gate about an edit no mutation shows, for an editor whose surface is `editor-ui` and which writes the record itself.

### 5.5 Conflicts on save (412)

On hosts that announce `conditional` (all three hosts in [What the host does](https://clayjs.com/docs/guide/model/#what-the-host-does)), every save carries `If-Match` with the version the tab last saw. If the file changed elsewhere and live sync has not merged that change yet, the host answers 412 and writes nothing.

- The result is `msgType: "conflict"`, `<html savestatus="conflict">` and `clay:save-conflict`. Unsaved work stays in the page. **Autosave stops** until the conflict is resolved. Cmd+S is refused again.
- ClayJS shows a built-in notice: **Keep mine** (`clay.save.overwrite()`), **Accept theirs** (press twice; reloads and drops local edits), **Download my copy** (an HTML file with your version and a list of replaced edits).
- With `sync` loaded, most 412s resolve themselves: the merge brings in the version that beat this tab, and `clay:save-conflict-resolved` fires.
- The first save after load can go out without `If-Match` on a slow host, because version discovery is not awaited. It is last-write-wins.
- If you hide the built-in notice, you must still offer overwrite and reload.

### 5.6 Hooks

Hooks shape the saved bytes without touching the live page. They run on a clone.

| Hook | Runs on | Use for |
|---|---|---|
| `onbeforesnapshot="code"` attribute | the clone, for every snapshot: save, change check, sync broadcast | normalizing tab-local state out of anything that leaves the tab |
| `onbeforesave="code"` attribute | the save clone and change-check clones (not sync broadcasts) | cleaning a subtree before it is written |
| `clay.onSnapshot(fn)` | every snapshot; `fn(clone, { original })` | stripping library residue everywhere |
| `clay.addDocumentTransform(fn)` | the save clone and every change check | writing derived values into the saved copy only |
| `onaftersave="code"` attribute | the **live** element after each accepted save | rarely |

In attribute hooks `this` is the cloned element. Example from the finance tracker, which keeps sap's search filter (rows hidden with `hidden`) out of the file and out of peers' copies:

```html
<tbody items="txns" onbeforesnapshot="this.querySelectorAll(':scope > [item][hidden]').forEach((row) => row.removeAttribute('hidden'))">
```

Rules:

- **Hooks must be pure and repeatable.** They run on every autosave check, every `hasUnsavedChanges()`, every `getHTML()`. A hook that writes a timestamp or counter makes the page permanently dirty and autosaves forever.
- A throwing **attribute** hook costs only that hook. A throwing `clay.onSnapshot` or `clay.addDocumentTransform` callback aborts the capture: `getHTML()` throws and every `save()` fails with `msgType: "error"` until it stops throwing. Registered callbacks must handle missing elements themselves; remember that change-check captures have already removed `editor-ui`, `no-save` and `no-snapshot` regions.
- `onaftersave` writes to the live DOM, so anything it changes is a new edit and, with autosave, a save loop. Mark what it writes `editor-ui`, or write it inside a `freeze` scratchpad.
- `clay:snapshot-ready` listeners receive the shared clone and must not change it.

Strip library residue once, at the snapshot level:

```js
clay.onSnapshot?.((root) => {
  for (const el of root.querySelectorAll(".sortable-chosen, .sortable-ghost, .sortable-drag")) {
    el.classList.remove("sortable-chosen", "sortable-ghost", "sortable-drag");
    if (!el.classList.length) el.removeAttribute("class");
  }
  for (const el of root.querySelectorAll('[draggable="false"]')) el.removeAttribute("draggable");
  for (const el of root.querySelectorAll('[style=""]')) el.removeAttribute("style");
});
```

Only strip `draggable="false"` if your own markup never authors it.

### 5.7 Save status

Style from the root attribute, with no JavaScript:

```css
html[savestatus="saving"] #status::after { content: "Saving…" }
html[savestatus="error"] #status::after { content: "Not saved" }
html[savestatus="conflict"] #status::after { content: "Changed elsewhere" }
```

`savestatus` says what the last save did and keeps its five values. Whether there is work since — anything a save has not written — is a second root attribute, `unsaved="true"`, present from the first edit until a save accounts for it. That split is what keeps a saved document's status CSS honest while a chip shows unsaved work:

```css
.chip-unsaved { display: none }
html[unsaved="true"]:not([savestatus="error"]):not([savestatus="offline"]) .chip-unsaved { display: inline }
```

In draft mode nothing is being saved on purpose, and `html[draftmode="true"]` is what says where "saved" went.

Put `#status` in chrome. Or load the `indicator` plugin for a ready-made chip. With `clay-ui.js` loaded, save errors and offline become persistent toasts. Without the `indicator` plugin, clay-ui also toasts "Saved" after every save; with it, set `clay.saveToast = true` to get those toasts too.

Events, all on `document`:

| Event | When | `detail` |
|---|---|---|
| `clay:ready` | boot finished | `{ clay }` |
| `clay:baseline-settled` | the load-settle baseline was taken | none |
| `clay:save-saving` | a save has been in flight 500 ms | `{ msg, msgType, timestamp }` (`msgType` is `""`) |
| `clay:save-saved` | the host accepted | `{ msg, msgType, timestamp, etag, captureId }` |
| `clay:save-error` | refused, or a network failure while online | `{ msg, msgType, timestamp, captureId }` (`msgType` is `""` in 1.8.2; the event name is the type) |
| `clay:save-offline` | failed while the browser is offline | `{ msg, msgType, timestamp, captureId }` (`msgType` is `""`) |
| `clay:save-conflict` | 412 | adds `changedBy`, `afterTimeout`, `etag`, `captureId` |
| `clay:save-conflict-resolved` | sync merged the version that caused the 412 | `{ timestamp }` |
| `clay:dirty`, `clay:clean` | unsaved-work state changed | none |
| `clay:unsaved-state-changed` | a registered state called `changed()` | `{ pending }` |

`clay:dirty` means "maybe dirty": typing a letter and deleting it leaves it raised until the next check.

`etag` and `captureId` on those events are additive. `clay:save-saved` carries the accepted `etag` (or `null`), and every save result event carries the `captureId` naming the bytes it captured before it was sent.

A save writes the document's own bytes, so an HTML file downloaded from a host links its pictures, it does not contain them: an image you uploaded to the host is fetched from that host's URL when the file is opened, and a copy opened somewhere that URL does not resolve shows a broken picture.

### 5.8 Recovery copies

`clay.recovery` keeps a local copy of writing the host has not accepted. It is not a save, and ClayJS never renders a page from it: after a reload the page compares the copies with the file it actually loaded and asks before using one. A document is covered only for the channels its adapters register, so a page that registers no channel keeps no local copy at all.

What clears a copy is one save's own capture, not the page's later state:

- Before a save is sent, ClayJS hands the recovery service the exact bytes it captured and that capture's id. Each channel's `readSaved` reads those bytes once, and a copy is covered only when the payload it staged is exactly what the capture holds.
- A save that was skipped, refused, conflicted, errored or ended unknown clears nothing. A confirmed save clears only the revision its bytes covered, so typing during the request stays available.
- A newer revision from the same tab, and every other tab's copy, survive that. A write that arrives after its save was acknowledged is refused by the stored watermark.
- **`clay:snapshot-ready` is not this proof.** It fires on a clone taken before `onbeforesave` hooks, document transforms and final serialization, so what it shows can differ from the bytes the host accepts. `captureId` on `clay:save-saved` is the id to compare against.

```js
document.addEventListener("clay:save-saved", (event) => {
  if (!event.detail.captureId) return;
  console.log("this save covered capture", event.detail.captureId, "etag", event.detail.etag);
});
```

The store lives in IndexedDB (`clay-recovery`), keeps 32 MiB per document scope and 64 MiB per database on this origin, holds plain text that any script on this origin can read, and reports `durable: false` whenever a write did not complete. It is edit mode only, draft mode included, and a reader never opens it. [Recovery](https://clayjs.com/docs/recovery/) has the receipts, the failure codes and the difference between journaled, acknowledged and checkpointed.

---

## 6. Live sync and collaboration

### 6.1 What sync is

`?plugins=sync` keeps every open copy of the file converging. It is a **save-gated, whole-document, three-way DOM merge**, not keystroke streaming.

- An edit-mode tab sends nothing until the host accepts its save. Then it relays that version to the other editors (the live lane). With autosave that is about 1.5 s after typing pauses, at most about 10 s.
- Each receiving tab merges the frame three ways: the last version both agreed on (base), its own current page including unsaved edits (local), and the frame (remote).
- View-mode tabs ride the saved lane: they receive every accepted save and update in place.
- Outside edits to the file on disk (an agent, a text editor, a version restore on desktop hosts) arrive as `disk` frames and merge the same way.

So collaborators see each other's work a few seconds after each pause. On a page without autosave they see nothing until someone saves, and overlapping work only meets at save time. **Every collaborative file uses `autosave`.**

#### The reader's lane

A Document in view mode loads its reader (`page-view`), not the editor, and the reader has no write half. It sees saved files and nothing else:

- **Saved, not live.** It follows a receive-only transport of its own (`src/sync/saved-stream.js`): a startup GET once the stream opens, then the saved lane's frames, then a refetch and repair after a reconnect or a gap. It never POSTs, never sends a live relay and needs no write credentials.
- **One receipt.** The reader holds the bytes on screen, their ETag and the sequence they cover, as one `{ bytes, etag, seq }`. A duplicate or older frame is dropped without moving it, a stamp alone never repairs missing bytes, and a refused or failed read keeps both the article and the receipt that were already there.
- **Keyed replacement.** An accepted file replaces only the blocks whose saved form changed (`src/page/reader-patch.js`). An unchanged block keeps its node, so an open toggle, a mounted tool and find-in-page survive.
- **Explicit `sync` keeps one owner.** On `plugins=page,sync` in view mode the saved lane already has an owner: the reader opens no stream of its own and takes the files that lane applied (`clay:sync-applied` with `source: "disk"`). Neither case adopts a peer's unsaved preview as a saved file.

#### A frame from another template version

A document copied from a starter template carries `<meta name="hyper-version" content="1.1.0">`, and `hyper-source` beside it, so an upgrade can find it. An upgrade replaces layout, code and data together, so a saved file that names a **different** version is not a change to this one: the frame is refused whole, never merged and never applied, because morphing it in would interleave two templates.

Once a frame is refused, this tab's DOM is a version the host no longer stores, so its next save would write that version back over the upgrade: the tab holds every save from then on, and every later frame is dropped too. The notice says **This document was upgraded.** with one action, **Reload**, and `clay:document-upgraded` fires on `document` with `{ message }`.

Only a page that states its own version can make this judgement, and only a frame that states one can disagree, so a document without the meta behaves exactly as it did before. Holding the saves is edit mode's lane, so a reader with nothing to write downloads none of it for the hold.

### 6.2 What a merge does

| Situation (this tab A unsaved, incoming B) | Result |
|---|---|
| A edits one paragraph, B another | both kept |
| A and B edit different words of one paragraph | both kept |
| A and B change the same word | B wins; A's version goes to the conflict ledger |
| Both add class tokens (`done` and `urgent`) | both kept |
| Both set one attribute (`data-status`) differently | B wins; ledger record |
| Both move different items in one list | both moves kept |
| Both move the same item | B's order; ledger record |
| Both change an attribute declared with `merge-tokens` or `merge-max` | merged (token set union, or the larger number), no conflict |
| A edits a card, B reorders the list | B's order with A's edit, no conflict |
| A edits a card B deleted | the card survives with A's edit |
| A deleted a card B edited | the card comes back with B's edit; ledger record |
| Both append an item with its own `data-id` | both land |
| Both append an item without ids | distinct text: both land; similar text: A's item dropped, ledger record; identical or blank: one dropped, **no** record |
| A is typing in a focused input | its value and focus kept |

More engine rules:

- Text merges word by word inside a block, and formatting merges per character. Inline `<style>` and textarea text merge word by word. Scripts and comments merge as whole values.
- Matched live nodes are moved, not recreated, so listeners, focus, caret and iframes survive. An element that matches nothing (re-keyed, or changed beyond recognition among similar siblings) is removed and inserted fresh, and listeners attached directly to it are gone. **Use delegated listeners** on `document` or a stable root.
- A new or changed inline `<script>` in the frame runs once after the merge. Hence `clay.start` ([Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once)).
- Window scroll is restored. Inner scroll containers are not, except the focused element's own.
- The merge runs with the mutation hub, the dirty gate and undo paused: incoming changes never autosave and never enter undo history. `clay.effect` re-runs after it through `clay:sync-applied`, which is how the examples re-render ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)).

#### Declared attribute merges

A `data-*` attribute that both sides change is normally a conflict: B wins and A's value goes to the ledger. Two kinds of attribute are better merged, and a container declares them for everything inside it:

- `merge-tokens="data-labels"`: the attribute is a space-separated set. Both sides' additions and removals apply.
- `merge-max="data-next-card"`: the attribute is a number that only grows, such as a counter for the next card number. The larger value wins, with no ledger record.

```html
<main merge-tokens="data-labels" merge-max="data-next-card" data-next-card="15">
  <article data-id="c1" data-labels="bug urgent">…</article>
</main>
```

Several names go in one attribute, separated by spaces. `data-id` is never merged this way. An attribute nobody declared still conflicts as before. The Kanban starter template uses both: labels as tokens, the card counter as a maximum.

### 6.3 Regions and JSON under sync

- `editor-ui`, `no-save`, `no-snapshot`: **ignored on every side.** Your copy is never touched, and the incoming copy is never read.
- `freeze`: **the element merges, its contents never do.** A frozen element pairs, moves, is inserted and removed with its record, and its attributes merge. Your copy's contents are never touched, the incoming contents are never read, and a frozen element new to this tab arrives empty.
- `no-dirty`, `no-watch`: **remote wins.** The incoming copy replaces yours with no merge. Correct for derived values that every tab recomputes.
- `no-trigger-autosave`: merged like ordinary content.
- `live`: **ignored by the merge on every side.** The `live` plugin takes the value itself ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)).
- Root attributes the library owns (`editmode`, `savestatus`, tokens) are never written by a frame.

**Known issue (ClayJS 1.8.2):** when a frame replaces a `no-dirty` region that this tab had also changed, while the tab also holds an unsaved edit outside that region, the replacement is logged in `clay.conflicts` as a loss and raises the conflict notice, although the docs say it happens with no warning. Two tabs that each edited the data will each have recomputed the totals differently, so this fires on concurrent edits whenever computed totals live in `no-dirty`. Until it is fixed, acknowledge those records yourself, as the finance tracker does:

```js
document.addEventListener("clay:sync-applied", () => {
  const derived = clay.conflicts.list().filter((c) =>
    c.detail === "remote-wins" && [c.el, c.local].some((n) => n?.closest?.('[clay~="no-dirty"]')));
  if (derived.length) clay.conflicts.acknowledge(derived.map((c) => c.id), { reason: "reconciled" });
});
```

**JSON.** A JSON script without `merge` is one value: two writers changing it means one whole blob goes to the ledger. With `merge="name"` it merges per key: objects per key, arrays of objects by an `id` field, arrays of primitives by value, and lists without an id (grids, boards, repeated values) position by position when both sides kept the same length. `merge-key="taskId"` names another id field for every list, and `merge-key="players:uid, items:sku"` names one per list path (no spaces inside an entry). **A key both sides changed takes the incoming value**, and the lost value goes to the ledger like any other replaced edit: the notice shows a row such as `game → players → alice → x`, with yours and now. Revert cannot put a JSON value back; Download keeps your copy. Use per-entry keys (`notes: { "n-1": ..., "n-2": ... }`) so two people adding entries never touch the same key. For data several people change at once, use a live store ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) instead. When a merge mixes both sides, the text is rewritten in the incoming text's style (one line stays one line, indented stays indented) with `<` written as `\u003c`.

### 6.4 Focus, typing and long-running editors

- The focused `<input>` or `<textarea>` keeps its value through a merge. Checkbox, radio and select state are not protected.
- A caret in contenteditable text follows its characters through the merge.
- A dirty tab that has no merge base (because the record was rewritten at boot) **holds** incoming frames and fires `clay:sync-held` until it saves. Another reason not to touch the record at boot.

### 6.5 Reconciling in app code

Draw everything derived from the record inside `clay.effect(fn)`. It runs `fn` on the next microtask, then again after every change the mutation hub observes (local edits, drags, undo and redo) and after every merge, batched to one run per microtask. Changes inside `editor-ui` or `no-watch` regions, ephemeral attributes and live properties with no attribute change do not re-run it. `fn` runs with the hub paused, so its own writes never re-trigger it, start an autosave or enter undo history. It returns a function that stops it.

```js
clay.effect(() => {
  const rows = items.querySelectorAll(":scope > li");
  const done = items.querySelectorAll("input[checked]").length;
  setText(summary, `${done} of ${rows.length} read`);
});
```

Rules for `fn`:

- **Keep it synchronous.** Writes after an `await` land outside the pause and would re-trigger it forever, so an effect whose `fn` returns a promise is stopped with a console error.
- **Do not call `clay.undo.commit` inside it.** A commit drains the hub's records, so the effect's writes reach autosave and the effect again.
- **One effect does not see another's writes**, because each runs paused. Draw values that depend on each other in one effect.
- **A derived value saved in the record** (a count painted in markup, [Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) is written with the hub paused, so a repaint after a merge leaves the page dirty with no save scheduled. Put saved derived values in `clay="no-dirty"`, or in chrome, or declare them as sapjs paints, which ClayJS leaves out of every comparison ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).

In edit mode each effect warns once in the console when it breaks one of these rules: a write to saved content outside `no-dirty` and `editor-ui`, a `clay.undo.commit` call, an effect created inside it, or more than 50 runs in a second (usually a timer or async callback it started that keeps changing the document). The effect keeps running; the warning names the element or command.

Work that belongs to a merge alone goes in a `clay:sync-applied` listener:

```js
document.addEventListener("clay:sync-applied", (event) => {
  if (openId && !cardById(openId)) closeCard();
});
```

- Close or repoint any view whose record a peer deleted. The kanban closes the open card when its id is gone: `if (openId && !cardById(openId)) return writeHash({ card: "" }, { replace: true });`
- Re-parse any JSON you parsed earlier.
- Re-attach any per-element setup that a re-created element lost (the writer re-injects block gutters on every render).

`detail` on `clay:sync-applied`: `{ seq, source: "peer" | "disk", by, report, conflictIds, unresolved }`, plus `etag` and `html` for disk frames. `by` is `{ id, name }` on hyperclay.com peer frames and `null` elsewhere. `report.applied`, `report.conflicts` and `report.localDiverged` describe the merge.

### 6.6 The conflict ledger and notice

Losses (where this tab's work was replaced) enter `clay.conflicts`:

- `list()`, `get(id)`, `size`, `recoveryOf(id)` (a clone of the page as it was just before the frame).
- `acknowledge(ids, { reason })` with `reason` of `accepted`, `reverted` or `reconciled`. It is the only way a record leaves. Nothing clears them automatically, and the close warning stays up while any is open.
- `claim(ids, { owner })` hides records from the built-in notice so your app can resolve them itself, then `acknowledge` them.

The built-in notice reads "Another edit replaced N changes" and offers **Revert to mine**, **Accept theirs**, **Download my copy** and a list of the edits. Revert puts the selected losses back as an ordinary local edit, then saves.

### 6.7 Presence

hyperclay.com shows a fixed avatar stack (initials in hollow squares, a "+N viewing" count) when two or more people have the file open. **There is no API**: no event, no roster, no cursor or section data. An app cannot build its own "who is here" or "X is editing this card" from it; share that through a never-saved live store instead ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)). HTML Clay and Hyperclay Local have no presence.

### 6.8 Agents

An agent edits a malleable file the way a person in another tab does.

- **Editing the file on disk** (HTML Clay, Hyperclay Local): the host notices the change and pushes a `disk` frame. The open tab merges it three ways, so the person's unsaved typing in other paragraphs survives, and an overlap goes to the ledger. Tell agents to address elements by `data-id`, never by position, and to leave chrome alone (it is not in the file anyway).
- **`clay.wire`** (`?plugins=wire`, HTML Clay and Hyperclay Local): `clay.wire.send(payload)` sends a request to a local process started with `htmlclay wire serve file.htmlclay -- my-agent`. The page saves first, so the agent reads what the person sees, and autosave pauses until the agent's edit lands as a disk frame. `run.done` resolves then.
- **`ai-edit`** (`?plugins=ai-edit`): select text, press Cmd+J, describe the change. The rewrite is previewed in place; Keep saves it, Revert discards it. Available where the host offers the `ai-edit` helper: HTML Clay, Hyperclay Local, and hyperclay.com (for the owner and team editors on a paid plan, billed to the document's AI credits).
- **The data API**: a host that announces `data-read`/`data-write` serves `/_/api/<file>`, a JSON read and write face over the file defined by a rules tag ([Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export)). `clay.readData()` and `clay.writeData()` call it from the page; `writeData` is for agents and other processes, and refuses while the page has unsaved edits.

### 6.9 Live data: `clay="live"`

Everything above moves at save speed: a peer sees your change after your next save. A live store is for state that changes faster than that, such as a game board, a score, a cursor or a timer. It is one JSON script that ClayJS holds as an object in memory. Page code changes it through ops, every tab of the document sees each change at once, and the value is written back into the file at checkpoints.

```html
<script type="application/json" merge="game" clay="live">
{"turn": "x", "cells": {"0": "", "1": "", "2": ""}, "wins": {"x": 0, "o": 0}}
</script>
<script src="https://clayjs.com/v1/clay.js?plugins=sync,live"></script>
```

```js
await clay.ready;
const game = clay.live("game");

game.on("change", render);            // { source: "local" | "remote" | "state", ops }
render();

function play(cell) {
  game.update((d) => {                // one batch, one frame, rolled back if it throws
    if (d.cells[cell]) return;
    d.cells[cell] = d.turn;
    d.turn = d.turn === "x" ? "o" : "x";
  });
}

function render() {
  const d = game.data;                 // read it like a plain object
  // ...paint the board from d.cells
}
```

**The tag.** A `<script type="application/json">` with `merge="name"` and `clay="live"`, holding a JSON object or list. The name is 1 to 64 letters, digits, `_`, `.`, `:` or `-`, and two live tags with the same name are both ignored. Write the tag into the file before people share it: a tag added later is not in the rooms of tabs that loaded before. Checkpoints add a `live-at` attribute to the tag (the room position the value was saved at, and a hash of the text). A save made while the tab is out of the room also adds `live-by` (that tab and the last update it sent), so the room does not apply those updates a second time. The room trusts `live-by` only while the value still matches the hash in `live-at`, and never on a restored version. Leave both in place when you or an agent edit the tag's JSON by hand: the room then merges your edit with the play since that checkpoint. Without it, the edit is merged over what the room last saved. A save hook (`onbeforesave`) may reformat a live tag's JSON, but must not change its value. A tag is written in the layout it was loaded with: one line, or indented when the authored JSON had line breaks. `live-format="lines"` writes each entry of each top-level object on its own line instead, so the file's version history shows only the entries that changed, which suits a large store keyed by id (the page editor's blocks).

**The API.** `clay.live(name)` returns the same handle every time.

- `game.data` is the value, read like a plain object. Writes to it become ops: `game.data.players.alice = { x: 0 }`, `delete game.data.players.bob`.
- `game.set(path, value)`, `game.delete(path)` and `game.add(path, n = 1)`. A path is a dotted string (`"players.alice.x"`) or an array (`["players", "alice", "x"]`).
- `game.update(fn)` runs `fn(data)` synchronously and sends what it changed as one batch. If `fn` throws, every change it made is undone.
- `game.on("change", fn)` and `game.off("change", fn)`. `source` is `local` (this tab), `remote` (another tab), or `state` (the value was replaced from the room or a save).
- `game.toJSON()` is a copy, `game.ready` a promise of the handle, `game.status.mode` is `fast` or `file` (below).

Two rules for the proxy:

- **Counters use `add`.** `game.data.score += 1` reads the number and writes the sum, so two tabs adding at once both write the same sum and one point is lost. `game.add("score", 1)` sends the increment, and both count.
- **Lists are written whole.** `push`, `splice` and `sort` replace the entire list, so two tabs pushing at once keep one push. An index assignment (`grid[2][3] = "x"`) changes one cell. Keep collections as objects keyed by id (`players: { "p-7f3a": {...} }`).

**What gets saved, and when.** A live change never marks the page unsaved, never starts autosave and never raises the close warning. A checkpoint writes the current value into the file 8 seconds after the first change, and again when the tab is hidden or closed. Up to 8 seconds of play can be lost, and that is the trade. The close save uses `keepalive`, which browsers only honour for bodies under about 60 KB, so a large page may lose its last few seconds. Every checkpoint is a save, with a version in the host's history. A game page needs no `autosave` attribute for its live data.

**Never-saved stores.** `clay="live ephemeral"` shares the value like any store but never writes it into the file: the tag keeps the text you authored. Use it for cursors, lobbies and presence. Anyone who can open the file can read the authored text, so keep secrets out of it.

**How it travels.** Which lane a store uses depends on the host:

- **hyperclay.com** (the `live-data` capability): every change goes to the document's room on the server, which numbers it and passes it to every editor within a network round trip. Tabs that join late, or that miss a change, fetch the room's whole state. Only one tab, the room's writer, saves the checkpoints. Viewers do not get the fast lane: they see the game at each checkpoint, through ordinary live sync. When an outside save changes a live tag (the code editor, a version restore, a device sync, an agent), the room takes the file's value and puts its own changes since the version the file came from back on top, so the edit lands and no move is lost or counted twice. An edit of a version older than the room's history is overwritten by the room's next checkpoint instead. The history covers 256 KB of changes per store, and the writer saves early when half of it is used, so this takes a restore of an old version or a writer that cannot save.
- **Tabs of one browser on HTML Clay or Hyperclay Local**: the tabs share the store at the same speed through the browser itself. One tab runs the room and saves the checkpoints. When it closes, another tab takes over with every move the room had accepted. Use this to playtest a game in several tabs.
- **Everywhere else** (another device on a local host, a browser without Web Locks): the store moves at save speed. Each incoming save replaces the value, and this tab's own changes that are not yet saved are replayed on top. A change counts as saved only when this tab's own save holding it is accepted, so an `add` counts exactly once.

`game.status.mode` is `fast` on the first two lanes and `file` on the third. In view mode a store reads normally, but writes stay in the tab and are never sent or saved.

**The page editor's own store.** A Document's blocks are a live store named `page`, and its merge state is not in the file: hyperclay.com and Hyperclay Local keep it beside the file and hand it back to an editor only while it still belongs to the article (the article's `data-rev` matches), and HTML Clay keeps none, so open tabs share it and a fresh open rebuilds it from the article. Saved files and downloads never carry it. A page changed outside the editor (the code editor, an agent, a version restore, another device, a text editor) merges into the page tabs that are open, the way a peer's edit does: each block is merged three ways against the article the change started from, so edits on both sides survive. Where both sides changed the same words, the outside change wins, and the tab offers a download of what it had. An edit beats a delete. Only a change with no article this host can trace it back to shows a reload notice, and the tab stops saving so the old article is not written back over the new one.

**When a room is lost.** A room lives in memory: a server restart, or two minutes with nobody connected, ends it. The next room starts from the last checkpoint, so up to 8 seconds of play can be gone. A change of yours that the old room may already have taken is not sent to the new one, even when its answer was lost: if the old room's last checkpoint lands afterwards, it brings that change back, and sending it again would count it twice. A change that never left the tab is sent as usual. Closing the tab that runs a local room is not a loss: the next tab takes over the room with every move.

**Load the plugin wherever a live tag exists.** A page without `?plugins=live` still leaves live tags out of the merge, so an incoming save does not update them and the next save writes the old text back.

**Limits on hyperclay.com.** A frame carries at most 128 ops and 64 KB, except that one value larger than that is sent in a request of its own of up to 5 MB, so a single change can write a value up to the store's 4 MB; the page editor splits its changes into 12 KB pieces, so a Document's size is not limited by the frame. A store holds at most 4 MB of JSON, a document at most 6 MB across at most 16 stores, which gives a Document roughly 900 KB of text that keeps compacting. One person sends at most 25 frames a second per document (bursts to 40), and ClayJS paces itself to stay under that. A change the room refuses is undone in the tab, with a warning. When the server holds as much live data as it can, a document without a room, or a change that would grow one, moves at save speed and tries the room again a minute later.

**A two-player example.** The board above plus a never-saved lobby for pointers:

```html
<script type="application/json" merge="lobby" clay="live ephemeral">{"pointers": {}}</script>
```

```js
const lobby = clay.live("lobby");
const me = crypto.randomUUID?.() ?? String(Math.random());
document.addEventListener("pointermove", (e) => {
  lobby.set(["pointers", me], { x: e.clientX, y: e.clientY });
});
lobby.on("change", drawPointers);
```

Wins are counters, so they use `add`: `game.add(["wins", winner], 1)`.

---

## 7. Editing components

### 7.1 richclay: rich text (`editable`)

`editable` on an element makes it a rich text editor in edit mode (Squire underneath, DOMPurify on paste). It is the default plugin.

```html
<div class="desc" editable><p>Two paragraphs on <b>scope</b>.</p></div>
<div class="body" editable="toolbar-on-select"><p>…</p></div>
<h1 editable="single-line">Title</h1>
```

Tokens: `single-line` (Enter does nothing, pasted blocks flatten), `no-toolbar` (shortcuts only), `toolbar-on-select` (the floating toolbar appears only for a non-empty selection: the "bubble toolbar"). Toolbar presets: `standard` (block menu with Paragraph, H1 to H3, Quote, Code block; bold, italic, underline, strikethrough, inline code, link, undo, redo, clear; bulleted and numbered lists, quote, indent, outdent), `inline`, `minimal`.

What saves: the region's own markup, with every runtime attribute, toolbar and Squire artifact stripped. Opening a page in edit mode does not change its bytes.

What it does not do, and what to build instead:

| Missing | Build it |
|---|---|
| Tables, checklists, dividers, callouts, toggles, embeds | As separate blocks outside the rich region (the writer's block model, [Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)) |
| Image insert, captions, alignment | An image block (`<figure>` with an `<img>` and an `editmode:contenteditable` caption), or `editor.squire.insertImage(src)` for inline images |
| Screenshot paste | Squire swallows image-only pastes. Listen for `pasteImage` (below) |
| Markdown shortcuts | Only `* ` and `1. ` start lists. Watch `editor.squire` `input` events and call `editor.setBlockType("H2")` for others |
| Slash menu | A keyup handler for `/` on an empty paragraph opening an `editor-ui` menu ([Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)) |
| Change callback | Auto-mounted editors cannot take `onChange`. Use `new clay.RichClay(el).squire.addEventListener("input", …)` or a `MutationObserver` |

`new clay.RichClay(el)` returns the instance already mounted on `el`. Use it to reach `squire`, `getHTML()`, `setHTML()`, `setBlockType(tag)`, `registerButton(def)`.

Screenshot paste into an upload, from the writer:

```js
new clay.RichClay(body).squire.addEventListener("pasteImage", async (event) => {
  const item = [...(event.detail?.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return;
  const src = await imageSource(file);
  if (src) insertAfter(body.closest(".block"), "image", src);
});
```

Custom toolbar buttons must be registered **per instance**, after mount; a global `RichClay.registerButton` after load does not reach editors already mounted:

```js
const editor = new clay.RichClay(el);
editor.registerButton({ id: "stamp", label: "Stamp", icon: "<svg …></svg>", run: (e) => e.squire.insertHTML("<p>Approved</p>") });
editor.options.toolbar = [...clay.RichClay.presets.standard, "stamp"];
```

Traps:

- **Mode by attribute.** `editable` is inline mode: it never sanitizes your authored markup on load. `data-richclay` without `editable` is card mode: it sanitizes in place on load with an allowlist that has no `img`, so **it deletes images on every edit-mode open**. Use `editable`.
- **Nested `editable` regions are refused.** The outer one mounts. Siblings are fine.
- **Custom elements** (tag with a hyphen) are skipped for bare `editable`; use `clay-editable`.
- **The floating toolbar is mounted on `document.body`, not in the top layer.** Inside `dialog.showModal()` or a `popover` it is unusable (shortcuts still work). Do not put `editable` inside a modal dialog. The kanban shows the card itself as a fixed overlay instead ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)).
- **Two undo histories.** Inside an `editable`, Cmd+Z goes to Squire's own stack. Outside, it goes to page undo, which never records rich text. A person who types in a rich region, clicks elsewhere and presses Cmd+Z does not undo their typing.
- **Squire's undo can roll back a peer's edit** in the same region: its history is whole-region snapshots. Keep collaborative documents in many small regions (one `editable` per block), which also limits the damage.
- **Many editors are expensive.** Each multi-line editor installs document-level listeners and its own Squire instance. Do not put `editable` on every cell of a grid; use `editmode:contenteditable`.
- **Paste is an allowlist**: tables, `<hr>`, `<details>`, `<figure>`, iframes and inline styles are reduced to text. A pasted remote image keeps its hotlinked `src`; a pasted `data:` image bloats every save.
- **Cloning an active region** copies runtime attributes. Strip them with `clay.RichClay.stripElement(clone)` (as in [Identity](https://clayjs.com/docs/guide/record/#identity)), or clone from a `<template>`.
- **`editable` is ignored in view mode**; viewers get plain markup.

#### 7.1.1 The page editor's Markdown shortcuts

`editable` regions and the page editor are different editors, and their Markdown input rules are not the same. The page editor (`plugins/page`) converts these as you type:

| Typed at the start of a block | Becomes |
|---|---|
| `# `, `## `, `### ` | heading 1, 2 or 3 |
| `- `, `* `, `+ ` | bulleted list item |
| `1. `, `1) ` | numbered list item |
| `[] `, `[ ] `, `[x] ` | checklist item, unchecked or checked |
| `> ` | toggle |
| ` ``` ` | code block, when the whole paragraph is the fence |
| `---` | divider, when the whole paragraph is the dashes |

| Typed around text | Becomes |
|---|---|
| `**bold**`, `__bold__` | bold |
| `*italic*`, `_italic_` | italic |
| `` `code` `` | inline code |
| `~~strike~~` | strikethrough |
| `[label](address)` | a link, if the address is a safe one |

An opening delimiter needs the start of the line, whitespace or opening punctuation before it, and neither delimiter may be escaped, so `\**this\**` stays literal text. Nothing converts inside inline code, and a shortcut typed during an IME composition converts when the composition ends. The delimiters are deleted and the mark is applied over the body in place, which keeps the marks the text already carried, and a block shortcut retypes the block rather than replacing it, so its `data-id` and its position survive.

**Backspace immediately after a shortcut restores the typed characters**, delimiters included, through the editor's input-rule undo: it is one history step like any other, it does not drop a peer's concurrent edit, and redo applies the shortcut again. Wait a keystroke and the shortcut is simply part of the text and Backspace deletes one character as usual.

None of this loads for a reader: the input rules, the menus and the title adapter are editor code, and a Document's view mode fetches none of them.

### 7.2 sortable: drag to reorder

```html
<div class="columns" sortable="columns">
  <section class="column" data-id="col-todo">
    <header><span class="grip" sortable-handle show-when:editmode="true">⠿</span><h2 …>To do</h2></header>
    <ol class="cards" sortable="cards">
      <li class="card" data-id="c-brief"><span class="grip" sortable-handle show-when:editmode="true">⠿</span>…</li>
    </ol>
  </section>
</div>
```

- `sortable` on a container makes its children draggable in edit mode: `<li>` children for `<ul>`/`<ol>`, all children otherwise, never `editor-ui` children.
- `sortable="name"`: every container with the same name accepts items from the others. That is cross-column drag.
- A `[sortable-handle]` inside the container (outside nested sortables) switches the container to handle-only dragging. Nested sortables are separate.
- Order is saved as child order. There is no order attribute.
- Every drop fires `clay:sorted` (bubbling) with `{ item, from, to, oldIndex, newIndex }`. In a cross-container move it fires on the source container. Read `item.dataset.id` and `to.closest(...)`, not indexes.
- `onsorted="code"` runs on drop with `this` and `evt`.
- Containers added later are bound after about 200 ms.
- `window.Sortable` is SortableJS 1.15.6. `Sortable.get(el).option(name, value)` changes an instance.

Traps:

- **Handle-only mode is decided when the container is bound.** If handles are injected later (the writer's gutters), set it yourself: `Sortable.get(blocks).option("handle", "[sortable-handle]")`.
- **One stray `[sortable-handle]` makes every other item undraggable** except by its handle.
- **`onsorting` cannot veto a move**: its return value is lost. Use `Sortable.get(el).option("onMove", (evt) => …)`.
- **Hidden template children count as items.** Keep blueprints in `<template>` outside the list.
- **Sortable leaves residue** (`draggable="false"`, `style=""`, drag classes) that saves. The `sortable` plugin strips it inside `[sortable]` lists itself, including from a save taken mid-drag; a Sortable you load and wire up yourself needs the snapshot hook in 6.6.
- A peer frame arriving mid-drag merges under the drag. Rare at autosave cadence, but possible.
- Write durable side effects of a move in a `clay:sorted` handler (the kanban logs "Moved to Doing" into the card's activity). If a record attribute must match its container (`data-status`), set it there too.

### 7.3 undo: whole-page undo

`?plugins=undo` gives `clay.undo`: Cmd+Z, Cmd+Shift+Z and Cmd+Y over DOM mutations, restoring the same live nodes.

- Mutations outside a commit close into an "Edit" step after 500 ms idle. **Wrap every command** so it is one labelled step:

  ```js
  const command = (label, fn) => (clay.undo ? clay.undo.commit(label, fn) : fn());
  command("Add card", () => list.append(card));
  ```

- `commit` must be synchronous. For async work (an upload, a fetch), await it first, then make every DOM write in one synchronous `commit`. Pausing undo across an `await` loses the mutations made before the `await`.
- Not recorded: `editor-ui`, `no-undo`, `no-watch` regions, richclay regions, and every change a merge brings in.
- Attribute and text steps are skipped if what they would restore has changed since (for example by a peer). Structural steps are not: undoing an "Add card" removes the card even if a peer has edited it since, and redo replays without checking. In a collaborative file, treat undo as safe for the person's own recent work only; if that matters, call `clay.undo.clear()` when a `clay:sync-applied` frame touches records the history refers to.
- `clay.undo.on("undo" | "redo" | "commit" | "clear", fn)`, `canUndo`, `canRedo`, `history`.

Traps:

- **It takes Cmd+Z in every text field**, including inputs it does not record (a non-persist input), so their native undo is lost.
- History is per tab, capped at 100, and not saved.
- Undoing a delete re-inserts the original node even if a peer re-created an equivalent; dedupe by `data-id` on `clay:sync-applied` if that matters.

### 7.4 Plain contenteditable

For titles, labels, list items and table cells, use `editmode:contenteditable` with `plaintext-only` ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers)). No toolbar, no Squire, no formatting, cheap at any count. Handle Enter yourself (blur, or create the next item as the writer's to-do list does).

### 7.5 upload and quickcrop

`clay.upload(file, { onProgress, signal })` posts a file you supply to the host and never rejects. **It is not a file picker** and inserts nothing. Supply the `File` from an `<input type="file">`, a drop or a paste, and write the URL yourself.

```js
async function imageSource(file) {
  const result = await clay.upload(file);
  if (result.ok) return result.uploads[0].url;
  if (result.code === "unsupported") {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  clay.toast?.(result.msg || "Upload failed", "error");
  return null;
}
```

- Embed a `data:` URL **only** on `code === "unsupported"` (the host does not store files). On `forbidden` (the host stores files, but not for this person on this document), `too-large`, `unsupported-type`, `payment-required` and other failures, write nothing: embedding a refused 20 MB photo would ride every future save.
- Other codes: `unauthorized`, `forbidden`, `timeout` (may have landed; retrying is safe), `aborted`, `network`, `bad-response`.
- Events: `clay:upload-start`, `clay:upload-progress`, `clay:upload-done`, `clay:upload-error`.
- Host limits: HTML Clay and Hyperclay Local 25 MB per file; hyperclay.com 10, 20 or 100 MB by plan.
- The URL is a host path, `/_/uploads/assets-<document>/<name>`. Write it exactly as returned: every address of the host serves it, so it survives renaming or moving the document. Never rebuild it from parts.
- Uploaded assets on hyperclay.com are publicly reachable by URL even when the document is private.

`clay.quickcrop(file, { aspect, maxWidth, maxHeight, type, quality })` opens a crop dialog and resolves `{ blob, dataURL, width, height }`, or `null` on cancel. It does not upload. Pass the blob to `clay.upload`, wrapped as a `File`. One cropper at a time; it sets `body.style.overflow = "hidden"` while open, which a save at that moment writes into the file.

The file picker for an image block lives in chrome: `<input type="file" accept="image/*" hidden>` inside the `editor-ui` wrapper, clicked by your menu.

### 7.6 clay-ui: toasts and dialogs

- `clay.toast(message, type)` with `success`, `error`, `warning`, `info`. The message is text, never markup. No handle to dismiss early.
- `clay.toastPersistent(message, type)` stays until closed.
- `clay.confirm(prompt)` resolves on confirm and **rejects with `undefined` on cancel**. Always pass a rejection handler: `clay.confirm("Delete this card?").then(del, () => {})`. `try { await clay.confirm(...) } catch (e) { e.message }` throws inside the catch.
- `clay.ask(prompt, onYes, defaultValue)` resolves with the typed text.
- **Every dialog prompt and title is HTML**: `clay.confirm(prompt, extraContent)`, `clay.ask(prompt)`, `clay.tell(title, ...paragraphs)` and `clay.snippet(title, code)` all insert their strings as markup. ``clay.confirm(`Delete "${card.title}"?`)`` runs whatever markup a collaborator typed into the title. Keep prompts constant, or escape record text first.
- `clay.modal` is a single modal with `title`, `html`, `yes`, `no`, `onYes`, `open()`, `close()`. Every setting resets on close, and opening any dialog rejects the one already open.

**Never pass a live record element as `clay.modal.html`.** The modal moves the node into its runtime-only root and removes that root on close: the element is gone from the page, and a save during the dialog drops it from the file. Pass a form built from a template, and write values back to the record on yes. For card detail, prefer the record-as-modal pattern ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)).

ClayJS's own UI (notice, indicator, dialogs, toasts) is drawn with inline, reset styles, so page CSS cannot restyle it.

### 7.7 clay-events, clay-dom and All

Useful pieces, each with a trap:

- **`onclone="code"`** runs on every element clone, with `this` the clone. Good for minting a fresh id on duplicate. It does not run for `template.content.cloneNode()` (a fragment): clone `template.content.firstElementChild` instead. It also runs for library clones, so keep it pure.
- **`onclickaway="code"`** closes a menu on outside click. It runs on every outside click, even when already closed.
- **`onclickchildren="code"`** runs with `this` as the clicked direct child: tab bars and segmented controls.
- **`onmutation` and `onglobalmutation`** run code when the subtree or the page changes. **A handler that writes into what it watches loops forever**, even writing the same text. Guard every write: `if (this.textContent !== n) this.textContent = n`. They do not fire for merged peer changes.
- **`onrender`** runs once per element at load and again whenever the element is inserted, including every drag and every merge re-insert. Keep it idempotent.
- **`el.nearest.NAME`** searches outward through siblings and cousins, so in a list it reads (and with `val`/`text` assignment writes) a neighbour's field when the record lacks one. For record-scoped access use `el.closest("[data-id]").querySelector(...)`.
- **`el.hide()`, `el.show()` and `All(...).css()`** write inline styles that save. Use clay-options or a runtime stylesheet.
- **`cycleAttr`** cycles through values in alphabetical order across the whole document. Write status cycles explicitly: `const order = ["todo", "doing", "done"]; el.dataset.status = order[(order.indexOf(el.dataset.status) + 1) % order.length];`
- **`All`**: `All.name` and `All.length` are the function's own properties, so write `All("[name]")`. `sortBy("data-amount")` compares strings; pass a function.

Plain delegated `addEventListener` handlers on `document`, as in the examples, avoid every one of these traps and are the default.

### 7.8 Libraries that rewrite content: highlighting, math, diagrams

Prism, highlight.js, KaTeX and Mermaid replace source text with generated markup when they run. In edit mode that goes wrong two ways:

- **The output is saved.** If the library runs after ClayJS has read the page, its spans or SVG count as an edit: they start an autosave and land in the file.
- **Sync wipes it.** An outside change brings in the plain source, which replaces the decorated markup in the open page. The library does not run again, so the decoration is gone until a reload.

For fixed content, such as code samples in a docs page, mark the block `clay="freeze"`: sync never touches its contents. For content people or agents edit, keep the plain source as the record and render the decorated version into a `clay="editor-ui"` mount, and redraw it on load and on `clay:sync-applied` ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)).

### 7.9 OverType: a markdown editor

For a notes or journal app where markdown is the format, OverType (`https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js`) is a textarea under a styled preview. **The textarea is not the record.** Keep each entry's text in a text element of the record, put the editor in a `clay="freeze"` region outside the saved records, and bind it to the open record with `clay.bindText` (`?plugins=bind-text`):

```html
<article data-id="a"><pre><code class="entry-body"># Morning

Walk by the river.</code></pre></article>

<div id="writer" clay="freeze">
  <div class="overtype-container"><div class="overtype-wrapper"><textarea class="overtype-input"></textarea></div></div>
</div>
```

```js
const binding = clay.bindText(document.querySelector('#writer textarea'), {
  onWrite: (code) => { code.closest('article').dataset.updated = Date.now(); },
  onShow: () => overtype?.updatePreview(),
  onConflict: (typed) => note('Someone changed the same words while you were typing.', typed),
  onGone: () => note('This entry was deleted somewhere else.'),
});
binding.open(document.querySelector('.entry-body'), {
  key: 'a',
  resolve: () => document.querySelector('[data-id="a"] .entry-body'),
});
```

Three reasons the record stays text and the textarea stays outside it. A `<textarea>` merges as one value, so two people editing different paragraphs of one textarea collide and one of them loses their words; a text element merges word by word, so both edits land. A library writes attributes onto the element it decorates: OverType stamps its own `id`, `autocomplete`, `spellcheck` and Grammarly attributes onto a textarea, and inside a record those save into the file and report the page dirty at boot. And the file is smaller and readable without JavaScript: an `<article>` holding a `<pre><code>` shows in any browser and to any reader, where a `<textarea persist>` shows nothing until the library runs.

`bindText` returns `{ open, close, flush, current, attach, composing }`. Every `input` is written into the record at once, so a save captures it as that record's text. A change the editor did not make (a peer's merge, a restored draft, a JSON API write) is shown in the textarea with the caret kept. During an IME composition nothing is written or shown, and when it ends both edits apply unless they touch the same stretch of text, where the record keeps the other person's words and `onConflict` gets what was typed. Opening the same `key` after a merge replaced the record's element rebinds without touching the textarea; opening another `key` flushes the open record and shows the new one with the caret at the start. Keep one OverType instance for the life of the tab, normalize OverType's layout state in an `onbeforesave` on the container, and call `binding.attach(textarea)` if a library ever swaps the element. A journal built this way keeps entries as `<article data-id>` records, clones its chrome from a `<template>`, and paints the open entry with a runtime stylesheet.

### 7.10 Attributes from older Hyperclay files

Older Hyperclay files can carry attributes ClayJS ignores: `movable`, `movable-handle`, `prevent-enter`, `autosize`, `ajax-form`, `ajax-button`, `send-message`, `upgrade`. Replace them with a few lines of code (`prevent-enter`: a keydown handler; `autosize`: CSS `field-sizing: content`; `movable`: pointer events writing `data-x`/`data-y`; `send-message`: the `message` plugin, [message: contact forms](https://clayjs.com/docs/guide/components/#message-contact-forms)). Old saved `<html editmode="false">` and hand-written `option-visibility-styles` style tags are dead weight; ClayJS strips the root attributes on the next save.

### 7.11 sap.js: records, views and totals in markup

`sap.js` (a satellite, also published standalone as `@panphora/sapjs`) is a reactive attribute layer whose only store is the DOM. Every change runs one pass: it reads the app out of the live page, computes `calc:` fields in dependency order, and writes only the paints that changed. It is the way to build the reactive parts of a malleable document app: totals, filtered and sorted views, a form that adds records, an editor for the selected record.

**Before building an app with sapjs, read the sapjs guide: [saphtml.com/guide.html](https://saphtml.com/guide.html) (Markdown: [saphtml.com/guide.md](https://saphtml.com/guide.md)).** It covers designing records, `each=` views, the three kinds of state, detail editors and dialogs, three complete tested apps, and a trap table. The attribute reference is [saphtml.com/llms.txt](https://saphtml.com/llms.txt). This section covers only what is specific to running sapjs inside ClayJS.

```html
<main id="app" sap>
  <output calc:total="sum(state.txns, 'amount')" text:usd2="state.total">$900.00</output>
  <table>
    <tbody items="txns">
      <tr item template data-id=""><td><input type="number" step="0.01" bind="amount" persist></td></tr>
      <tr item data-id="t-k1"><td><input type="number" step="0.01" bind="amount" persist value="900"></td></tr>
    </tbody>
  </table>
</main>
<script src="https://clayjs.com/v1/sap.js"></script>
```

The vocabulary in one breath: `sap` marks an app root; `items="list"` holds `[item]` records and `[item][template]` (or a shared `<template items="list">`) is the blueprint; `bind` two-way binds a control or a text leaf; `state="data-due data-done:presence"` declares fields stored as attributes; `calc:`, `text:fmt`, `show`, `class:`, `css:`, `attr:` and `effect` paint; `each="expr"` renders a view of any array whose rows edit the records they show; `detail="LIST by KEY"` projects one record into a panel or a `<dialog>`; actions are `trigger-add`, `trigger-remove`, `move:`, `sort:`, `set:` and `confirm=`; `Sap(el)` is a write-through proxy and `Sap.batch(label, fn)` makes one undo step. Done means no `sap ✗` console line and `Sap.status().ok === true`.

How it fits ClayJS:

- **The core loads by itself.** On any page with a `[sap]` root, ClayJS loads the sapjs core (the `derive` plugin, [Plugins](https://clayjs.com/docs/guide/loading/#plugins)). The core covers records (`bind`, `state=`, `items` and `item`) and paints (`text`, `text:fmt`, `show`, `attr:`, `class:`, `css:`, the `show-when:` family). Markup that needs full sapjs (`calc:`, `each`, `detail`, `effect`, `invalid`, the actions, `Sap(el)`) halts with `E50`, which names it. Load `https://clayjs.com/v1/sap.js` for full sapjs; the markup stays the same, and full sapjs takes the page over from the core.
- **Painted values are derived.** Comparisons, the dirty check, autosave, undo and every merge input leave out what a paint owns: the attribute an `attr:` names, the one class token a `class:` names, the `--` property a `css:` names, the children of a `text` element, and `hidden` under `show`. A paint never makes the page unsaved, and two tabs that change different records while repainting the same total end with the right total and no conflict.
- **Ownership is read from the markup.** It comes from the element's own attributes, never from evaluating an expression, so it holds the same in the live page, a save clone and a frame from disk. `attr:` never owns `id`, `data-id`, `class`, `style`, `value`, `checked`, `selected`, or a name the same element declares in `state=`: those stay record.
- **Repainted before anything records a baseline.** The engine mounts in a boot phase, after frozen regions record their markup and visitor drafts restore, and the boot baseline settles on the painted page. After every merge it repaints right away, before the saved, peer and disk baselines and before `clay:sync-applied`.
- **Painted values are still saved,** so the file shows them without JavaScript. When a repaint leaves the file's painted values different from the page's (an agent wrote a record and left the old paint), one clean tab with autosave on saves the painted page after a short random delay, and other tabs that repainted the same frame see that save and skip theirs.
- **Agents and `api` rules read and write records, never paints.** Point a rule at the `bind` element or a `state=` attribute (`"state": ".state"`), never at a painted attribute: a painted value on disk can lag the record until a tab repaints and saves it.
- Rows of an `each=` view carry `clay="editor-ui"`, so views never save or sync.

A status that sets text, colour and a label, with the state stored once:

```html
<main sap>
  <table><tbody items="steps">
    <tr item class="step" data-id="s1" attr:data-state="item.state">
      <td><span class="state" bind="state" attr:aria-label="'Status: ' + item.state">accepted</span></td>
    </tr>
  </tbody></table>
</main>
```

`tr[data-state="accepted"] .state { background: var(--ok) }` colours it, and `htmlfile data --write` or the JSON API writes only `.state`.

Rules for sapjs in a malleable file:

- **Store each record once, as an element; derive everything else.** Counts, totals and card faces computed only from records are ordinary saved content: paint them into the record markup and ship the file pre-painted, so the first pass writes nothing (`mount writes 0`). A stale painted value repaints at mount; under ClayJS the paint heal saves it, and on other hosts sapjs logs `W30` and the value goes out with the next real save.
- **Per-tab values go in `clay="freeze"`**: anything from today's date, the locale, the URL hash, the search box or runtime data. Freeze saves an element's contents as they were at load, so put the per-tab values inside the frozen element, or fill it from an `effect`, which re-runs every pass.
- **Per-tab state is `transient`** (`state="q:transient open:transient"`, and `transient` on the bound search input), or the URL hash through `clay-router.js`.
- **Filter with an `each=` view, or a frozen stylesheet**, never with `show=` on saved records: `show=` paints `hidden`, which ClayJS treats as derived, so it never syncs, but a save still writes the saving tab's filter into the file.
- **Every `detail=` panel and `<dialog>` sits inside a `clay="freeze"` wrapper.** Its controls are painted with the open record's values; outside freeze they would save a second copy. Not `editor-ui`, which removes the element from the file. sapjs warns `W31` for a dialog without the wrapper.
- **Give records a `data-id`**, and `data-id=""` on blueprints: `$add` and `trigger-add` mint fresh ids. Live sync pairs elements by it.
- **`persist` on bound inputs inside records**, so typed values reach the attributes a save captures.
- **Undo and redo restore `persist` controls' live values** from their attributes, and a sync merge does the same, so sapjs reads what the file says. Controls without `persist` are not restored; give them `persist` or re-sync them yourself.
- **`viewmode:` attributes log `W03`** (unknown attribute) in sapjs, for example [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers)'s `viewmode:readonly`. The warning is harmless, but it makes a "no warnings" check fail.
- **Hide blueprints in your own CSS** (`[item][template] { display: none }`); sapjs's own rule arrives only with the script. Sapjs also adds `[hidden] { display: none !important }` page-wide.
- A pass is batched: after a write, call `Sap.refresh()` before reading painted output. Expressions compile with `new Function`, so a Content Security Policy without `unsafe-eval` breaks them.

### 7.12 The CMS, in passing

`?plugins=cms` turns a page into a content-managed page: a JSON rules tag maps field names to selectors, and an "Edit content" button opens a sidebar form (or edits text in place) that writes straight into the DOM.

```html
<script data-rules-name="cms" data-rules-version="1" type="application/json">
{ "title": ".page-title", "intro": "p.intro", "hero": "img.hero@src", "plans": [".plan", { "name": ".name", "price": ".price" }] }
</script>
```

It fits content sites: landing pages, menus, pricing, FAQs, team pages, where the layout is fixed and a non-developer changes copy and images. It does not fit apps where editing is the product: its form is a separate surface from the content, new list items clone the first item's attributes (including its state), and rich text inside lists is flattened in the sidebar. A file can use both: the CMS owns the header copy, the app owns `<main>`, and the rules never reach into the app's region. Give every list that can become empty a `cms-template` seed hidden by CSS, not by the `hidden` attribute (which is copied into every new item). Add `sortable` to the plugin list for drag in the sidebar.

The rules tag can declare which editor opens: `data-cms-view="inline"` edits text where it sits and opens small popovers for everything else; no attribute (or `"sidebar"`) opens the form in a side panel. The "Edit content" button opens whichever the page declares.

The CMS also edits how a page looks. A rule ending in `@--name` reads and writes one CSS custom property in an element's `style` attribute, so `"accent": "html@--color-accent"` with `a { color: var(--color-accent) }` in your CSS gives the owner a color picker (any `--color-*` name gets one, any `--font-*` name gets a font list of 40 Google Fonts, and the CMS keeps one `<link data-hcms-fonts>` loading exactly the fonts in use). For a layout choice, put `data-hcms-component:data-layout="variant"` and `data-hcms-options:data-layout="1:cols-1 2:cols-2 3:cols-3"` on a section and key your grid CSS on `[data-layout]`: the owner gets icon tiles, and the choice writes only the attribute. Style fields on `html`, `body` or `:root` gather in a "Page style" group at the top of the form.

---

### 7.13 message: contact forms

`?plugins=message` sends a visitor's form to the document's owner. On hyperclay.com the owner gets it by email and in their messages.

```html
<form message-form="Thanks, I'll reply soon">
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <button>Send</button>
</form>
```

- On submit the fields go as JSON to the host's `/_/message`. The form resets, the attribute's text shows as a toast, and the form fires `clay:message-sent` or `clay:message-failed` (`detail` is `{ ok, error }`). Call `event.preventDefault()` on it to draw your own confirmation instead of the toast.
- A form whose `action` is `/_/message` is taken over the same way, so a hand-written `<form method="post" action="/_/message">` works once the plugin is loaded.
- `clay.message.send(data)` sends from your own code. It resolves `{ ok, error }` and never rejects.
- **The bot check is invisible and needs the plugin.** When the visitor first focuses or types in the form, the plugin fetches a one-time token from `/_/form-token`; the host refuses a message without one. A form posted without the plugin, or with JavaScript off, gets an error, never a silent drop.
- Field names are what the owner reads (`**email**: ...`). Do not name a field `formToken` or `formSignals`.
- A submit handler of your own that calls `preventDefault()` keeps the form to itself; the plugin leaves it alone.

## 8. Structuring an app

### 8.1 The record container

One container in the saved document holds every record, with `data-id` per record and fields as attributes, text or persist controls. Shape it by the primary editing dimension:

- **Board-first** (kanban, pipeline): records live inside their column's list. `sortable` gives cross-column drag; the column a card sits in is its status.
- **Table-first** (finance, CRM contacts, inventory): records are `<tr data-id>` rows in one `<tbody>`. A board, if any, is a projection.
- **Document-first** (writer, wiki page): records are blocks, siblings in one `sortable` container ([Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)).

Never store a record twice. A JSON mirror of DOM records, or a rendered copy beside a model, drifts the first time a merge or a hand edit touches one of them.

### 8.2 Chrome

Author chrome in the file and hide it from viewers with `show-when:editmode="true"` ([Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options)). It needs no script, it is in place before ClayJS loads, and viewers never see it. The file carries its markup, which is harmless as long as nothing changes it.

Use `clay="editor-ui"` when hiding is not enough:

- **A script changes it after load.** Counts, summaries, status text, a filter bar that reflects its state. (A selection or an open state on a saved element is `ephemeral` instead, 5.7.) In a saved element each of these changes is an edit: it starts an autosave, adds an undo step, is sent to peers and can conflict with theirs. Inside `editor-ui` none of that happens.
- **It is drawn from data.** Charts, canvases and grids rendered from the record.
- **It holds per-tab state.** The open card, the current view, the style that paints them ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).
- **Viewers must not receive it.** The saved file has to be clean HTML without the controls.

An `editor-ui` element is removed from every save, so it cannot be authored in the file. Clone it from a `<template>` into one `clay="editor-ui"` wrapper after `clay.ready`:

```js
const chrome = document.createElement("div");
chrome.id = "chrome";
chrome.setAttribute("clay", "editor-ui");
chrome.append(document.getElementById("chrome-tpl").content.cloneNode(true));
board.querySelector(".board-head").append(chrome);
```

Chrome may sit inside the record container (the kanban puts its filter in the board header): `editor-ui` removes it wherever it is. Per-item controls that never change, such as a grip or a remove button, are authored in the item's `<template>` with `show-when:editmode="true"`. Per-item controls a script manages (the writer's block gutter, a list's menu button) are inserted into each item as their own `editor-ui` element and re-inserted by `render()` when missing, so items added by a peer get theirs too. A per-item value computed from the record, such as a count, is not chrome: it is saved content ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)).

Edit-only chrome lives in the same wrapper with `show-when:editmode="true"`, or is not built at all in view mode (`if (clay.isEditMode) …`).

### 8.3 Per-tab state

| State | Where | Why |
|---|---|---|
| Which card or entry is open, the filter, search text, current view, sort | URL hash: `#card=c-brief&q=pricing` | per tab, survives reload, shareable, Back closes the card, never saved or synced |
| Collapsed sections, column widths, density, last opened entry | `clay.storage.local.get(key)` / `set(key, value)` / `remove(key)` | per device and viewer, scoped to this file's path; `clay.storage.session` instead lasts one tab |
| Selection, hover, drag state, open menu | `ephemeral` on the element ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)), memory, or chrome DOM | transient, never saved or synced |
| Pointers, lobbies, who is looking at what, shared live but never saved | a never-saved live store ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | every tab sees it at once, the file never holds it |
| A default view visitors land on, WIP limits, column names, label definitions | attributes on a settings element in the record | genuinely part of the document |

For state on one element, such as the selected card, use `ephemeral` ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)). **Paint state that comes from the hash with a runtime stylesheet** inside chrome, rewritten from the hash, instead of toggling classes or attributes on records:

```js
const rules = [];
if (openId) {
  const sel = `.card[data-id="${CSS.escape(openId)}"]`;
  rules.push(`${sel}{position:fixed;z-index:20;top:6vh;left:0;right:0;margin:auto;width:min(560px,92vw);max-height:88vh;overflow:auto}`);
  rules.push(`${sel} .detail{display:block}`, `#chrome .backdrop{display:block}`);
}
setText(document.getElementById("view-state"), rules.join("\n"));
```

Nothing on a record changes, so opening a card or filtering never makes the page dirty and never reaches a peer. The kanban and skeleton tests check exactly that.

When a view switch must use clay-options on a saved ancestor attribute, normalize it out of every snapshot so it stays tab-local:

```html
<main id="app" view="board" onbeforesnapshot="this.setAttribute('view', 'board')">
```

Never put per-viewer state on `<html>` or any record element without that: it autosaves, syncs to every collaborator and lands in version history.

`clay.storage` keeps JSON under `clay:doc:<location.pathname>:<key>`, so two documents on one subdomain never share a key. Without it a per-document key is hand-built from the path, and every document's app collides with the next one's. `session` survives a reload and is copied into a duplicated tab, so it cannot keep one tab's state out of the next. When the browser blocks storage, every call still works from memory for the life of the tab and `set` returns `false`: save the value somewhere that outlives the tab if the return is `false`.

### 8.4 Derived values

Pick by whether the saved file must show the value:

- **Computed only from the records** (counts, progress badges, totals, a card's face): ordinary saved content. Write it into the record markup, ship the file pre-painted, and recompute on every change. With sap this is just a paint ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)), and ClayJS treats it as derived: merges leave it out and the engine repaints it from the merged records, so two tabs that changed different records end with the right value and no conflict. Hand-written derived text in saved content does not get this; give it `no-dirty`. The starter Kanban paints its list counts and card faces this way.
- **Different per tab** (search results, which entry is open, "overdue" against today's date, OS shortcut labels, names loaded from the people plugin): write it inside a `clay="freeze"` scratchpad ([Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute)). The element saves and syncs; its contents never do.
- **Pure UI** (buttons, menus, handles): `editor-ui`, created from a `<template>` ([Chrome](https://clayjs.com/docs/guide/architecture/#chrome)).
- **Optionally, `no-dirty`** for a computed value the saved file shows: it saves with the next real edit, never counts as an edit itself, and remote wins under sync. Apply the [Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync) workaround. The finance tracker does this.
- **Only in the saved file**: compute it into the save clone with `clay.addDocumentTransform`, never the live page.

Always write derived text through a guard, because writing the same text is still a mutation:

```js
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
```

Recompute inside `clay.effect(render)`, which covers record mutations, merges, undo and redo ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)), and call `render()` from a `hashchange` listener when the hash affects the view.

With sapjs, every derived value here is a paint. sapjs recomputes on record mutations and `clay:sync-applied` by itself, and on hash changes only through `clay-router.js` (`clay:route`); an app with its own hash format keeps a `hashchange` listener that calls `Sap.refresh()`. See [sapjs guide section 6](https://saphtml.com/guide.html).

### 8.5 Detail views: the record is the modal

Keep a record's detail fields **inside the record element**, hidden on the card face by CSS, and show the record itself as an overlay with the runtime stylesheet from 9.3.

```html
<li class="card" data-id="c-brief">
  <span class="grip" sortable-handle show-when:editmode="true">⠿</span>
  <h3 editmode:contenteditable inert-contenteditable="plaintext-only">Write the launch brief</h3>
  <div class="detail">
    <div class="desc" editable><p>Two paragraphs on <b>scope</b> and audience.</p></div>
    <ul class="checklist">…</ul>
    <ol class="activity"><li data-at="2026-10-07">Created</li></ol>
    <footer class="card-actions" show-when:editmode="true">…</footer>
  </div>
</li>
```

```css
.detail { display: none }
```

Why this beats a dialog with a copy:

- There is no copy, so nothing to write back and nothing to lose.
- The detail moves with the card when it is dragged, and merges per card under sync.
- A peer's edit to the open card appears in place, with your caret kept.
- richclay's body-mounted toolbar works, because nothing is in the top layer. `showModal()` would also write `open` into the file.

Open on a click that is not on an editable field, a handle, an input or a link. Close on the backdrop, Escape (unless typing) and Back. When a peer deletes the open record, `render()` finds it gone and clears the hash. Caveat: `position: fixed` breaks inside an ancestor with `transform`, `filter` or `contain`.

When a dialog must aggregate several records, render it into `editor-ui`, write each change back to its record by id, call `clay.markDirty()` per edit if the record is not written immediately, and re-render it on `clay:sync-applied` without disturbing the focused field.

**Half-typed text in a detail field outlives the view.** A comment box or a description being edited sits in chrome (`clay="editor-ui"` or `clay="freeze"`) and carries `unsent="<name>"`. clayjs keeps its value per record (the nearest `[data-id]`) and name in this tab, outside the file: close the detail, take a sync redraw, reload, and the text is back, with the close warning on until it is sent.

```html
<div class="detail" clay="editor-ui">
  <textarea class="comment" unsent="comment" placeholder="Add a comment"></textarea>
  <button data-action="send-comment">Send</button>
</div>
```

- The attribute is only a marker in the file: the region is chrome, so no save, sync frame or undo step ever carries the text.
- The restore runs after the code that rebuilt the detail (a `MutationObserver`, not a microtask), so the view's own `openDetail` can clear and refill the field in the same task. To react to it, listen for `clay:unsent-restored`, which bubbles from the control with `detail: {base, current, stale}`: `stale` is true when the record's saved value changed since the person started typing, so the view can say so instead of silently overwriting.
- Send and cancel call `clay.unsent.clear(input)`. Typing the text back to what the record already holds, or emptying it, drops it too, so the warning goes without an explicit call.
- `clay.unsent.size` and `clay.unsent.list()` (`{record, name, base, text}`) say what is kept, and `clay:unsent-changed` fires on `document` with the count.

With sapjs, the record-as-modal pattern works unchanged over `items=` records, and a plain-field editor can be a `detail=` panel or `<dialog>` instead: see [sapjs guide section 7](https://saphtml.com/guide.html).

### 8.6 Commands

A command is a function that changes the record once:

```js
const actions = {
  "add-card"(button) {
    const card = fromTemplate("card-tpl");
    card.dataset.id = newId("c");
    logActivity(card, "Created");
    command("Add card", () => button.closest(".column").querySelector(".cards").append(card));
    focusText(card.querySelector("h3"));
  },
  "delete-card"(button) {
    const card = button.closest(".card");
    clay.confirm("Delete this card?").then(() => {
      command("Delete card", () => card.remove());
      writeHash({ card: "" });
    }, () => {});
  },
};
const editOnly = new Set(["add-card", "delete-card"]);

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (editOnly.has(button.dataset.action) && !clay.isEditMode) return;
  actions[button.dataset.action](button);
});
```

- Build new elements off-document (fill, id, log), then insert once inside the commit.
- One delegated click listener on `document` for all actions. It survives merges that recreate elements.
- Write activity entries from the command that made the change, never from a mutation observer, which would also log peer changes and undo replays.
- Bulk inserts (an import of hundreds of rows) cost one mutation record per inserted element. Insert a fragment once rather than row by row, inside one commit or `Sap.batch`.

**Deleting: soft delete is `clay.trash`.** `card.remove()` above deletes for good. A delete a person might want back, or one a peer might be editing at the same moment, is an attribute instead: a record is in the trash while it carries `data-deleted-at`, and the record keeps its place, its id and its content.

```js
const item = button.closest("article.entry");
const { undo } = clay.trash(item);          // stamps data-deleted-at, fires clay:trashed
clay.toastPersistent("Moved to Trash", "info", {
  actions: [{ label: "Undo", onClick: () => { undo(); clay.toastPersistent("Restored", "info"); } }],
});
```

- `clay.trash(el, {at})` stamps the timestamp (`at`, or now), `clay.trash.is(el)` asks, `clay.trash.restore(el)` removes the attribute and fires `clay:restored`, and `clay.trash.purge(el)` removes the record for good. Both events bubble from the record.
- Because a delete is an attribute change, a peer editing the same record at that moment keeps their edit and the delete merges with it, and Undo restores the attribute instead of an old copy of the record. `card.remove()` has neither.
- Leave trashed records out with a rules selector, `"article.entry:not([data-deleted-at])"`, or keep them in the list and show a `deletedAt` field (`Date.parse(el.dataset.deletedAt)`) for a Trash view. Never remove records to filter.
- Readers without JavaScript get the raw file, so hide trashed records there too: `<noscript><style>article.entry[data-deleted-at]{display:none}</style></noscript>`.
- The undo toast stays yours: `clay.toastPersistent(message, type, {actions})` takes the Undo button where clay-ui is loaded, and an app with its own toast keeps it.

### 8.7 Filters and view switching

- **Filter by hiding** records with a runtime stylesheet (skeleton, kanban), or with sapjs through an `each=` view or a frozen stylesheet ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)). The finance example still uses sap `show=` plus snapshot normalization, an older pattern: `show=` writes `hidden` into saved records. Never remove records to filter.
- **Switch layouts with CSS** over the same records where possible: a list view can be the board with `display: contents` on columns.
- **Projection views** (a table of all cards, a calendar, a due-today list) render into an `editor-ui` container and rebuild on record mutation, `clay:sync-applied` and `hashchange`. Edits made in a projection write to the record by id.

With sapjs, a projection view is an `each=` attribute, and its rows edit the records they show by themselves: see [sapjs guide section 5](https://saphtml.com/guide.html).

### 8.8 Computed totals

Plain JavaScript into `editor-ui` ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) for a count or two. Sapjs for anything with arithmetic across rows, categories and formats ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup), and the expense tracker in sapjs guide section 9). Store money as integers or as plain numbers in `value` attributes, never as formatted strings.

### 8.9 Import and export

Export reads the record, import writes it, and both buttons live in chrome. The finance tracker's export:

```js
const rows = Sap(app).txns.map((t) => [t.date, t.memo, t.cat, t.amount]);
const blob = new Blob([toCSV([["date", "memo", "category", "amount"], ...rows])], { type: "text/csv" });
const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "transactions.csv" });
link.click();
URL.revokeObjectURL(link.href);
```

Without sap, read the record with `clay-data`'s `clay.extractData(rules)`, which returns strings and skips `editor-ui` and `no-data` regions:

```js
await clay.loaded.data;
const { rows } = clay.extractData({ rows: [".txn", { id: "@data-id", date: ".date", amount: ".amt", memo: ".memo" }] });
```

`clay.applyData({ rows }, { rules })` writes a whole list back: it grows and shrinks the list to match and refuses unknown keys, scripts and event handlers without a partial write. To append, pass the existing rows plus the new ones. It pairs incoming rows with existing elements by content and order, **not** by an `id` field: reorder the rows and edit them in the same call, and an element can be rewritten as a different record while keeping the old record's unexposed attributes. When identity matters, update records yourself: find each element by `data-id`, write its fields, and append new ones from a template.

ClayJS has no CSV parser. The finance tracker has a 20-line RFC 4180 parser (quoted fields, doubled quotes, CRLF) and imports with sap:

```js
Sap.batch("Import CSV", () => {
  for (const r of body) {
    const row = Sap(app).$add("txns");
    row.date = pick(r, "date");
    row.memo = pick(r, "memo");
    row.cat = pick(r, "category");
    row.amount = Number(pick(r, "amount").replace(/[$,]/g, "")) || 0;
  }
});
```

A rules tag with `data-rules-name="api"` gives agents and the host's data API the same shape your export uses.

### 8.10 Starting the app once

A live-sync merge can re-insert an inline script, which runs it again: every listener doubles and every chrome element appears twice. Start the app with `clay.start`. It runs its function once per page, after `clay.ready`, and a repeat call does nothing:

```js
clay.start(() => {
  …
});
```

A page with more than one app script names each one so they do not share a slot: `clay.start("board", fn)`.

### 8.11 Size

Every save captures and serializes the whole document, every change check captures it again, and every peer merges the whole document per accepted save. Measured in jsdom and scaled to a browser (estimates):

| Records (about 425 bytes each) | File size | Capture per check | Full save | Peer merge |
|---|---|---|---|---|
| 300 | 128 KB | ~10 ms | ~25 ms | ~10 ms |
| 1,500 | 640 KB | ~55 ms | ~140 ms | ~60 ms |
| 3,000 | 1.3 MB | ~120 ms | ~300 ms | ~190 ms |
| 6,000 | 2.6 MB | ~250 ms | ~650 ms | ~400 ms |

Up to about 1,000 records feels instant. From 1,000 to 3,000 there is a visible hitch at each save. Past about 3,000 records or 1.5 MB, autosave stalls typing and peers lag. Hosts cap a save at 5 MB (hyperclay.com), 20 MB (Hyperclay Local) and 50 MB (HTML Clay). Design for archiving: one file per year, a hidden archive section that can move to another file, or one file per project.

### 8.12 Styles a script writes

Use `clay.style` when a script owns CSS that should stay in the saved document. The saved style paints the next load before the script runs. When the script runs, it refreshes that same tag with its current CSS:

```js
await clay.ready;
clay.style("app-colors", ".status { color: blue; }");
```

The name identifies a `<style data-name="app-colors" clay="no-dirty">` in the document's head. A repeated call updates the existing tag in place. Refreshing it does not add an undo step, start an autosave, or raise the close warning. The next real save includes the current CSS. On the first load, before any save has carried the tag, the script creates it.

The one-argument form keeps an external stylesheet link current:

```js
await clay.ready;
const link = clay.style("/app.css?v=2");
```

If the saved file has `/app.css?v=1`, this updates that link's `href` to `/app.css?v=2`. Matching uses the URL's origin and path, ignoring its query and fragment. The link is also `no-dirty` and travels with the next real save. Both forms return the element synchronously; the link form does not wait for the stylesheet to load. Both work in edit and view mode.

Use `clay="editor-ui"` instead for CSS that viewers must not receive or that represents per-tab state, such as a temporary filter. Those styles are stripped from saved HTML. `clay.style` is for CSS that belongs in the file; changing its name on every load creates another saved tag. Adding or rewriting a plain style tag without `no-dirty` can raise the leave warning even though the person edited nothing.

---

## 9. Hosts, assets and privacy

### 9.1 What each host gives

| | HTML Clay | Hyperclay Local | hyperclay.com |
|---|---|---|---|
| Who edits | the local user | the local user; teammates through device sync | owner, team editors, edit-link holders |
| Live sync | tabs on this machine | tabs, plus other devices through the sync engine | every editor and viewer |
| Outside disk edits reach open tabs | yes (agents, text editors) | yes | no disk except through device sync |
| Presence | none | none | avatar stack, no API |
| `by` on frames, editing marker | no | no | yes |
| Live stores ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | tabs of one browser at full speed | tabs of one browser at full speed; other devices at save speed | every editor at full speed |
| Page editor merge state ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | none in the file: open tabs share it, a fresh open rebuilds it from the article | kept beside the file | kept beside the file |
| Wire and ai-edit | yes | yes | ai-edit only, for owners and team editors on a paid plan |
| Data API write | yes | yes | read only |
| Uploads | 25 MB, in `~/htmlclay/uploads/` | 25 MB, in the root's `uploads/` | 10, 20 or 100 MB by plan, in the account's `uploads/` |
| Upload access (`document.upload.access`) | `local` | `local` | `document` once the account's uploaded files have been protected, and no field before that |
| Version history | yes | 60 days, newest 20 | a version per save; a restore does not reach open editors' tabs, so reload after restoring |
| Max save | 50 MB | 20 MB | 5 MB |

A plain static server or a file opened from disk can show the file in view mode but cannot save it. Use the `demo` plugin for a public demo that saves into each visitor's browser.

On hyperclay.com every tab holds its own sync connection. Over HTTP/1.1 a browser allows six connections per origin, so a seventh tab of the same site can stall.

### 9.2 Getting started on each

- **HTML Clay:** save the file as `name.htmlclay` and open it with HTML Clay 1.9.0 or newer. The extension changes nothing about the content; it is ordinary HTML.
- **Hyperclay Local:** put the file in the synced folder and open it from the app.
- **hyperclay.com:** create a site and paste the file, or upload it.

### 9.3 Privacy

The saved file is the data. Everyone who can download it can read everything in it: hidden elements, `data-*` attributes, JSON scripts, CSS-hidden sections and everything the owner typed. `show-when:editmode`, `hidden` and `display: none` are presentation.

- To publish a version without private values, make a copy and remove them, or keep private data in a different file with different access.
- A file you hand out as a template should ship with sample data, not yours.
- On hyperclay.com a file uploaded from inside a document is bound to that document, and where the host advertises `document.upload.access` as `document` its bytes follow the document's read permission on every route. A reader without access gets the same 404 as a missing file, and the file is sent `Cache-Control: private, no-store`. Uploads made before that binding existed stay reachable by URL until the account's protection migration has run, and a copy someone already downloaded cannot be taken back.
- HTML Clay and Hyperclay Local report `local`, which means their own file-serving rules, not a sharing ACL. A file there is as private as the folder on that machine.
- Password inputs are never persisted; an authored `value` on them is still in the file.

### 9.4 Offline in a local host

Hyperclay Local and HTML Clay each bundle one exact, published ClayJS release, chosen in their `offline-runtime.lock.json`. The whole release ships as its index lists it (`dist/offline-manifest.json` in the npm package: about 550 files, every module, plugin, satellite such as `sap.js` and `clay-router.js`, vendored library, theme sheet and font, plus the exact library builds older Journals load from other CDNs), not only what one document boots with, so a plugin, the merge engine, a drag library or a font that a document uses for the first time offline still loads.

- **The route.** The release is served at `/_/clayjs/<version>/<path>`, so `https://clayjs.com/v1/clay.js` is `/_/clayjs/<version>/clay.js`, with an immutable cache and an `ETag` of the file's sha256. A path the index does not list answers 404 and is never fetched from the network.
- **Projection on serve.** A served document is rewritten in two places only: the `src` and `href` attributes that are recognized ClayJS runtime URLs (`https://clayjs.com/v1/...`, exact-version URLs of the bundled release, and the few exact library and font URLs the release carries a copy of) become the local address, written with the same spelling the file used for the rest of the URL, and a `<script type="application/json" id="clay-runtime-map">` descriptor records the mapping. Text, code samples, Markdown and every other URL stay byte for byte.
- **Canonicalization on every write.** Save, data API writes, restore, export and live-sync frames turn those local addresses back into the public `https://clayjs.com/...` URLs and remove the descriptor before anything reaches disk. A saved or downloaded file never contains a `/_/clayjs/` address, so it stays portable to any host. A request with `Clay-Source: 1` receives the canonical bytes unprojected.
- **Versions.** A rolling `https://clayjs.com/v1/` URL is served from the host's bundled release. A document that pins a release the host does not bundle, or names a runtime file the bundled release lacks, is served with every runtime URL left public: it loads online, is not promised offline, and the response carries a `Clay-Runtime-Unavailable` header that says why. The host never substitutes another release's files into a page.
- **Older Journals.** Journals made before the release carried their libraries load OverType and highlight.js from other CDNs, and their fonts from Google Fonts. The release maps exactly three of those URLs to copies it ships: `https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js` and `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` to the same classic builds (the ones that define `window.OverType` and `window.hljs`, with their licenses and pinned hashes in `compat/journal-assets.lock.json`), and the Journal's Google Fonts stylesheet URL to a stylesheet over the bundled IBM Plex files. Each match is the whole URL: another version, a query string, another file or another host stays on the network. So a Journal saved with those URLs edits offline, and a document that names anything else from those CDNs does not.
- **What stays online.** Pictures and media hosted elsewhere, AI features and collaboration with other people need the network. A picture uploaded into the local folder is a local file and works offline.
- **Checking a host.** `node scripts/verify-offline-closure.mjs` in the ClayJS repository checks a release's closure, every listed file present with its recorded hash and every module import resolving inside the release, in three modes: `--package-root <dir>` for a built checkout, `--published-root <dir>` for an unpacked release tree and `--base-url <url>` for a running host's `/_/clayjs/<version>/` prefix. With `--base-url`, pass `--index <file>` naming the host's own bundled index; without it the check compares the host against the checkout's index.

Why the whole release and not a boot closure: a sap document loads much of its code late. A Kanban board loaded with `plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu` boots with a few dozen modules, then asks for `derive`, the merge engine, SortableJS on the first drag and the live-sync modules as they are needed, about 116 release paths in all. None of those appear in what the page requests at boot, so a host that served only the boot graph would break on the first drag with the network off. ClayJS's cross-host contract test opens that real board in both local hosts and requests every one of those paths through the host.

---

## 10. What ClayJS does not do

ClayJS gives you one file per document that edits and saves itself. Here is what it does not do, so you can promise what the file can do and pick the right tool.

### 10.1 What changed recently

Two plugins replace the old advice to hand-build a [block writer](https://clayjs.com/docs/guide/recipes/#block-writer) or wait for autosave:

- **The [page editor](https://clayjs.com/docs/plugins/page/)** (`?plugins=page`) is a Notion-like block editor for one `article[data-page]`, backed by Yjs, where typing reaches other people as they type. It includes headings, lists, checklists, toggles, callouts, code, images, files, typed tables, boards, charts from a table, and CSV import.
- **[Live stores](https://clayjs.com/docs/plugins/live-sync/)** (`clay="live"` and `clay.live()`) move fast-changing state at network speed (25 frames per second) instead of save speed. Use [live data](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) for games, scores, and shared state.

The old limits apply elsewhere. Ordinary `editable` regions and DOM records have no CRDT and merge at save time. Rich text outside the page editor has no tables, and without `live-data`, the page editor falls back to file saves.

### 10.2 Compared with the tools you know

| What you are comparing to | What ClayJS gives | What is missing | What to build instead |
|---|---|---|---|
| **Google Docs** | Keystroke co-editing, tables, code, callouts, and images in the [page editor](https://clayjs.com/docs/plugins/page/); word-level save merge in `editable`; recoverable conflicts; version history; `ai-edit` | Comments, suggestion mode, live cursors, pagination, footnotes, `.docx` export, tables in `editable` rich text | The [page editor](https://clayjs.com/docs/plugins/page/) or a [block writer](https://clayjs.com/docs/guide/recipes/#block-writer); comments as `<aside data-id data-anchor>`; print CSS for PDF |
| **Google Sheets** | Persisted inputs, sap formulas over named fields, aggregates, formats, CSV, page tables and charts from a table, 10,000-row pages saving in about 400 ms | A1 references, ranges, fill-down, recalculation graph, virtualization, range selection, pivots | A page table and chart, or a [typed table](https://clayjs.com/docs/guide/recipes/#typed-table-a-spreadsheet-you-can-be-honest-about) of a few thousand rows, one file per year |
| **Google Slides** | Slides as sections, sortable, uploads, view mode as the published deck | Free positioning, guides, masters, presenter view in a second window, transitions, PPTX export | A flow-layout deck with fixed layouts per slide ([slides](https://clayjs.com/docs/guide/recipes/#slides)) |
| **Trello and Linear** | Page boards where cards have an owner and a due date; sortable columns, inline editing, checklists, attachments, undo, per-card sync | Notifications, reminders, cross-board search, mentions, integrations, boards past a few thousand cards | A page board, or the [kanban with card detail](https://clayjs.com/docs/guide/recipes/#kanban-with-card-detail) with labels, due dates, and a due-soon projection |
| **Notion** | One document per file in the [page editor](https://clayjs.com/docs/plugins/page/) with real-time co-editing, Markdown shortcuts, derived titles, blocks, tables, CSV import, boards, and charts | A workspace of many pages, databases with relations and rollups, backlinks, sub-pages, workspace search, page permissions | A folder of files, one per page or database, plus an index file; links are `<a href>` |
| **CRM** | Records, pipeline board, card owners and due dates, notes, CSV, totals, contact forms via `message` | Email logging, reminders, dedupe, per-row permissions | The [CRM follow-up list](https://clayjs.com/docs/guide/recipes/#crm-follow-up-list), computing due rows on open |
| **Finance apps** | Rows with amounts, budgets, sap totals painted in view mode by `derive`, CSV import of bank exports, charts from a table | Bank sync, learned categorization, multi-currency, scheduled transactions, encryption at rest | A monthly or yearly budget file with CSV import ([finance tracker](https://clayjs.com/docs/guide/recipes/#finance-tracker)) |
| **Full CMS** | Per-page [CMS](https://clayjs.com/docs/plugins/cms/) sidebar, per-page style group for colors, fonts, and variants, uploads with crop, view mode as the site, JSON data API | Multi-page collections, shared layouts, drafts and scheduled publishing, roles, media library, i18n | A [content site](https://clayjs.com/docs/guide/recipes/#content-site) with one file per page, a shared stylesheet, and the [CMS](https://clayjs.com/docs/plugins/cms/) per page |

### 10.3 Limits that apply to every document

- **No comments.** ClayJS has no comment model (`ai-edit` is an AI prompt, not stored comments). Store comments as `<aside data-id data-anchor>` elements.
- **No live cursors.** Presence shows who is here in an avatar stack and outlines which block someone is editing. There are no character cursors and no app-facing presence API.
- **No suggestion mode, pagination, footnotes, or `.docx` and PPTX export.** Edits apply directly without tracked changes, page breaks, footnotes, or Office exporters. Use print CSS for PDF.
- **Per-file edit access.** There are no per-row permissions. Split data for different audiences into separate files.
- **No background work in a closed file.** Nothing runs in a closed file, and a live room ends after two minutes with nobody connected. Compute due states on open.
- **Undo is per tab.** History is capped at 100 steps per tab, is not saved, and never reverts a peer's merged edits.

> [!NOTE]
> **Privacy: the saved file is the data.** Hiding an element with CSS, `hidden`, or `show-when` is presentation, not access control. See [Privacy](https://clayjs.com/docs/guide/hosts/#privacy).

---

## 11. Recipes

### 11.1 Kanban with card detail

[`examples/kanban.html`](https://clayjs.com/examples/kanban.html). Plugins `sync,sortable,undo,indicator`, satellites `clay-options` and `clay-ui`.

- `#board > .columns[sortable="columns"] > section.column[data-id]`, each with a handle and an `h2`, then `ol.cards[sortable="cards"]` of `li.card[data-id]`.
- Each card holds a hidden `.detail`: an `editable` description, a checklist of `li[data-id]` with `persist` checkboxes, an `ol.activity` of `li[data-at]`, and edit-only actions.
- Count per column and progress per card are `editor-ui` spans re-rendered on every mutation.
- The open card is in the hash and painted by the view-state style ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)). The filter is in the hash too.
- `clay:sorted` logs "Moved to *Column*" in the card when it changes column.
- Templates: card, checklist item, column, chrome.

Extend with labels (a settings element listing `<li data-label="bug" data-color="…">`, cards carrying `data-labels="bug ui"`), due dates (`data-due` plus a hash filter "due this week"), WIP limits (an attribute on the column, a warning in an `editor-ui` badge), and a list view (a projection or `display: contents`).

With sapjs, the counts and progress badges become paints, the filters an `each=` view or a frozen stylesheet, and checklists nested `items=` lists with a shared blueprint: sapjs guide section [Chrome](https://clayjs.com/docs/guide/architecture/#chrome) builds a smaller version as a complete, tested app.

### 11.2 Block writer

[`examples/writer.html`](https://clayjs.com/examples/writer.html). Plugins `sync,sortable,undo,upload,indicator`, satellite `clay-ui`.

**One `editable` per block**, not one big editor. The document is `#blocks[sortable="blocks"]`, a list of sibling `.block[data-id][data-type]` elements:

| `data-type` | Content |
|---|---|
| `text` | `.body[editable="toolbar-on-select"]`: paragraphs, H2/H3, lists, quotes |
| `callout` | the same, styled as a callout |
| `todo` | `ul.todos` of `li[data-id]` with a `persist` checkbox and an `editmode:contenteditable` span; Enter adds the next item, Backspace on an empty item removes it |
| `divider` | `<hr>` |
| `image` | `<figure>` with `<img>` and an `editmode:contenteditable` caption |

This model gives drag, block menus, non-rich blocks and per-block Squire undo (which limits the peer-rollback trap), at the cost of selection and Enter-to-split across blocks.

- A gutter (handle, `+` insert, `⋯` block menu) is cloned from a template into each block as `editor-ui`, with `contenteditable="false"`. Because the handles are injected, the script sets Sortable's `handle` option ([sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder)).
- The menu is one `editor-ui` element positioned under the clicked button. Insert actions clone a block template and give it an id; block actions duplicate (re-iding every descendant, [Identity](https://clayjs.com/docs/guide/record/#identity)) or delete.
- The slash menu opens on keyup `/` when the caret's paragraph contains only `/`; choosing an item removes the `/` (and the block, if it held nothing else) and inserts after it.
- Images come from a hidden file input in chrome or from a pasted screenshot (`pasteImage`), through `clay.upload` with the `data:` fallback.
- The outline (H1 to H3 across blocks) and the word count are `editor-ui` projections; the outline rebuilds only when its signature changes.

Missing pieces to add on the same model: a table block (`<table>` with `editmode:contenteditable` cells and your own Tab and add-row code), a code block (`<pre><code editmode:contenteditable>` with a copy button in chrome), a toggle (`<details>`, noting `open` saves), anchor ids on headings (assign `id` from text on blur, not on load).

### 11.3 Finance tracker

[`examples/finance.html`](https://clayjs.com/examples/finance.html). Plugins `sync,undo,indicator&exclude=richclay`, satellites `clay-options`, `clay-ui`, `sap.js`.

- `main#app[sap]` with a summary of `no-dirty` outputs (budgeted, spent, left), a categories table (`items="categories"`, each row a name, a persisted budget input, computed spent and left, a progress bar via `css:used`) and a transactions table (`items="txns"`, each row date, memo, category with a datalist, amount).
- Category spent: `calc:spent="sum(root.txns.filter(t => t.cat === item.name), 'amount')"`.
- Search: a `transient` bound input, `calc:match` and `show="item.match"` per row, `hidden` stripped from snapshots.
- Rows get stable ids from `claimRowIds`, a workaround from before sapjs minted unique ids. A new app writes `data-id=""` on the blueprint and lets `trigger-add` mint ids ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).
- CSV import (edit only) and export (both modes).
- The [Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync) acknowledge workaround for `no-dirty` totals.

The authored file already shows every computed value, so sap mounts without changing the record and a reader without JavaScript sees correct totals.

### 11.4 CRM follow-up list

Table-first. `<tr data-id data-stage="lead" data-next="2026-10-14">` rows with `editmode:contenteditable` name and company cells, a persisted `<select>` for stage, a persisted `<input type="date">` for the next contact, and an `editable` notes cell or a hidden notes element shown in the record-as-modal detail. Projections into `editor-ui`: "due today" (rows whose `data-next` is today or earlier) and a pipeline board (columns by stage, each card a link to the row's detail). Totals by stage with sap if deals carry amounts. `mailto:` links for contact. CSV import merges by email or id. Single owner.

### 11.5 Flashcards

Decks as `<section data-id>` records, cards as `<article data-id data-due data-interval data-ease>` with `editmode:contenteditable` front and back. Study mode is tab-local: the hash holds the deck and the current card, a runtime stylesheet shows one card and hides the back until revealed. Grading writes the new `data-due`, `data-interval` and `data-ease` on the card (an SM-2 style schedule), inside one undo commit. The "due today" count is an `editor-ui` projection.

### 11.6 Typed table (a spreadsheet you can be honest about)

A fixed schema of named columns, rows as `<tr item data-id>` in a sap `items` list, inputs bound and persisted per cell, computed columns with `calc:`, totals with `sum`, filters by hiding, CSV in and out. Tab between cells with a keydown handler on the table. A few hundred to two thousand rows per file.

### 11.7 Slides

One `<section class="slide" data-id data-layout="title|bullets|image|quote">` per slide in a 16:9 box, `editable` text, `sortable` to reorder, images through upload. Present mode is tab-local (hash `#present=3`): fullscreen, `scroll-snap`, arrow keys, speaker notes in an `<aside>` hidden while presenting. PDF through `@page { size: 16in 9in }` and the browser's print.

### 11.8 Content site

Without the CMS: `editable` regions for copy, upload and quickcrop for images, `sortable` lists for features. With the CMS: a rules tag and `?plugins=cms` ([The CMS, in passing](https://clayjs.com/docs/guide/components/#the-cms-in-passing)).

---

## 12. Free documents for visitors

A **free document** is a published app anyone can use and keep. The visitor gets the same editing UI the owner gets, their work is kept in their own browser, and the download hands them a file with that work in it. Nothing a visitor does reaches the host.

### 12.1 What a visitor gets

On a page that opts in ([The contract](https://clayjs.com/docs/guide/free-documents/#the-contract)), a visitor who is not the owner is in **draft mode**. Every edit-only module loads, so `editable`, `persist`, undo, sortable and the rest behave as they do for the owner, and the autosave pipeline still runs. The save lane is swapped: instead of sending the document to the host, ClayJS extracts the page's `api` JSON out of the bytes a real save would write and stores `{ "v": 1, "savedAt": "2026-10-15T00:00:00.000Z", "data": { ... } }` under `localStorage["clay:visitor-drafts:<slot>"]`. The next load applies that JSON over the file the host served, so an owner's later fix reaches a returning visitor while the visitor's own work stays. The host is never told: no save, no sync, no upload, and no `/_/meta` discovery. Two tabs on the same page share that record: a save takes what only the other tab changed, and when both changed the same thing, this tab's version is saved and the other tab's record is kept under `clay:visitor-drafts:<slot>:conflict`.

The owner is a visitor here too. Signed in, they get the same private draft unless the URL carries `?editmode=true`, which edits the original file and shows every visitor the change. Two things always edit the file itself: a document opened from `file:`, where draft mode never applies, and HTML Clay, which stamps a save token on the response. Hyperclay Local is not one of them. It serves the folder over `http:` and injects no save token, so its owner is in draft mode like anyone else and adds `?editmode=true` to edit the file ([The mode ladder](https://clayjs.com/docs/guide/free-documents/#the-mode-ladder)).

### 12.2 The contract

A page that wants draft mode needs all of this. The example in [A complete example](https://clayjs.com/docs/guide/free-documents/#a-complete-example) carries every item, and its test proves the round trip:

1. An `api` rules tag naming every saved field, with a `cms-template` seed row for every list the rules describe. Hide the seed in your own CSS (`[cms-template] { display: none !important }`), never with `hidden`, which the CMS reads as data ([The CMS, in passing](https://clayjs.com/docs/guide/components/#the-cms-in-passing)).
2. `<html visitor-drafts="<site-stem>-v1" autosave>`. The value is the slot: letters, digits, dot, underscore and hyphen, up to 100 characters. It names this app's corner of `localStorage`, so two apps on one origin never mix.
3. `plugins=visitor-drafts` on the loader tag, plus whatever else the app needs.
4. `persist` on every control the rules name. A typed value without `persist` is lost at save ([`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls)), and in draft mode a save is the visitor's own copy.
5. `data-id` on every record and `data-id=""` on every blueprint. New rows mint their own (`trigger-add` does it, [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).
6. `<meta name="application-name" content="...">`. The prompt, the intro and the download name the app from it, falling back to the title before the first `:` or `|`.
7. A feedback link the visitor can use: a `mailto:` address in the page, not in the plugin.
8. Optional: a `<template visitor-intro>` ([The download prompt and the intro area](https://clayjs.com/docs/guide/free-documents/#the-download-prompt-and-the-intro-area)). No template, no intro; the prompt still shows.
9. A round trip test in your own repo: write a draft, load the page again with that storage, and check that the values and the computed counts come back.

Bump the slot (`-v2`) only when an old draft cannot fit the new rules. A draft that no longer fits is parked, not thrown away ([Restoring and redrawing](https://clayjs.com/docs/guide/free-documents/#restoring-and-redrawing)).

### 12.3 The mode ladder

[How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided)'s list decides the mode. Draft mode is a rung in it, between a save token and the owner cookie:

1. `?editmode=true` or `?editmode=false` in the URL. Only the literal `true` means edit.
2. `<html viewonly>` in the file, or a response carrying only the pre-1.9.0 token `htmlclaytoken`.
3. `window.clayEditMode`, set by a script before boot.
4. A `savetoken` attribute the host put on `<html>`.
5. **Draft mode**, on a page that opted in ([The contract](https://clayjs.com/docs/guide/free-documents/#the-contract)).
6. The `isAdminOfCurrentResource` cookie (hyperclay.com, Hyperclay Local).

The rung is where a free document lives, so the details matter:

- `?editmode=false` is view mode, and nothing below it changes that.
- `?editmode=true` edits the original **only with the owner cookie**, and only on a page that draft mode would otherwise claim. A query parameter on its own never grants writes to the host: an anonymous visitor with `?editmode=true` stays in draft mode.
- The owner cookie alone is not enough either. The signed in owner gets the same draft as everyone else until they open the page with `?editmode=true`, and the owner chip ([The download prompt and the intro area](https://clayjs.com/docs/guide/free-documents/#the-download-prompt-and-the-intro-area)) is their way there.
- `viewonly`, a stale token, `window.clayEditMode` or a `savetoken` the host stamped on `<html>` all turn draft mode off. The first two leave it in view mode; the last two switch the load to edit mode against the host, which still decides who may write ([How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided)). On a `viewonly` document or one with a stale token, `?editmode=true` is not draft mode either: it is the same edit mode as before, saving to a host that refuses the write.
- Draft mode needs all four of the plugin name in `plugins=`, a valid slot, an `http:` or `https:` page and an `api` rules tag. That tag also has to carry `data-rules-version="1"` and hold JSON that parses; a newer version or unreadable JSON leaves the page out of draft mode with one console warning naming the problem. On `file:` it never applies, which is exactly why the download is a real file.
- `<html draftmode="true">` says which mode this load is in, beside `editmode` and `pageowner` ([The root attributes](https://clayjs.com/docs/guide/edit-mode/#the-root-attributes)), and is removed from every save.

### 12.4 What runs in draft mode

`clay.isDraftMode` is true, and everything else follows from it:

- **The plugins that talk to the host are dropped**, even when the page names them: `sync`, `live`, `upload`, `quickcrop`, `cms`, `people`, `wire`, `ai-edit`, `demo` and `source`. `clay.upload`, `clay.cms`, `clay.conflicts` and `clay.source` are absent, and code that guards them (`clay.upload?.(...)`) behaves as it does for a viewer. The `[refetch-on-save]` attribute is dropped too, since it would fetch its element from the host again after every save.
- **The save lane is the browser.** `clay.save()` and autosave both run, `savestatus` moves as usual, and the save answers `msgType: "success"` with `msg: "Saved in this browser"`. A storage failure answers the 507 path with `code: "draft-storage"` and fires `clay:drafts-store-failed`; the next good write clears it.
- **No request reaches the host.** The download link goes to the host's download page, which holds the email sign-up. The prompt's own stylesheet is a Google Fonts link.
- **`clay.readData()` and `clay.writeData()` refuse.** Both reject with `code: "DataUnavailableInDraft"`: the saved file belongs to the owner, and this visitor's work is in their browser, so there is nothing for them to read or write there. A page that calls them in draft mode gets that refusal instead of a request ([Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export)).
- **`clay.visitorDrafts`** is the plugin's whole surface:

| Member | What it is |
|---|---|
| `active` | `true` when the plugin found a slot and the rules tag, `false` otherwise |
| `slot` | the slot from `<html visitor-drafts="...">` |
| `key` | the `localStorage` key, `clay:visitor-drafts:<slot>` |
| `hasDraft()` | is there a stored draft for this slot |
| `restored()` | `{ restored, hadDraft, parked }` for this load, or `null` when the plugin is not active |
| `saveNow()` | write the page to the slot now; `true` when it landed, `false` when it did not |
| `reset()` | delete this slot and reload the page; nothing outside draft mode |
| `onRestore(fn)` | call `fn(detail)` at once when the restore already ran, otherwise on `clay:drafts-restored` |
| `editOriginal()` | navigate to this page with `?editmode=true` |
| `backToDraft()` | navigate back with `editmode` removed |
| `downloadUrl()` | the download link the prompt is using, with `src` |
| `source` | the `?src=` this slot remembers, or `null` ([The download prompt and the intro area](https://clayjs.com/docs/guide/free-documents/#the-download-prompt-and-the-intro-area)) |

- **Three events** on `document`: `clay:drafts-restored` with `{ restored, hadDraft, parked }`, `clay:drafts-saved` with `{ data }`, and `clay:drafts-store-failed` with `{ error }`.

### 12.5 Restoring and redrawing

The restore runs while ClayJS boots, before `clay.ready` resolves, and applies the stored JSON to the live page with `applyData`. sapjs and any code that waits for `clay.ready` therefore see the restored values, not the authored ones, and sapjs re-derives on the mutations the restore makes, so a count or a total painted in markup is right on the first paint after it. Load `clay.js` before `sap.js` for that: sapjs mounts when `clay.ready` resolves, and a page that mounts it first paints the authored values with no later mutation to correct them ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).

Code that drew before `clay.ready` has two ways to hear about the restore: listen for `clay:drafts-restored` on `document`, or call `clay.visitorDrafts.onRestore(fn)`, which runs `fn` at once when the restore already happened. Either way the detail is `{ restored, hadDraft, parked }`.

A draft that no longer fits the page is never overwritten. When the stored JSON is not `{ v, data }` (garbage, a bare array, a missing `data`), the raw value is moved to `localStorage["clay:visitor-drafts:<slot>:unreadable:<ISO timestamp>"]`, the slot is cleared, and the page loads as authored with `parked: true` in the detail. When the write is refused only for keys the rules do not know, those keys are dropped and the rest is applied, so adding a field to the rules never costs a visitor their work.

### 12.6 The download prompt and the intro area

Both are runtime chrome: `clay="editor-ui"` and `sap-ignore`, built by the plugin on every load. Neither is in the file, neither is saved or synced, and neither is read by sapjs.

Both remember themselves per slot in `localStorage["clay:visitor-drafts:<slot>:ui"]`, as `{ "v": 1, "prompt": { "shown": ..., "dismissed": ..., "uses": ..., "downloaded": ... }, "intro": { "done": null | "closed" | "scrolled" }, "src": ... }`. Clearing that key shows the intro and the prompt again.

**The intro** is authored per app as a `<template visitor-intro>`. The template holds the author's whole strip: its markup and any `<style>` it needs. The plugin clones it into a section at the very top of the page body, before the app's own content, and adds a quiet close (`x`) in the corner. The intro leaves for good when the visitor closes it or scrolls it past the top of the viewport; the ui memory records `"closed"` or `"scrolled"` as the reason.

```html
<template visitor-intro>
  <p>One paragraph on what the app does and who it is for.</p>
</template>
```

When there is a release video, add it as the first element of the template, and no `<video>` before then:

```html
<video src="/_/uploads/assets/kanban/release.mp4" poster="/_/uploads/assets/kanban/release-poster.jpg" controls playsinline preload="metadata"></video>
```

An element inside the template with `[visitor-intro-start]` scrolls to the app, and one with `[visitor-intro-dismiss]` closes the intro the same way the `x` does. A deep link (a URL with a `#...`) skips the intro so a shared link opens where it points, a draft skips it too, and `?intro=1` forces it.

**The prompt** needs nothing from the app but its name: a small tab at the bottom right ("This app is free to keep") that opens into a card holding the download link and "Don't show again", with a minimize button in its corner. The tab's X and the card's minimize button leave a small "Keep" button with the download icon that reopens the download card. That choice survives reload. It opens itself once after the visitor has touched three fields. "Don't show again" stops those reminders for that slot but keeps the icon, including for previously dismissed notices. A storage failure opens it in its error state, and the next good save clears it. In that error state the download link does not go to the host, whose download page would read the stored copy that just failed to be written: the plugin builds the file from the live page in the browser instead, named after the page file with `.htmlclay` at the end.

**The download link** is `/_/download<path>?as=htmlclay`, with the page's path (`/_/download?as=htmlclay` for `/`) and `&src=<src>` when this slot has one. `clay.visitorDrafts.downloadUrl()` returns it. **`?src=` is first touch**: the first valid value the page sees for this slot is kept and rides into the download link and every signup. Valid values match `/^[a-z0-9][a-z0-9-]{0,39}$/`.

**The owner chip** shows only to the signed in owner, at the bottom left: it says whether this load is their private draft ("Edit the original") or the original ("Back to my draft") and switches with `clay.visitorDrafts.editOriginal()` and `backToDraft()`.

### 12.7 Migrating an app's own storage

**Not supported yet:** the plugin reads no migration hook, so an app that kept its earlier data under its own `localStorage` key has to move those values into the page from its own code, on the first load after the switch.

### 12.8 A complete example

[`examples/free-reading-list.html`](https://clayjs.com/examples/free-reading-list.html). Plugins `visitor-drafts,indicator&exclude=richclay`, satellites `clay-options` and `sap.js`. A reading list: a title, an author and a status select per book, one scalar goal for the year, and sapjs counting the books that are read. It is the shortest file that carries every item of the contract, and `tests/unit/guide-examples/free-document.test.js` runs it end to end: edit a title, add a book, check the slot, then load the file again with that storage and check the books and the counts come back. The record is authored in the saved form, so sapjs logs its harmless W03 warning for each `viewmode:` attribute ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)). The `reading` option of a status select carries no `selected`: it is the first option, which is the default, and the row that is `read` marks it.

```html
<!DOCTYPE html>
<html lang="en" visitor-drafts="reading-list-v1" autosave>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="application-name" content="Reading list">
<title>Reading list</title>
<script type="application/json" data-rules-name="api" data-rules-version="1">
{
  "goal": "#goal@value",
  "books": ["#books > li[item]:not([cms-template])", {
    "id": "@data-id",
    "title": ".title",
    "author": ".author",
    "status": "select@value"
  }]
}
</script>
<style>
  html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
  [cms-template] { display: none !important }
  :root { color-scheme: light dark; --bg: #f3f0e8; --ink: #26241f; --muted: #706b61; --line: #dbd5c8; --accent: #3d6f72 }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1e21; --ink: #e9e5dd; --muted: #a39e94; --line: #3b4046; --accent: #82b6b8 } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif }
  main { max-width: 640px; margin: 0 auto; padding: 32px 20px 64px }
  h1 { margin: 0 0 8px; font-size: 26px }
  .count { color: var(--muted) }
  .count output { font-variant-numeric: tabular-nums; color: var(--ink) }
  #books { list-style: none; padding: 0; margin: 20px 0 8px }
  #books > li { display: flex; gap: 8px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--line) }
  #books .title { flex: 1 1 auto; font-weight: 500 }
  #books .author { color: var(--muted); font-size: 14px }
  button { font: inherit; color: inherit; background: none; border: 1px solid var(--line); border-radius: 6px; padding: 2px 10px; cursor: pointer }
  input[type="number"] { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; width: 5em; text-align: right }
  select { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 2px 4px }
  .feedback { margin-top: 28px; font-size: 14px; color: var(--muted) }
  [contenteditable]:focus { outline: 2px solid var(--accent); border-radius: 3px }
</style>
</head>
<body>
<main id="app" sap>
  <h1 editmode:contenteditable inert-contenteditable="plaintext-only">Reading list</h1>

  <p class="count">Books read: <output clay="no-dirty" calc:read="state.books.filter(b => b.status === 'read').length" text="state.read">1</output> of <output clay="no-dirty" calc:total="state.books.length" text="state.total">2</output></p>

  <p><label for="goal">Books to read this year</label> <input id="goal" type="number" min="0" step="1" bind="goal" persist viewmode:readonly readonly value="24"></p>

  <ul id="books" items="books">
    <li item cms-template data-id=""><span class="title"></span><span class="author"></span><select bind="status" persist><option>reading</option><option>read</option></select></li>
    <li item data-id="b-mmm"><span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">The Mythical Man-Month</span> <span class="author" editmode:contenteditable inert-contenteditable="plaintext-only">Fred Brooks</span> <select bind="status" persist viewmode:disabled disabled><option>reading</option><option selected>read</option></select> <button type="button" show-when:editmode="true" trigger-remove aria-label="Remove book">×</button></li>
    <li item data-id="b-sicp"><span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">Structure and Interpretation of Computer Programs</span> <span class="author" editmode:contenteditable inert-contenteditable="plaintext-only">Abelson and Sussman</span> <select bind="status" persist viewmode:disabled disabled><option>reading</option><option>read</option></select> <button type="button" show-when:editmode="true" trigger-remove aria-label="Remove book">×</button></li>
  </ul>

  <p><button type="button" show-when:editmode="true" trigger-add="books">+ Add book</button></p>

  <p class="feedback"><a href="mailto:hello@clayjs.com?subject=Reading%20list">Tell me what this app is missing</a></p>

  <template items="books">
    <li item data-id="">
      <span class="title" editmode:contenteditable contenteditable="plaintext-only"></span>
      <span class="author" editmode:contenteditable contenteditable="plaintext-only"></span>
      <select bind="status" persist><option>reading</option><option>read</option></select>
      <button type="button" show-when:editmode="true" trigger-remove aria-label="Remove book">×</button>
    </li>
  </template>
</main>

<template visitor-intro>
  <p>A reading list that lives in your browser. Add books, set the ones you have read, and keep a goal for the year. Nothing leaves this machine unless you download the file.</p>
</template>

<script src="https://clayjs.com/v1/clay.js?plugins=visitor-drafts,indicator&exclude=richclay"></script>
<script src="https://clayjs.com/v1/clay-options.js"></script>
<script src="https://clayjs.com/v1/sap.js"></script>
</body>
</html>
```

---

## 13. Pre-ship checklist

### 13.1 Before you ship a file

1. Loads with `clay.js` as a classic script at the end of `<body>`, every tag on the same version prefix.
2. `<html autosave>` unless it is a deliberate manual-save writer.
3. `sync` is in the plugin list, and `exclude=richclay` if there is no rich text.
4. The fallback rule `html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }` is in the stylesheet, and every edit-only control has `show-when:editmode="true"`.
5. Records are authored in the saved form (`inert-contenteditable`, `disabled`, `readonly`); templates in the active form.
6. Every repeated record has a unique `data-id`; templates carry none; every create and duplicate mints a fresh one.
7. Every control whose value matters has `persist`; no filter or search box does.
8. All chrome is cloned from a `<template>` into `clay="editor-ui"` after `clay.ready`; nothing in the file is chrome.
9. Tab-local state is in the hash, `localStorage` or memory, painted through a runtime style; opening, filtering and searching leave `clay.hasUnsavedChanges()` false.
10. Derived values are sapjs paints, in `editor-ui`, or `no-dirty` when the file must show them; every hand-written derived write is guarded, and no script copies a record into a second attribute.
11. Commands are wrapped in `clay.undo.commit`; derived views are drawn in `clay.effect`, with no effect warnings in the console.
12. Views whose record a peer deleted are closed, in the effect or a `clay:sync-applied` handler.
13. The app script starts with `clay.start`; all listeners are delegated.
14. Nothing writes the record at boot.
15. Edit-only calls are guarded for view mode, and edit actions check `clay.isEditMode`.
16. `clay.confirm` calls have a rejection handler.
17. Save failures are visible (indicator, `savestatus` CSS or clay-ui).
18. Library residue (Sortable, third-party editors) is stripped in a snapshot hook.
19. Images use `clay.upload`, embedding only on `unsupported`.
20. The file opens in view mode with JavaScript disabled and shows correct content and no edit controls.
21. With sap: `Sap.status().ok`, the live root matches the file after load (no computed value rewritten), no `[sap-error]`, rows with your own ids.

### 13.2 Trap index

| Trap | Section |
|---|---|
| CSS keyed on `editmode="false"` shows edit chrome before boot | [The root attributes](https://clayjs.com/docs/guide/edit-mode/#the-root-attributes) |
| A never-saved file shows `show-when:editmode` controls to viewers without the fallback rule | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options) |
| `show-when` matches any ancestor, not the nearest | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options) |
| A view attribute on a saved element syncs to every collaborator | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options), [Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state) |
| Records authored with live `contenteditable` stay editable for viewers until the first save | [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers) |
| Templates in the inert form give clones that cannot be edited until reload | [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers) |
| Unguarded edit-only API calls throw in view mode | [What a viewer gets](https://clayjs.com/docs/guide/edit-mode/#what-a-viewer-gets) |
| `hidden`, `.selected`, `<details open>` and library inline styles save; use `ephemeral` | [What a save writes](https://clayjs.com/docs/guide/record/#what-a-save-writes), [Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements) |
| `no-save` chrome still reaches peers; use `editor-ui` | [Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute) |
| Edits in `no-watch` or `no-dirty` are invisible to `save()` and the close warning | [Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute) |
| Runtime changes inside `freeze` are never saved or synced, even by `force()` | [Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute) |
| A `freeze` scratchpad from a peer arrives empty; fill it on every change | [Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute) |
| Content in a `freeze` element when it first appears becomes its saved contents | [Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute) |
| A control without `persist` loses its typed value | [`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls) |
| Undo and merges restore `checked`/`value` attributes but not what the control shows, and the next save writes what is shown | [`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls), [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| JSON with an unescaped `</script>` corrupts the file | [Where to keep data that is not visible text](https://clayjs.com/docs/guide/record/#where-to-keep-data-that-is-not-visible-text) |
| `<template>` content edits never autosave | [Where to keep data that is not visible text](https://clayjs.com/docs/guide/record/#where-to-keep-data-that-is-not-visible-text) |
| `+=` on a live counter loses increments from other tabs; use `add` | [Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) |
| A list in a live store pushed from two tabs keeps one push | [Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) |
| A live tag added after people loaded the page is not in their rooms | [Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) |
| Live data gets no close warning; up to 8 s can be lost | [Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) |
| Items without ids added in two tabs: one is dropped | [Identity](https://clayjs.com/docs/guide/record/#identity), [What a merge does](https://clayjs.com/docs/guide/live-sync/#what-a-merge-does) |
| Cloned records share a `data-id`, which counts as no id | [Identity](https://clayjs.com/docs/guide/record/#identity) |
| `crypto.randomUUID` is missing outside secure contexts | [Identity](https://clayjs.com/docs/guide/record/#identity) |
| Writes in the first 0.5 to 3 s after load are absorbed into the baseline and not saved | [Autosave](https://clayjs.com/docs/guide/saving/#autosave) |
| A failed save is not retried until the next edit | [Autosave](https://clayjs.com/docs/guide/saving/#autosave) |
| `ok: false` also means "nothing to save" and "queued" | [The save API](https://clayjs.com/docs/guide/saving/#the-save-api) |
| `clay.getHTML()` runs hooks and closes the undo batch | [The save API](https://clayjs.com/docs/guide/saving/#the-save-api) |
| A 412 conflict stops autosave until resolved | [Conflicts on save (412)](https://clayjs.com/docs/guide/saving/#conflicts-on-save-412) |
| Impure hooks keep the page permanently dirty | [Hooks](https://clayjs.com/docs/guide/saving/#hooks) |
| A throwing `onSnapshot` or `addDocumentTransform` callback blocks every save | [Hooks](https://clayjs.com/docs/guide/saving/#hooks) |
| `onaftersave` writing to the live DOM loops autosave | [Hooks](https://clayjs.com/docs/guide/saving/#hooks) |
| Without autosave, collaborators see nothing until a save | [What sync is](https://clayjs.com/docs/guide/live-sync/#what-sync-is) |
| Listeners attached to records are lost when a merge recreates them | [What a merge does](https://clayjs.com/docs/guide/live-sync/#what-a-merge-does) |
| A peer's frame re-runs inline scripts | [What a merge does](https://clayjs.com/docs/guide/live-sync/#what-a-merge-does), [Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once) |
| A `no-dirty` region replaced by a peer raises a false conflict notice (1.8.2) | [Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync) |
| Same-key JSON edits under `merge`: incoming wins, yours goes to the notice | [Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync) |
| Rewriting the record at boot makes incoming frames hold | [Focus, typing and long-running editors](https://clayjs.com/docs/guide/live-sync/#focus-typing-and-long-running-editors) |
| Parsed JSON goes stale after a merge | [Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code) |
| A script that copies a record into a styling attribute goes stale in the file, and a merge brings the stale copy back | [Rules for DOM state](https://clayjs.com/docs/guide/model/#rules-for-dom-state), [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| An `api` rule that reads a painted value can read a stale one until a tab repaints and saves | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| Full sapjs markup under the sapjs core halts with `E50` | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| There is no presence API | [Presence](https://clayjs.com/docs/guide/live-sync/#presence) |
| `data-richclay` card mode deletes images on load | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| The richclay toolbar is unusable inside `showModal()` and popovers | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Rich text has its own undo; page undo never records it | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable), [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| Squire undo can roll back a peer's edit in the same region | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Global `registerButton` after load does not reach mounted editors | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Screenshot paste does nothing without a `pasteImage` listener | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Sortable handle mode is fixed at bind time | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder) |
| `onsorting` cannot veto a move | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder) |
| Sortable residue saves | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder), [Hooks](https://clayjs.com/docs/guide/saving/#hooks) |
| The undo plugin takes Cmd+Z in every text field | [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| Undoing an add removes the record even after a peer edited it | [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| Pausing undo across an `await` loses the earlier mutations | [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| Sap reads live control values: undo without re-syncing inputs saves the undone number | [`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls), [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| `clay.upload` is not a picker; embed only on `unsupported` | [upload and quickcrop](https://clayjs.com/docs/guide/components/#upload-and-quickcrop) |
| `clay.confirm` rejects with `undefined` on cancel | [clay-ui: toasts and dialogs](https://clayjs.com/docs/guide/components/#clay-ui-toasts-and-dialogs) |
| A live element passed to `clay.modal.html` is deleted | [clay-ui: toasts and dialogs](https://clayjs.com/docs/guide/components/#clay-ui-toasts-and-dialogs) |
| Mutation hooks that write what they watch loop forever | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `onclone` does not fire for template fragments | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `el.nearest` reads a neighbour record's field | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| `hide()`, `show()`, `css()` write saved inline styles | [clay-events, clay-dom and All](https://clayjs.com/docs/guide/components/#clay-events-clay-dom-and-all) |
| A file whose painted values do not match sap's state writes at load | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| Dialog prompts are HTML: record text in `clay.confirm` runs a collaborator's markup | [clay-ui: toasts and dialogs](https://clayjs.com/docs/guide/components/#clay-ui-toasts-and-dialogs) |
| `editmode:resource type="inert/javascript"` activates as `javascript` and never runs | [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers) |
| Sap's template row shows before sap loads | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| CMS `cms-template` with `hidden` makes every new item invisible | [The CMS, in passing](https://clayjs.com/docs/guide/components/#the-cms-in-passing) |
| Records stored twice drift | [The record container](https://clayjs.com/docs/guide/architecture/#the-record-container) |
| `applyData` pairs rows by content and order, not by id | [Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export) |
| Activity logged from a mutation observer also logs peers and undo | [Commands](https://clayjs.com/docs/guide/architecture/#commands) |
| Saves slow down past about 1,000 records and stall past 3,000 | [Size](https://clayjs.com/docs/guide/architecture/#size) |
| Updating a runtime style tag without `no-dirty` can raise the leave warning | [Styles a script writes](https://clayjs.com/docs/guide/architecture/#styles-a-script-writes) |
| A version restore on hyperclay.com does not reach open editors | [What each host gives](https://clayjs.com/docs/guide/hosts/#what-each-host-gives) |
| Hidden is not private | [Privacy](https://clayjs.com/docs/guide/hosts/#privacy) |
| Typed values vanish from a visitor's draft: the control has no `persist` | [The contract](https://clayjs.com/docs/guide/free-documents/#the-contract) |
