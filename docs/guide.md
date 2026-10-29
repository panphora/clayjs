# Building malleable documents with ClayJS

This is the complete reference for building malleable documents with ClayJS: one HTML file that is the whole app, edits itself in place, saves itself back to its host, and merges edits from other tabs, other people and agents. Read it top to bottom once. After that, [A document, line by line](https://clayjs.com/docs/guide/walkthrough/), [Structuring an app](https://clayjs.com/docs/guide/architecture/) and [Pre-ship checklist](https://clayjs.com/docs/guide/checklist/) are the parts to return to.

It is written for a developer or an LLM building full apps with inline editing and inline controls: kanban boards with card detail, block writers, finance trackers, CRMs, flashcards, trackers. It covers the CMS plugin only in passing ([cms: content-managed pages](https://clayjs.com/docs/guide/components/#cms-content-managed-pages)), because an app whose product is editing should not route editing through a form sidebar.

Every behavior stated here was read from ClayJS 1.17.0 source or executed. The four example files below are complete, tested apps that this guide quotes. A [test suite](https://github.com/panphora/clayjs/tree/main/tests/unit/guide-examples) boots each one in jsdom with the real loader and checks what it saves, how it merges a peer's edit, and what a viewer receives. Open any of them and view source, or download one and open it in HTML Clay to edit it:

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

`<main id="app">` is the record, the part of the page that ClayJS saves. ([Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id))

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

The script tags load core with `sync,sortable,undo,indicator`, `exclude=richclay` because this app has no rich text, and then the `clay-options` and `clay-ui` satellites. ([Add ClayJS to a page](https://clayjs.com/docs/guide/loading/)) The file opens in view mode, even for its owner. Press Cmd+Shift+E (Ctrl+Shift+E elsewhere) to edit, or add `menu` to the plugin list for an Edit switch ([How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided)).

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

`newId` makes ids from a timestamp and random suffix. `crypto.randomUUID` exists only in secure contexts, so it fails on a file served over plain http from another machine. ([Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id))

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
5. **Per-tab state stays out of the record.** Keep which card is open, the filter, and the current view in the URL hash, `clay.storage`, or memory. Paint them through `ephemeral` attributes ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)), a runtime `<style>`, or `editor-ui` elements.
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

Load ClayJS with a single `<script>` tag and select plugins in its query string:

```html
<script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
```

- **Use a classic script with a `src`.** The loader reads `document.currentScript` to find its own URL and locate its modules. As `type="module"` or pasted inline, it logs an error and never boots.
- **`/v1/`** is the rolling 1.x alias, cached for 10 minutes: files get fixes automatically. **`/1.8.2/`** and every exact version are immutable for a year: use one when a file must never change behavior.
- **Use the same URL prefix on every tag.** Companion scripts (satellites, such as `clay-ui.js`) import ClayJS modules relative to their own URL. `clay.js` from `/1.8.2/` with `clay-ui.js` from `/v1/` gives two copies of shared modules: transforms registered through one are invisible to the other, and save feedback appears twice.
- npm and jsDelivr package paths work too (`@panphora/clayjs`).
- Put the tags at the end of `<body>`. The loader waits for `DOMContentLoaded` anyway.

`plugins=` and `exclude=` are comma-separated lists. Only the first of each parameter counts. Unknown names warn and are ignored.

### 2.2 Plugins

Plugins add editing, sync, and UI features to `clay.js`. Most are off by default, and edit-only plugins skip view mode.

| Plugin | Default | Loads in view mode | Adds |
|---|---|---|---|
| `richclay` | on | no | the `editable` attribute, `clay.RichClay` |
| `source` | on | no | byte-preserving saves, `clay.source` |
| `sync` | off | yes | live sync, `clay.conflicts`, `clay.morph`, presence and the editing marker |
| `live` | off | yes | `clay.live(name)`: a `clay="live"` JSON tag as a live object |
| `sortable` | off | no | the `sortable` attribute, `window.Sortable`, `clay:sorted` |
| `undo` | off | no | `clay.undo` (whole-page undo, takes Cmd+Z for the window) |
| `indicator` | off | no | the save status chip, drawn by a module fetched at the first input or save state |
| `upload` | off | no | `clay.upload` |
| `quickcrop` | off | yes | `clay.quickcrop` |
| `cms` | off | yes | `clay.cms`; implies `quickcrop` and `upload` |
| `wire` | off | yes | `clay.wire`, the channel to a local agent process |
| `message` | off | yes | `message-form`: a visitor's contact form to the owner, `clay.message` ([message: contact forms](https://clayjs.com/docs/guide/components/#message-contact-forms)) |
| `ai-edit` | off | no | select text, ask an agent to rewrite it; implies `wire` |
| `demo` | off | yes | fakes saving into `localStorage` for public demos |
| `visitor-drafts` | off | yes | `clay.visitorDrafts`; in draft mode, the draft store, download prompt and intro area; outside it, only the owner chip, fetched when the owner edits ([Free documents for visitors](https://clayjs.com/docs/guide/free-documents/)) |
| `derive` | on for any page with a `[sap]` root | yes | the sapjs core: records and paints, treated as derived ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)) |
| `page` | off | reader half only (`page-view`) | the page editor, `clay.page`; implies `live`, `sync` and `upload`, and drops `richclay` unless named |
| `unsent` | off | no | `unsent="<name>"`: unsent text in chrome survives a redraw and a reload, `clay.unsent` |
| `bind-text` | off | no | `clay.bindText`: an editor textarea outside the records, bound to one record's text |
| `people` | off | yes | who is editing and who wrote what |
| `menu` | off | yes | an Edit switch and claygoo in the top right for anyone who can edit, with the SEO settings |
| `upgrade` | off; added for a copy of a hyperclay.com starter template that this person can edit | yes | the template upgrade notice |

- Edit-only plugins do not load in a tab that booted in view, even when named. Their members are absent there. Test `clay.isEditMode` (or `clay.modeLifecycle.canWrite()` before a write), never `'save' in clay` or `clay.RichClay` alone, because a live exit leaves those members attached. On a `<html clay-mode-switch="live">` document, entering edit imports them while the tab still shows view, and they stay loaded after the exit ([Leaving edit](https://clayjs.com/docs/guide/edit-mode/#leaving-edit)).
- `exclude` wins over implications. `exclude=wire` also drops `ai-edit`.
- Load order is fixed regardless of how you list them.
- Use `exclude=richclay` when the app has no rich text. `exclude=source` saves one request and about 48 KB, at the cost of saves reprinting the whole document instead of keeping hand formatting.
- Nothing implies `undo`, on purpose: it intercepts Cmd+Z in every text field on the page ([undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo)).
- In view mode, `page` loads only its reader half and nothing it implies. A Document on `plugins=page` resolves to `page-view`, with no live data service, no generic `sync`, and no `upload`. Name `sync` as well (`plugins=page,sync`) when the reader should take its saved files from sync's lane instead of its own.
- `derive` loads automatically when the page has a `[sap]` root at boot, and stays idle when full sapjs is on the page. `exclude=derive` opts out; `plugins=derive` loads it for a page that adds its `[sap]` root later.
- `visitor-drafts` loads its draft store only in draft mode. A reader or an owner editing the original gets a small module that publishes an inert `clay.visitorDrafts` and, for the owner, the owner chip. On a page with no `visitor-drafts` slot, no `api` rules tag, or a rules tag this version cannot read (not `data-rules-version="1"`, or not JSON), it warns in the console and draws nothing. [Free documents for visitors](https://clayjs.com/docs/guide/free-documents/) covers the opt in.

Measure what each mode you ship downloads, and keep a byte budget and a test that fails when one grows: [Keep a byte budget per boot, and fail a test when it grows](https://clayjs.com/docs/practices/#keep-a-byte-budget-per-boot-and-fail-a-test-when-it-grows).

**A good default for apps:** `?plugins=sync,sortable,undo,indicator`, plus `upload` for images or attachments, plus `exclude=richclay` when there is no rich text. A document opens in view even for its owner, so add `menu` for the Edit switch, or declare `<html opens-in="edit">` on a tool page that must edit as soon as it opens.

### 2.3 Satellites

Satellites are separate classic script tags. Each publishes a readiness promise on `clay.loaded`.

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

Satellites do not wait for `clay.ready` and work without `clay.js`, including in view mode and on a static host. In code that runs early, await the promise before using what it adds (`await clay.loaded.ui` before `clay.toast`). Inside a `clay.ready` callback, satellites have usually finished loading, so `clay.toast?.(...)` is safe and the optional call costs nothing.

`clay.standalone.js` bundles the loader, every plugin, and every satellite into one file of about 5 MB for offline use. `plugins=` still decides what runs. With it, remove the satellite tags and always `await clay.loaded.sap` or `.data` before use.

In Hyperclay Local and HTML Clay, a document needs no special loading to work offline. Keep the ordinary `https://clayjs.com/v1/` tags and the host serves them from its bundled release. Use `clay.standalone.js` for a file opened with no host at all. [Offline in a local host](https://clayjs.com/docs/guide/hosts/#offline-in-a-local-host) covers the route and what a host must do.

### 2.4 `clay.ready`

`clay.ready` is a promise that resolves with `window.clay` once boot is done and every plugin that loads at boot has started; the late plugins ([Plugins that load late](#plugins-that-load-late)) arrive after it. `clay:ready` fires on `document` at the same moment. Before it resolves, members like `clay.save` and `clay.undo` do not exist. Start app code with `clay.start(...)`: it waits for `clay.ready` and runs once per page ([Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once)).

`clay.plugins` is the frozen list of plugin names in the plan the loader resolved, late plugins included. It says what the page asked for, not what has finished loading.

`clay.ready` means the loader is done, not that a plugin has finished its own startup. The `page` plugin keeps going: it exports no `ready`, so `clay.ready` fires while the person still sees the article's saved content. `clay.page.ready` is that plugin's boot, and `clay.page.status` is its current result, `{ phase, reason, installId, at }`. Await it before touching `clay.page`:

```js
clay.start("document-ui", async () => {
  const boot = await clay.page?.ready;
  if (boot?.phase !== "ready") return;
  document.documentElement.setAttribute("document-ready", "true");
});
```

Boot moves through `loading` (the saved article is read and validated), `joining` (the editor's code downloads beside the room join, plus capability, the first save, and the page handle), and `adopting` (the editor is mounted and the saved article is adopted into the room). It then settles at `ready` (input enabled), `blocked`, or `error`. Each boundary is a `performance.mark` carrying `{ detail: { installId } }`:

| Mark | Exact boundary |
|---|---|
| `document:boot` | an installation starts, before the source is validated |
| `document:assets-ready` | the editor's code is in hand |
| `document:authority-ready` | the capability and first-save gates passed, the page handle is admitted and the binding is created |
| `document:input-ready` | adoption succeeded and editable was enabled on the current mounted view |

A failed or cancelled installation never emits `document:input-ready`. Blocked readiness still resolves: `clay.page.ready` settles, `clay.page.status.phase` is `blocked` with a `reason`, the saved article stays as the host served it, and no editable page appears. [When the page editor is ready](https://clayjs.com/docs/guide/edit-mode/#when-the-page-editor-is-ready) covers the reasons and what a page can offer instead.

You can set configuration before the tag, and the loader merges into it: `window.clay = { saveToast: true }`.

### 2.5 Theming ClayJS's own UI

ClayJS draws dialogs (`clay.ask`, `clay.confirm`, `clay.tell`, `clay.snippet`, `clay.modal`) and the `people` plugin's name prompt. By default they take your page's font. On a page with a plain solid background, they also take its background and text colours. Everything else comes from ClayJS's built-in look.

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
- **Parts** set anything else. Every element ClayJS draws has a stable name in `data-clay-part`, such as `dialog.panel`, `dialog.title`, `button.primary`, or `people.choice`. Each takes `base`, `hover`, `active`, `focus`, and `disabled` declarations. A part names its surface, so `people.title` overrides `dialog.title` in the name prompt only. The full list is in `docs/injected-ui.md`.
- Values win in this order: `tokens`, then `--clay-ui-*` properties, then the page's sampled font and colours, then the built-in look.
- `window.clayTheme = false` keeps the exact built-in look. After loading, `clay.theme(options)` replaces the theme, `clay.theme(false)` and `clay.theme(null)` restore the built-in look or the default, and `clay.theme()` returns the current one. A change affects the next dialog, not one already open.

Your stylesheet cannot reach these elements: every declaration is inline and `!important`, so a stray `button { ... }` rule never breaks a prompt. On a phone, dialog buttons stay at least 44px tall regardless of the theme.

### 2.6 Plugins that load late

`source`, `sortable`, `menu` and `upgrade` load after `clay:ready`, one at a time, in the order the plan resolves them. Nothing on first paint or the first keystroke waits for them. A late plugin that fails to load is logged and left absent, like any other.

Each late plugin fires `clay:plugin-ready` on `document` once its own `ready` settles, with `detail.plugin` naming it. Use this event to tune something the plugin built for itself. For example, a Kanban board waits for `sortable` and then sets the drag delay its cards need on a phone:

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

`clay.assets.load(name)` loads a library from the same release that served `clay.js` the first time a page asks for it. The document needs no vendor URL, so a copy served by another host or opened from disk still finds it. The names are `overtype`, `marked`, and `highlight`, plus one grammar per `highlight/<language>` for `bash`, `css`, `javascript`, `json`, `python`, and `xml`. `clay.assets.names()` lists them.

```js
const { Marked } = await clay.assets.load("marked");
const { default: hljs } = await clay.assets.load("highlight");
const { default: javascript } = await clay.assets.load("highlight/javascript");
hljs.registerLanguage("javascript", javascript);
```

`overtype` resolves the vendored OverType editor with its toolbar buttons. `marked` resolves the `Marked` class. `highlight` resolves the core with no grammar of its own, so a page registers only the grammars it uses. Each name loads once: a second call before the first settles shares it, a failed one is forgotten and can be tried again, and an unknown name rejects with `clay.assets: no asset named "<name>"`. The [`window.clay` reference](https://clayjs.com/docs/api/) lists what each name resolves to.

### 2.8 Editor commands load on first use

The page editor's optional commands are separate modules under `src/page/features/`, listed in `COMMAND_FEATURES` with one literal import each: `mentions`, `dates`, `emoji`, `titleIcon`, `titleCover`, `exportHtml`, `importMarkdown` and `exportMarkdown`. The build splits each into its own files, and the editor fetches one the first time a person invokes that command. A plain document that never uses them fetches none: opening a page, reading it and typing in it asks for no picker, no parser and no exporter. The emoji list arrives with the first picker that needs it (`page/emoji-data.js`), and `marked` arrives with the first Markdown import.

An installed command shares the page lease's disposal. Leaving edit, or a refused exit that closes admission, disposes what the commands installed and aborts whatever was still arriving, and the next entry installs fresh against the module the browser already holds. A command asked for while its module is still on the way runs only if the edit is still open, the document revision has not moved and the selection is where it was; otherwise it refuses with `stale-target` and writes nothing. A failed fetch is reported and asked for again on the next request.

The load report and the offline manifest both carry them. `node scripts/measure-load.mjs` counts what a command fetches in its `firstUse` phase, printed as the `phase first use` row, so the editor's ready bytes never include a module nobody asked for, and `dist/offline-manifest.json` lists their files, so a host that serves a release offline still loads one on first use.

---

## 3. Edit mode and view mode

### 3.1 How the mode is decided

Three separate facts:

- `clay.canEdit` is permission: whether this person may edit the document at all.
- `clay.mode` is `"view"`, `"edit"` or `"draft"`, and it is a live getter.
- `clay.modeLifecycle.state.destination` is where edits land: `"host"`, `"draft"`, or `"demo"` when the demo plugin saves to `localStorage`.

Permission alone does not open edit. An owner on hyperclay.com opens in view, with `clay.canEdit === true`. The host's own answer about the document, `document.writable` in `/_/meta`, is the last word on `canEdit`, and a change to it fires `clay:capabilitychange`.

The mode this tab starts in is decided once, in this order:

1. **Draft mode**, on a page that opted in ([Free documents for visitors](https://clayjs.com/docs/guide/free-documents/)). The visitor gets the editing UI, and their work stays in their own browser. `?editmode=false`, a `viewonly` attribute, a stale token, `window.clayEditMode`, or a save token all turn draft mode off. Only the owner cookie plus `?editmode=true` edits the original. On a `viewonly` document or one with a stale token, `?editmode=true` is plain edit mode as usual ([The mode ladder](https://clayjs.com/docs/guide/free-documents/#the-mode-ladder)).
2. **The reload receipt.** A deliberate switch writes `sessionStorage` entry `clay:doc:<pathname>:mode-receipt` just before it reloads. Boot reads it once and removes it, accepts it only within 30 seconds and only for a reload of the same path, and then starts the tab in the mode it names. A tab that can edit also leaves a receipt when the page is hidden, and boot accepts it only for a browser reload, so reloading an editing tab comes back in edit. On a page that declares `<html opens-in="edit">`, that hide receipt never keeps a tab in view, so adding the attribute takes effect on the next reload; a deliberate switch to view still does. A receipt keeps a reload in the same tab, not a lasting preference.
3. **`?editmode=`.** Only the literal `true` asks for edit.
4. **`window.clayEditMode === true`** or `<html opens-in="edit">`.
5. **Otherwise** the tab starts in view.

Nothing else opens edit, including a page whose own script makes text editable. An editor library such as OverType or CodeMirror, a `persist` field, and `contenteditable` set by your code all accept typing in view mode, and none of that typing is saved, because the save path runs only in edit. A tool page that must be editable the moment it opens, such as a journal or a notes pad, declares `<html opens-in="edit">`. Every other document needs a way into edit: the `menu` plugin, or a control that calls `clay.setMode("edit")`.

When someone who can edit types into a document in view anyway, ClayJS shows a notice on the first edit to a field that would save in edit mode: a `persist` control, or `contenteditable` content outside `editor-ui`, `no-save` and `freeze`. A field that edit mode would unlock (`editmode:contenteditable`, `viewmode:readonly`, `viewmode:disabled`) raises it on the first attempt to type into it or press it. The notice reads "In view mode, so edits won't be saved." and stays until the tab enters edit, with a **Switch to edit** button that calls `clay.setMode("edit")`. A document without `clay-mode-switch="live"` reloads to switch, so the characters typed before the notice appeared are lost. A visitor who cannot edit never sees it, and a page with its own handled single-key shortcuts does not set it off. It also writes one warning to the console.

`<html viewonly>` in the file forces view mode. So does a response carrying only the pre-1.9.0 token `htmlclaytoken` (an out-of-date HTML Clay, which also shows an update bar).

`clay.canEdit` follows its own ladder: `?editmode=` first, then `viewonly` and a stale token, which take edit off the table, then `window.clayEditMode`, then a save token or the owner cookie.

`clay.isOwner` reflects the cookie alone. On HTML Clay, an editable page has `isOwner === false`. Use `clay.canEdit` for whether a person may edit, and `clay.mode` for whether this tab is editing.

### 3.2 Switching modes: clay.setMode

`await clay.setMode("edit")` and `await clay.setMode("view")` switch this tab. `setMode` takes one argument, and anything else throws a `TypeError`.

Three answers:

- `{ ok: true, mode, changed }`: the switch committed. `changed` is `false` when the tab was already in that mode.
- `{ ok: true, mode, changed: true, reloading: true }`: a reload is on its way.
- `{ ok: false, mode, code }`: it refused, and `mode` is still the committed one.

The refusal codes:

- `busy`: another switch to the other mode is already running.
- `not-allowed`: this person may not edit, or the page is in draft mode.
- `permission-denied`: the host answered that this caller may not write the document.
- `cancelled`: the page moved to another document while the host answered.
- `host-failed`: the workspace shell threw instead of answering.
- `host-refused`: the workspace shell answered without success.
- `save-failed`: the save before leaving edit failed or did not settle as saved.
- `pending-input`: text or a composition is still uncommitted in the page.
- `conflict`: the file has an unresolved save conflict.
- `save-unknown`: the outcome of the last save could not be established.
- `stale-document`: the file moved on while the session was being prepared.
- `timeout`: the 15 second deadline passed.
- `load-failed`: a module the entry needed failed to import.
- `unsupported-plugin`: a queued entry was not a participant.

An undeclared document saves, writes the receipt and reloads. A document with `<html clay-mode-switch="live">` and supported participants switches live. A workspace frame hands the change to its shell, whose reload owns it.

Draft mode always answers `not-allowed`: a draft stays local.

Keep the control on the committed value while a switch is pending, and show the code when it refuses:

```js
const toggle = document.querySelector("[clay-mode-toggle]");
const status = document.querySelector("[data-mode-status]");
let busy = false;

function paint() {
  toggle.setAttribute("aria-checked", clay.mode === "edit" ? "true" : "false");
}
paint();
document.addEventListener("clay:modechange", paint);

toggle.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  toggle.disabled = true;
  status.textContent = "";
  const result = await clay.setMode(clay.mode === "edit" ? "view" : "edit");
  // A reload is coming: stay busy until the page goes.
  if (result.reloading) return;
  busy = false;
  toggle.disabled = false;
  if (result.ok === false) status.textContent = `Stayed in ${clay.mode}: ${result.code}`;
});
```

Never switch by writing the root `editmode` attribute. That attribute reports the committed mode; it does not change it.

`clay.toggleEditMode()` is the one-line form. In draft mode it opens `?editmode=true`, and otherwise it calls `setMode`.

Every page answers Cmd+Shift+E (Ctrl+Shift+E elsewhere) with `setMode` for a person who can edit. A page with no switch of its own shows that person a one-time note pointing to the shortcut. Mark your own control `clay-mode-toggle` to replace the note, or load the `menu` plugin for a ready-made Edit switch in the top right ([menu](https://clayjs.com/docs/plugins/menu/)).

### 3.3 Switching without a reload: clay-mode-switch="live"

`<html clay-mode-switch="live">` is the author's promise that every edit resource can be taken back. Without it, `setMode` takes the guarded reload: it saves, writes the receipt and reloads.

A document registers participants with `clay.modeLifecycle.register(...)`, or before the loader runs through the `window.clay.modeParticipants` array, which survives the boot and is drained by the first entry.

A participant is `{ id, order, prepare }`. `order` decides prepare order and defaults to `0`. `prepare(context)` returns a lease:

- `ready`: a promise the entry awaits before it goes on, or nothing.
- `enable`: runs synchronously, once every preparation has succeeded.
- `quiesce`: stops admission without losing buffers.
- `resume`: takes the very same lease back after a refused exit.
- `dispose`: runs only after a committed exit.

`context` is `{ generation, destination, signal, represented, reader, initial, isCurrent() }`.

`clay.modeLifecycle.canWrite()` is true while this tab is in edit or draft and no transition is running. `clay.modeLifecycle.state` reports `phase` as `idle`, `entering`, `leaving` or `blocked`, beside `mode`, `destination`, `generation` and `reason`. A committed change fires `clay:modechange`, and a refusal is the returned code plus `state.reason`.

An id that starts with `clay:` is reserved for the built-in sessions.

One 15 second deadline covers the whole transition: every import a participant prepares from, the preparation itself and the commit.

`prepare` must not await `clay.ready`. The loader awaits `activateInitialMode()` before it resolves `ready`, and `activateInitialMode()` awaits every `prepare`, so a `prepare` that awaits `ready` waits on itself.

An asynchronous callback checks `context.isCurrent()` and `clay.modeLifecycle.canWrite()` before it changes a record.

A participant registered before the loader runs, with a lease that has all five members:

```js
window.clay.modeParticipants = [
  {
    id: "board",
    order: 10,
    prepare: async (context) => {
      const editor = await openEditor(context.signal);
      return {
        ready: null,
        enable: () => editor.adopt(),
        quiesce: async () => editor.flush(),
        resume: () => editor.resume(),
        dispose: () => editor.teardown(),
      };
    },
  },
];
```

### 3.4 Leaving edit

The exit waits for the writes it is allowed to wait for, and refuses with a code when it cannot finish:

- an unsent composer or an unresolved IME composition answers `pending-input`.
- an unresolved conflict answers `conflict`.
- a save whose outcome is unknown answers `save-unknown`.
- a failed save answers `save-failed`.
- a pending upload is flushed first, and one that is still running answers `pending-input`.

A refused exit resumes the very same leases and leaves the page in edit, with `clay.modeLifecycle.state.reason` naming why. Nothing blur-submits: the exit never commits text a person did not commit.

Entering edit writes nothing. The session adopts the file it shows as its baseline (`save.adoptEntryBaseline`), so a clean enter and exit leaves the file byte for byte the same. The recorded case is `enter-leave-zero-writes` in the clayjs corpus.

### 3.5 Attributes across a mode change

The four controlled families, `editmode:contenteditable`, `editmode:onclick`, `viewmode:disabled` and `viewmode:readonly`, are handed back with their authored values after a cycle.

Frozen regions keep their saved contents.

`editmode` on `<html>` follows each commit, and it is stripped from every save.

A committed live switch drops `?editmode=` from the URL.

`opens-in` is read once at boot and never rewritten.

### 3.6 A complete example

One persisted note, a participant registered before the loader, an explicit initial edit, and a composer that holds a comment until it is sent or discarded. The participant's script goes above the loader in the same document.

```html example=mode-cycle-page
<!DOCTYPE html>
<html clay-mode-switch="live">
<head>
  <meta charset="utf-8">
  <title>Notes</title>
</head>
<body>
  <article data-id="note">
    <div id="content" editmode:contenteditable inert-contenteditable="plaintext-only">A note kept in the file.</div>
    <div class="composer" clay="editor-ui">
      <input id="comment" unsent="comment" placeholder="Add a comment">
      <button id="send" type="button">Send</button>
      <button id="discard" type="button">Discard</button>
      <span id="count" aria-live="polite"></span>
    </div>
  </article>
  <script src="https://clayjs.com/v1/clay.js?plugins=unsent&exclude=richclay"></script>
</body>
</html>
```

The record is a controlled element, so a save writes the inert spelling back and no reader receives an editable note. The lease hands that surface to the session and takes it back on the way out, and a write that lands in a later turn checks the session is still current and still admits writes:

```js example=mode-cycle-participant
window.clay = window.clay ?? {};
window.clay.modeParticipants = window.clay.modeParticipants ?? [];

window.clay.modeParticipants.push({
  id: "notes",
  order: 10,
  prepare: async (context) => {
    const content = document.getElementById("content");
    const count = document.getElementById("count");
    const editable = "plaintext-only";

    const paint = () => {
      setTimeout(() => {
        if (!context.isCurrent() || !clay.modeLifecycle.canWrite()) return;
        count.textContent = `${content.textContent.trim().length} characters`;
      }, 0);
    };

    return {
      ready: null,
      enable() {
        content.setAttribute("contenteditable", editable);
        content.removeAttribute("inert-contenteditable");
        content.addEventListener("input", paint);
      },
      quiesce: async () => {},
      resume() {
        content.setAttribute("contenteditable", editable);
        content.removeAttribute("inert-contenteditable");
      },
      dispose() {
        content.removeEventListener("input", paint);
        content.removeAttribute("contenteditable");
        content.setAttribute("inert-contenteditable", editable);
      },
    };
  },
});
```

```js example=mode-cycle-submit
const comment = document.getElementById("comment");

document.getElementById("send").addEventListener("click", async () => {
  const content = document.getElementById("content");
  const line = document.createElement("p");
  line.textContent = comment.value;
  content.append(line);
  clay.unsent.clear(comment);
  comment.value = "";
  await clay.save();
});

document.getElementById("discard").addEventListener("click", () => {
  clay.unsent.clear(comment);
  comment.value = "";
});
```

Leaving edit is refused while the composer holds unsent text, and it succeeds once Send or Discard clears that text.

### 3.7 The root attributes

At load, ClayJS sets `editmode="true|false"` and `pageowner="true|false"` on `<html>` in both modes, `canedit="true"` while this person may edit (kept current on `clay:capabilitychange`), and `draftmode="true"` in draft mode. In edit mode, it also sets `savestatus` (`saving`, `saved`, `error`, `offline`, `conflict`) once the page settles, and `unsaved="true"` while there is work a save has not written. **All of them are removed on every save**, along with the host's `savetoken` and `documentetag`. The saved file's `<html>` carries none of them.

Before ClayJS runs, `editmode` is **absent**, not `"false"`. CSS keyed on `html[editmode="false"]` shows edit chrome to visitors until boot. Key on `html:not([editmode="true"])` instead.

### 3.8 Showing and hiding edit controls: clay-options

Load the `clay-options.js` satellite and mark edit-only controls with `show-when:editmode="true"`:

```html
<button type="button" data-action="add" show-when:editmode="true">+ Add book</button>
```

The satellite compiles each distinct pattern into one CSS rule in `<style data-name="option-visibility">` in `<head>`. Showing and hiding uses no JavaScript and preserves each element's own `display` when shown. Because that `<style>` is saved, a viewer's browser hides edit controls at first paint after the first save, before any script runs.

**Before the first save**, there is no saved rule. Add this fallback rule to your stylesheet in every file, as the skeleton does:

```css
html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
```

Visibility attributes:

| Attribute | Visible when |
|---|---|
| `show-when:NAME="a\|b"` (alias `option:NAME`) | The element or any ancestor has `NAME` equal to `a` or `b`. |
| `hide-when:NAME="a\|b"` | Hidden when the element or any ancestor has `NAME` equal to one of them; shown otherwise, including when no ancestor has `NAME`. |
| `option-not:NAME="a"` | An ancestor has `NAME` with a value other than `a`; hidden when no ancestor has `NAME`. |

- Rules match **any** ancestor, not the nearest. Nested views need different attribute names (`view` on the app, `cardview` on a card).
- Rules compare literal strings only. For expressions, use sap's `show=` ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).
- `show-when:savestatus="error|offline"` shows a "not saved" warning. `show-when:pageowner="true"` shows owner links.
- For viewer-only content, use `hide-when:editmode="true"`, which is visible when `editmode` is absent. `show-when:editmode="false"` stays hidden until boot and then appears.
- The attribute that switches views is ordinary saved content. Setting `view="list"` on a saved element saves and syncs it to every collaborator. [Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state) covers tab-local views.

### 3.9 Mode attributes: one file for editors and viewers

Four attributes make an element behave differently by mode. A **save transform** writes the inert form into the file, and **edit mode** activates it on load. A view boot never loads the activation code, so a viewer sees what the file holds.

| Attribute | In the saved file | In edit mode |
|---|---|---|
| `editmode:contenteditable` | `contenteditable` renamed to `inert-contenteditable` (value kept) | `contenteditable` restored |
| `editmode:onclick` | `onclick` renamed to `inert-onclick` | `onclick` restored |
| `editmode:resource` on `<script>`, `<style>`, `<link>` | `type` prefixed `inert/` | `inert/` prefix stripped and element re-inserted so it runs |
| `viewmode:disabled`, `viewmode:readonly` on controls | `disabled` / `readonly` added | removed |

There is no general `editmode:<anything>`. Only these four attributes exist.

```html
<span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">Title</span>
<input type="checkbox" persist viewmode:disabled disabled>
<input type="number" bind="amount" persist viewmode:readonly readonly value="72">
<script editmode:resource type="inert/text/javascript" src="board-editor.js"></script>
```

**Author records in the saved form**, as above. A file written with live `contenteditable` or without `disabled` gives every viewer editable text and live checkboxes until the owner's first save rewrites it. The test suite checks each example's view mode from the very first open.

**Write templates in the active form.** The save transform does not reach `<template>` content, and clones are inserted while the owner edits. A clone with `inert-contenteditable` would stay uneditable until reload. On the next save, the transform converts the clone like any other element.

```html
<template id="item-tpl">
  <li><input type="checkbox" persist viewmode:disabled> <span class="title" editmode:contenteditable contenteditable="plaintext-only"></span></li>
</template>
```

Use `contenteditable="plaintext-only"` for titles, labels, and cells to prevent formatting and pasted markup. Make Enter blur instead of inserting a line break, as in the skeleton's keydown handler. Use `editable` ([richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable)) only where you need rich text.

### 3.10 What works in view mode

`window.clay` keeps `ready`, `setMode`, `mode`, `canEdit`, `modeLifecycle`, `isEditMode`, `isDraftMode`, `isOwner`, `toggleEditMode`, `Mutation`, `region`, `readData`, `writeData`, `assets`, `ephemeral`, `storage`, `host`, `trash`, `derived`, `effect`, `style`, `morph`, and `hasUnsavedChanges` (always `false`) in both modes. It also includes whatever view-mode plugins and satellites add (`clay.conflicts` and `clay.morph` with `sync`, `clay.cms`, `clay.quickcrop`, `clay.toast`, and others). There is no `save`, `getHTML`, `addDocumentTransform`, `onSnapshot`, `undo`, `RichClay`, or `upload`, and no `markDirty` unless `sync` is loaded (where it is harmless). On a template copy whose tab can edit, the `upgrade` plugin loads in view and `clay.save` holds only `replace`, so test `clay.isEditMode`, never `'save' in clay`.

- Guard edit-only APIs with optional chaining (`clay.addDocumentTransform?.(fn)`), or return early with `if (!clay.isEditMode) return`. An unguarded call throws and stops the rest of the script for viewers.
- Click handlers run for viewers too. Hidden buttons cannot be clicked, but guard edit actions anyway with `if (!clay.isEditMode) return`, as the examples do.
- A viewer can still use read-only interactions: open a card, filter, search, export, or scroll the outline. Those use chrome and tab-local state, so they work the same in both modes.
- With `sync` loaded, a viewer rides the saved lane and receives each accepted save, so a published page updates live ([What sync is](https://clayjs.com/docs/guide/live-sync/#what-sync-is)).
- Clicking inside `[trigger-save]` in view mode dispatches `clay:view-save-attempt`, so you can explain why nothing saved.

### 3.11 When the page editor is ready

The mode this tab starts in is decided at load, but a `page` document is ready to edit later. `clay.page.ready` resolves when its editor is mounted and accepts typing. `clay.page.status` holds that boot result: `{ phase, reason, installId, at }`.

`clay.ready` does not wait for the page editor. Because `plugins/page.js` exports no `ready`, `await clay.ready` can resolve while the saved article is still on screen. Late plugins do wait, so a page that ships with them needs nothing extra.

Each boot stage records a `performance.mark` with `{ detail: { installId } }`:

- `document:boot`: an installation starts, before the source is validated.
- `document:assets-ready`: the editor's code is loaded.
- `document:authority-ready`: the capability and first-save gates passed, the page handle is admitted, and the binding is created. Writer election and the article's feature views are still ahead.
- `document:input-ready`: adoption succeeded and editing was enabled on the mounted view. A failed or cancelled installation never emits it.

When boot is blocked, `clay.page.ready` still resolves rather than throwing an error. `clay.page.status.phase` is `blocked`, and `reason` names where boot stopped (`missing-capability`, `first-save-refused`, `first-save-conflict`, `admission-failed`, `editor-assets-failed`, `mount-failed`, `adoption-refused`, `adoption-timeout`, `adoption-error`, `page-replaced`, `view-detached`, `no-page`, `ambiguous-page`, `invalid-page-source`, `invalid-page-json`, `unsupported-page-format`, `missing-page-store`, `boot-incomplete`). Nothing accepts keystrokes: the saved article stays as the host served it, or an already-mounted editor is left read-only because the page was replaced. Base your fallback on `phase`, not on a caught exception:

```js
const boot = await clay.page?.ready;
if (boot?.phase !== "ready") document.documentElement.setAttribute("read-only", "true");
```

`clay.page.install()` disposes the last installation and starts a fresh one with its own id, letting a page retry after a failure without reloading.

### 3.12 The page editor on a phone

At widths up to 560 px, the page editor's toolbar keeps four controls: Bold, Italic, Link, and More. Each is at least 44 by 44 CSS px inside a 204 px bar with 4 px gaps and 8 px padding. The selection bubble is hidden so two bars never appear at once.

More holds the rest: Strikethrough, Code, bulleted, numbered, and checklist lists, Turn into, Insert, Move up, Move down, Indent, and Outdent. Turn into and Insert open the same pickers used on desktop. Move and indent actions apply to the caret's block when nothing more is selected.

The bar is positioned from the visual viewport, not the layout viewport. Its top and horizontal bounds come from the visible area, so an on-screen keyboard cannot cover it and panning the visual viewport moves it with the page. The safe-area inset is read once per layout frame. Menus stay inside the visual viewport, open above the bar when there is room, and scroll internally. Desktop layouts are unchanged.

### 3.13 Keyboard navigation in the page editor

Escape closes an open menu or the link popover first, returning focus to the control that opened it or to the editor.

From a block selection, Escape moves focus from the writing surface to the first toolbar control while keeping the selection, so the keyboard is never trapped in `contenteditable`. In the toolbar, Left and Right move between controls, and Escape returns to the editor. The toolbar is a single tab stop with a roving tabindex: Tab leaves it forward and Shift-Tab leaves it backward. Inside a table, Tab moves across cells and Shift-Tab moves back. The editor takes Tab for nothing else.

A table's column resize handle is a focusable vertical separator named for its column, with `aria-valuemin` 48, `aria-valuemax` 1200, and the current width in `aria-valuenow`. Left and Right preview a 10 px change (50 px with Shift), while Home and End preview the minimum and maximum. Enter commits the change, and Escape cancels it. Holding an arrow key previews across repeated keydowns. The keyup that ends the repeat, Enter, or leaving the handle commits one command, so a held arrow key records a single undo item. Double-click fits the column, and pointer dragging is unchanged. On a phone, the column's Width menu (Wider, Narrower, Fit to content, and Reset width once the column has a width) does the same job.

---

## 4. What gets saved

### 4.1 What a save writes

A save writes the current DOM with these changes:

- Subtrees marked `no-save`, `no-snapshot`, or `editor-ui` are removed.
- `freeze` elements write the inner HTML they had when they first appeared (at load or on insertion). Their live contents are a per-tab scratchpad.
- Mode attributes go inert ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers)). Root attributes `editmode`, `pageowner`, `canedit`, `draftmode`, `savestatus`, `unsaved`, `savetoken`, and `documentetag` are removed.
- `persist` controls write their live values ([`persist`: form controls](https://clayjs.com/docs/guide/record/#persist-form-controls)).
- Runtime residue from ClayJS editors (richclay attributes, toolbars) and browser extensions (password managers, Grammarly, Dark Reader) is stripped.
- Your hooks run ([Hooks](https://clayjs.com/docs/guide/saving/#hooks)).

Everything else on the page is written as it is, including changes builders forget:

- Classes and attributes toggled for UI: `.selected`, `aria-expanded`, `<details open>`, `hidden`. Mark them `ephemeral` instead ([Ephemeral state: per-tab state on saved elements](https://clayjs.com/docs/guide/record/#ephemeral-state-per-tab-state-on-saved-elements)). `<dialog open>` is the exception: it is never saved.
- Inline styles from libraries and helpers: Sortable's `draggable="false"` and `style=""`, `el.hide()`, `All(...).css()`, and `body.style.overflow = "hidden"` from an open modal or crop dialog.
- Any element a script inserts outside an excluded region.

State outside the light DOM and attributes is never saved. This includes JavaScript objects, `localStorage`, canvas pixels, scroll position, focus, and selection. It also excludes shadow DOM content (only the host element's light DOM and attributes are saved), iframe content, the live value of a control without `persist`, and password, hidden, and file input values even with `persist`.

### 4.2 Regions: the `clay` attribute

Region tokens on the `clay` attribute control how ClayJS saves, syncs, watches, and undoes an element and its descendants. Pass space-separated tokens in `clay="token token"` or use bare attributes like `<div no-save>`. Set tokens on creation or with `clay.region.addRegionToken(el, "editor-ui")`.

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

**When chrome needs a region, use `editor-ui`, not `no-save`.** `editor-ui` bundles `no-data no-save no-snapshot no-watch no-undo`. By itself, `no-save` still records undo steps and stays in the snapshot live sync sends to peers. Peers never apply it, but its text travels to every edit-mode tab (viewers receive the saved file without it). `editor-ui` replaces `clay="no-save no-watch"` from older docs.

Legacy spellings still work: `save-remove` is `no-save no-undo`, `save-ignore` is `no-dirty no-undo`, `save-freeze` is `freeze no-undo`, `mutations-ignore` is `no-watch`, `snapshot-remove` is `no-snapshot`.

Traps in this table:

- **An edit inside `no-watch` or `no-dirty` is invisible to `clay.save()` and the close warning.** `save()` answers "No changes to save" and closing the tab loses it silently. It is saved only when another change triggers a save, or by `clay.save.force()`. Never put typed work there.
- **`freeze` is a scratchpad.** The element belongs to the document: its attributes save, and it syncs, moves, and merges like any element. Its contents belong to this tab: a runtime change inside is never saved, not even by `clay.save.force()`, and never reaches a peer. Every save restores the contents the element had when it first appeared.
- **A scratchpad from a peer arrives empty.** When a peer adds a record that contains a frozen element, it is inserted without contents. Fill scratchpads from code that runs on every change (a sap `effect` or your render function), never once at boot.
- **Fill a scratchpad after `clay.ready`, and insert new ones empty.** The contents are captured when the element first appears. Content written before boot, or present in a cloned element when inserted, becomes its saved contents. Empty the scratchpads in a copied record before inserting it.
- **Create `editor-ui` roots at runtime from an unmarked `<template>` on every load.** An `editor-ui` root disappears from the saved file, so it cannot be authored in the file. Do not mark the blueprint inside the `<template>` as `editor-ui`, or the first save empties the template and leaves no chrome to clone on the next load. Leave the blueprint unmarked and set `clay="editor-ui"` on each clone as you insert it.

### 4.3 `persist`: form controls

Put `persist` on every `<input>`, `<textarea>`, and `<select>` whose value belongs to the record. A control's typed value is a property, not an attribute, and serialization only reads attributes. Without `persist`, a typed value is lost on save and the file keeps the authored `value`.

```html
<input type="checkbox" persist viewmode:disabled disabled checked>
<input type="number" step="0.01" persist value="312.40">
<textarea persist></textarea>
<select persist><option>todo</option><option selected>doing</option></select>
```

- On `input` (text-like fields) and `change` (checkbox, radio, select), ClayJS mirrors the live value into `value`, `checked`, or `selected`. A textarea's value goes into a `data-value` attribute while typing and becomes its text content in the save.
- A `<textarea>` merges as one value, so do not use `<textarea persist>` for long text several people edit. Keep the text in a record element (`<pre><code>`) and bind an editor outside the records to it with `clay.bindText` ([OverType: a markdown editor](https://clayjs.com/docs/guide/components/#overtype-a-markdown-editor)).
- A snapshot also copies every `persist` control's live state, so a value set from script with no event is saved too.
- Password, hidden, and file inputs are never persisted. An authored `value` on them stays in the file.
- `persist` goes on the control itself, never on a wrapper.
- Changing a `persist` control's value counts as an edit and starts autosave.
- Do not persist a filter or search box. Those are tab-local: put them in chrome ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).

**After undo, redo, or a merge, ClayJS puts each control's display back in step with its attributes.** A control the user has touched shows its live property, not its attribute. A merge and the undo plugin copy `checked`, `value`, and `selected` back onto the property (undo does this for `persist` controls outside `no-undo` regions). A merge leaves the focused text field alone, while undo restores it too.

### 4.4 Where to keep data that is not visible text

In order of preference:

1. **Attributes on the element they describe.** `<li class="card" data-id="c-7f3a" data-due="2026-11-02" data-points="3">`. The default. Saved, merged per attribute, readable by agents, and moves with the element.
2. **Hidden elements inside the record.** `<ul hidden class="archive">`, or the card detail inside the card ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)). Same properties, good for archived items and detail fields.
3. **A JSON script with `merge`.** For data that markup expresses badly (formula grids, chart series, settings objects):

   ```html
   <script type="application/json" id="model" merge="store">{"series":[{"id":"s1","points":[3,5,8]}]}</script>
   ```

   ```js
   function writeModel(model) {
     document.getElementById("model").textContent = JSON.stringify(model).replace(/</g, "\\u003c");
   }
   ```

   Always escape `<` so a value containing `</script>` cannot close the element early and corrupt the file on reload. Re-parse on every `clay:sync-applied`, because a merge changes the text, not your parsed object. When two writers change the same key, the incoming value wins and the lost value shows in the conflict notice ([Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync)).
4. **A live JSON script (`clay="live"`)** for state that changes faster than a save: game boards, scores, cursors ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)).
5. **`<template>` content: never for mutable data.** It is saved, but edits there never trigger autosave.

### 4.5 Element identity: `data-id` and `id`

Live sync and undo pair elements across versions by **`data-id`, then `id`**, used only when the value is unique on its side and the tag names match. Without an id, elements pair by content, which works for distinct text and fails for identical new items.

- **Give every repeated item a unique `data-id` when it is created.** With ids, two people adding an item at the same place always keep both items. Without ids, items with distinct text usually both land, items with similar text ("New card", "New task") drop one into the conflict ledger, and items with identical or blank text drop one **with no ledger record**.
- **Assign fresh ids when cloning.** A duplicated `data-id` counts as no id at all. Re-id the clone and every id-carrying descendant, as the writer's duplicate command does:

  ```js
  const copy = block.cloneNode(true);
  copy.querySelectorAll('[clay~="editor-ui"]').forEach((el) => el.remove());
  copy.querySelectorAll("[data-richclay-active]").forEach((el) => clay.RichClay.stripElement(el));
  copy.dataset.id = newId("b");
  copy.querySelectorAll("li[data-id]").forEach((li) => { li.dataset.id = newId("t"); });
  ```

- **Leave `data-id` off templates.** The command that clones a template assigns one. For a plain "add an item" button, `<button add-from="#item-tpl" add-to="#list">` handles the clone, the id, and the focus with no script.
- **Never stamp ids on open.** Opening an old file must not rewrite it. Add an id when an item is created or first changed.
- **Make ids without `crypto.randomUUID`** unless the file is only ever served over https or localhost, because it is missing in insecure contexts. The examples use `prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`.
- **A `data-id` is also what presence names.** A record target `{ kind: "record", id }` carries it, so a stable id is what lets a peer's badge find the row again after a reload or a merge ([Presence](https://clayjs.com/docs/guide/live-sync/#presence)).
- **Use ids to find records in commands:** `` board.querySelector(`.card[data-id="${CSS.escape(id)}"]`) ``. Never find a record by position.

### 4.6 Assets

ClayJS saves an image through its `src`. Upload the file and write the returned URL ([upload and quickcrop](https://clayjs.com/docs/guide/components/#upload-and-quickcrop)). Every host returns a host path such as `/_/uploads/assets-<name>/photo-ab12.png`, which keeps working on that host when the document is renamed or moved. A document opened straight from disk shows those images broken; Export as zip takes a document with its files. Where the host cannot store files, embed a `data:` URL. Data URLs work anywhere, but every save carries the bytes, so keep embedded images small.

### 4.7 Ephemeral state: per-tab state on saved elements

Use `ephemeral` for per-tab state on a saved element, such as a selected card, a row being dragged, or an open section. Toggling a normal class or attribute is an edit like any other: it marks the page unsaved, starts an autosave, adds an undo step, reaches every peer, and lands in the file. Mark it `ephemeral` instead:

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
- Ephemeral state is never saved, sent to peers, undone, or counted as a change. An incoming merge from a peer or from the file on disk never writes or removes it on an element this tab already has. The router's `route-active` gets the same treatment.
- Identity (`class`, `id`, `data-id`), region attributes (`clay`, `no-save`, `freeze`, and the rest), and form state (`value`, `checked`, `selected`, which `persist` owns) can never be made ephemeral.
- Because ephemeral changes are not changes, `onmutation` and `onglobalmutation` handlers do not fire for them. Update anything derived from a selection in the same function that changes it.

Use `ephemeral` for state on one element. State that comes from the URL hash and spans many records (the open card, a filter) is still painted with a runtime stylesheet ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).

---

## 5. Saving

### 5.1 Edit mode and the save path

In edit mode, ClayJS saves the whole document to `POST /_/save` on the page's origin (or `/_/save/<savetoken>` on HTML Clay). Cmd+S (Ctrl+S elsewhere) and clicks inside any `[trigger-save]` element call `clay.save()` on every edit-mode page, with or without autosave. A close warning appears whenever there are unsaved changes.

Leaving edit saves first. If that save fails, or text is still unsent, or a conflict is open, the switch is refused with a code and the page stays in edit ([Leaving edit](https://clayjs.com/docs/guide/edit-mode/#leaving-edit)).

#### 5.1.1 The saved title

ClayJS derives the saved `<title>` from the document rather than keeping the authored `<title>`. The save projection reads the captured model and takes the first top-level H1, collapsing and trimming whitespace runs. A page with no top-level H1 gets the title `Untitled`. The server checkpoint renderer runs the same function on the same model, so a room checkpoint writes the same title a client save would.

To keep an authored `<title>`, put `<meta name="clay-seo-title-mode" content="custom">` in `<head>`. ClayJS then leaves `<title>` untouched. Setting a custom title in the SEO panel writes that marker, and removing it restores the derived title on the next save.

Title changes only update the document's content. ClayJS never derives or changes a file's name. A save writes bytes to the route the host already serves, so the file name, downloaded name, and local folder path stay the same. Renaming a file is up to the host or the user.

### 5.2 Autosave

`<html autosave>` present at load turns on autosave. Adding or removing it later changes nothing.

- A watched DOM change or a `persist` input starts a 1500 ms debounce. Continuous changes save at most 10 s after the first one. After each save, the next automatic save waits at least 1.2 s, and at least four times as long as that save took to prepare, up to 30 s, so a page whose saves are expensive saves less often instead of saving between keystrokes.
- Measured: one edit saves at about 1.5 s, 50 edits in a second save once at about 2.5 s, and an edit every 300 ms saves at about 10 s.
- Template content edits never trigger autosave.
- A save that fails (500 or network) is **not retried** until the next edit or the browser's `online` event. `savestatus="error"` stays up. If your app can sit idle after a failure, retry yourself:

  ```js
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && document.documentElement.getAttribute("savestatus") === "error") clay.save();
  });
  ```

**The load-settle window.** At load, ClayJS takes a baseline of the document. It retakes the baseline once the page is quiet for 500 ms (at most 3 s), unless the user typed or a save ran. It then sets `savestatus="saved"` and fires `clay:baseline-settled`. Anything app code writes to the record during that window becomes part of the baseline: it is not saved, not autosaved, and not counted as unsaved. It reaches the file only when a later edit triggers a save:

- Do not seed defaults, migrate a schema, or stamp ids at startup. Author defaults in the file.
- If an app must write at startup, write after `clay:baseline-settled` (or once `<html savestatus>` exists), or follow the write with `await clay.save.force()`.

### 5.3 Manual-save pages and batching

To disable autosave, such as for a long-form writer where frequent saves are unwelcome, omit `autosave`. Cmd+S, `[trigger-save]`, and the close warning still work. Save when the tab hides:

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && clay.isEditMode && clay.hasUnsavedChanges()) {
    clay.save.flush({ keepalive: true }).catch(() => {});
  }
});
```

Keep autosave on for collaborative pages. Peers see an edit only after it saves ([What sync is](https://clayjs.com/docs/guide/live-sync/#what-sync-is)).

To batch saves in part of an autosaving page, wrap that region in `clay="no-trigger-autosave"`. Edits there still count as unsaved and warn on close, but never start a save. Your own `clay.save()` (on blur, or every 30 s) writes them, as does any save triggered by another edit.

`clay.Mutation.pause()` and `resume()` hide DOM mutations from the mutation hub's listeners, including autosave's mutation trigger, while paused. The next save still writes those mutations. They do not pause input: `input` and `change` events on controls, including synthetic ones, still mark the page dirty and start autosave. Pair them in `try/finally`. An unbalanced pause silences mutation-driven autosave for the rest of the session.

### 5.4 The save API

`clay.save()` returns `Promise<{ ok, msg, msgType, code, etag }>` and never rejects. One exception in 1.8.2: when capturing the page fails because a registered hook threw ([Hooks](https://clayjs.com/docs/guide/saving/#hooks)), the result has `msgType: "error"` and no `ok` field.

| Result | Meaning |
|---|---|
| `ok: true`, `msgType: "success"` (or `"warning"`) | The host accepted these bytes |
| `ok: false`, `msgType: "skipped"`, `msg: "No changes to save"` | Nothing in the dirty domain changed |
| `ok: false`, `msgType: "skipped"`, `msg: "Save already in progress"` | A save is in flight; these bytes are queued and sent after it |
| `ok: false`, `msgType: "conflict"` | HTTP 412: the file changed elsewhere ([Conflicts on save (412)](https://clayjs.com/docs/guide/saving/#conflicts-on-save-412)); also carries `changedBy`, `afterTimeout`, `conflictEtag` |
| `ok: false`, `msgType: "error"` | The host refused or the network failed |
| `ok: false`, `msgType: "unknown"` | 12 s timeout; ClayJS asks the host whether it landed |

**Branch on `msgType`, not `ok`.** `ok: false` also means "nothing to save" or "queued behind another save". To ensure the host holds what the page holds now, use `flush`:

- `clay.save.soon()` saves a discrete action (a moved card, a toggled checkbox) within about 250 ms instead of after the autosave wait. Calls within a second share one save, and each resolves with that save's result. A save you asked for with Cmd+S or `soon()` that an incoming merge cancels mid preparation is captured again once, after the merge settles (150 ms of quiet, at most 2 s); an autosave cancelled the same way is not retried. Leave typing on autosave.
- `clay.save.flush({ keepalive, timeoutMs })` resolves `{ state: "view" | "clean" | "saved", etag }` only when the host holds the current bytes. It waits out the settle window and any in-flight save, and retries while the page keeps changing. It rejects with `err.state` of `failed`, `conflict`, or `blocked`.
- `clay.save.force()` saves without the dirty check, writing `no-dirty` and `no-watch` edits. Template content edits need no force: `save()` and the close warning see them, and only autosave does not.
- `clay.save.overwrite()` re-reads the host's current version stamp and force-saves over it. This is "keep mine" after a conflict.
- `clay.getHTML()` returns the exact bytes a save would send. It runs your `onbeforesnapshot` and `onbeforesave` hooks and closes the open undo batch, so do not call it on every keystroke.
- `clay.hasUnsavedChanges()` is synchronous and costs one full capture of the document.
- `clay.registerUnsavedState({ id, isPending })` registers work held outside the DOM (such as an unapplied form) so the close warning and `flush` respect it. Call the returned `changed()` when it changes and `dispose()` when done.
- `clay.markDirty()` tells the dirty gate about an edit no mutation shows, for an editor whose surface is `editor-ui` and which writes the record itself.

### 5.5 Size limits

The limit comes from the host's `/_/meta` answer, `document.maxBytes`: the most bytes of uncompressed UTF-8 HTML one save body may have, inclusive. It counts only as a positive safe integer. A missing, zero, negative, fractional or non-numeric value means the limit is unknown, and `clay.save.limits()` resolves `{ maxBytes: null }`. Draft mode answers the same without asking the host at all. See [Hosts, assets and privacy](https://clayjs.com/docs/guide/hosts/#what-each-host-gives).

A save is measured on the exact UTF-8 bytes it is about to send, after hooks, transforms and cleanup, and refused before anything is sent when it is over. The result is `{ ok: false, code: "save-too-large", sent: false, size }`, where `size` holds `{ bytes, maxBytes, state: "over" }`. Nothing is written: no accepted listener runs, no baseline moves and no recovery copy is cleared. A host that answers 413 maps to the same code.

The host stays authoritative. A client that predates this check, a first save sent before discovery answers, and a limit that changed after it was read are all decided by the host's own refusal, which leaves the writing recoverable.

`clay.save.inspect(html)` measures bytes that are not this page, such as a file you are about to import, without capturing, sending or moving a baseline:

```js
const size = await clay.save.inspect(candidateHTML);
if (size.state === "over") return say("That is larger than this host can save.");
```

A real save that measures `near` or `over` fires `clay:save-size` and loads a small notice into the editor UI. It reports the last measurement, never a live size:

- Near: `This file is getting large. At the last save attempt: 1.6 MB of 2.0 MB. Download a copy, then reduce its size; saving still works.`
- Over: `This host can't save a file this size. At the last save attempt: 2.1 MB of 2.0 MB. Download a copy to keep your work.`

**Download my copy** appears only when the measurement is over. The notice is hidden by a later save measurement below the threshold, and when the page leaves edit mode. It is loaded only when a measurement is near or over, so most pages never fetch it.

To make a copy of the page without some of its records, remove them from the clone with `clay.getHTML({ transform })`:

```js
const html = clay.getHTML({
  transform: (root) => {
    for (const el of root.querySelectorAll("#entries > article.entry[data-drop]")) el.remove();
  },
  flushUndo: false
});
```

The transform must be synchronous and its return value is ignored. The live page, the baselines and the network are untouched. See [Importing and exporting records](https://clayjs.com/docs/guide/architecture/#importing-and-exporting-records).

### 5.6 Conflicts on save (412)

On hosts that announce `conditional` (all three hosts in [What the host does](https://clayjs.com/docs/guide/model/#what-the-host-does)), every save sends `If-Match` with the version the tab last saw. If the file changed elsewhere and live sync has not merged that change yet, the host answers 412 and writes nothing.

- The save returns `msgType: "conflict"`, sets `<html savestatus="conflict">`, and fires `clay:save-conflict`. Unsaved work stays in the page. **Autosave stops** until the conflict is resolved, and Cmd+S is refused again.
- ClayJS shows a built-in notice with three actions: **Keep mine** (`clay.save.overwrite()`), **Accept theirs** (press twice; reloads and drops local edits), and **Download my copy** (an HTML file with your version and a list of replaced edits).
- With `sync` loaded, most 412s resolve themselves. The merge brings in the version that beat this tab and fires `clay:save-conflict-resolved`.
- The first save after load can go out without `If-Match` on a slow host because version discovery is not awaited. That save is last-write-wins.
- If you hide the built-in notice, you must still offer overwrite and reload.

### 5.7 Hooks

Hooks shape the saved bytes without touching the live page. Except for `onaftersave`, they run on a clone.

| Hook | Runs on | Use for |
|---|---|---|
| `onbeforesnapshot="code"` attribute | The clone, for every snapshot: save, change check, sync broadcast | Normalizing tab-local state out of anything that leaves the tab |
| `onbeforesave="code"` attribute | The save clone and change-check clones (not sync broadcasts) | Cleaning a subtree before it is written |
| `clay.onSnapshot(fn)` | Every snapshot; `fn(clone, { original })` | Stripping library residue everywhere |
| `clay.addDocumentTransform(fn)` | The save clone and every change check | Writing derived values into the saved copy only |
| `onaftersave="code"` attribute | The **live** element after each accepted save | Post-save live DOM updates (rarely) |

In attribute hooks, `this` is the cloned element (or the live element in `onaftersave`). Here, the finance tracker keeps sap's search filter (rows hidden with `hidden`) out of the file and out of peers' copies:

```html
<tbody items="txns" onbeforesnapshot="this.querySelectorAll(':scope > [item][hidden]').forEach((row) => row.removeAttribute('hidden'))">
```

Rules:

- **Hooks must be pure and repeatable.** They run on every autosave check, every `hasUnsavedChanges()`, and every `getHTML()`. A hook that writes a timestamp or counter makes the page permanently dirty and autosaves forever.
- A throwing **attribute** hook aborts only that hook. A throwing `clay.onSnapshot` or `clay.addDocumentTransform` callback aborts the capture: `getHTML()` throws and every `save()` fails with `msgType: "error"` until it stops throwing. Registered callbacks must handle missing elements themselves, because change-check captures have already removed `editor-ui`, `no-save`, and `no-snapshot` regions.
- `onaftersave` writes to the live DOM, so any record change it makes counts as a new edit and causes a save loop with autosave. Mark what it writes `editor-ui`, or write inside a `freeze` scratchpad.
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

### 5.8 Save status

ClayJS reflects save state on `<html>`, so you can style a status indicator with CSS alone:

```css
html[savestatus="saving"] #status::after { content: "Saving…" }
html[savestatus="error"] #status::after { content: "Not saved" }
html[savestatus="conflict"] #status::after { content: "Changed elsewhere" }
```

`savestatus` records what the last save did and keeps its five values. A second root attribute, `unsaved="true"`, tracks whether there is new work that a save has not written yet. It stays on `<html>` from the first edit until a save accounts for it. That split keeps a saved document's status CSS accurate while a separate chip shows unsaved work:

```css
.chip-unsaved { display: none }
html[unsaved="true"]:not([savestatus="error"]):not([savestatus="offline"]) .chip-unsaved { display: inline }
```

In draft mode, nothing is saved on purpose, and `html[draftmode="true"]` indicates why the page is not marked saved.

Put `#status` in chrome, or load the `indicator` plugin for a ready-made chip. The chip's drawing arrives on demand, at the first input or the first save state, so it costs nothing at edit ready. With `clay-ui.js` loaded, save errors and offline states become persistent toasts. Without the `indicator` plugin, `clay-ui.js` also toasts "Saved" after every save; with it, set `clay.saveToast = true` to get those toasts too.

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

`etag` and `captureId` on these events are additive. `clay:save-saved` carries the accepted `etag` (or `null`), and every save result event carries the `captureId` naming the bytes captured before the save was sent.

A save writes only the document's own bytes, so a downloaded HTML file links to its images rather than embedding them. When the file opens, the browser fetches uploaded images from the host's URLs. Opening a copy where those URLs do not resolve shows broken images.

### 5.9 Recovery copies

`clay.recovery` keeps a local copy of edits the host has not accepted. It is not a save, and ClayJS never renders a page directly from it. After a reload, ClayJS compares the stored copies with the loaded file and asks before restoring one. A document is covered only for the channels its adapters register, so a page that registers no channel keeps no local copy.

A recovery copy is cleared by one save's own capture, not by the page's later state:

- Before sending a save, ClayJS hands the recovery service the exact bytes it captured and that capture's id. Each channel's `readSaved` reads those bytes once, and a copy is covered only when the payload it staged matches what the capture holds.
- A save that was skipped, refused, conflicted, errored, or left `unknown` clears nothing. A confirmed save clears only the revision its bytes covered, so typing during the request stays available.
- A newer revision from the same tab and every other tab's copy survive that clear. Any write that arrives after its save was acknowledged is refused by the stored watermark.
- **`clay:snapshot-ready` is not this proof.** It fires on a clone taken before `onbeforesave` hooks, document transforms, and final serialization, so what it shows can differ from the bytes the host accepts. Compare against `captureId` on `clay:save-saved` instead.

```js
document.addEventListener("clay:save-saved", (event) => {
  if (!event.detail.captureId) return;
  console.log("this save covered capture", event.detail.captureId, "etag", event.detail.etag);
});
```

The store lives in IndexedDB (`clay-recovery`), keeps 32 MiB per document scope and 64 MiB per database on this origin, holds plain text that any script on this origin can read, and reports `durable: false` whenever a write did not complete. It runs in edit mode only, draft mode included, and a reader never opens it. See [Recovery](https://clayjs.com/docs/recovery/) for the receipts, failure codes, and the difference between journaled, acknowledged, and checkpointed states.

---

## 6. Live sync and collaboration

### 6.1 What sync is

`?plugins=sync` keeps every open copy of the file converging through a **save-gated, whole-document, three-way DOM merge**, not keystroke streaming.

- An edit-mode tab sends nothing until the host accepts its save. It then relays that saved version as a frame to the other editors on the live lane. With `autosave`, this happens about 1.5 s after typing pauses, at most about 10 s.
- Each receiving tab merges the frame three ways: the last version both agreed on (base), its own current page including unsaved edits (local), and the frame (remote).
- View-mode tabs use the saved lane: they receive every accepted save and update in place.
- Outside edits to the file on disk (an agent, a text editor, or a version restore on desktop hosts) arrive as `disk` frames and merge the same way.

Collaborators see each other's work a few seconds after each pause. Without `autosave`, they see nothing until someone saves, and overlapping work only meets at save time. **Every collaborative file uses `autosave`.**

#### Sync in the view-mode reader

A Document in view mode loads its reader (`page-view`), not the editor. The reader has no write half and sees saved files only:

- **Saved, not live.** It uses its own receive-only transport (`src/sync/saved-stream.js`): a startup GET once the stream opens, then frames from the saved lane, and a refetch and repair after a reconnect or gap. It never POSTs, never sends a live relay, and needs no write credentials.
- **One receipt.** The reader holds the bytes on screen, their ETag, and the sequence they cover as one `{ bytes, etag, seq }` receipt. Duplicate or older frames are dropped without advancing it, a stamp alone never repairs missing bytes, and a refused or failed read keeps the existing article and receipt.
- **Keyed replacement.** An accepted file replaces only the blocks whose saved form changed (`src/page/reader-patch.js`). Unchanged blocks keep their nodes, so open toggles, mounted tools, and find-in-page survive.
- **Explicit `sync` keeps one owner.** On `plugins=page,sync` in view mode, the `sync` plugin already owns the saved lane. The reader opens no stream of its own and takes the files that lane applied (`clay:sync-applied` with `source: "disk"`). Neither case adopts a peer's unsaved preview as a saved file.

#### A frame from another template version

When an incoming frame has a different template version than the open page, ClayJS refuses to merge it and stops saving until you reload.

A document copied from a starter template carries `<meta name="hyper-version" content="1.1.0">` and `hyper-source` beside it so an upgrade can find it. An upgrade replaces layout, code, and data together. If a saved file names a **different** version, it is not a change to this template: the frame is refused whole, never merged, and never applied, because morphing it in would interleave two templates.

Once a frame is refused, this tab's DOM holds a version the host no longer stores. To prevent the next save from overwriting the upgrade, the tab holds every save from then on and drops every later frame. The notice says **This document was upgraded.** with one action, **Reload**, and `clay:document-upgraded` fires on `document` with `{ message }`.

Only a page that states its own version can make this check, and only a frame that states one can disagree, so a document without the meta tag behaves as usual. Holding saves belongs to edit mode, so a reader with nothing to write downloads none of it for the hold.

### 6.2 What a merge does

When an incoming frame (B) meets unsaved edits in this tab (A), ClayJS merges the DOM and records any replaced local work in the conflict ledger:

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

- Text merges word by word inside a block, and formatting merges per character. Inline `<style>` text merges word by word, while a `<textarea>` merges as one value. Scripts and comments merge as whole values.
- Matched live nodes are moved, not recreated, so listeners, focus, caret, and iframes survive. An element that matches nothing (re-keyed, or changed beyond recognition among similar siblings) is removed and inserted fresh, and listeners attached directly to it are gone. **Use delegated listeners** on `document` or a stable root.
- A new or changed inline `<script>` in the frame runs once after the merge. Guard one-time setup with `clay.start` ([Starting the app once](https://clayjs.com/docs/guide/architecture/#starting-the-app-once)).
- Window scroll is restored. Inner scroll containers are not, except the focused element's own.
- The merge runs with the mutation hub, the dirty gate, and undo paused: incoming changes never autosave and never enter undo history. `clay.effect` re-runs after it through `clay:sync-applied`, which is how the examples re-render ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)).

#### Declared attribute merges

A `data-*` attribute that both sides change is normally a conflict: B wins and A's value goes to the ledger. A container can declare two merge rules for attributes inside it instead:

- `merge-tokens="data-labels"`: the attribute is a space-separated set. Additions and removals from both sides apply.
- `merge-max="data-next-card"`: the attribute is a number that only grows, such as a counter for the next card number. The larger value wins, with no ledger record.

```html
<main merge-tokens="data-labels" merge-max="data-next-card" data-next-card="15">
  <article data-id="c1" data-labels="bug urgent">…</article>
</main>
```

Separate multiple attribute names with spaces. `data-id` is never merged this way, and undeclared attributes still conflict as before. The Kanban starter template uses both: labels as tokens, the card counter as a maximum.

### 6.3 Regions and JSON under sync

`clay` region attributes and `<script type="application/json">` tags control how parts of the page merge:

- `editor-ui`, `no-save`, `no-snapshot`: **ignored on every side.** Your copy is never touched, and the incoming copy is never read.
- `freeze`: **the element merges, its contents never do.** A frozen element pairs, moves, is inserted and removed with its record, and merges its attributes. Your copy's contents are never touched, the incoming contents are never read, and a frozen element new to this tab arrives empty.
- `no-dirty`, `no-watch`: **remote wins.** The incoming copy replaces yours with no merge. Use this for derived values that every tab recomputes.
- `no-trigger-autosave`: merged like ordinary content.
- `live`: **ignored by the merge on every side.** The `live` plugin takes the value itself ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)).
- Root attributes the library owns (`editmode`, `savestatus`, tokens) are never written by a frame.

**Known issue (ClayJS 1.8.2):** If a tab holds an unsaved edit outside `no-dirty` and also changed a `no-dirty` region, a frame that replaces that `no-dirty` region logs a loss in `clay.conflicts` and raises the conflict notice, even though `no-dirty` replacements should happen without warning. Because two tabs editing data will each recompute totals differently, this fires on concurrent edits whenever computed totals live in `no-dirty`. Until it is fixed, acknowledge those records yourself, as the finance tracker does:

```js
document.addEventListener("clay:sync-applied", () => {
  const derived = clay.conflicts.list().filter((c) =>
    c.detail === "remote-wins" && [c.el, c.local].some((n) => n?.closest?.('[clay~="no-dirty"]')));
  if (derived.length) clay.conflicts.acknowledge(derived.map((c) => c.id), { reason: "reconciled" });
});
```

**JSON.** Without `merge`, a JSON script is one value: if two writers change it, one whole blob goes to the ledger. With `merge="name"`, it merges by key: objects per key, arrays of objects by an `id` field, arrays of primitives by value, and lists without an id (grids, boards, repeated values) position by position when both sides kept the same length. `merge-key="taskId"` names another id field for every list, and `merge-key="players:uid, items:sku"` names one per list path (no spaces inside an entry).

**A key both sides changed takes the incoming value.** The lost value goes to the ledger like any other replaced edit, and the notice shows a row such as `game → players → alice → x` with yours and now. Revert cannot put a JSON value back; Download keeps your copy. Use per-entry keys (`notes: { "n-1": ..., "n-2": ... }`) so two people adding entries never touch the same key. For data several people change at once, use a live store ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) instead. When a merge mixes both sides, the text is rewritten in the incoming text's style (one line stays one line, indented stays indented) with `<` written as `\u003c`.

### 6.4 Focus, typing and long-running editors

Merges protect active typing in the current tab:

- The focused `<input>` or `<textarea>` keeps its value through a merge. Checkbox, radio, and select state are not protected.
- A caret in `contenteditable` text follows its characters through the merge.
- A dirty tab that has no merge base (because the record was rewritten at boot) **holds** incoming frames and fires `clay:sync-held` until it saves. Avoid touching the record at boot so merges can run immediately.

### 6.5 Reconciling in app code

Draw everything derived from the record inside `clay.effect(fn)`. It runs `fn` on the next microtask, then again after every change the mutation hub observes (local edits, drags, undo, and redo) and after every merge, batched to one run per microtask. Changes inside `editor-ui` or `no-watch` regions, ephemeral attributes, and live properties with no attribute change do not re-run it. `fn` runs with the hub paused, so its own writes never re-trigger it, start an autosave, or enter undo history. It returns a function that stops the effect.

```js
clay.effect(() => {
  const rows = items.querySelectorAll(":scope > li");
  const done = items.querySelectorAll("input[checked]").length;
  setText(summary, `${done} of ${rows.length} read`);
});
```

Rules for `fn`:

- **Keep it synchronous.** Writes after an `await` land outside the pause and would re-trigger the effect forever. An effect whose `fn` returns a promise is stopped with a console error.
- **Do not call `clay.undo.commit` inside it.** A commit drains the hub's records, so the effect's writes reach autosave and the effect again.
- **One effect does not see another's writes**, because each runs paused. Draw values that depend on each other in one effect.
- **A derived value saved in the record** (a count painted in markup, [Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) is written with the hub paused, so a repaint after a merge leaves the page dirty with no save scheduled. Put saved derived values in `clay="no-dirty"`, in chrome, or in sapjs paints, which ClayJS leaves out of every comparison ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)).

In edit mode, each effect warns once in the console when it breaks one of these rules: writing to saved content outside `no-dirty` and `editor-ui`, calling `clay.undo.commit`, creating an effect inside `fn`, or running more than 50 times in a second (usually a timer or async callback it started that keeps changing the document). The effect keeps running; the warning names the element or command.

Work that belongs to a merge alone goes in a `clay:sync-applied` listener:

```js
document.addEventListener("clay:sync-applied", (event) => {
  if (openId && !cardById(openId)) closeCard();
});
```

- Close or repoint any view whose record a peer deleted. The kanban closes the open card when its id is gone: `if (openId && !cardById(openId)) return writeHash({ card: "" }, { replace: true });`
- Re-parse any JSON you parsed earlier.
- Re-attach any per-element setup that a recreated element lost (the writer re-injects block gutters on every render).

`detail` on `clay:sync-applied` carries `{ seq, source: "peer" | "disk", by, report, conflictIds, unresolved }`, plus `etag` and `html` for disk frames. `by` is `{ id, name }` on hyperclay.com peer frames and `null` elsewhere. `report.applied`, `report.conflicts`, and `report.localDiverged` describe the merge.

### 6.6 The conflict ledger and notice

Losses (where a merge replaced this tab's work) enter `clay.conflicts`:

- `list()`, `get(id)`, `size`, and `recoveryOf(id)` (a clone of the page as it was just before the frame).
- `acknowledge(ids, { reason })` with `reason` of `accepted`, `reverted`, or `reconciled`. It is the only way a record leaves. Nothing clears records automatically, and the close warning stays up while any is open.
- `claim(ids, { owner })` hides records from the built-in notice so your app can resolve them itself, then `acknowledge` them.

The built-in notice reads "Another edit replaced N changes" and offers **Revert to mine**, **Accept theirs**, **Download my copy**, and a list of the edits. Revert puts the selected losses back as an ordinary local edit, then saves.

### 6.7 Presence

`?plugins=sync` loads presence. `clay.presence` is the facade (`clayjs/src/sync/presence-store.js`), installed on `window.clay.presence` when the store loads. It has three page-facing methods:

```js
const snapshot = clay.presence.getSnapshot();  // the same object until something changes
const stop = clay.presence.subscribe(render);  // the current snapshot at once, then every change
clay.presence.setTarget({ kind: "record", id: "card-1", field: "title" });
```

`subscribe(listener)` returns an unsubscribe function. It emits the current snapshot at once, even before the host answers, so a page never waits for a first frame. `setTarget(null)` clears this tab's target and publishes nobody anywhere; it does not fall back to the generic editing marker.

**The snapshot.** `{ supported, recordAwareness, pageAwareness, people, anonymous }`. Each person is `{ id, name, you, canEdit, editing, sessions }`, and each session is `{ id, you, n, editing }`:

```js
{
  supported: true, recordAwareness: true, pageAwareness: true,
  people: [{
    id: "p_ada", name: "Ada Lovelace", you: false, canEdit: true,
    editing: { kind: "record", id: "card-1", field: "title" },
    sessions: [{ id: "s1", you: false, n: 12, editing: { kind: "page", v: 1, epoch, generation, selection } }],
  }],
  anonymous: 0,
}
```

Before discovery answers, the snapshot is unsupported with no people. The host decides who appears: each recipient gets a roster filtered by its own access, and nothing in the page can widen it (`src/sync/live-sync.js`, the `presence` event).

**Targets.** A target is `null`, a legacy dotted path string, a record target `{ kind: "record", id, field }` with `field` optional, or a page target `{ kind: "page", v: 1, epoch, generation, selection }`. A page selection is `text` (`anchor` and `head`, each `{ block, rel }`), `blocks` (`{ ids }`), or `cell` (`{ block, row, col }`).

The bounds come from `src/sync/presence-target.js`:

- A record id of 1 to 128 printable ASCII characters.
- A field of `title`, `description`, `labels`, `members`, `dates`, `checklist`, `comment`, or `attachments`.
- 8 KiB per target.
- 256 bytes per page id.
- 1 KiB per decoded relative position.
- At most 128 block ids.

An invalid target is refused, never repaired. Updates are coalesced to one every 250 ms, a stable target renews every 5 seconds, and it expires 15 seconds after the host receives it.

**A record target from a focused control.** Publish a target only while the control that writes the record has focus, and publish `null` the moment it stops: on blur, when the open record changes, when the page is hidden, when the record goes to Trash, and when the tab leaves edit mode or enters draft mode. After a blur, check again on the next microtask, so focus moving inside the same control does not flash `null`. A record with one writing control sends the fieldless shape, `{ kind: "record", id }`, where `id` is the record's `data-id`. A target never carries a title, text or date. The Journal template does this in `RecordPresence` (`templates/00-journal/journal.html`):

```js
function reconcile() {
  const id = capable && clay.isEditMode && !clay.isDraftMode && !document.hidden && writerHasFocus()
    ? openEntryId() : null;
  if (id === sentId) return;
  sentId = id;
  clay.presence.setTarget(id ? { kind: "record", id } : null);
}
```

`capable` is the snapshot's `recordAwareness`, so a host without `record-awareness-v1` is sent nothing. Renewal and expiry belong to ClayJS: a page sets a target once and keeps no timer of its own.

**Showing who is on a record.** Build a map from record id to people out of each snapshot. Skip `you: true`, keep only targets with `kind: "record"` whose id is a live record on this page, and count a person once however many tabs they have. Write names with `textContent`. A slot a script creates carries `clay="no-save no-watch no-snapshot"`. A slot inside a repeated row's `<template>` carries only `clay="no-save no-watch"`: a save removes `no-snapshot` nodes from template content too, which would delete the slot from the file, and the rows sapjs renders from the template are marked `editor-ui`, which already keeps them out of snapshots. Repaint only when the names change, so a renewal announces nothing. A badge is advisory: it never blocks editing and never reaches a record.

**Hosts.** The client picks exactly one transport from `/_/meta` (`connect` in `presence-store.js`):

- hyperclay.com relays presence through the host. The target goes to `POST /_/presence`, and the roster comes back as a named `presence` event on the document's stream, with one person per account and one session per tab.
- HTML Clay announces `awareness: { transport: "broadcast", scope }`. Its presence travels between tabs of the same browser on a channel named for the document scope (`src/sync/local-presence.js`). Each tab is a fresh random session, not an account, shown under the label "This computer". Two documents that share a file name never meet.
- Hyperclay Local likewise shows tabs on this computer, not authenticated people.

In view mode the reader draws the roster too. It takes the roster from the stream it already follows, as a named `presence` event, so it opens no second connection. The roster UI is a first-use download that comes with the first presence frame, and a reader that receives no frame downloads none of it. A reader publishes no target and joins no writable room, because its lease has no write half: a target a page sets in view mode sends nothing. Its roster goes away when its stream closes.

Each part needs its own extension: `presence` for the roster, `presence-editing` for the generic editing marker, `record-awareness-v1` for record targets, and `page-awareness-v1` for remote carets.

**Runtime only.** The roster UI is marked `clay="no-save no-watch no-snapshot"` (`RUNTIME_ONLY` in `src/ui/bevel-controls.js`, applied in `src/sync/presence.js`). It never reaches a save, a snapshot, or the page's own change detection, and a roster change is not an edit. Remote carets are editor decorations, not document content ([Remote carets](https://clayjs.com/docs/plugins/page/#remote-carets)). All three tokens are needed: `no-save` alone only keeps a name out of the file, and the snapshot clone that peers receive is emitted before the save-only regions are stripped, so `no-snapshot` is what keeps a name out of that clone, while `no-watch` is what keeps a roster change from counting as an edit (`src/sync/presence.js:15-28`).

Presence is not for app data. For state that must be shared and is not presence, use a live store ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)).

### 6.8 The page format floor

A document records the lowest page format a writer must understand, in document metadata outside the page value:

```html
<meta name="clay-page-format" content="1">
```

No marker means floor 0, and a floor only ever rises: a later save cannot remove the marker or lower it. The value is protocol capability, not permission. The host still applies every access check it applied before, and the marker cannot be used to discover a private document.

**Every page write declares its capability.** A save and a live write carry `X-Clay-Page-Format: 1`, the format the runtime knows rather than the format this document uses, so even an ordinary document's save declares it.

**A host refuses a write below the floor.** Nothing is mutated. The answer is HTTP `409` with a body carrying the code `page-format-upgrade-required`, the same string as its `reason` on the save lanes, and `minimum`, the floor the document requires. That covers the ordinary save, the live data lanes, a checkpoint, a version restore and the relay, on all three hosts, and a refused live request ends that tab's stream so it receives no newer content. The stored file, its version history and its page state stay as they were, and the refused tab keeps its own unsaved work.

**A writer raises the floor on its first new format, through one real save.** The gate reads the floor the document already has, asks the host, and adds the marker to an otherwise equivalent capture. Activation is idempotent. It is refused while any admitted live page editor declares a capability below the floor it would set, and that check happens under the host's per-document write lock, so an editor that registers between the check and the save is refused rather than missed. A refused activation leaves ordinary writing available and every unsaved store as it was, and says **This document uses a newer page format; update the editor in the other tabs to keep writing**. The command that asked applies only if the same editor installation and document revision still exist once activation succeeds; otherwise the answer is retryable and the content is untouched.

**A host announces `page-format-v1` only when it can hold the floor**, meaning its enforcement and its tolerant checkpoint renderer are installed. On a host that does not announce it, a new format command is refused as `page-format-unsupported` and writes nothing.

**Who reads what.** ClayJS 1.16.0 and later keep floor 1 content, so those tabs are the cohort that can stay open while a floor 1 document is written. The published 1.15.x tabs cannot be changed: once a document's floor rises they are refused writes with `page-format-upgrade-required` instead of saving a version that would drop the new content, and their own unsaved work stays in the tab. A floor 0 document keeps working on all of them.

Opening a document that is already at floor 1 asks for nothing: only a command that writes a newer format raises a floor, and a document that never uses one never records one.

### 6.9 Agents

An agent edits a malleable file the way a person in another tab does:

- **Editing the file on disk** (HTML Clay, Hyperclay Local): the host notices the change and pushes a `disk` frame. The open tab merges it three ways, so the user's unsaved typing in other paragraphs survives, and an overlap goes to the ledger. Tell agents to address elements by `data-id`, never by position, and to leave chrome alone (it is not in the file anyway).
- **`clay.wire`** (`?plugins=wire`, HTML Clay and Hyperclay Local): `clay.wire.send(payload)` sends a request to a local process started with `htmlclay wire serve file.htmlclay -- my-agent`. The page saves first so the agent reads what the user sees, and autosave pauses until the agent's edit lands as a disk frame. `run.done` resolves then.
- **`ai-edit`** (`?plugins=ai-edit`): select text, press Cmd+J, and describe the change. The rewrite is previewed in place; Keep saves it, Revert discards it. Available where the host offers the `ai-edit` helper: HTML Clay, Hyperclay Local, and hyperclay.com (for the owner and team editors on a paid plan, billed to the document's AI credits).
- **The data API**: a host that announces `data-read`/`data-write` serves `/_/api/<file>`, a JSON read and write interface over the file defined by a rules tag ([Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export)). `clay.readData()` and `clay.writeData()` call it from the page; `writeData` is for agents and other processes, and refuses while the page has unsaved edits.

### 6.10 Live data: `clay="live"`

Everything above moves at save speed: a peer sees your change after your next save. A live store is for state that changes faster than that, such as a game board, a score, a cursor, or a timer. It is one JSON script that ClayJS holds as an object in memory. Page code changes it through ops, every tab of the document sees each change at once, and ClayJS writes the value back into the file at checkpoints.

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

**The tag.** Declare a `<script type="application/json">` with `merge="name"` and `clay="live"`, holding a JSON object or list. The name is 1 to 64 letters, digits, `_`, `.`, `:`, or `-`, and two live tags with the same name are both ignored. Write the tag into the file before people share it: a tag added later is not in the rooms (in-memory sessions that relay ops between tabs) of tabs that loaded before.

Checkpoints add a `live-at` attribute to the tag with the room position the value was saved at and a hash of the text. A save made while the tab is out of the room also adds `live-by` (that tab and the last update it sent), so the room does not apply those updates a second time. The room trusts `live-by` only while the value still matches the hash in `live-at`, and never on a restored version. Leave both in place when you or an agent edit the tag's JSON by hand: the room then merges your edit with the play since that checkpoint. Without them, the edit is merged over what the room last saved. A save hook (`onbeforesave`) may reformat a live tag's JSON, but must not change its value. A tag is written in the layout it was loaded with: one line, or indented when the authored JSON had line breaks. `live-format="lines"` writes each entry of each top-level object on its own line instead, so version history shows only the entries that changed, which suits a large store keyed by id (the page editor's blocks).

**The API.** `clay.live(name)` returns the same handle every time:

- `game.data` is the value, read like a plain object. Writes to it become ops: `game.data.players.alice = { x: 0 }`, `delete game.data.players.bob`.
- `game.set(path, value)`, `game.delete(path)`, and `game.add(path, n = 1)`. A path is a dotted string (`"players.alice.x"`) or an array (`["players", "alice", "x"]`).
- `game.update(fn)` runs `fn(data)` synchronously and sends what it changed as one batch. If `fn` throws, every change it made is undone.
- `game.on("change", fn)` and `game.off("change", fn)`. `source` is `local` (this tab), `remote` (another tab), or `state` (the value was replaced from the room or a save).
- `game.toJSON()` is a copy, `game.ready` a promise of the handle, and `game.status.mode` is `fast` or `file` (below).

Two rules for the proxy:

- **Counters use `add`.** `game.data.score += 1` reads the number and writes the sum, so two tabs adding at once both write the same sum and one point is lost. `game.add("score", 1)` sends the increment, and both count.
- **Lists are written whole.** `push`, `splice`, and `sort` replace the entire list, so two tabs pushing at once keep one push. An index assignment (`grid[2][3] = "x"`) changes one cell. Keep collections as objects keyed by id (`players: { "p-7f3a": {...} }`).

**What gets saved, and when.** A live change never marks the page unsaved, never starts autosave, and never raises the close warning. A checkpoint writes the current value into the file 8 seconds after the first change, and again when the tab is hidden or closed. Up to 8 seconds of play can be lost. The close save uses `keepalive`, which browsers only honor for bodies under about 60 KB, so a large page may lose its last few seconds. Every checkpoint is a save, with a version in the host's history. A game page needs no `autosave` attribute for its live data.

**Never-saved stores.** `clay="live ephemeral"` shares the value like any store but never writes it into the file: the tag keeps the text you authored. Use it for cursors, lobbies, and presence. Anyone who can open the file can read the authored text, so keep secrets out of it.

**How it travels.** Which lane a store uses depends on the host:

- **hyperclay.com** (the `live-data` capability): every change goes to the document's room on the server, which numbers it and passes it to every editor within a network round trip. Tabs that join late or miss a change fetch the room's whole state. Only one tab, the room's writer, saves checkpoints. Viewers do not get the fast lane; they see the game at each checkpoint through ordinary sync. When an outside save changes a live tag (the code editor, a version restore, a device sync, or an agent), the room takes the file's value and replays its own changes since the version the file came from on top, so the edit lands and no move is lost or counted twice. An edit of a version older than the room's history is overwritten by the room's next checkpoint instead. The history covers 256 KB of changes per store, and the writer saves early when half of it is used, so this requires restoring an old version or a writer that cannot save.
- **Tabs of one browser on HTML Clay or Hyperclay Local**: the tabs share the store at the same speed through the browser itself. One tab runs the room and saves checkpoints. When it closes, another tab takes over with every move the room accepted. Use this to playtest a game in several tabs.
- **Everywhere else** (another device on a local host, or a browser without Web Locks): the store moves at save speed. Each incoming save replaces the value, and this tab's own unsaved changes are replayed on top. A change counts as saved only when this tab's own save holding it is accepted, so an `add` counts once.

`game.status.mode` is `fast` on the first two lanes and `file` on the third. In view mode, a store reads normally, but writes stay in the tab and are never sent or saved.

**The page editor's own store.** A Document's blocks are a live store named `page`, and its merge state is not in the file. Saved files and downloads never carry it. On hyperclay.com and Hyperclay Local, the host keeps the merge state beside the file and hands it back to an editor only while it matches the article's `data-rev`. HTML Clay keeps none on disk: open tabs share it in memory, and a fresh open rebuilds it from the article. A page changed outside the editor (by the code editor, an agent, a version restore, another device, or a text editor) merges into open page tabs the way a peer's edit does: each block merges three ways against the article the change started from, so edits on both sides survive. An edit beats a delete. Where both sides changed the same words, the outside change wins and the tab offers a download of what it had. Only a change with no article this host can trace it back to shows a reload notice and stops the tab from saving over the new article.

**When a room is lost.** A room lives in memory: a server restart or two minutes with nobody connected ends it. The next room starts from the last checkpoint, so up to 8 seconds of play can be lost. A change that the old room may already have taken is not resent to the new one, even when its acknowledgment was lost: if the old room's last checkpoint lands afterward, it brings that change back, and resending it would count it twice. A change that never left the tab is sent as usual. Closing the tab that runs a local room is not a loss: the next tab takes over the room with every move.

**Load the plugin wherever a live tag exists.** A page without `?plugins=live` still leaves live tags out of the merge, so an incoming save does not update them and the next save writes the old text back.

**Limits on hyperclay.com.** A store holds at most 4 MB of JSON, and a document holds at most 6 MB across at most 16 stores, giving a Document roughly 900 KB of text that keeps compacting. A frame carries at most 128 ops and 64 KB. One value larger than 64 KB is sent in its own request of up to 5 MB, so a single change can write a value up to the store's 4 MB. The page editor splits its changes into 12 KB pieces, so frame size does not limit a Document's size. One person sends at most 25 frames a second per document (bursts to 40), and ClayJS paces itself to stay under that. A change the room refuses is undone in the tab with a warning. When the server holds as much live data as it can, a document without a room (or a change that would grow one) moves at save speed and tries the room again a minute later.

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

`editable` turns an element into a rich text editor in edit mode. It is the default plugin, using Squire for editing and DOMPurify on paste.

```html
<div class="desc" editable><p>Two paragraphs on <b>scope</b>.</p></div>
<div class="body" editable="toolbar-on-select"><p>…</p></div>
<h1 editable="single-line">Title</h1>
```

Mode tokens: `single-line` (Enter does nothing and pasted blocks flatten), `no-toolbar` (shortcuts only), and `toolbar-on-select` (the bubble toolbar appears only for a non-empty selection). Toolbar presets: `standard` (block menu with Paragraph, H1 to H3, Quote, Code block; bold, italic, underline, strikethrough, inline code, link, undo, redo, clear; bulleted and numbered lists, quote, indent, outdent), `inline`, and `minimal`.

Saves keep only the region's own markup, with every runtime attribute, toolbar, and Squire artifact stripped. Opening a page in edit mode does not change its bytes.

What it leaves out, and what to build instead:

| Missing | Build it |
|---|---|
| Tables, checklists, dividers, callouts, toggles, embeds | Separate blocks outside the rich region (the writer's block model, [Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)) |
| Image insert, captions, alignment | An image block (`<figure>` with an `<img>` and an `editmode:contenteditable` caption), or `editor.squire.insertImage(src)` for inline images |
| Screenshot paste | Squire swallows image-only pastes. Listen for `pasteImage` (below) |
| Markdown shortcuts | Only `* ` and `1. ` start lists. Watch `editor.squire` `input` events and call `editor.setBlockType("H2")` for others |
| Slash menu | A `keyup` handler for `/` on an empty paragraph opening an `editor-ui` menu ([Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)) |
| Change callback | Auto-mounted editors cannot take `onChange`. Use `new clay.RichClay(el).squire.addEventListener("input", …)` or a `MutationObserver` |

`new clay.RichClay(el)` returns the instance mounted on `el`. Use it to reach `squire`, `getHTML()`, `setHTML()`, `setBlockType(tag)`, and `registerButton(def)`.

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

Register custom toolbar buttons **per instance**, after mount. Calling `RichClay.registerButton` globally after load does not reach editors already mounted:

```js
const editor = new clay.RichClay(el);
editor.registerButton({ id: "stamp", label: "Stamp", icon: "<svg …></svg>", run: (e) => e.squire.insertHTML("<p>Approved</p>") });
editor.options.toolbar = [...clay.RichClay.presets.standard, "stamp"];
```

Traps:

- **Mode by attribute.** `editable` is inline mode and never sanitizes your authored markup on load. `data-richclay` without `editable` is card mode: it sanitizes in place on load with an allowlist that excludes `img`, so **it deletes images on every edit-mode open**. Use `editable`.
- **Nested `editable` regions are refused.** Only the outer region mounts. Siblings are fine.
- **Custom elements** (tags with a hyphen) are skipped for bare `editable`. Use `clay-editable`.
- **The floating toolbar mounts on `document.body`, not in the top layer.** Inside `dialog.showModal()` or a `popover`, it is unusable, though shortcuts still work. Do not put `editable` inside a modal dialog. The kanban shows the card itself as a fixed overlay instead ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)).
- **Two undo histories.** Inside an `editable`, Cmd+Z goes to Squire's stack. Outside, it goes to page undo, which never records rich text. Typing in a rich region, clicking elsewhere, and pressing Cmd+Z does not undo that typing.
- **Squire's undo can roll back a peer's edit** in the same region because its history stores whole-region snapshots. Keep collaborative documents in many small regions (one `editable` per block) to limit the damage.
- **Many editors are expensive.** Each multi-line editor installs document-level listeners and its own Squire instance. Do not put `editable` on every cell of a grid; use `editmode:contenteditable`.
- **Paste uses an allowlist.** Tables, `<hr>`, `<details>`, `<figure>`, iframes, and inline styles are reduced to text. A pasted remote image keeps its hotlinked `src`. A pasted `data:` image bloats every save.
- **Cloning an active region** copies runtime attributes. Strip them with `clay.RichClay.stripElement(clone)` ([Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id)), or clone from a `<template>`.
- **`editable` is ignored in view mode.** Viewers get plain markup.

#### 7.1.1 The page editor's Markdown shortcuts

`editable` regions and the page editor are different editors with different Markdown input rules. The page editor (`plugins/page`) converts these as you type:

| Typed at the start of a block | Becomes |
|---|---|
| `# `, `## `, `### ` | heading 1, 2 or 3 |
| `- `, `* `, `+ ` | bulleted list item |
| `1. `, `1) ` | numbered list item |
| `[] `, `[ ] `, `[x] ` | checklist item, unchecked or checked |
| `> ` | toggle |
| ` ``` ` | code block, when the whole paragraph is the fence |
| `---` | divider, when the whole paragraph is the dashes |
| `" ` | quote, when the document's format gate allows it; otherwise the space is typed as itself |

| Typed around text | Becomes |
|---|---|
| `**bold**`, `__bold__` | bold |
| `*italic*`, `_italic_` | italic |
| `` `code` `` | inline code |
| `~~strike~~` | strikethrough |
| `[label](address)` | a link, if the address is a safe one |

An opening delimiter must follow the start of the line, whitespace, or opening punctuation. Neither delimiter may be escaped, so `\**this\**` stays literal text. Nothing converts inside inline code, and a shortcut typed during an IME composition converts when the composition ends. Inline shortcuts delete the delimiters and apply the mark in place, keeping any existing marks on the text. Block shortcuts retype the block rather than replacing it, so its `data-id` and position survive.

**Backspace immediately after a shortcut restores the typed characters**, delimiters included, through input-rule undo. It is a single history step, does not drop a peer's concurrent edit, and reapplies on redo. After another keystroke, the shortcut is plain text and Backspace deletes one character as usual.

None of this loads for a reader. The input rules, menus, and title adapter are editor code, and a Document that never enters edit fetches none of them. A live entry fetches them while the tab still shows view ([switching without a reload](https://clayjs.com/docs/guide/edit-mode/#switching-without-a-reload-clay-mode-switch-live)).

### 7.2 sortable: drag to reorder

`sortable` on a container makes its children draggable in edit mode:

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

- `sortable` drags `<li>` children in `<ul>` or `<ol>`, and all children otherwise, except `editor-ui` children.
- `sortable="name"` lets every container with the same name accept items from the others for cross-column drag.
- A `[sortable-handle]` inside the container (outside nested sortables) switches it to handle-only dragging. Nested sortables are separate.
- Order saves as child order. There is no order attribute.
- Every drop fires `clay:sorted` (bubbling) with `{ item, from, to, oldIndex, newIndex }`. In a cross-container move, it fires on the source container. Read `item.dataset.id` and `to.closest(...)`, not indexes.
- `onsorted="code"` runs on drop with `this` and `evt`.
- Containers added later bind after about 200 ms.
- `window.Sortable` is SortableJS 1.15.6. `Sortable.get(el).option(name, value)` changes an instance.
- `clay.sortable.move(item, toContainer, beforeItem = null)` makes the reorder a drag makes, without dragging and without waiting for SortableJS. It fires the same `clay:sorted`, records the same undo step, and answers `{ ok: true, moved }` or `{ ok: false, code }` with `not-editable`, `detached`, `item`, `group` or `anchor`. Resolve `beforeItem` by `data-id` at the moment of the move, and use it for keyboard and touch moves.

Traps:

- **Handle-only mode is decided when the container binds.** If handles are injected later (like the writer's gutters), set it yourself: `Sortable.get(blocks).option("handle", "[sortable-handle]")`.
- **One stray `[sortable-handle]` makes every other item undraggable** except by its handle.
- **`onsorting` cannot veto a move** because its return value is lost. Use `Sortable.get(el).option("onMove", (evt) => …)`.
- **Hidden template children count as items.** Keep blueprints in `<template>` outside the list.
- **Sortable leaves residue** (`draggable="false"`, `style=""`, drag classes) that saves. The `sortable` plugin strips it inside `[sortable]` lists, including from a mid-drag save. A Sortable you load and wire up yourself needs a snapshot hook to strip it.
- A peer frame arriving mid-drag merges under the drag. Rare at autosave cadence, but possible.
- Write durable side effects of a move in a `clay:sorted` handler (the kanban logs "Moved to Doing" into the card's activity). If a record attribute must match its container (`data-status`), set it there too.

### 7.3 undo: whole-page undo

`?plugins=undo` provides `clay.undo`: Cmd+Z, Cmd+Shift+Z, and Cmd+Y over DOM mutations, restoring the same live nodes.

- Mutations outside a commit group into an "Edit" step after 500 ms idle. **Wrap every command** so it records as one labeled step:

  ```js
  const command = (label, fn) => (clay.undo ? clay.undo.commit(label, fn) : fn());
  command("Add card", () => list.append(card));
  ```

- `commit` must be synchronous. For async work (an upload or fetch), `await` it first, then make every DOM write in one synchronous `commit`. Pausing undo across an `await` loses the mutations made before the `await`.
- Not recorded: `editor-ui`, `no-undo`, `no-watch` regions, `richclay` regions, and every change a merge brings in.
- Every step is checked against the document as it stands before either stack moves, so a step applies whole or changes nothing. Undoing "Add card" checks that the card is still the node the step added and still holds what the step recorded; if a peer edited it, the undo is refused with `content-changed` and the card stays as the peer left it. A moved neighbour refuses with `structure-changed`, and a reused `data-id` with `duplicate-id`. A refused step stays on top and fires `clay:undo-refused`; replay it once the conflict is gone, or drop it with `clay.undo.discard(entryId)`. [undo](https://clayjs.com/docs/plugins/undo/) lists every code.
- Also exposed: `clay.undo.on("undo" | "redo" | "commit" | "clear", fn)`, `canUndo`, `canRedo`, and `history`.

Traps:

- **It leaves Cmd+Z to text fields.** Inside an `input`, `textarea`, `select` or `contenteditable` subtree, the browser's own undo runs. A plain control's typed value is not content until `persist` or a command writes it, so page undo has nothing to replay for it.
- History is per tab, capped at 100, and not saved.
- Undoing a delete re-inserts the original node even if a peer re-created an equivalent. Dedupe by `data-id` on `clay:sync-applied` if needed.

### 7.4 Plain contenteditable

For titles, labels, list items, and table cells, use `editmode:contenteditable` with `plaintext-only` ([Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers)). It has no toolbar, Squire instance, or formatting, and is cheap at any count. Handle Enter yourself by blurring or creating the next item, as the writer's to-do list does.

### 7.5 upload and quickcrop

`clay.upload(file, { onProgress, signal })` posts a file you supply to the host and never rejects. **It is not a file picker** and inserts nothing. Supply the `File` from an `<input type="file">`, a drop, or a paste, and write the URL yourself.

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

- Embed a `data:` URL **only** on `code === "unsupported"` (the host does not store files). On `forbidden` (the host stores files, but not for this person on this document), `too-large`, `unsupported-type`, `payment-required`, and other failures, write nothing. Embedding a refused 20 MB photo would bloat every future save.
- Other codes: `unauthorized`, `forbidden`, `timeout` (may have landed; retrying is safe), `aborted`, `network`, and `bad-response`.
- Events: `clay:upload-start`, `clay:upload-progress`, `clay:upload-done`, and `clay:upload-error`.
- Host limits: HTML Clay and Hyperclay Local allow 25 MB per file; hyperclay.com allows 10, 20, or 100 MB by plan.
- The URL is a host path: `/_/uploads/assets-<document>/<name>`. Write it exactly as returned. Every address of the host serves it, so it survives renaming or moving the document. Never rebuild it from parts.
- On hyperclay.com, an upload made from a document follows that document's read access once `document.upload.access` is `document`; before the account's protection migration it stays reachable by URL. To refuse private media on a host that cannot protect it, start the upload with `clay.upload.start(file, { requiredAccess: "document-or-local" })` ([Privacy](https://clayjs.com/docs/guide/hosts/#privacy)).

`clay.quickcrop(file, { aspect, maxWidth, maxHeight, type, quality })` opens a crop dialog and resolves `{ blob, dataURL, width, height }`, or `null` on cancel. It does not upload; wrap the blob as a `File` and pass it to `clay.upload`. Only one cropper opens at a time, and it sets `body.style.overflow = "hidden"` while open, which a save at that moment writes into the file.

Put the file picker for an image block in chrome: `<input type="file" accept="image/*" hidden>` inside an `editor-ui` wrapper, clicked by your menu.

### 7.6 clay-ui: toasts and dialogs

`clay-ui` provides built-in notifications and modal dialogs:

- `clay.toast(message, type)` takes `success`, `error`, `warning`, or `info`. The message is text, never markup, with no handle to dismiss early.
- `clay.toastPersistent(message, type)` stays until closed.
- `clay.confirm(prompt)` resolves on confirm and **rejects with `undefined` on cancel**. Always pass a rejection handler: `clay.confirm("Delete this card?").then(del, () => {})`. `try { await clay.confirm(...) } catch (e) { e.message }` throws inside the `catch`.
- `clay.ask(prompt, onYes, defaultValue)` resolves with the typed text.
- **Every dialog prompt and title is HTML.** `clay.confirm(prompt, extraContent)`, `clay.ask(prompt)`, `clay.tell(title, ...paragraphs)`, and `clay.snippet(title, code)` insert their strings as markup. ``clay.confirm(`Delete "${card.title}"?`)`` runs whatever markup a collaborator typed into the title. Keep prompts constant, or escape record text first.
- `clay.modal` is a single modal with `title`, `html`, `yes`, `no`, `onYes`, `open()`, and `close()`. Every setting resets on close, and opening any dialog rejects the one already open.

**Never pass a live record element as `clay.modal.html`.** The modal moves the node into its runtime-only root and removes that root on close. The element is gone from the page, and a save during the dialog drops it from the file. Pass a form built from a template, and write values back to the record on confirm. For card detail, prefer the record-as-modal pattern ([Detail views: the record is the modal](https://clayjs.com/docs/guide/architecture/#detail-views-the-record-is-the-modal)).

ClayJS's own UI (notice, indicator, dialogs, toasts) uses inline reset styles, so page CSS cannot restyle it.

### 7.7 clay-events, clay-dom and All

Plain delegated `addEventListener` handlers on `document`, as in the examples, avoid every trap below and are the default. If you use these helpers, watch for their traps:

- **`onclone="code"`** runs on every element clone, with `this` as the clone. Good for minting a fresh ID on duplicate. It does not run for `template.content.cloneNode()` (a fragment); clone `template.content.firstElementChild` instead. It also runs for library clones, so keep it pure.
- **`onclickaway="code"`** closes a menu on outside click. It runs on every outside click, even when already closed.
- **`onclickchildren="code"`** runs with `this` as the clicked direct child, for tab bars and segmented controls.
- **`onmutation` and `onglobalmutation`** run when the subtree or page changes. **A handler that writes into what it watches loops forever**, even writing the same text. Guard every write: `if (this.textContent !== n) this.textContent = n`. They do not fire for merged peer changes.
- **`onrender`** runs once per element at load and again whenever the element is inserted, including every drag and merge re-insert. Keep it idempotent.
- **`el.nearest.NAME`** searches outward through siblings and cousins. In a list, it reads (and with `val` or `text` assignment writes) a neighbor's field when the record lacks one. For record-scoped access, use `el.closest("[data-id]").querySelector(...)`.
- **`el.hide()`, `el.show()`, and `All(...).css()`** write inline styles that save. Use `clay-options` or a runtime stylesheet.
- **`cycleAttr`** cycles through values in alphabetical order across the whole document. Write status cycles explicitly: `const order = ["todo", "doing", "done"]; el.dataset.status = order[(order.indexOf(el.dataset.status) + 1) % order.length];`
- **`All`**: `All.name` and `All.length` are the function's own properties, so write `All("[name]")`. `sortBy("data-amount")` compares strings; pass a function.

### 7.8 Libraries that rewrite content: highlighting, math, diagrams

Prism, highlight.js, KaTeX, and Mermaid replace source text with generated markup when they run. In edit mode, that goes wrong two ways:

- **The output is saved.** If the library runs after ClayJS reads the page, its spans or SVGs count as an edit, starting an autosave that writes them into the file.
- **Sync wipes it.** An outside change brings in plain source, replacing the decorated markup. The library does not run again, so the decoration disappears until reload.

For fixed content, such as code samples in a docs page, mark the block `clay="freeze"` so sync never touches its contents. For content people or agents edit, keep the plain source as the record and render the decorated version into a `clay="editor-ui"` mount. Redraw it on load and on `clay:sync-applied` ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)).

### 7.9 OverType: a markdown editor

For a notes or journal app where Markdown is the format, OverType is a textarea under a styled preview. Load it with `await clay.assets.load("overtype")`, which takes it from the release that served `clay.js` ([Libraries on demand](https://clayjs.com/docs/guide/loading/#libraries-on-demand)). **The textarea is not the record.** Keep each entry's text in a text element of the record, put the editor in a `clay="freeze"` region outside the saved records, and bind it to the open record with `clay.bindText` (`?plugins=bind-text`):

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

Three reasons keep the record as text and the textarea outside it:

- **Word-by-word merges.** A `<textarea>` merges as one value, so two people editing different paragraphs collide and one loses their words. A text element merges word by word, so both edits land.
- **No library attributes in records.** OverType stamps `id`, `autocomplete`, `spellcheck`, and Grammarly attributes onto a textarea. Inside a record, those save into the file and mark the page dirty at boot.
- **Readable without JavaScript.** An `<article>` holding `<pre><code>` renders in any browser and keeps the file smaller, whereas `<textarea persist>` shows nothing until the library runs.

`bindText` returns `{ open, close, flush, current, attach, composing }`. Every `input` writes into the record at once, so a save captures it as that record's text. Changes the editor did not make (a peer merge, a restored draft, or a JSON API write) appear in the textarea with the caret kept. During an IME composition, nothing is written or shown. When it ends, both edits apply unless they touch the same stretch of text; on conflict, the record keeps the other person's words and `onConflict` gets what was typed. Opening the same `key` after a merge replaced the record's element rebinds without touching the textarea. Opening another `key` flushes the open record and shows the new one with the caret at the start.

Keep one OverType instance for the life of the tab. Normalize OverType's layout state in an `onbeforesave` on the container, and call `binding.attach(textarea)` if a library ever swaps the element. A journal built this way keeps entries as `<article data-id>` records, clones its chrome from a `<template>`, and paints the open entry with a runtime stylesheet.

### 7.10 Attributes from older Hyperclay files

Older Hyperclay files can carry attributes ClayJS ignores: `movable`, `movable-handle`, `prevent-enter`, `autosize`, `ajax-form`, `ajax-button`, `send-message`, and `upgrade`. Replace `prevent-enter` with a `keydown` handler, `autosize` with CSS `field-sizing: content`, `movable` with pointer events writing `data-x` and `data-y`, and `send-message` with the `message` plugin ([message: contact forms](https://clayjs.com/docs/guide/components/#message-contact-forms)). Old saved `<html editmode="false">` and hand-written `option-visibility-styles` style tags are dead weight; ClayJS strips the root attributes on the next save.

### 7.11 sap.js: records, views and totals in markup

`sap.js` (also published standalone as `@panphora/sapjs`) is a reactive attribute layer whose only store is the DOM. Every change runs one pass: it reads the app from the live page, computes `calc:` fields in dependency order, and writes only the paints that changed. Use it to build the reactive parts of a malleable document app: totals, filtered and sorted views, a form that adds records, and an editor for the selected record.

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

Core vocabulary: `sap` marks an app root. `items="list"` holds `[item]` records, and `[item][template]` (or a shared `<template items="list">`) is the blueprint. `bind` two-way binds a control or text leaf, and `state="data-due data-done:presence"` declares fields stored as attributes. `calc:`, `text:fmt`, `show`, `class:`, `css:`, `attr:`, and `effect` paint derived values. `each="expr"` renders a view of any array whose rows edit the records they show, and `detail="LIST by KEY"` projects one record into a panel or `<dialog>`. Actions are `trigger-add`, `trigger-remove`, `move:`, `sort:`, `set:`, and `confirm=`. `Sap(el)` is a write-through proxy, and `Sap.batch(label, fn)` makes one undo step. Done means no `sap ✗` console line and `Sap.status().ok === true`.

How it fits ClayJS:

- **The core loads by itself.** On any page with a `[sap]` root, ClayJS loads the sapjs core (the `derive` plugin, [Plugins](https://clayjs.com/docs/guide/loading/#plugins)). The core covers records (`bind`, `state=`, `items`, `item`) and paints (`text`, `text:fmt`, `show`, `attr:`, `class:`, `css:`, and the `show-when:` family). Markup that needs full sapjs (`calc:`, `each`, `detail`, `effect`, `invalid`, actions, or `Sap(el)`) halts with `E50`, which names it. Load `https://clayjs.com/v1/sap.js` for full sapjs; the markup stays the same, and full sapjs takes over from the core.
- **Painted values are derived.** Comparisons, dirty checks, autosave, undo, and merge inputs leave out what a paint owns: the attribute an `attr:` names, the one class token a `class:` names, the `--` property a `css:` names, the children of a `text` element, and `hidden` under `show`. A paint never marks the page unsaved, and two tabs that change different records while repainting the same total end with the right total and no conflict.
- **Ownership is read from the markup.** It comes from the element's own attributes, never from evaluating an expression, so it holds the same in the live page, a save clone, and a frame from disk. `attr:` never owns `id`, `data-id`, `class`, `style`, `value`, `checked`, `selected`, or a name the same element declares in `state=`; those stay record.
- **Repainted before anything records a baseline.** The engine mounts during boot after frozen regions record their markup and visitor drafts restore, so the boot baseline settles on the painted page. After every merge, it repaints right away before the saved, peer, and disk baselines and before `clay:sync-applied`.
- **Painted values are still saved** so the file shows them without JavaScript. When a repaint leaves the file's painted values different from the page's (an agent wrote a record and left the old paint), one clean tab with autosave on saves the painted page after a short random delay. Other tabs that repainted the same frame see that save and skip theirs.
- **Agents and `api` rules read and write records, never paints.** Point a rule at the `bind` element or a `state=` attribute (`"state": ".state"`), never at a painted attribute. A painted value on disk can lag the record until a tab repaints and saves it.
- Rows of an `each=` view carry `clay="editor-ui"`, so views never save or sync.

A status that sets text, color, and a label, with the state stored once:

```html
<main sap>
  <table><tbody items="steps">
    <tr item class="step" data-id="s1" attr:data-state="item.state">
      <td><span class="state" bind="state" attr:aria-label="'Status: ' + item.state">accepted</span></td>
    </tr>
  </tbody></table>
</main>
```

`tr[data-state="accepted"] .state { background: var(--ok) }` colors it, and `htmlfile data --write` or the JSON API writes only `.state`.

Rules for sapjs in a malleable file:

- **Store each record once as an element, and derive everything else.** Counts, totals, and card faces computed only from records are ordinary saved content. Paint them into the record markup and ship the file pre-painted so the first pass writes nothing (`mount writes 0`). A stale painted value repaints at mount; under ClayJS the paint heal saves it, and on other hosts sapjs logs `W30` and the value goes out with the next real save.
- **Per-tab values go in `clay="freeze"`.** This includes today's date, the locale, the URL hash, the search box, or runtime data. Freeze saves an element's contents as they were at load, so put per-tab values inside the frozen element or fill it from an `effect`, which re-runs every pass.
- **Per-tab state is `transient`** (`state="q:transient open:transient"`, and `transient` on the bound search input), or the URL hash through `clay-router.js`.
- **Filter with an `each=` view or a frozen stylesheet**, never with `show=` on saved records. `show=` paints `hidden`, which ClayJS treats as derived and never syncs, but a save still writes the saving tab's filter into the file.
- **Every `detail=` panel and `<dialog>` sits inside a `clay="freeze"` wrapper.** Its controls are painted with the open record's values and would save a second copy outside freeze. Do not use `editor-ui`, which removes the element from the file. Sapjs logs `W31` for a dialog without the wrapper.
- **Give records a `data-id`**, and `data-id=""` on blueprints so `$add` and `trigger-add` mint fresh IDs. Live sync pairs elements by it.
- **Put `persist` on bound inputs inside records** so typed values reach the attributes a save captures.
- **Undo, redo, and sync merges restore `persist` controls' live values** from their attributes, so sapjs reads what the file says. Controls without `persist` are not restored; give them `persist` or re-sync them yourself.
- **Hide blueprints in your own CSS** (`[item][template] { display: none }`); sapjs's own rule arrives only with the script. Sapjs also adds `[hidden] { display: none !important }` page-wide.
- A pass is batched: after a write, call `Sap.refresh()` before reading painted output. Expressions compile with `new Function`, so a Content Security Policy without `unsafe-eval` breaks them.

### 7.12 cms: content-managed pages

`?plugins=cms` turns a page into a content-managed page. A JSON rules tag maps field names to selectors, and an "Edit content" button opens a sidebar form (or edits text in place) that writes straight into the DOM.

```html
<script data-rules-name="cms" data-rules-version="1" type="application/json">
{ "title": ".page-title", "intro": "p.intro", "hero": "img.hero@src", "plans": [".plan", { "name": ".name", "price": ".price" }] }
</script>
```

It fits fixed-layout content sites such as landing pages, menus, pricing, FAQs, and team pages, where a non-developer changes copy and images. It does not fit apps where editing is the product: its form is a separate surface from the content, new list items clone the first item's attributes (including its state), and rich text inside lists is flattened in the sidebar. A file can use both if the CMS owns the header copy, the app owns `<main>`, and the rules never reach into the app's region. Give every list that can become empty a `cms-template` seed hidden by CSS, not by the `hidden` attribute (which is copied into every new item). Add `sortable` to the plugin list for drag in the sidebar.

The rules tag can declare which editor opens. `data-cms-view="inline"` edits text in place and opens small popovers for everything else, while no attribute (or `"sidebar"`) opens the form in a side panel. The "Edit content" button opens whichever the page declares. The CMS edits only in edit mode: while the page is in view, `clay.cms.open()` answers `{ ok: false, code: "not-allowed" }`, so a button of your own calls `clay.setMode("edit")` first.

The CMS also edits how a page looks. A rule ending in `@--name` reads and writes one CSS custom property in an element's `style` attribute. For example, `"accent": "html@--color-accent"` with `a { color: var(--color-accent) }` in your CSS gives the owner a color picker. Any `--color-*` name gets a color picker, any `--font-*` name gets a list of 40 Google Fonts, and the CMS keeps one `<link data-hcms-fonts>` loading the fonts in use. For a layout choice, put `data-hcms-component:data-layout="variant"` and `data-hcms-options:data-layout="1:cols-1 2:cols-2 3:cols-3"` on a section and key your grid CSS on `[data-layout]`: the owner gets icon tiles, and the choice writes only the attribute. Style fields on `html`, `body`, or `:root` gather in a "Page style" group at the top of the form.

### 7.13 message: contact forms

`?plugins=message` sends a visitor's form to the document's owner. On hyperclay.com, the owner gets it by email and in their messages.

```html
<form message-form="Thanks, I'll reply soon">
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <button>Send</button>
</form>
```

- On submit, the fields go as JSON to the host's `/_/message`. The form resets, the attribute's text shows as a toast, and the form fires `clay:message-sent` or `clay:message-failed` (`detail` is `{ ok, error }`). Call `event.preventDefault()` on it to draw your own confirmation instead of the toast.
- A form whose `action` is `/_/message` is taken over the same way, so a hand-written `<form method="post" action="/_/message">` works once the plugin loads.
- `clay.message.send(data)` sends from your own code. It resolves `{ ok, error }` and never rejects.
- **The bot check is invisible and needs the plugin.** When the visitor first focuses or types in the form, the plugin fetches a one-time token from `/_/form-token`, and the host refuses a message without one. A form posted without the plugin or with JavaScript off gets an error, never a silent drop.
- Field names are what the owner reads (`**email**: ...`). Do not name a field `formToken` or `formSignals`.
- A submit handler of your own that calls `preventDefault()` keeps the form to itself; the plugin leaves it alone.
## 8. Structuring an app

### 8.1 The record container

Keep every record in one container in the saved document, with `data-id` per record and fields as attributes, text, or persist controls. Shape the container by the primary editing dimension:

- **Board-first** (kanban, pipeline): records live inside their column's list. `sortable` gives cross-column drag, and the column a card sits in is its status.
- **Table-first** (finance, CRM contacts, inventory): records are `<tr data-id>` rows in one `<tbody>`. Any board is a projection.
- **Document-first** (writer, wiki page): records are blocks, siblings in one `sortable` container ([Block writer](https://clayjs.com/docs/guide/recipes/#block-writer)).

Never store a record twice. A JSON mirror of DOM records, or a rendered copy beside a model, drifts the first time a merge or a hand edit touches one of them.

### 8.2 Chrome

Chrome is the app UI around your records. Author static chrome in the file and hide it from viewers with `show-when:editmode="true"` ([Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options)). It needs no script, is in place before ClayJS loads, and viewers never see it. The file carries its markup, which is harmless as long as nothing changes it.

Use `clay="editor-ui"` when hiding is not enough:

- **A script changes it after load.** This includes counts, summaries, status text, and a filter bar that reflects its state. In a saved element, each change is an edit: it starts an autosave, adds an undo step, syncs to peers, and can conflict with theirs. Inside `editor-ui`, none of that happens. For a selection or open state on a saved element, use `ephemeral` instead.
- **It is drawn from data.** Charts, canvases, and grids rendered from the record.
- **It holds per-tab state.** The open card, the current view, and the style that paints them ([Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state)).
- **Viewers must not receive it.** The saved file has to be clean HTML without the controls.

An `editor-ui` element is removed from every save, so do not author it in the file. Clone it from a `<template>` into one `clay="editor-ui"` wrapper after `clay.ready`:

```js
const chrome = document.createElement("div");
chrome.id = "chrome";
chrome.setAttribute("clay", "editor-ui");
chrome.append(document.getElementById("chrome-tpl").content.cloneNode(true));
board.querySelector(".board-head").append(chrome);
```

Chrome may sit inside the record container (the kanban puts its filter in the board header): `editor-ui` removes it wherever it is. Author static per-item controls, such as a grip or remove button, in the item's `<template>` with `show-when:editmode="true"`. Insert script-managed per-item controls (the writer's block gutter, a list's menu button) into each item as their own `editor-ui` element, and re-insert them in `render()` when missing so items added by a peer get theirs too. A per-item value computed from the record, such as a count, is saved content rather than chrome ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)).

Edit-only chrome lives in the same wrapper with `show-when:editmode="true"`, or is skipped in view mode (`if (clay.isEditMode) …`).

### 8.3 Per-tab state

Keep UI state outside saved records unless it belongs to the document for every visitor.

| State | Where | Why |
|---|---|---|
| Which card or entry is open, the filter, search text, current view, sort | URL hash: `#card=c-brief&q=pricing` | per tab, survives reload, shareable, Back closes the card, never saved or synced |
| Collapsed sections, column widths, density, last opened entry | `clay.storage.local.get(key)` / `set(key, value)` / `remove(key)` | per device and viewer, scoped to this file's path (`clay.storage.session` lasts one tab) |
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

Nothing on a record changes, so opening a card or filtering never makes the page dirty or reaches a peer. The kanban and skeleton tests check that.

When a view switch must use `clay-options` on a saved ancestor attribute, normalize it out of every snapshot so it stays tab-local:

```html
<main id="app" view="board" onbeforesnapshot="this.setAttribute('view', 'board')">
```

Never put per-viewer state on `<html>` or any record element without that reset: it autosaves, syncs to every collaborator, and lands in version history.

`clay.storage` keeps JSON under `clay:doc:<location.pathname>:<key>`, so two documents on one subdomain never share a key. Without it, a per-document key must be hand-built from the path or every document's app collides with the next. `session` survives a reload and copies into a duplicated tab, so it cannot keep one tab's state out of the next. When the browser blocks storage, every call works from memory for the life of the tab and `set` returns `false`: save the value somewhere that outlives the tab if `set` returns `false`.

### 8.4 Derived values

Pick by whether the saved file must show the value:

- **Computed only from the records** (counts, progress badges, totals, a card's face): ordinary saved content. Write it into the record markup, ship the file pre-painted, and recompute on every change. With sap, this is a paint ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)) that ClayJS treats as derived. Merges leave it out and the engine repaints it from the merged records, so two tabs that changed different records end with the right value and no conflict. Hand-written derived text in saved content does not get this, so give it `no-dirty`. The starter Kanban paints its list counts and card faces this way.
- **Different per tab** (search results, which entry is open, "overdue" against today's date, OS shortcut labels, names loaded from the people plugin): write it inside a `clay="freeze"` scratchpad ([Regions: the `clay` attribute](https://clayjs.com/docs/guide/record/#regions-the-clay-attribute)). The element saves and syncs, while its contents never do.
- **Pure UI** (buttons, menus, handles): `editor-ui`, created from a `<template>` ([Chrome](https://clayjs.com/docs/guide/architecture/#chrome)).
- **Optionally, `no-dirty`** for a computed value the saved file shows: it saves with the next real edit, never counts as an edit itself, and remote wins under sync. Apply the [Regions and JSON under sync](https://clayjs.com/docs/guide/live-sync/#regions-and-json-under-sync) workaround. The finance tracker does this.
- **Only in the saved file**: compute it into the save clone with `clay.addDocumentTransform`, never the live page.

Always write derived text through a guard, because writing the same text is still a mutation:

```js
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
```

Recompute inside `clay.effect(render)`, which covers record mutations, merges, undo, and redo ([Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code)). Call `render()` from a `hashchange` listener when the hash affects the view.

With sapjs, every derived value here is a paint. sapjs recomputes on record mutations and `clay:sync-applied` by itself, and on hash changes only through `clay-router.js` (`clay:route`). An app with its own hash format keeps a `hashchange` listener that calls `Sap.refresh()`. See the [sapjs guide](https://saphtml.com/guide.html).

### 8.5 Detail views: the record is the modal

Keep a record's detail fields **inside the record element**, hidden on the card face by CSS, and show the record itself as an overlay with the runtime stylesheet from [Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state):

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
- The detail moves with the card when dragged, and merges per card under sync.
- A peer's edit to the open card appears in place, with your caret kept.
- richclay's body-mounted toolbar works because nothing is in the top layer. `showModal()` would also write `open` into the file.

Open on a click that is not on an editable field, handle, input, or link. Close on the backdrop, Escape (unless typing), and Back. When a peer deletes the open record, `render()` finds it gone and clears the hash. Caveat: `position: fixed` breaks inside an ancestor with `transform`, `filter`, or `contain`.

When a dialog must aggregate several records, render it into `editor-ui` and write each change back to its record by id. Call `clay.markDirty()` per edit if the record is not written immediately, and re-render it on `clay:sync-applied` without disturbing the focused field.

**Half-typed text in a detail field outlives the view.** A comment box or description being edited sits in chrome (`clay="editor-ui"` or `clay="freeze"`) and carries `unsent="<name>"`, with the `unsent` plugin loaded (`?plugins=unsent`). ClayJS keeps its value per record and name in this tab, outside the file. The record is named by the nearest `unsent-key` attribute, and by the nearest `[data-id]` when there is none, so a composer for a record that does not exist yet can name its destination (`unsent-key="capture:board"`). While a draft is held, leaving edit is refused with `pending-input`. Close the detail, take a sync redraw, or reload, and the text is back with the close warning on until it is sent.

```html
<div class="detail" clay="editor-ui">
  <textarea class="comment" unsent="comment" placeholder="Add a comment"></textarea>
  <button data-action="send-comment">Send</button>
</div>
```

- The attribute is only a marker in the file: the region is chrome, so no save, sync frame, or undo step ever carries the text.
- Restoration runs from a `MutationObserver` rather than a microtask, after the code that rebuilt the detail, so the view's `openDetail` can clear and refill the field in the same task. To react to it, listen for `clay:unsent-restored`, which bubbles from the control with `detail: {base, current, stale}`. `stale` is true when the record's saved value changed since the person started typing, so the view can warn instead of silently overwriting.
- Send and cancel call `clay.unsent.clear(input)`. Typing the text back to what the record already holds, or emptying it, drops it too, so the warning clears without an explicit call.
- `clay.unsent.size` and `clay.unsent.list()` (`{record, name, base, text}`) say what is kept, and `clay:unsent-changed` fires on `document` with the count.

With sapjs, the record-as-modal pattern works unchanged over `items=` records, and a plain-field editor can be a `detail=` panel or `<dialog>` instead. See the [sapjs guide](https://saphtml.com/guide.html).

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
- Use one delegated click listener on `document` for all actions. It survives merges that recreate elements.
- Write activity entries from the command that made the change, never from a mutation observer, which would also log peer changes and undo replays.
- Bulk inserts (an import of hundreds of rows) cost one mutation record per inserted element. Insert a fragment once rather than row by row, inside one commit or `Sap.batch`.

**Soft delete is `clay.trash`.** `card.remove()` above deletes for good. A delete a person might want back, or one a peer might be editing at the same moment, is an attribute instead: a record is in the trash while it carries `data-deleted-at`, and the record keeps its place, its id, and its content.

```js
const item = button.closest("article.entry");
const { undo } = clay.trash(item);          // stamps data-deleted-at, fires clay:trashed
clay.toastPersistent("Moved to Trash", "info", {
  actions: [{ label: "Undo", onClick: () => { undo(); clay.toastPersistent("Restored", "info"); } }],
});
```

- `clay.trash(el, {at})` stamps the timestamp (`at`, or now), `clay.trash.is(el)` checks trashed state, `clay.trash.restore(el)` removes the attribute and fires `clay:restored`, and `clay.trash.purge(el)` removes the record for good. Both events bubble from the record.
- Because a delete is an attribute change, a peer editing the same record at that moment keeps their edit and the delete merges with it. Undo restores the attribute instead of an old copy of the record. `card.remove()` has neither.
- Leave trashed records out with a rules selector, `"article.entry:not([data-deleted-at])"`, or keep them in the list and show a `deletedAt` field (`Date.parse(el.dataset.deletedAt)`) for a Trash view. Never remove records to filter.
- Readers without JavaScript get the raw file, so hide trashed records there too: `<noscript><style>article.entry[data-deleted-at]{display:none}</style></noscript>`.
- The undo toast stays yours: `clay.toastPersistent(message, type, {actions})` takes the Undo button where `clay-ui` is loaded, and an app with its own toast keeps it.

### 8.7 Filters and view switching

Filter and switch views without removing or mutating record elements:

- **Filter by hiding** records with a runtime stylesheet (skeleton, kanban), or with sapjs through an `each=` view or a frozen stylesheet ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup)). The finance example still uses sap `show=` plus snapshot normalization, an older pattern where `show=` writes `hidden` into saved records. Never remove records to filter.
- **Switch layouts with CSS** over the same records where possible: a list view can be the board with `display: contents` on columns.
- **Projection views** (a table of all cards, a calendar, a due-today list) render into an `editor-ui` container and rebuild on record mutation, `clay:sync-applied`, and `hashchange`. Edits made in a projection write to the record by id.

With sapjs, a projection view is an `each=` attribute, and its rows edit the records they show by themselves. See the [sapjs guide](https://saphtml.com/guide.html).

### 8.8 Computed totals

Use plain JavaScript into `editor-ui` ([Derived values](https://clayjs.com/docs/guide/architecture/#derived-values)) for a count or two. Use sapjs for arithmetic across rows, categories, and formats ([sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup), and the expense tracker in the sapjs guide). Store money as integers or plain numbers in `value` attributes, never as formatted strings.

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

`clay.applyData({ rows }, { rules })` writes a whole list back. It grows and shrinks the list to match and refuses unknown keys, scripts, and event handlers without a partial write. To append, pass the existing rows plus the new ones. `applyData` pairs incoming rows with existing elements by content and order, **not** by an `id` field. Reorder the rows and edit them in the same call, and an element can be rewritten as a different record while keeping the old record's unexposed attributes. When identity matters, update records yourself: find each element by `data-id`, write its fields, and append new ones from a template.

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

### 8.10 Importing and exporting records

The Journal keeps every record in one container, so a backup, an import, a selected export and a print are four ways of copying or writing that same set. Each one is a named function in `journal.html`.

- **Back up the exact fields, blanks and Trash included.** `Backup.records` reads every record with all of its fields, and `Backup.envelope` wraps them as `{ format, version, exportedAt, entries }`. An empty body and a trashed record are still records, so a backup restores what the file holds rather than what the view shows. Markdown is not an exact data backup.
- **Parse, preview and revalidate before committing.** `Backup.parse` reads a file inertly and refuses unknown fields, missing fields, duplicate ids and bad dates with a code. `Backup.plan` sorts the rows into fresh, identical and conflicting ones, `planRestore` offers `keepBoth` for a row that changed here, and `Backup.verify` reads a candidate back field for field. A refusal at any of those points changes nothing.
- **Commit once, synchronously.** `confirmImport` re-reads the limit, compares the current capture with the preview's baseline, replans and re-verifies, then appends the prepared records in one synchronous step followed by one `clay.save.soon()`. There is no await between the last check and that step, so a refusal leaves the page, the route, the selection and the dirty state as they were.
- **Measure the candidate against the host's limit.** `candidateWith` builds the bytes a save would send with the new records already in place, and `measureHTML` asks `clay.save.inspect` about them. An over-limit import is refused before a single record enters the document.
- **Export only the bytes selected.** `selectedCopy` removes every unselected article from the copy inside `clay.getHTML({ transform })`, so the records left out are gone from the file rather than hidden by CSS. `verifySelectedCopy` reads the result back and checks the exact id set.
- **Move a year out only after the copy you kept checks out.** `YearArchive.archive` downloads the year as a `.htmlclay` copy and an exact JSON backup and removes nothing; starting a download proves nothing about a second copy. **Finish moving this year** asks for the file the person kept, reads it inertly, and requires exactly the reviewed records, field for field. A different file, a changed record or a record that joined the year since the review refuses with nothing removed. Before removing, `ArchiveMoves.stage` keeps the reviewed records in the `journal.archive-moves` recovery channel and awaits its durable receipt; a browser that cannot keep it refuses and offers the copy only. The removal itself is one synchronous step after a last re-check, followed by one `clay.save.soon()`. The move is cleared only by a saved file whose bytes lack every reviewed id, so a save that never lands leaves **Archive move awaiting save** after a reload. A year whose entries link pictures kept in the journal's own files can be copied but not moved, because a copy cannot carry them yet.
- **Print the canonical records.** `printSelected` flags the chosen live articles with the ephemeral `print-pick` word and print CSS narrows the printout to them, so a printout is the records themselves, not the filtered list or an open editor. The flag is never saved, and another tab's sync never carries it.

```js
const attempt = candidateWith(added);
if (!Backup.verify(attempt.html, attempt.expected).ok) return;
const size = await measureHTML(attempt.html, limit);
if (size.state === "over") return;
store.append(fragment);
```

### 8.11 Starting the app once

Start the app with `clay.start` so initialization runs once per page. A live-sync merge can re-insert an inline script and run it again, which doubles every listener and every chrome element. `clay.start` runs its function once after `clay.ready`, and a repeat call does nothing:

```js
clay.start(() => {
  …
});
```

A page with more than one app script names each one so they do not share a slot: `clay.start("board", fn)`.

### 8.12 Document size and record limits

Every save captures and serializes the whole document, every change check captures it again, and every peer merges the whole document per accepted save. Measured in jsdom and scaled to a browser (estimates):

| Records (about 425 bytes each) | File size | Capture per check | Full save | Peer merge |
|---|---|---|---|---|
| 300 | 128 KB | ~10 ms | ~25 ms | ~10 ms |
| 1,500 | 640 KB | ~55 ms | ~140 ms | ~60 ms |
| 3,000 | 1.3 MB | ~120 ms | ~300 ms | ~190 ms |
| 6,000 | 2.6 MB | ~250 ms | ~650 ms | ~400 ms |

Typing also costs one Sap pass, and a pass visits every record. Sap skips rereading unchanged record values, but it still builds fresh objects for every record, so the pass grows with the record count: at 5,000 records in jsdom, a body edit's pass takes about 27 ms ([Cost at size](https://clayjs.com/docs/plugins/sap/#cost-at-size)).

Up to about 1,000 records feels instant. From 1,000 to 3,000 there is a visible hitch at each save. Past about 3,000 records or 1.5 MB, autosave stalls typing and peers lag. Hosts cap a save at 5 MB (hyperclay.com), 20 MB (Hyperclay Local), and 50 MB (HTML Clay). Design for archiving: one file per year, a hidden archive section that can move to another file, or one file per project.

### 8.13 Styles a script writes

Use `clay.style` when a script owns CSS that should stay in the saved document. The saved style paints the next load before the script runs. When the script runs, it refreshes that same tag with its current CSS:

```js
await clay.ready;
clay.style("app-colors", ".status { color: blue; }");
```

The name identifies a `<style data-name="app-colors" clay="no-dirty">` in the document's head. On the first load, before any save has carried the tag, `clay.style` creates it. A repeated call updates the existing tag in place without adding an undo step, starting an autosave, or raising the close warning. The next real save includes the current CSS.

The one-argument form keeps an external stylesheet link current:

```js
await clay.ready;
const link = clay.style("/app.css?v=2");
```

If the saved file has `/app.css?v=1`, this updates that link's `href` to `/app.css?v=2`. Matching uses the URL's origin and path, ignoring its query and fragment. The link is also `no-dirty` and travels with the next real save. Both forms work in edit and view mode and return the element synchronously, without waiting for the stylesheet to load.

Use `clay="editor-ui"` instead for CSS that viewers must not receive or that represents per-tab state, such as a temporary filter. Those styles are stripped from saved HTML. `clay.style` is for CSS that belongs in the file, and changing its name on every load creates another saved tag. Adding or rewriting a plain style tag without `no-dirty` can raise the leave warning even though the person edited nothing.

---

## 9. Hosts, assets and privacy

### 9.1 What each host gives

| | HTML Clay | Hyperclay Local | hyperclay.com |
|---|---|---|---|
| Who edits | the local user | the local user; teammates through device sync | owner, team editors, edit-link holders |
| Live sync | tabs on this machine | tabs, plus other devices through the sync engine | every editor and viewer |
| Outside disk edits reach open tabs | yes (agents, text editors) | yes | no disk except through device sync |
| Presence (`clay.presence`) | tabs of this browser, shown as "This computer" | tabs on this computer, relayed by the app | one person per account and one session per tab, filtered per recipient |
| `by` on frames, editing marker | no | no | yes |
| Live stores ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | tabs of one browser at full speed | tabs of one browser at full speed; other devices at save speed | every editor at full speed |
| Page editor merge state ([Live data: `clay="live"`](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live)) | kept beside the file: `document.pageState.href` returns the state stored with the exact bytes on disk | kept beside the file | kept beside the file |
| Wire and ai-edit | yes | yes | ai-edit only, for owners and team editors on a paid plan |
| Data API write | yes | yes | read only |
| Uploads | 25 MB, in `~/htmlclay/uploads/` | 25 MB, in the root's `uploads/` | 10, 20 or 100 MB by plan, in the account's `uploads/` |
| Upload access (`document.upload.access`) | `local` | `local` | `document` once the account's uploaded files are protected; no field before that |
| Version history | yes | 60 days, newest 20 | a version per save; a restore does not reach open editors' tabs, so reload after restoring |
| Max save (`document.maxBytes`) | 50 MB | 20 MB | 5 MB |

The `/_/meta` answer carries `document.maxBytes`: the maximum uncompressed UTF-8 HTML save body, inclusive. All three hosts send it, and ClayJS measures a save against it before sending, so a document that is over the limit is refused instead of lost ([Size limits](https://clayjs.com/docs/guide/saving/#size-limits)). A missing or unusable value means the limit is unknown, and the host's own refusal is the only answer.

On hyperclay.com only, the same block carries `document.maxBytesMeasures: "file"`. It means the limit is measured without the `<script merge="page">` tag that holds the document's live state. HTML Clay and Hyperclay Local send no such field.

A plain static server or a file opened from disk can show the file in view mode, but cannot save it. Use the `demo` plugin for a public demo that saves into each visitor's browser.

On hyperclay.com, every tab holds its own sync connection. Over HTTP/1.1, a browser allows six connections per origin, so a seventh tab of the same site can stall.

### 9.2 Getting started on each

- **HTML Clay:** save the file as `name.htmlclay` and open it with HTML Clay 1.9.0 or newer. The extension changes nothing about the content. The file is ordinary HTML.
- **Hyperclay Local:** put the file in the synced folder and open it from the app.
- **hyperclay.com:** create a site and paste the file, or upload it.

### 9.3 Privacy

The saved file is the data. Everyone who can download it can read everything in it: hidden elements, `data-*` attributes, JSON scripts, CSS-hidden sections and everything the owner typed. `show-when:editmode`, `hidden` and `display: none` are presentation only.

- To publish a version without private values, make a copy and remove them, or keep private data in a different file with different access.
- A file you hand out as a template should ship with sample data, not yours.
- On hyperclay.com, a file uploaded from inside a document is bound to that document. When `document.upload.access` is `document`, its bytes follow the document's read permission on every route. A reader without access gets the same 404 as a missing file, and the file is sent `Cache-Control: private, no-store`. Uploads made before that binding existed stay reachable by URL until the account's protection migration has run. A copy someone already downloaded cannot be taken back.
- HTML Clay and Hyperclay Local report `local`, meaning their own file-serving rules, not a sharing ACL. A file there is as private as the folder on that machine.
- Password inputs are never persisted. An authored `value` on them is still in the file.

### 9.4 Offline in a local host

Hyperclay Local and HTML Clay each bundle one exact, published ClayJS release, chosen in their `offline-runtime.lock.json`. They ship the whole release listed in `dist/offline-manifest.json` in the npm package, not only what one document boots with. That index lists about 550 files: every module, plugin, satellite such as `sap.js` and `clay-router.js`, vendored library, theme sheet and font, plus the exact library builds older Journals load from other CDNs. A plugin, the merge engine, a drag library or a font that a document uses for the first time offline still loads.

- **The route.** The release is served at `/_/clayjs/<version>/<path>`, so `https://clayjs.com/v1/clay.js` is `/_/clayjs/<version>/clay.js`, with an immutable cache and an `ETag` of the file's sha256. A path the index does not list answers 404 and is never fetched from the network.
- **Projection on serve.** A served document is rewritten in two places only. First, `src` and `href` attributes for recognized ClayJS runtime URLs become the local address, with the same spelling the file used for the rest of the URL. Recognized URLs are `https://clayjs.com/v1/...`, exact-version URLs of the bundled release, and the few exact library and font URLs the release carries a copy of. Second, a `<script type="application/json" id="clay-runtime-map">` descriptor records the mapping. Text, code samples, Markdown and every other URL stay byte for byte.
- **Canonicalization on every write.** Save, data API writes, restore, export and live-sync frames turn those local addresses back into the public `https://clayjs.com/...` URLs and remove the descriptor before anything reaches disk. A saved or downloaded file never contains a `/_/clayjs/` address, so it stays portable to any host. A request with `Clay-Source: 1` receives the canonical bytes unprojected.
- **Versions.** A rolling `https://clayjs.com/v1/` URL is served from the host's bundled release. If a document pins a release the host does not bundle, or names a runtime file the bundled release lacks, every runtime URL is left public. It loads online, is not promised offline, and the response carries a `Clay-Runtime-Unavailable` header that says why. The host never substitutes another release's files into a page.
- **Older Journals.** Journals created before the release bundled its libraries load OverType and highlight.js from other CDNs, and their fonts from Google Fonts. The release maps three exact URLs to copies it ships: `https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js` and `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` to the same classic builds (which define `window.OverType` and `window.hljs`, with their licenses and pinned hashes in `compat/journal-assets.lock.json`), and the Journal's Google Fonts stylesheet URL to a stylesheet over the bundled IBM Plex files. Each match is the whole URL. Another version, a query string, another file or another host stays on the network. A Journal saved with those URLs edits offline, and a document that names anything else from those CDNs does not.
- **The first switch to edit.** A document opened offline in view can switch to edit without the network. The switch reloads into an edit boot, and every file that boot loads (the mode controller, the plugins, the Document editor and their late imports) is in the bundled release. Both hosts serve that set from the release with its index digest, the first edit saves the canonical public URLs, and the reopened file is projected again. ClayJS checks it per release: a mode file missing from the release fails the closure check.
- **What stays online.** Pictures and media hosted elsewhere, AI features and collaboration with other people need the network. A picture uploaded into the local folder is a local file and works offline.
- **Checking a host.** `node scripts/verify-offline-closure.mjs` in the ClayJS repository checks a release's closure: every listed file is present with its recorded hash, and every module import resolves inside the release. It runs in three modes: `--package-root <dir>` for a built checkout, `--published-root <dir>` for an unpacked release tree and `--base-url <url>` for a running host's `/_/clayjs/<version>/` prefix. With `--base-url`, pass `--index <file>` naming the host's own bundled index. Without it, the check compares the host against the checkout's index.

Why the whole release and not a boot closure: a sap document loads much of its code late. A Kanban board loaded with `plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu` boots with a few dozen modules. It then asks for `derive`, the merge engine, SortableJS on the first drag and the live-sync modules as they are needed, about 116 release paths in all. None of those appear in what the page requests at boot, so a host that served only the boot graph would break on the first drag with the network off. ClayJS's cross-host contract test opens that real board in both local hosts and requests every one of those paths through the host.

---

## 10. What ClayJS does not do

ClayJS gives you one file per document that edits and saves itself. Here is what it does not do, so you can promise what the file can do and pick the right tool.

### 10.1 What changed recently

Two plugins replace the old advice to hand-build a [block writer](https://clayjs.com/docs/guide/recipes/#block-writer) or wait for autosave:

- **The [page editor](https://clayjs.com/docs/plugins/page/)** (`?plugins=page`) is a Notion-like block editor for one `article[data-page]`, backed by Yjs, where typing reaches other people as they type. It includes headings, toggle headings, lists, checklists, toggles, callouts, code, images, files, typed tables, boards, charts from a table, mentions of people and dates, emoji, a page icon and cover, CSV and Markdown import, and Markdown and self-contained HTML export.
- **[Live stores](https://clayjs.com/docs/plugins/live-sync/)** (`clay="live"` and `clay.live()`) move fast-changing state at network speed (25 frames per second) instead of save speed. Use [live data](https://clayjs.com/docs/guide/live-sync/#live-data-clay-live) for games, scores, and shared state.

The old limits apply elsewhere. Ordinary `editable` regions and DOM records have no CRDT and merge at save time. Rich text outside the page editor has no tables, and without `live-data`, the page editor falls back to file saves.

### 10.2 Compared with the tools you know

| What you are comparing to | What ClayJS gives | What is missing | What to build instead |
|---|---|---|---|
| **Google Docs** | Keystroke co-editing, tables, code, callouts, and images in the [page editor](https://clayjs.com/docs/plugins/page/); word-level save merge in `editable`; recoverable conflicts; version history; `ai-edit` | Comments, suggestion mode, live cursors outside the page editor, pagination, footnotes, `.docx` export, tables in `editable` rich text | The [page editor](https://clayjs.com/docs/plugins/page/) or a [block writer](https://clayjs.com/docs/guide/recipes/#block-writer); comments as `<aside data-id data-anchor>`; print CSS for PDF |
| **Google Sheets** | Persisted inputs, sap formulas over named fields, aggregates, formats, CSV, page tables and charts from a table, 10,000-row pages saving in about 400 ms | A1 references, ranges, fill-down, recalculation graph, virtualization, range selection, pivots | A page table and chart, or a [typed table](https://clayjs.com/docs/guide/recipes/#typed-table-a-spreadsheet-you-can-be-honest-about) of a few thousand rows, one file per year |
| **Google Slides** | Slides as sections, sortable, uploads, view mode as the published deck | Free positioning, guides, masters, presenter view in a second window, transitions, PPTX export | A flow-layout deck with fixed layouts per slide ([slides](https://clayjs.com/docs/guide/recipes/#slides)) |
| **Trello and Linear** | Page boards where cards have an owner and a due date; sortable columns, inline editing, checklists, attachments, undo, per-card sync | Notifications, reminders, cross-board search, mentions, integrations, boards past a few thousand cards | A page board, or the [kanban with card detail](https://clayjs.com/docs/guide/recipes/#kanban-with-card-detail) with labels, due dates, and a due-soon projection |
| **Notion** | One document per file in the [page editor](https://clayjs.com/docs/plugins/page/) with real-time co-editing, Markdown shortcuts, derived titles, blocks, tables, CSV import, boards, and charts | A workspace of many pages, databases with relations and rollups, backlinks, sub-pages, workspace search, page permissions | A folder of files, one per page or database, plus an index file; links are `<a href>` |
| **CRM** | Records, pipeline board, card owners and due dates, notes, CSV, totals, contact forms via `message` | Email logging, reminders, dedupe, per-row permissions | The [CRM follow-up list](https://clayjs.com/docs/guide/recipes/#crm-follow-up-list), computing due rows on open |
| **Finance apps** | Rows with amounts, budgets, sap totals painted in view mode by `derive`, CSV import of bank exports, charts from a table | Bank sync, learned categorization, multi-currency, scheduled transactions, encryption at rest | A monthly or yearly budget file with CSV import ([finance tracker](https://clayjs.com/docs/guide/recipes/#finance-tracker)) |
| **Full CMS** | Per-page [CMS](https://clayjs.com/docs/plugins/cms/) sidebar, per-page style group for colors, fonts, and variants, uploads with crop, view mode as the site, JSON data API | Multi-page collections, shared layouts, drafts and scheduled publishing, roles, media library, i18n | A [content site](https://clayjs.com/docs/guide/recipes/#content-site) with one file per page, a shared stylesheet, and the [CMS](https://clayjs.com/docs/plugins/cms/) per page |

### 10.3 Limits that apply to every document

- **No comments.** ClayJS has no comment model (`ai-edit` is an AI prompt, not stored comments). Store comments as `<aside data-id data-anchor>` elements.
- **Live cursors only in the page editor.** The page editor draws other people's carets and selections where the host announces `page-awareness-v1`. Elsewhere, `clay.presence` tells a page who is here and which record they are writing in, and the page draws its own badges ([Presence](https://clayjs.com/docs/guide/live-sync/#presence)).
- **No suggestion mode, pagination, footnotes, or `.docx` and PPTX export.** Edits apply directly without tracked changes, page breaks, footnotes, or Office exporters. Use print CSS for PDF.
- **Per-file edit access.** There are no per-row permissions. Split data for different audiences into separate files.
- **No background work in a closed file.** Nothing runs in a closed file, and a live room ends after two minutes with nobody connected. Compute due states on open.
- **Large record sets cost every keystroke.** Each change runs a Sap pass that visits every record. Sap rereads only changed values, but the pass still grows with the record count, about 27 ms for a body edit at 5,000 records in jsdom. See [Document size and record limits](https://clayjs.com/docs/guide/architecture/#document-size-and-record-limits).
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

Extend with labels (a settings element listing `<li data-label="bug" data-color="…">`, cards carrying `data-labels="bug ui"`, and `merge-tokens="data-labels"` on the board so two people adding labels both keep theirs, [Declared attribute merges](https://clayjs.com/docs/guide/live-sync/#declared-attribute-merges)), due dates (`data-due` plus a hash filter "due this week"), WIP limits (an attribute on the column, a warning in an `editor-ui` badge), and a list view (a projection or `display: contents`).

With sapjs, the counts and progress badges become paints, the filters an `each=` view or a frozen stylesheet, and checklists nested `items=` lists with a shared blueprint: sapjs guide section [Chrome](https://clayjs.com/docs/guide/architecture/#chrome) builds a smaller version as a complete, tested app.

### 11.2 Block writer

For a Notion-like document, use the [page editor](https://clayjs.com/docs/plugins/page/) (`?plugins=page`) instead. This recipe is for a block app whose blocks are your own records.

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
- The menu is one `editor-ui` element positioned under the clicked button. Insert actions clone a block template and give it an id; block actions duplicate (re-iding every descendant, [Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id)) or delete.
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

Without the CMS: `editable` regions for copy, upload and quickcrop for images, `sortable` lists for features. With the CMS: a rules tag and `?plugins=cms` ([cms: content-managed pages](https://clayjs.com/docs/guide/components/#cms-content-managed-pages)).

---

## 12. Free documents for visitors

A **free document** is a published app anyone can use and keep. The visitor gets the same editing UI the owner gets, their work is kept in their own browser, and the download hands them a file with that work in it. Nothing a visitor does reaches the host.

### 12.1 What a visitor gets

On a page that opts in ([The contract](https://clayjs.com/docs/guide/free-documents/#the-contract)), a visitor who is not the owner is in **draft mode**. Every edit-only module loads, so `editable`, `persist`, undo, sortable and the rest behave as they do for the owner, and the autosave pipeline still runs. The save lane is swapped: instead of sending the document to the host, ClayJS extracts the page's `api` JSON out of the bytes a real save would write and stores `{ "v": 1, "savedAt": "2026-10-15T00:00:00.000Z", "data": { ... } }` under `localStorage["clay:visitor-drafts:<slot>@<path>"]`. The next load applies that JSON over the file the host served, so an owner's later fix reaches a returning visitor while the visitor's own work stays. The host is never told: no save, no sync, no upload, and no `/_/meta` discovery. Two tabs on the same page share that record: a save takes what only the other tab changed, and when both changed the same thing, this tab's version is saved and the other tab's record is kept under `clay:visitor-drafts:<slot>@<path>:conflict`.

The owner is a visitor here too. Signed in, they get the same private draft unless the URL carries `?editmode=true`, which edits the original file and shows every visitor the change. Two things never put the owner in draft mode: a document opened from `file:`, where draft mode never applies, and HTML Clay, which stamps a save token on the response. On HTML Clay the owner opens the file in view and edits the original after switching to edit. Hyperclay Local is not one of them. It serves the folder over `http:` and injects no save token, so its owner is in draft mode like anyone else and adds `?editmode=true` to edit the file ([The mode ladder](https://clayjs.com/docs/guide/free-documents/#the-mode-ladder)).

### 12.2 The contract

A page that wants draft mode needs all of this. The example in [A complete example](https://clayjs.com/docs/guide/free-documents/#a-complete-example) carries every item, and its test proves the round trip:

1. An `api` rules tag naming every saved field, with a `cms-template` seed row for every list the rules describe. Hide the seed in your own CSS (`[cms-template] { display: none !important }`), never with `hidden`, which the CMS reads as data ([cms: content-managed pages](https://clayjs.com/docs/guide/components/#cms-content-managed-pages)).
2. `<html visitor-drafts="<site-stem>-v1" autosave>`. The value is the slot: letters, digits, dot, underscore and hyphen, up to 100 characters. It names this app's drafts. ClayJS keys each draft by the slot and the document's path, so two documents on one origin never share a visitor's draft, even with the same slot.
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
6. The `isAdminOfCurrentResource` cookie (hyperclay.com, Hyperclay Local). It grants permission, so `clay.canEdit` is true, and the page still opens in view: the person opens it for editing with `clay.setMode("edit")` ([How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided)).

The rung is where a free document lives, so the details matter:

- `?editmode=false` is view mode, and nothing below it changes that.
- `?editmode=true` edits the original **only with the owner cookie**, and only on a page that draft mode would otherwise claim. A query parameter on its own never grants writes to the host: an anonymous visitor with `?editmode=true` stays in draft mode.
- The owner cookie alone is not enough either. The signed in owner gets the same draft as everyone else until they open the page with `?editmode=true`, and the owner chip ([The download prompt and the intro area](https://clayjs.com/docs/guide/free-documents/#the-download-prompt-and-the-intro-area)) is their way there.
- `viewonly`, a stale token, `window.clayEditMode` or a `savetoken` the host stamped on `<html>` all turn draft mode off. The first two leave it in view mode. `window.clayEditMode = true` starts the load in edit mode against the host, and a `savetoken` grants permission, so the page opens in view and `clay.setMode("edit")` edits the original. The host still decides who may write ([How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided)). On a `viewonly` document or one with a stale token, `?editmode=true` is not draft mode either: it is the same edit mode as before, saving to a host that refuses the write.
- Draft mode needs all four of the plugin name in `plugins=`, a valid slot, an `http:` or `https:` page and an `api` rules tag. That tag also has to carry `data-rules-version="1"` and hold JSON that parses; a newer version or unreadable JSON leaves the page out of draft mode with one console warning naming the problem. On `file:` it never applies, which is exactly why the download is a real file.
- `<html draftmode="true">` says which mode this load is in, beside `editmode` and `pageowner` ([The root attributes](https://clayjs.com/docs/guide/edit-mode/#the-root-attributes)), and is removed from every save.

### 12.4 What runs in draft mode

`clay.isDraftMode` is true, and everything else follows from it:

- **The plugins that talk to the host are dropped**, even when the page names them: `sync`, `live`, `page`, `upload`, `quickcrop`, `cms`, `people`, `menu`, `upgrade`, `wire`, `ai-edit`, `demo` and `source`. `clay.upload`, `clay.cms`, `clay.conflicts` and `clay.source` are absent, and code that guards them (`clay.upload?.(...)`) behaves as it does for a viewer. The `[refetch-on-save]` attribute is dropped too, since it would fetch its element from the host again after every save.
- **The save lane is the browser.** `clay.save()` and autosave both run, `savestatus` moves as usual, and the save answers `msgType: "success"` with `msg: "Saved in this browser"`. A storage failure answers the 507 path with `code: "draft-storage"` and fires `clay:drafts-store-failed`; the next good write clears it.
- **No request reaches the host.** The download link goes to the host's download page, which holds the email sign-up. The prompt's own stylesheet is a Google Fonts link.
- **`clay.readData()` and `clay.writeData()` refuse.** Both reject with `code: "DataUnavailableInDraft"`: the saved file belongs to the owner, and this visitor's work is in their browser, so there is nothing for them to read or write there. A page that calls them in draft mode gets that refusal instead of a request ([Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export)).
- **`clay.visitorDrafts`** is the plugin's whole surface:

| Member | What it is |
|---|---|
| `active` | `true` when the plugin found a slot and the rules tag, `false` otherwise |
| `slot` | the slot from `<html visitor-drafts="...">` |
| `key` | the `localStorage` key, `clay:visitor-drafts:<slot>@<path>`, where `<path>` is the document's path up to its `.html` or `.htmlclay` file (`/` for the root and for a host that serves one document at every path) |
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

A draft that no longer fits the page is never overwritten. When the stored JSON is not `{ v, data }` (garbage, a bare array, a missing `data`), the raw value is moved to `localStorage["clay:visitor-drafts:<slot>@<path>:unreadable:<ISO timestamp>"]`, the slot is cleared, and the page loads as authored with `parked: true` in the detail. When the write is refused only for keys the rules do not know, those keys are dropped and the rest is applied, so adding a field to the rules never costs a visitor their work.

**Drafts saved by an older ClayJS.** A draft stored under the slot alone is copied into the document's key on its first load, with its intro and prompt memory, and the old key is left as it is. Code outside ClayJS that reads a draft should read `clay.visitorDrafts.key`; a script that must run before `clay.js` uses the same path rule.

### 12.6 Two tabs

Each save merges what the other tab saved. Fields merge one by one, and lists of rows with ids merge row by row: a row added or removed in one tab is kept or removed, and rows changed in different tabs both keep their change. When both tabs changed the same field, reordered a list, or moved one row to different places, this tab's value is saved and the other tab's whole record is kept under `<key>:conflict`.

### 12.7 The download prompt and the intro area

Both are runtime chrome: `clay="editor-ui"` and `sap-ignore`, built by the plugin on every load. Neither is in the file, neither is saved or synced, and neither is read by sapjs.

Both remember themselves per slot and path in `localStorage["clay:visitor-drafts:<slot>@<path>:ui"]`, as `{ "v": 1, "prompt": { "shown": ..., "dismissed": ..., "uses": ..., "downloaded": ... }, "intro": { "done": null | "closed" | "scrolled" }, "src": ... }`. Clearing that key shows the intro and the prompt again.

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

### 12.8 Migrating an app's own storage

**Not supported yet:** the plugin reads no migration hook, so an app that kept its earlier data under its own `localStorage` key has to move those values into the page from its own code, on the first load after the switch.

### 12.9 A complete example

[`examples/free-reading-list.html`](https://clayjs.com/examples/free-reading-list.html). Plugins `visitor-drafts,indicator&exclude=richclay`, satellites `clay-options` and `sap.js`. A reading list: a title, an author and a status select per book, one scalar goal for the year, and sapjs counting the books that are read. It is the shortest file that carries every item of the contract, and `tests/unit/guide-examples/free-document.test.js` runs it end to end: edit a title, add a book, check the slot, then load the file again with that storage and check the books and the counts come back. The record is authored in the saved form, with its `viewmode:` attributes. The `reading` option of a status select carries no `selected`: it is the first option, which is the default, and the row that is `read` marks it.

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
4. The owner has a way into edit: the `menu` plugin, or a control of your own that calls `clay.setMode()` and carries `clay-mode-toggle`. Without either, ClayJS shows a one-time note pointing to Cmd+Shift+E (Ctrl+Shift+E elsewhere).
5. The fallback rule `html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }` is in the stylesheet, and every edit-only control has `show-when:editmode="true"`.
6. Records are authored in the saved form (`inert-contenteditable`, `disabled`, `readonly`); templates in the active form.
7. Every repeated record has a unique `data-id`; templates carry none; every create and duplicate mints a fresh one.
8. Every control whose value matters has `persist`; no filter or search box does.
9. All chrome is cloned from a `<template>` into `clay="editor-ui"` after `clay.ready`; nothing in the file is chrome.
10. Tab-local state is in the hash, `clay.storage.local` or `clay.storage.session`, or memory, painted through a runtime style; opening, filtering and searching leave `clay.hasUnsavedChanges()` false.
11. Derived values are sapjs paints, in `editor-ui`, or `no-dirty` when the file must show them; every hand-written derived write is guarded, and no script copies a record into a second attribute.
12. Commands are wrapped in `clay.undo.commit`; derived views are drawn in `clay.effect`, with no effect warnings in the console.
13. Views whose record a peer deleted are closed, in the effect or a `clay:sync-applied` handler.
14. The app script starts with `clay.start`; all listeners are delegated.
15. Nothing writes the record at boot.
16. Edit-only calls are guarded for view mode, and edit actions check `clay.isEditMode`.
17. `clay.confirm` calls have a rejection handler.
18. Save failures are visible (indicator, `savestatus` CSS or clay-ui).
19. Library residue (Sortable, third-party editors) is stripped in a snapshot hook.
20. Images use `clay.upload`, embedding only on `unsupported`.
21. The file opens in view mode with JavaScript disabled and shows correct content and no edit controls.
22. With sap: `Sap.status().ok`, the live root matches the file after load (no computed value rewritten), no `[sap-error]`, rows with your own ids.
23. A tool page whose script opens an editor at load (a journal, a notes pad) declares `<html opens-in="edit">`. Without it the page opens in view, accepts typing and saves none of it.

### 13.2 Testing a document that changes modes

Each check names the clayjs test that proves the library side.

- **It opens in view by default.** `tests/unit/mode-decision.test.js` pins the table, including an owner cookie alone opening in view with permission kept.
- **An explicit edit enters edit.** The same file covers `?editmode=true`, `window.clayEditMode = true` and `<html opens-in="edit">`, and `tests/unit/mode-transition.test.js` covers an explicit initial edit preparing the session a live first entry does.
- **A draft document stays a draft.** `tests/unit/mode-draft.test.js` shows a declared draft refusing both directions.
- **A refused exit can be retried.** `tests/unit/mode-lifecycle.test.js` covers a quiesce that refuses and resumes the same leases, and `tests/unit/mode-transition.test.js` covers the next entry starting a fresh session.
- **Pending work refuses the exit.** `tests/unit/mode-transition.test.js` covers a registered pending source, and `tests/unit/mode-save-barrier.test.js` covers the barrier's codes.
- **A clean enter and exit writes nothing.** `tests/unit/mode-transition.test.js` asserts it, and the corpus case `enter-leave-zero-writes` records the same run.

`tests/mode-counterexamples/` is a set of recorded cases. Each one boots a fixture in jsdom through the real loader, applies a schedule with the transport, the chunk imports and the clock supplied by the harness, and judges the result from what the run left behind. It is not a browser run: no phone, no keyboard and no real network appears in it.

### 13.3 Trap index

| Trap | Section |
|---|---|
| CSS keyed on `editmode="false"` shows edit chrome before boot | [The root attributes](https://clayjs.com/docs/guide/edit-mode/#the-root-attributes) |
| A never-saved file shows `show-when:editmode` controls to viewers without the fallback rule | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options) |
| `show-when` matches any ancestor, not the nearest | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options) |
| A view attribute on a saved element syncs to every collaborator | [Showing and hiding edit controls: clay-options](https://clayjs.com/docs/guide/edit-mode/#showing-and-hiding-edit-controls-clay-options), [Per-tab state](https://clayjs.com/docs/guide/architecture/#per-tab-state) |
| Records authored with live `contenteditable` stay editable for viewers until the first save | [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers) |
| Templates in the inert form give clones that cannot be edited until reload | [Mode attributes: one file for editors and viewers](https://clayjs.com/docs/guide/edit-mode/#mode-attributes-one-file-for-editors-and-viewers) |
| Unguarded edit-only API calls throw in view mode | [What works in view mode](https://clayjs.com/docs/guide/edit-mode/#what-works-in-view-mode) |
| A page whose script opens an editor at load accepts typing in view mode and saves nothing | [How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided) |
| Reading `clay.mode` once at boot and keeping it | [How the mode is decided](https://clayjs.com/docs/guide/edit-mode/#how-the-mode-is-decided) |
| Using `clay.canEdit` as the guard for writing; use `clay.modeLifecycle.canWrite()` | [Switching without a reload: clay-mode-switch="live"](https://clayjs.com/docs/guide/edit-mode/#switching-without-a-reload-clay-mode-switch-live) |
| Switching modes by writing the root `editmode` attribute | [Switching modes: clay.setMode](https://clayjs.com/docs/guide/edit-mode/#switching-modes-clay-setmode) |
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
| Items without ids added in two tabs: one is dropped | [Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id), [What a merge does](https://clayjs.com/docs/guide/live-sync/#what-a-merge-does) |
| Cloned records share a `data-id`, which counts as no id | [Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id) |
| `crypto.randomUUID` is missing outside secure contexts | [Element identity: `data-id` and `id`](https://clayjs.com/docs/guide/record/#element-identity-data-id-and-id) |
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
| Two tabs changing one shared `data-*` attribute (labels, a counter) conflict unless a container declares `merge-tokens` or `merge-max` | [Declared attribute merges](https://clayjs.com/docs/guide/live-sync/#declared-attribute-merges) |
| Rewriting the record at boot makes incoming frames hold | [Focus, typing and long-running editors](https://clayjs.com/docs/guide/live-sync/#focus-typing-and-long-running-editors) |
| Parsed JSON goes stale after a merge | [Reconciling in app code](https://clayjs.com/docs/guide/live-sync/#reconciling-in-app-code) |
| A script that copies a record into a styling attribute goes stale in the file, and a merge brings the stale copy back | [Rules for DOM state](https://clayjs.com/docs/guide/model/#rules-for-dom-state), [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| An `api` rule that reads a painted value can read a stale one until a tab repaints and saves | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| Full sapjs markup under the sapjs core halts with `E50` | [sap.js: records, views and totals in markup](https://clayjs.com/docs/guide/components/#sap-js-records-views-and-totals-in-markup) |
| Presence is runtime only: the host filters the roster, and a caret it cannot place is not drawn | [Presence](https://clayjs.com/docs/guide/live-sync/#presence) |
| `data-richclay` card mode deletes images on load | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| The richclay toolbar is unusable inside `showModal()` and popovers | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Rich text has its own undo; page undo never records it | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable), [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| Squire undo can roll back a peer's edit in the same region | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Global `registerButton` after load does not reach mounted editors | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Screenshot paste does nothing without a `pasteImage` listener | [richclay: rich text (`editable`)](https://clayjs.com/docs/guide/components/#richclay-rich-text-editable) |
| Sortable handle mode is fixed at bind time | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder) |
| `onsorting` cannot veto a move | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder) |
| Sortable residue saves | [sortable: drag to reorder](https://clayjs.com/docs/guide/components/#sortable-drag-to-reorder), [Hooks](https://clayjs.com/docs/guide/saving/#hooks) |
| A plain input's typed value is not content until `persist` or a command writes it, so page undo has nothing to replay for it | [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
| A refused undo or redo stays on top of the stack until it is replayed or discarded | [undo: whole-page undo](https://clayjs.com/docs/guide/components/#undo-whole-page-undo) |
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
| CMS `cms-template` with `hidden` makes every new item invisible | [cms: content-managed pages](https://clayjs.com/docs/guide/components/#cms-content-managed-pages) |
| Records stored twice drift | [The record container](https://clayjs.com/docs/guide/architecture/#the-record-container) |
| `applyData` pairs rows by content and order, not by id | [Import and export](https://clayjs.com/docs/guide/architecture/#import-and-export) |
| Activity logged from a mutation observer also logs peers and undo | [Commands](https://clayjs.com/docs/guide/architecture/#commands) |
| Saves slow down past about 1,000 records and stall past 3,000 | [Document size and record limits](https://clayjs.com/docs/guide/architecture/#document-size-and-record-limits) |
| Updating a runtime style tag without `no-dirty` can raise the leave warning | [Styles a script writes](https://clayjs.com/docs/guide/architecture/#styles-a-script-writes) |
| A version restore on hyperclay.com does not reach open editors | [What each host gives](https://clayjs.com/docs/guide/hosts/#what-each-host-gives) |
| Hidden is not private | [Privacy](https://clayjs.com/docs/guide/hosts/#privacy) |
| Typed values vanish from a visitor's draft: the control has no `persist` | [The contract](https://clayjs.com/docs/guide/free-documents/#the-contract) |
