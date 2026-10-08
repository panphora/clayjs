# Building malleable HTML files with ClayJS

This is the complete reference for building malleable HTML files with ClayJS: one HTML file that is the whole app, edits itself in place, saves itself back to its host, and merges edits from other tabs, other people and agents. Read it top to bottom once. After that, sections 2 (the skeleton), 9 (architecture) and 13 (checklist and trap index) are the parts to return to.

It is written for a developer or an LLM building full apps with inline editing and inline controls: kanban boards with card detail, block writers, finance trackers, CRMs, flashcards, trackers. It covers the CMS plugin only in passing (section 8.12), because an app whose product is editing should not route editing through a form sidebar.

Every behavior stated here was read from ClayJS 1.8.2 source or executed. The four example files below are complete, tested apps that this guide quotes. A [test suite](https://github.com/panphora/clayjs/tree/main/tests/unit/guide-examples) boots each one in jsdom with the real loader and checks what it saves, how it merges a peer's edit, and what a viewer receives. Open any of them and view source, or download one and open it in HTML Clay to edit it:

| File | What it shows |
|---|---|
| [`examples/skeleton.html`](https://clayjs.com/examples/skeleton.html) | The smallest correct app: a sortable reading list with persisted checkboxes, a derived summary, a tab-local filter, sync and undo. Start every new file from it. |
| [`examples/kanban.html`](https://clayjs.com/examples/kanban.html) | Columns and cards with cross-column drag, a card detail view that is the card itself, checklists, an activity log, a filter, undo. |
| [`examples/writer.html`](https://clayjs.com/examples/writer.html) | A block document: rich text blocks, headings, callouts, to-do blocks, dividers, images with upload, a gutter with drag handle and block menu, a slash menu, an outline and a word count. |
| [`examples/finance.html`](https://clayjs.com/examples/finance.html) | A budget built on sap.js: categories with budgets, transactions, computed totals saved into the file, search, CSV import and export. |

Code in this guide assumes the loader URL `https://clayjs.com/v1/`. Section 3 covers versions. This guide is also served as plain Markdown at [clayjs.com/guide.md](https://clayjs.com/guide.md) for agents, and its ideas are drawn as diagrams in the [visual guide](https://clayjs.com/visual-guide).

---

## 1. The model

### 1.1 Two forms of one file

A malleable HTML file exists in two forms.

- **The saved file** is the bytes on the host. A visitor downloads exactly these bytes. They must be correct and complete with no JavaScript running: the content, its order, the state of every checkbox, the totals if the reader needs them.
- **The open page** is the live DOM in one browser tab. It holds the saved content plus everything the tab adds at runtime: editing toolbars, a filter box, an open dialog, selection, computed badges, drag ghosts.

A save turns the open page back into the saved file. ClayJS does this by cloning the whole document, removing everything marked as runtime-only, applying a few transforms, serializing, and posting the full HTML to the host (`POST /_/save`). There is no partial save and no separate data store. **The document is the database.**

### 1.2 Three kinds of DOM

Every element on an open page belongs to one of three kinds. Decide which before you write it.

| Kind | What it is | Where it lives | Saved | Sent to peers | Edited by people |
|---|---|---|---|---|---|
| **Record** | The work: card titles, checklist items, amounts, block text, order | Ordinary elements, attributes, text and `persist` control values | yes | yes | yes |
| **Chrome** | Runtime UI: toolbars, menus, filter boxes, gutters, status text, the style that paints the open card | Elements created at load inside `clay="editor-ui"` | no | no | no |
| **Derived** | Values computed from the record: counts, progress, totals, outlines | `clay="editor-ui"` (tab only) or `clay="no-dirty"` (saved, remote wins) | only if `no-dirty` | only if `no-dirty` | no |

Nearly every bug in a malleable file is one of these three leaking into another: chrome saved into the file, a derived count merged as if someone typed it, a record edited only in a copy that never reaches the DOM.

### 1.3 The rules

1. **The DOM is the record.** Everything durable is an element, an attribute, text, child order, or the value of a control marked `persist`. Never keep the authoritative copy in a JavaScript object.
2. **Chrome is built at runtime inside `clay="editor-ui"`.** It never reaches the file, a peer or undo history. Keep its blueprint in a `<template>` and clone it after `clay.ready`.
3. **Derived values are recomputed, never stored as edits.** Write them into `editor-ui` elements, or into `clay="no-dirty"` elements when the saved file must show them.
4. **Every repeated item has a unique `data-id` from birth.** Mint a fresh one on every create and every duplicate. Sync pairs elements by it.
5. **Per-tab state stays out of the record.** Which card is open, the filter, the current view: URL hash, `localStorage` or memory, painted through a runtime `<style>` or `editor-ui` elements.
6. **A command writes the record once, in one place,** wrapped in an undo commit. The mutation is what autosave, undo and sync see.
7. **Adopt the file as it is on load.** Never rewrite the record at boot: it makes the page dirty, it can fall outside the save baseline, and it races peers.
8. **Reconcile after changes you did not make.** A peer's frame, an agent's disk edit and an undo replay change the DOM under you. Rebuild derived and chrome state on `clay:sync-applied` and on undo and redo.

### 1.4 What the host does

ClayJS runs in the page. A **host** serves the file and accepts saves. The client never decides who may write: it sends the save, and the host accepts or refuses it. Hosts that run ClayJS pages today:

- **HTML Clay**, the desktop app that makes `.htmlclay` files open and save like documents. Single user, local disk.
- **Hyperclay Local**, the desktop sync client. Local folder, device sync to hyperclay.com.
- **hyperclay.com**, hosted files with accounts, teams, share links, presence and version history.
- **Any server** that implements `POST /_/save` (and optionally `/_/meta`, `/_/sync`, `/_/upload`). A plain static server or a file opened from disk can view the file but not save it.

Section 12 covers what each host adds.

---

## 2. The skeleton file

Start every app from [`examples/skeleton.html`](https://clayjs.com/examples/skeleton.html). It is short enough to read in full, and every later section refers back to its parts. It is a reading list: sortable rows, a checkbox and a title per row, an Add button, a summary line and a filter.

```html
<!DOCTYPE html>
<html lang="en" autosave>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reading list</title>
<style>
  html:not([editmode="true"]) [show-when\:editmode="true"] { display: none }
  /* app styles */
</style>
</head>
<body>
<main id="app">
  <h1 editmode:contenteditable inert-contenteditable="plaintext-only">Reading list</h1>
  <ul id="items" sortable="items">
    <li data-id="r-mmm"><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled disabled checked> <span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">The Mythical Man-Month</span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
    <li data-id="r-sicp"><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled disabled> <span class="title" editmode:contenteditable inert-contenteditable="plaintext-only">Structure and Interpretation of Computer Programs</span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
  </ul>
  <button type="button" data-action="add" show-when:editmode="true">+ Add book</button>
</main>

<template id="item-tpl">
  <li><span class="grip" sortable-handle show-when:editmode="true" aria-label="Drag">⠿</span><input type="checkbox" persist viewmode:disabled> <span class="title" editmode:contenteditable contenteditable="plaintext-only"></span><button type="button" data-action="remove" show-when:editmode="true" aria-label="Remove">×</button></li>
</template>

<template id="chrome-tpl">
  <p id="summary"></p>
  <input type="search" id="filter" placeholder="Filter" aria-label="Filter">
  <style id="view-state"></style>
</template>

<script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
<script src="https://clayjs.com/v1/clay-options.js"></script>
<script src="https://clayjs.com/v1/clay-ui.js"></script>
<script>
clay.ready.then(() => {
  if (window.__appStarted) return;
  window.__appStarted = true;

  const items = document.getElementById("items");
  const newId = (prefix) => prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const command = (label, fn) => (clay.undo ? clay.undo.commit(label, fn) : fn());

  clay.onSnapshot?.((root) => {
    for (const el of root.querySelectorAll(".sortable-chosen, .sortable-ghost, .sortable-drag")) {
      el.classList.remove("sortable-chosen", "sortable-ghost", "sortable-drag");
      if (!el.classList.length) el.removeAttribute("class");
    }
    for (const el of root.querySelectorAll('[draggable="false"]')) el.removeAttribute("draggable");
    for (const el of root.querySelectorAll('[style=""]')) el.removeAttribute("style");
  });
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

  function render() {
    const rows = [...items.querySelectorAll(":scope > li")];
    const done = rows.filter((li) => li.querySelector("input").hasAttribute("checked")).length;
    setText(chrome.querySelector("#summary"), `${done} of ${rows.length} read`);
    const q = filter.value.trim().toLowerCase();
    const hidden = q ? rows.filter((li) => !li.textContent.toLowerCase().includes(q)) : [];
    setText(chrome.querySelector("#view-state"), hidden.map((li) => `#items > [data-id="${CSS.escape(li.dataset.id)}"]{display:none}`).join("\n"));
  }

  function syncCheckboxes() {
    for (const box of items.querySelectorAll("input[type=checkbox]")) box.checked = box.hasAttribute("checked");
  }

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

  document.addEventListener("clay:sync-applied", () => { syncCheckboxes(); render(); });
  clay.undo?.on("undo", syncCheckboxes);
  clay.undo?.on("redo", syncCheckboxes);
  window.addEventListener("hashchange", () => { filter.value = new URLSearchParams(location.hash.slice(1)).get("q") || ""; render(); });
  new MutationObserver(render).observe(items, { subtree: true, childList: true, attributes: true, characterData: true });
  render();
});
</script>
</body>
</html>
```

What each part does, and the section that explains it:

- **`<html autosave>`** turns on autosave for edit mode. Autosave is decided at boot (6.2).
- **The fallback CSS rule** hides `show-when:editmode="true"` controls before ClayJS runs. Without it a viewer of a never-saved file sees the edit buttons for a moment, or for good with JavaScript off (4.3).
- **The record** is `<main id="app">`. Each row has a `data-id`, its text is `editmode:contenteditable`, and its checkbox is `persist viewmode:disabled`. The file is written in its **saved form** (`inert-contenteditable`, `disabled`), so a viewer gets inert text from the very first open (4.4).
- **The templates** are blueprints. `item-tpl` holds a new row in its **active form** (`contenteditable="plaintext-only"`, no `disabled`), because a clone is inserted while the owner is editing and the mode transform never touches template content (4.4).
- **`chrome-tpl`** is cloned once into a `clay="editor-ui"` wrapper. The summary, the filter and the `#view-state` style live there, so none of them is saved, synced or undone (5.2, 9.3).
- **The script tags**: core with `sync,sortable,undo,indicator`, `exclude=richclay` because this app has no rich text, then the `clay-options` and `clay-ui` satellites (3).
- **The boot guard** `window.__appStarted` stops a second run if a live-sync merge re-inserts the script (9.10).
- **`newId`** makes ids from a timestamp and random suffix. `crypto.randomUUID` exists only in secure contexts, so it fails on a file served over plain http from another machine (5.5).
- **`command`** wraps every record write in an undo step when the undo plugin is loaded (8.3).
- **The `onSnapshot` hook** strips Sortable's drag residue (`draggable="false"`, empty `style`, drag classes) from every snapshot, so a drag never writes it into the file (6.6).
- **`render`** derives the summary and the filter style from the record. It writes only when text changes, because writing the same text is still a mutation (9.4).
- **`syncCheckboxes`** puts each checkbox's displayed state back in step with its `checked` attribute after undo, redo or a merge, which change the attribute but not the property (8.3).
- **The `MutationObserver`** re-renders on any record change: local typing, drag, merge or undo. It observes only the record, so the chrome's own writes do not feed back.

The test suite checks this file opens without becoming dirty, saves the record and no chrome, keeps the filter out of the file, keeps undo and the screen in step, mints unique ids, merges a peer's edit beside an unsaved local edit, and gives a viewer inert text and disabled checkboxes.

---

## 3. Loading

### 3.1 The loader tag

```html
<script src="https://clayjs.com/v1/clay.js?plugins=sync,sortable,undo,indicator&exclude=richclay"></script>
```

- It must be a **classic script** with a `src`. The loader finds its own URL through `document.currentScript` to locate its modules. As `type="module"` or pasted inline it logs an error and never boots.
- **`/v1/`** is the rolling 1.x alias, cached for 10 minutes: files get fixes automatically. **`/1.8.2/`** and every exact version are immutable for a year: use one when a file must never change behavior.
- **Every tag on the page uses the same prefix.** Satellites import ClayJS modules relative to their own URL. `clay.js` from `/1.8.2/` with `clay-ui.js` from `/v1/` gives two copies of shared modules: transforms registered through one are invisible to the other, and save feedback appears twice.
- npm and jsDelivr package paths work too (`@panphora/clayjs`).
- Put the tags at the end of `<body>`. The loader waits for DOMContentLoaded anyway.

`plugins=` and `exclude=` are comma lists. Only the first of each parameter counts. Unknown names warn and are ignored.

### 3.2 Plugins

| Plugin | Default | Loads in view mode | Adds |
|---|---|---|---|
| `richclay` | on | no | the `editable` attribute, `clay.RichClay` |
| `source` | on | no | byte-preserving saves, `clay.source` |
| `sync` | off | yes | live sync, `clay.conflicts`, `clay.morph`, the section notice and presence |
| `sortable` | off | no | the `sortable` attribute, `window.Sortable`, `clay:sorted` |
| `undo` | off | no | `clay.undo` (whole-page undo, takes Cmd+Z for the window) |
| `indicator` | off | no | the save status chip |
| `upload` | off | no | `clay.upload` |
| `quickcrop` | off | yes | `clay.quickcrop` |
| `cms` | off | yes | `clay.cms`; implies `quickcrop` and `upload` |
| `wire` | off | yes | `clay.wire`, the channel to a local agent process |
| `ai-edit` | off | no | select text, ask an agent to rewrite it; implies `wire` |
| `demo` | off | yes | fakes saving into `localStorage` for public demos |

- Edit-only plugins never load in view mode, even when named. Their members are absent there: test `clay.isEditMode` or `'save' in clay`, never the presence of `clay.RichClay` alone.
- `exclude` wins over implications. `exclude=wire` also drops `ai-edit`.
- Load order is fixed regardless of how you list them.
- `exclude=richclay` when the app has no rich text. `exclude=source` saves one request and about 48 KB, at the cost of saves reprinting the whole document instead of keeping hand formatting.
- Nothing implies `undo`, on purpose: it intercepts Cmd+Z in every text field on the page (8.3).

**A good default for apps:** `?plugins=sync,sortable,undo,indicator`, plus `upload` for images or attachments, plus `exclude=richclay` when there is no rich text.

### 3.3 Satellites

Satellites are separate classic script tags. Each publishes a promise on `clay.loaded`.

| Tag | Promise | Adds | Section |
|---|---|---|---|
| `clay-ui.js` | `clay.loaded.ui` | `clay.toast`, `toastPersistent`, `ask`, `confirm`, `tell`, `snippet`, `modal`; automatic save feedback toasts | 8.6 |
| `clay-options.js` | `clay.loaded.options` | `show-when:`, `hide-when:`, `option:`, `option-not:` visibility | 4.3 |
| `clay-events.js` | `clay.loaded.events` | `onclickaway`, `onclickchildren`, `onclone`, `onmutation`, `onglobalmutation`, `onrender` | 8.7 |
| `clay-dom.js` | `clay.loaded.dom` | `el.nearest`, `el.val`, `el.text`, `el.exec`, `cycleAttr`, `clay.dom.createContentView` | 8.7 |
| `all.js` | `clay.loaded.all` | `All(selector)` collection helper | 8.7 |
| `clay-utils.js` | `clay.loaded.utils` | `clay.utils.debounce`, `throttle`, `cookie.get/remove`, `slugify`, `copyToClipboard` | |
| `clay-internals.js` | `clay.loaded.internals` | `clay.internals`: capture, transforms, raw save | |
| `clay-data.js` | `clay.loaded.data` | `clay.extractData`, `clay.applyData` | 9.9 |
| `sap.js` | `clay.loaded.sap` | `Sap`, the reactive attribute layer | 8.11 |

Satellites do not wait for `clay.ready` and work without `clay.js` at all, including in view mode and on a static host. Await the promise before using what it adds: `await clay.loaded.ui` before `clay.toast` in code that runs early. Code inside a `clay.ready` callback can usually use `clay.toast?.(...)` safely, since the satellites finish loading at about the same time, but the optional call costs nothing.

`clay.standalone.js` bundles the loader, every plugin and every satellite into one 2 MB file for offline use. `plugins=` still decides what runs. With it, remove the satellite tags and always `await clay.loaded.sap` or `.data` before use.

### 3.4 `clay.ready`

`clay.ready` is a promise that resolves with `window.clay` once boot is done and every plugin has loaded. `clay:ready` fires on `document` at the same moment. Before it resolves, members like `clay.save` and `clay.undo` do not exist. Start app code with `clay.ready.then(...)`.

You can set configuration before the tag, and the loader merges into it: `window.clay = { saveToast: true }`.

---

## 4. Edit mode and view mode

### 4.1 How the mode is decided

`clay.isEditMode` is decided once at load, by the first of these that applies:

1. `?editmode=true` or `?editmode=false` in the URL. Only the literal `true` means edit.
2. `<html viewonly>` in the file means view. So does a response carrying only the pre-1.9.0 token `htmlclaytoken` (an out-of-date HTML Clay, which also shows an update bar).
3. `window.clayEditMode`, set by a script before boot.
4. A `savetoken` attribute the host put on `<html>` (HTML Clay 1.9.0 and newer).
5. The `isAdminOfCurrentResource` cookie (hyperclay.com, Hyperclay Local).

Edit mode only asks for the editing UI. On a host that has not authorized this person every save is refused (`savestatus="error"`). The host decides who writes.

`clay.isOwner` reflects the cookie alone. On HTML Clay an editable page has `isOwner === false`. Use `clay.isEditMode` for "can edit", never `isOwner`.

`clay.toggleEditMode()` flips `?editmode=` and reloads.

### 4.2 The root attributes

At load ClayJS sets `editmode="true|false"` and `pageowner="true|false"` on `<html>`, in both modes. In edit mode it also sets `savestatus` (`saving`, `saved`, `error`, `offline`, `conflict`) once the page has settled. **All three are removed from every save,** as are the host's `savetoken` and `documentetag`. The saved file's `<html>` carries none of them.

Consequence: before ClayJS runs, `editmode` is **absent**, not `"false"`. CSS keyed on `html[editmode="false"]` shows edit chrome to visitors until boot. Key on `html:not([editmode="true"])` instead.

### 4.3 Showing and hiding edit controls: clay-options

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
- It compares literal strings only. Expressions belong to sap's `show=` (8.11).
- `show-when:savestatus="error|offline"` shows a "not saved" warning. `show-when:pageowner="true"` shows owner links.
- For content only viewers should see, use `hide-when:editmode="true"`: it is visible when `editmode` is absent. `show-when:editmode="false"` is hidden until boot and then appears.
- The attribute you switch views with is ordinary saved content. Setting `view="list"` on a saved element saves it and syncs it to every collaborator. Section 9.3 covers tab-local views.

### 4.4 Mode attributes: one file for editors and viewers

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

`contenteditable="plaintext-only"` is the right value for titles, labels and cells: no formatting, no pasted markup. Make Enter blur instead of inserting a line break, as in the skeleton's keydown handler. Use `editable` (8.1) only where rich text is the point.

### 4.5 What a viewer gets

In view mode `window.clay` keeps `ready`, `isEditMode`, `isOwner`, `toggleEditMode`, `Mutation`, `region`, `readData`, `writeData` and `hasUnsavedChanges` (always `false`), plus whatever view-mode plugins and satellites add (`clay.conflicts` and `clay.morph` with `sync`, `clay.cms`, `clay.quickcrop`, `clay.toast` and the rest). There is no `save`, `getHTML`, `addDocumentTransform`, `onSnapshot`, `undo`, `RichClay`, `upload`, and no `markDirty` unless `sync` is loaded (it is harmless there).

- Call edit-only APIs as optional calls (`clay.addDocumentTransform?.(fn)`), or return early with `if (!clay.isEditMode) return`. An unguarded call throws and kills the rest of the script for viewers.
- Click handlers run for viewers too. Hidden buttons cannot be clicked, but guard edit actions anyway, as the examples do with `if (!clay.isEditMode) return`.
- A viewer can still use read-only interactions: open a card, filter, search, export, scroll the outline. Those are chrome and tab-local state, so they work the same in both modes.
- With `sync` loaded a viewer rides the saved lane and receives each accepted save, so a published page updates live (7.1).
- A click inside `[trigger-save]` in view mode dispatches `clay:view-save-attempt`, so you can explain why nothing saved.

---

## 5. The record

### 5.1 What a save writes

A save writes the current document with these changes:

- Subtrees marked `no-save`, `no-snapshot` or `editor-ui` are removed.
- `freeze` subtrees are written with the inner HTML they had at load.
- Mode attributes go inert (4.4). Root attributes `editmode`, `pageowner`, `savestatus`, `savetoken`, `documentetag` are removed.
- `persist` controls write their live values (5.3).
- Runtime residue of ClayJS's own editors (richclay attributes, toolbars) and of browser extensions (password managers, Grammarly, Dark Reader) is stripped.
- Your hooks run (6.6).

Everything else on the page is written as it is. That includes things builders forget:

- Classes and attributes toggled for UI: `.selected`, `aria-expanded`, `<details open>`, `<dialog open>` (set by `showModal()`), `hidden`.
- Inline styles from libraries and helpers: Sortable's `draggable="false"` and `style=""`, `el.hide()`, `All(...).css()`, `body.style.overflow = "hidden"` from an open modal or crop dialog.
- Any element a script inserted outside an excluded region.

Never saved: JavaScript objects, `localStorage`, canvas pixels, scroll position, focus, selection, shadow DOM content (only the host element's light DOM and attributes), iframe content, the live value of a control without `persist`, and password, hidden and file input values even with `persist`.

### 5.2 Regions: the `clay` attribute

`clay="token token"` on an element applies to it and all its descendants. The bare attribute form (`<div no-save>`) means the same.

| Token | Saved file | Sent to peers | Starts autosave | Counts as unsaved | In undo | Use for |
|---|---|---|---|---|---|---|
| (none) | current | yes | yes | yes | yes | the record |
| `editor-ui` | removed | no | no | no | no | **all runtime chrome and tab-only derived values** |
| `no-save` | removed | carried in the bytes, never applied | no | no | yes | rarely; prefer `editor-ui` |
| `no-snapshot` | removed | no (each tab keeps its own) | no | no | yes | part of `editor-ui` |
| `freeze` | inner HTML as at load | no | no | no | yes | an authored mount whose runtime content must never save |
| `no-dirty` | current | yes, **remote wins** | no | no | yes | derived values the saved file must show (9.4) |
| `no-trigger-autosave` | current | yes | no | **yes** | yes | a heavy editor whose saves you batch yourself (6.3) |
| `no-watch` | current | yes, remote wins | no | no | no | rarely: high-frequency content that is disposable |
| `no-undo` | current | yes | yes | yes | no | content with its own undo (richclay sets it at runtime) |
| `no-data` | current | yes | yes | yes | yes | content the data API and `extractData` must skip |

`editor-ui` bundles `no-data no-save no-snapshot no-watch no-undo`. **Use `editor-ui` for chrome, not `no-save`.** A `no-save` element is still inside the snapshot live sync sends to peers. Peers never apply it, but its text travels to every edit-mode tab (viewers receive the saved file, without it), and `no-save` alone still records undo steps. Older docs advised `clay="no-save no-watch"` for chrome; `editor-ui` replaces that.

Legacy spellings still work: `save-remove` is `no-save no-undo`, `save-ignore` is `no-dirty no-undo`, `save-freeze` is `freeze no-undo`, `mutations-ignore` is `no-watch`, `snapshot-remove` is `no-snapshot`.

Traps in this table:

- **An edit inside `no-watch` or `no-dirty` is invisible to `clay.save()` and the close warning.** `save()` answers "No changes to save" and closing the tab loses it silently. It is saved only when some other change triggers a save, or by `clay.save.force()`. Never put typed work there.
- **A runtime change inside `freeze` is never saved,** not even by `clay.save.force()`: every save restores the inner HTML captured at load.
- **`freeze` freezes inner HTML only.** The freeze element's own attributes stay live and are saved.
- **Rendering into a `freeze` mount before `clay.ready` freezes the rendered output**, because the capture happens at boot. Render after `clay.ready`.
- An `editor-ui` root disappears from the saved file, so it cannot be authored in the file. Create it at runtime from a `<template>`, every load. That includes elements inside the `<template>`: mark the blueprint `editor-ui` and the first save empties the template, so the next load has no chrome to clone. Leave the blueprint unmarked and set `clay="editor-ui"` on each clone as you insert it.
- Mark a region by setting the attribute on creation, or with `clay.region.addRegionToken(el, "editor-ui")`.

### 5.3 `persist`: form controls

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
- Do not persist a filter or search box. Those are tab-local: put them in chrome (9.3).

**After undo, redo or a merge, the screen can disagree with the file.** Undo and sync restore the attribute, but the browser's checkbox and input display follow the property once the user has touched the control. Re-sync the property from the attribute on all three events, as the skeleton and kanban do for checkboxes:

```js
function syncCheckboxes() {
  for (const box of root.querySelectorAll("input[type=checkbox][persist]")) box.checked = box.hasAttribute("checked");
}
document.addEventListener("clay:sync-applied", syncCheckboxes);
clay.undo?.on("undo", syncCheckboxes);
clay.undo?.on("redo", syncCheckboxes);
```

Text and number inputs need the same for `value`, and it matters more there: a save copies the live value into the file, so after an undo that left the old number on screen, the next save writes the undone value back. The finance tracker re-syncs every persisted input, skipping the focused one after a merge (7.4), then refreshes sap:

```js
function syncControls({ keepFocused = false } = {}) {
  for (const input of app.querySelectorAll("input[persist]")) {
    if (keepFocused && input === document.activeElement) continue;
    const value = input.getAttribute("value") ?? "";
    if (input.value !== value) input.value = value;
  }
  Sap.refresh();
}
clay.undo?.on("undo", () => syncControls());
clay.undo?.on("redo", () => syncControls());
document.addEventListener("clay:sync-applied", () => syncControls({ keepFocused: true }));
```

### 5.4 Where to keep data that is not visible text

In order of preference:

1. **Attributes on the element they describe.** `<li class="card" data-id="c-7f3a" data-due="2026-11-02" data-points="3">`. Saved, merged per attribute, readable by agents, moves with the element. The default.
2. **Hidden elements inside the record.** `<ul hidden class="archive">`, the card detail inside the card (9.5). Same properties, good for archived items and detail fields.
3. **A JSON script with `merge`.** For data that markup expresses badly (formula grids, chart series, settings objects):

   ```html
   <script type="application/json" id="model" merge="store">{"series":[{"id":"s1","points":[3,5,8]}]}</script>
   ```

   ```js
   function writeModel(model) {
     document.getElementById("model").textContent = JSON.stringify(model).replace(/</g, "\\u003c");
   }
   ```

   Always escape `<`: a value containing `</script>` ends the element early and corrupts the file on reload. Re-parse on every `clay:sync-applied`, because a merge changes the text, not your parsed object. Same-key edits from two writers resolve silently to the incoming one (7.3).
4. **`<template>` content: never for mutable data.** It is saved, but edits there never trigger autosave.

### 5.5 Identity

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

- **Templates carry no `data-id`.** The command that clones a template assigns one.
- **Never stamp ids on open.** Opening an old file must not rewrite it. Add an id when an item is created or first changed.
- **Make ids without `crypto.randomUUID`** unless the file is only ever served over https or localhost: it is missing in insecure contexts. The examples use `prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`.
- Ids are also how commands find records: `board.querySelector(\`.card[data-id="${CSS.escape(id)}"]\`)`. Never find a record by position.

### 5.6 Assets

An image's durable form is its `src`. Upload the file and write the returned URL (8.5). Where the host cannot store files, embed a `data:` URL, which works anywhere but makes every save carry the bytes. Keep embedded images small. On HTML Clay and Hyperclay Local uploads land beside the file in `assets-<name>/`; moving the HTML alone breaks them.

---

## 6. Saving

### 6.1 Edit mode and the save path

In edit mode ClayJS saves the whole document to `POST /_/save` on the page's origin (or `/_/save/<savetoken>` on HTML Clay). Cmd+S (Ctrl+S elsewhere) and a click inside any `[trigger-save]` element call `clay.save()` on every edit-mode page, with or without autosave. A close warning appears whenever there are unsaved changes.

### 6.2 Autosave

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

### 6.3 Manual-save pages and batching

For a long-form writer where each autosave is unwelcome, omit `autosave`. Cmd+S, `[trigger-save]` and the close warning still work. Save when the tab hides:

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && clay.isEditMode && clay.hasUnsavedChanges()) {
    clay.save.flush({ keepalive: true }).catch(() => {});
  }
});
```

A collaborative page should keep autosave on: peers see an edit only after it saves (7.1).

To batch saves inside an autosaving page, wrap the heavy region in `clay="no-trigger-autosave"`: edits there still count as unsaved and still warn on close, but never start a save. Your own `clay.save()` (on blur, or every 30 s) writes them, and so does any save another edit triggers.

`clay.Mutation.pause()` and `resume()` hide DOM mutations from the mutation hub's listeners (autosave's mutation trigger among them) for the duration, but the next save still writes them. They do not pause input: `input` and `change` events on controls, including synthetic ones, still mark the page dirty and start autosave. Pair them in `try/finally`; an unbalanced pause silences mutation-driven autosave for the rest of the session.

### 6.4 The save API

`clay.save()` returns `Promise<{ ok, msg, msgType, code, etag }>` and never rejects. One exception to that shape in 1.8.2: when capturing the page fails (a registered hook threw, 6.6) the result has no `ok` field at all, only `msgType: "error"`.

| Result | Meaning |
|---|---|
| `ok: true`, `msgType: "success"` (or `"warning"`) | the host accepted these bytes |
| `ok: false`, `msgType: "skipped"`, `msg: "No changes to save"` | nothing in the dirty domain changed |
| `ok: false`, `msgType: "skipped"`, `msg: "Save already in progress"` | a save is in flight; these bytes are queued and sent after it |
| `ok: false`, `msgType: "conflict"` | HTTP 412: the file changed elsewhere (6.5); also carries `changedBy`, `afterTimeout`, `conflictEtag` |
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

### 6.5 Conflicts on save (412)

On hosts that announce `conditional` (all three hosts in 1.4), every save carries `If-Match` with the version the tab last saw. If the file changed elsewhere and live sync has not merged that change yet, the host answers 412 and writes nothing.

- The result is `msgType: "conflict"`, `<html savestatus="conflict">` and `clay:save-conflict`. Unsaved work stays in the page. **Autosave stops** until the conflict is resolved. Cmd+S is refused again.
- ClayJS shows a built-in notice: **Keep mine** (`clay.save.overwrite()`), **Accept theirs** (press twice; reloads and drops local edits), **Download my copy** (an HTML file with your version and a list of replaced edits).
- With `sync` loaded, most 412s resolve themselves: the merge brings in the version that beat this tab, and `clay:save-conflict-resolved` fires.
- The first save after load can go out without `If-Match` on a slow host, because version discovery is not awaited. It is last-write-wins.
- If you hide the built-in notice, you must still offer overwrite and reload.

### 6.6 Hooks

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
- `onaftersave` writes to the live DOM, so anything it changes is a new edit and, with autosave, a save loop. Mark what it writes `no-save` or `freeze`.
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

### 6.7 Save status

Style from the root attribute, with no JavaScript:

```css
html[savestatus="saving"] #status::after { content: "Saving…" }
html[savestatus="error"] #status::after { content: "Not saved" }
html[savestatus="conflict"] #status::after { content: "Changed elsewhere" }
```

Put `#status` in chrome. Or load the `indicator` plugin for a ready-made chip. With `clay-ui.js` loaded, save errors and offline become persistent toasts. Without the `indicator` plugin, clay-ui also toasts "Saved" after every save; with it, set `clay.saveToast = true` to get those toasts too.

Events, all on `document`:

| Event | When | `detail` |
|---|---|---|
| `clay:ready` | boot finished | `{ clay }` |
| `clay:baseline-settled` | the load-settle baseline was taken | none |
| `clay:save-saving` | a save has been in flight 500 ms | `{ msg, msgType, timestamp }` (`msgType` is `""`) |
| `clay:save-saved` | the host accepted | `{ msg, msgType, timestamp }` |
| `clay:save-error` | refused, or a network failure while online | `{ msg, msgType, timestamp }` (`msgType` is `""` in 1.8.2; the event name is the type) |
| `clay:save-offline` | failed while the browser is offline | `{ msg, msgType, timestamp }` (`msgType` is `""`) |
| `clay:save-conflict` | 412 | adds `changedBy`, `afterTimeout`, `etag` |
| `clay:save-conflict-resolved` | sync merged the version that caused the 412 | `{ timestamp }` |
| `clay:dirty`, `clay:clean` | unsaved-work state changed | none |
| `clay:unsaved-state-changed` | a registered state called `changed()` | `{ pending }` |

`clay:dirty` means "maybe dirty": typing a letter and deleting it leaves it raised until the next check.

---

## 7. Live sync and collaboration

### 7.1 What sync is

`?plugins=sync` keeps every open copy of the file converging. It is a **save-gated, whole-document, three-way DOM merge**, not keystroke streaming.

- An edit-mode tab sends nothing until the host accepts its save. Then it relays that version to the other editors (the live lane). With autosave that is about 1.5 s after typing pauses, at most about 10 s.
- Each receiving tab merges the frame three ways: the last version both agreed on (base), its own current page including unsaved edits (local), and the frame (remote).
- View-mode tabs ride the saved lane: they receive every accepted save and update in place.
- Outside edits to the file on disk (an agent, a text editor, a version restore on desktop hosts) arrive as `disk` frames and merge the same way.

So collaborators see each other's work a few seconds after each pause. On a page without autosave they see nothing until someone saves, and overlapping work only meets at save time. **Every collaborative file uses `autosave`.**

### 7.2 What a merge does

| Situation (this tab A unsaved, incoming B) | Result |
|---|---|
| A edits one paragraph, B another | both kept |
| A and B edit different words of one paragraph | both kept |
| A and B change the same word | B wins; A's version goes to the conflict ledger |
| Both add class tokens (`done` and `urgent`) | both kept |
| Both set one attribute (`data-status`) differently | B wins; ledger record |
| Both reorder a list differently | B's order; ledger record |
| A edits a card, B reorders the list | B's order with A's edit, no conflict |
| A edits a card B deleted | the card survives with A's edit |
| A deleted a card B edited | the card comes back with B's edit; ledger record |
| Both append an item with its own `data-id` | both land |
| Both append an item without ids | distinct text: both land; similar text: A's item dropped, ledger record; identical or blank: one dropped, **no** record |
| A is typing in a focused input | its value and focus kept |

More engine rules:

- Text merges word by word inside a block, and formatting merges per character. Inline `<style>` text merges word by word. Scripts, textarea text and comments merge as whole values.
- Matched live nodes are moved, not recreated, so listeners, focus, caret and iframes survive. An element that matches nothing (re-keyed, or changed beyond recognition among similar siblings) is removed and inserted fresh, and listeners attached directly to it are gone. **Use delegated listeners** on `document` or a stable root.
- A new or changed inline `<script>` in the frame runs once after the merge. Hence the boot guard (9.10).
- Window scroll is restored. Inner scroll containers are not, except the focused element's own.
- The merge runs with the mutation hub, the dirty gate and undo paused: incoming changes never autosave and never enter undo history. Your own `MutationObserver` still sees them, which is how the examples re-render.

### 7.3 Regions and JSON under sync

- `editor-ui`, `no-save`, `no-snapshot`, `freeze`: **ignored on every side.** Your copy is never touched, and the incoming copy is never read.
- `no-dirty`, `no-watch`: **remote wins.** The incoming copy replaces yours with no merge. Correct for derived values that every tab recomputes.
- `no-trigger-autosave`: merged like ordinary content.
- Root attributes the library owns (`editmode`, `savestatus`, tokens) are never written by a frame.

**Known issue (ClayJS 1.8.2):** when a frame replaces a `no-dirty` region that this tab had also changed, while the tab also holds an unsaved edit outside that region, the replacement is logged in `clay.conflicts` as a loss and raises the conflict notice, although the docs say it happens with no warning. Two tabs that each edited the data will each have recomputed the totals differently, so this fires on concurrent edits whenever computed totals live in `no-dirty`. Until it is fixed, acknowledge those records yourself, as the finance tracker does:

```js
document.addEventListener("clay:sync-applied", () => {
  const derived = clay.conflicts.list().filter((c) =>
    c.detail === "remote-wins" && [c.el, c.local].some((n) => n?.closest?.('[clay~="no-dirty"]')));
  if (derived.length) clay.conflicts.acknowledge(derived.map((c) => c.id), { reason: "reconciled" });
});
```

**JSON.** A JSON script without `merge` is one value: two writers changing it means one whole blob goes to the ledger. With `merge="name"` it merges per key: objects per key, arrays of objects by an `id` field (`merge-key="taskId"` names another), arrays of primitives by value. **A key both sides changed takes the incoming value silently**: no ledger record, no notice. Keep fields where a silent loss matters (an amount, a status) in the DOM, where an overlap shows. Use per-entry keys (`notes: { "n-1": ..., "n-2": ... }`) so two people adding entries never touch the same key. The merged text is re-serialized, so blob formatting is not kept.

### 7.4 Focus, typing and long-running editors

- The focused `<input>` or `<textarea>` keeps its value through a merge. Checkbox, radio and select state are not protected.
- A caret in contenteditable text follows its characters through the merge.
- A dirty tab that has no merge base (because the record was rewritten at boot) **holds** incoming frames and fires `clay:sync-held` until it saves. Another reason not to touch the record at boot.

### 7.5 Reconciling in app code

After `clay:sync-applied`, rebuild everything derived from the record and every piece of chrome that points into it:

```js
document.addEventListener("clay:sync-applied", (event) => {
  syncCheckboxes();
  render();
});
```

- Re-render derived values and projections.
- Close or repoint any view whose record a peer deleted. The kanban closes the open card when its id is gone: `if (openId && !cardById(openId)) return writeHash({ card: "" }, { replace: true });`
- Re-parse any JSON you parsed earlier.
- Re-attach any per-element setup that a re-created element lost (the writer re-injects block gutters on every render).

`detail` on `clay:sync-applied`: `{ seq, source: "peer" | "disk", by, report, conflictIds, unresolved }`, plus `etag` and `html` for disk frames. `by` is `{ id, name }` on hyperclay.com peer frames and `null` elsewhere. `report.applied`, `report.conflicts` and `report.localDiverged` describe the merge.

### 7.6 The conflict ledger and notice

Losses (where this tab's work was replaced) enter `clay.conflicts`:

- `list()`, `get(id)`, `size`, `recoveryOf(id)` (a clone of the page as it was just before the frame).
- `acknowledge(ids, { reason })` with `reason` of `accepted`, `reverted` or `reconciled`. It is the only way a record leaves. Nothing clears them automatically, and the close warning stays up while any is open.
- `claim(ids, { owner })` hides records from the built-in notice so your app can resolve them itself, then `acknowledge` them.

The built-in notice reads "Another edit replaced N changes" and offers **Revert to mine**, **Accept theirs**, **Download my copy** and a list of the edits. Revert puts the selected losses back as an ordinary local edit, then saves.

On hyperclay.com, a frame stamped with `by` also shows a one-line "*Name* changed this section" beside the field the reader last focused.

### 7.7 Presence

hyperclay.com shows a fixed avatar stack (initials, editors solid, viewers hollow, a "+N viewing" count) when two or more people have the file open. **There is no API**: no event, no roster, no cursor or section data. An app cannot build its own "who is here" or "X is editing this card". HTML Clay and Hyperclay Local have no presence.

### 7.8 Agents

An agent edits a malleable file the way a person in another tab does.

- **Editing the file on disk** (HTML Clay, Hyperclay Local): the host notices the change and pushes a `disk` frame. The open tab merges it three ways, so the person's unsaved typing in other paragraphs survives, and an overlap goes to the ledger. Tell agents to address elements by `data-id`, never by position, and to leave chrome alone (it is not in the file anyway).
- **`clay.wire`** (`?plugins=wire`, HTML Clay and Hyperclay Local): `clay.wire.send(payload)` sends a request to a local process started with `htmlclay wire serve file.htmlclay -- my-agent`. The page saves first, so the agent reads what the person sees, and autosave pauses until the agent's edit lands as a disk frame. `run.done` resolves then.
- **`ai-edit`** (`?plugins=ai-edit`): select text, press Cmd+J, describe the change. The rewrite is previewed in place; Keep saves it, Revert discards it. Available where the host offers the `ai-edit` helper (HTML Clay, Hyperclay Local).
- **The data API**: a host that announces `data-read`/`data-write` serves `/_/api/<file>`, a JSON read and write face over the file defined by a rules tag (9.9). `clay.readData()` and `clay.writeData()` call it from the page; `writeData` is for agents and other processes, and refuses while the page has unsaved edits.

---

## 8. Editing components

### 8.1 richclay: rich text (`editable`)

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
| Tables, checklists, dividers, callouts, toggles, embeds | As separate blocks outside the rich region (the writer's block model, 10.2) |
| Image insert, captions, alignment | An image block (`<figure>` with an `<img>` and an `editmode:contenteditable` caption), or `editor.squire.insertImage(src)` for inline images |
| Screenshot paste | Squire swallows image-only pastes. Listen for `pasteImage` (below) |
| Markdown shortcuts | Only `* ` and `1. ` start lists. Watch `editor.squire` `input` events and call `editor.setBlockType("H2")` for others |
| Slash menu | A keyup handler for `/` on an empty paragraph opening an `editor-ui` menu (10.2) |
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
- **The floating toolbar is mounted on `document.body`, not in the top layer.** Inside `dialog.showModal()` or a `popover` it is unusable (shortcuts still work). Do not put `editable` inside a modal dialog. The kanban shows the card itself as a fixed overlay instead (9.5).
- **Two undo histories.** Inside an `editable`, Cmd+Z goes to Squire's own stack. Outside, it goes to page undo, which never records rich text. A person who types in a rich region, clicks elsewhere and presses Cmd+Z does not undo their typing.
- **Squire's undo can roll back a peer's edit** in the same region: its history is whole-region snapshots. Keep collaborative documents in many small regions (one `editable` per block), which also limits the damage.
- **Many editors are expensive.** Each multi-line editor installs document-level listeners and its own Squire instance. Do not put `editable` on every cell of a grid; use `editmode:contenteditable`.
- **Paste is an allowlist**: tables, `<hr>`, `<details>`, `<figure>`, iframes and inline styles are reduced to text. A pasted remote image keeps its hotlinked `src`; a pasted `data:` image bloats every save.
- **Cloning an active region** copies runtime attributes. Strip them with `clay.RichClay.stripElement(clone)` (as in 5.5), or clone from a `<template>`.
- **`editable` is ignored in view mode**; viewers get plain markup.

### 8.2 sortable: drag to reorder

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

### 8.3 undo: whole-page undo

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

- **Undo of a `persist` control restores the attribute, not what is shown** (5.3). Re-sync `.checked` and `.value` on `undo` and `redo`.
- **It takes Cmd+Z in every text field**, including inputs it does not record (a non-persist input), so their native undo is lost.
- History is per tab, capped at 100, and not saved.
- Undoing a delete re-inserts the original node even if a peer re-created an equivalent; dedupe by `data-id` on `clay:sync-applied` if that matters.

### 8.4 Plain contenteditable

For titles, labels, list items and table cells, use `editmode:contenteditable` with `plaintext-only` (4.4). No toolbar, no Squire, no formatting, cheap at any count. Handle Enter yourself (blur, or create the next item as the writer's to-do list does).

### 8.5 upload and quickcrop

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
- Uploaded assets on hyperclay.com are publicly reachable by URL even when the document is private.

`clay.quickcrop(file, { aspect, maxWidth, maxHeight, type, quality })` opens a crop dialog and resolves `{ blob, dataURL, width, height }`, or `null` on cancel. It does not upload. Pass the blob to `clay.upload`, wrapped as a `File`. One cropper at a time; it sets `body.style.overflow = "hidden"` while open, which a save at that moment writes into the file.

The file picker for an image block lives in chrome: `<input type="file" accept="image/*" hidden>` inside the `editor-ui` wrapper, clicked by your menu.

### 8.6 clay-ui: toasts and dialogs

- `clay.toast(message, type)` with `success`, `error`, `warning`, `info`. The message is text, never markup. No handle to dismiss early.
- `clay.toastPersistent(message, type)` stays until closed.
- `clay.confirm(prompt)` resolves on confirm and **rejects with `undefined` on cancel**. Always pass a rejection handler: `clay.confirm("Delete this card?").then(del, () => {})`. `try { await clay.confirm(...) } catch (e) { e.message }` throws inside the catch.
- `clay.ask(prompt, onYes, defaultValue)` resolves with the typed text.
- **Every dialog prompt and title is HTML**: `clay.confirm(prompt, extraContent)`, `clay.ask(prompt)`, `clay.tell(title, ...paragraphs)` and `clay.snippet(title, code)` all insert their strings as markup. ``clay.confirm(`Delete "${card.title}"?`)`` runs whatever markup a collaborator typed into the title. Keep prompts constant, or escape record text first.
- `clay.modal` is a single modal with `title`, `html`, `yes`, `no`, `onYes`, `open()`, `close()`. Every setting resets on close, and opening any dialog rejects the one already open.

**Never pass a live record element as `clay.modal.html`.** The modal moves the node into its runtime-only root and removes that root on close: the element is gone from the page, and a save during the dialog drops it from the file. Pass a form built from a template, and write values back to the record on yes. For card detail, prefer the record-as-modal pattern (9.5).

ClayJS's own UI (notice, indicator, dialogs, toasts) is drawn with inline, reset styles, so page CSS cannot restyle it.

### 8.7 clay-events, clay-dom and All

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

### 8.8 OverType: a markdown editor

For a notes or journal app where markdown is the format, OverType (`https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js`) is a textarea under a styled preview. With `new OverType(el, { persist: true })` the saved file holds only a `<textarea persist>` and its wrapper; everything else is `editor-ui`. Keep one live instance at a time, and normalize OverType's layout state in an `onbeforesave` on the container. A journal built this way keeps entries as `<article data-id>` records, clones its chrome from a `<template>`, and paints the open entry with a runtime stylesheet.

### 8.9 Bevel components

Bevel (`@panphora/bevel`) is a separate component library with a kanban board, an editable data grid, inline edit, upload dropzone and modal, all with state in markup. ClayJS does not load it. Load `bevel.css` and `bevel.js` yourself and register `Bevel.prepareForSave` with `clay.onSnapshot`. It has its own drag and events and is not wired to ClayJS undo or sortable. Use it when a ready-made grid or board is acceptable; build from this guide when the app needs its own shape.

### 8.10 Attributes from older Hyperclay files

Older Hyperclay files can carry attributes ClayJS ignores: `movable`, `movable-handle`, `prevent-enter`, `autosize`, `ajax-form`, `ajax-button`, `send-message`, `upgrade`. Replace them with a few lines of code (`prevent-enter`: a keydown handler; `autosize`: CSS `field-sizing: content`; `movable`: pointer events writing `data-x`/`data-y`). Old saved `<html editmode="false">` and hand-written `option-visibility-styles` style tags are dead weight; ClayJS strips the root attributes on the next save.

### 8.11 sap.js: computed values in markup

`sap.js` (satellite, also standalone as `@panphora/sapjs`) is a reactive attribute layer whose only store is the DOM. Every change runs one pass that reads the page, computes `calc:` fields in dependency order and writes only changed paints. Use it for number-heavy apps: budgets, invoices, trackers with totals.

```html
<main id="app" sap>
  <output clay="no-dirty" calc:totalspent="sum(state.txns, 'amount')" text:usd2="state.totalspent">$900.00</output>
  <table>
    <tbody items="txns">
      <tr item id="t-k1">
        <td><input type="number" step="0.01" bind="amount" persist viewmode:readonly readonly value="900"></td>
      </tr>
      <tr item template><td><input type="number" step="0.01" bind="amount" persist viewmode:readonly></td></tr>
    </tbody>
  </table>
</main>
```

The vocabulary:

- `sap` marks an app root. `bind="field"` two-way binds a control (numbers for `type=number`, booleans for checkboxes) or a contenteditable leaf. `items="list"` on a container makes its `[item]` children rows; `[item][template]` is the row blueprint.
- `calc:name="expr"`, `text:fmt="expr"` (`usd`, `usd2`, `pct`, `int`, `num2`, `compact`, `date`, others), `show="expr"` (toggles `hidden`), `class:name`, `css:name` (sets `--name`), `attr:name`.
- Expressions see `state`, `item`, `root`, and `sum`, `count`, `avg`, `min`, `max`, `num`, `plural`, `days`. Field names are lowercase identifiers without hyphens.
- Actions: `trigger-add="list"`, `trigger-remove`, `move:up`, `move:down`, `sort:field`, `set:field="expr"`, `confirm="msg"` (uses `clay.confirm`).
- JavaScript: `Sap(el)` returns a write-through proxy for the owning row or scope (`$add(list)`, `$remove()`); `Sap.batch(label, fn)` makes one undo step; `Sap.refresh()` runs a pass now.
- Done means: no `sap ✗` console line, `Sap.status().ok === true`, no `[sap-error]` elements.

How it fits ClayJS: it rides the mutation hub so its paints never trigger autosave, re-derives on `clay:sync-applied` and on undo, and mirrors bound values into attributes on programmatic writes. `persist` on bound controls keeps typed values. Sap reads a control's live value, not its attribute, so after undo and redo re-sync the inputs first (the `syncControls` code in 5.3) or totals and the next save keep the undone number.

Rules for sap in a malleable file, all from the finance tracker:

- **Author the file with its computed values already painted.** A mismatch makes sap write at load, which is an edit. Check by comparing the live `#app` after load with the file's. `Sap.status().apps[0].mountWrites` is not a clean signal on its own: in a root that contains `show-when` controls, sap briefly sets `hidden` on them before clay-options starts (a `W30` warning, 10 writes in the finance tracker) and clears it again, which is harmless.
- **Computed outputs that the saved file shows go in `clay="no-dirty"`.** Their bytes save with the next real edit, never count as edits themselves, and a peer's frame replaces them. Apply the acknowledge workaround from 7.3 while that known issue stands.
- **Give rows your own stable ids.** Sap stamps `row-N` from a counter that restarts on every load, so a row added after reload can reuse an id another row already carries. Replace them as rows appear:

  ```js
  function claimRowIds() {
    for (const row of app.querySelectorAll("[items] > [item]:not([template])")) {
      if (!row.id || /^row-/.test(row.id)) row.id = newId("t");
    }
  }
  new MutationObserver(claimRowIds).observe(app, { subtree: true, childList: true });
  ```

- **Hide the template row in your own CSS**: `[item][template] { display: none }`. Sap's rule is runtime-only and absent before it loads.
- **Filter by hiding, never by removing**, so totals still see every row. A filter painted with `show=` writes `hidden` onto saved rows; normalize it out of snapshots with `onbeforesnapshot` (6.6) and use `transient` on the search input.
- Sap adds `[hidden] { display: none !important }` page-wide.
- Sap lints `viewmode:` attributes as unknown (`W03` warnings) in 1.8.2. Harmless.
- `usd2` formats negative numbers as `$-162.40`.
- A pass is batched: after a write, `Sap.refresh()` before reading painted output.
- Expressions compile with `new Function`, so a Content Security Policy without `unsafe-eval` breaks them.

### 8.12 The CMS, in passing

`?plugins=cms` turns a page into a content-managed page: a JSON rules tag maps field names to selectors, and an "Edit content" button opens a sidebar form (or edits text in place) that writes straight into the DOM.

```html
<script data-rules-name="cms" data-rules-version="1" type="application/json">
{ "title": ".page-title", "intro": "p.intro", "hero": "img.hero@src", "plans": [".plan", { "name": ".name", "price": ".price" }] }
</script>
```

It fits content sites: landing pages, menus, pricing, FAQs, team pages, where the layout is fixed and a non-developer changes copy and images. It does not fit apps where editing is the product: its form is a separate surface from the content, new list items clone the first item's attributes (including its state), and rich text inside lists is flattened in the sidebar. A file can use both: the CMS owns the header copy, the app owns `<main>`, and the rules never reach into the app's region. Give every list that can become empty a `cms-template` seed hidden by CSS, not by the `hidden` attribute (which is copied into every new item). Add `sortable` to the plugin list for drag in the sidebar.

---

## 9. App architecture

### 9.1 The record container

One container in the saved document holds every record, with `data-id` per record and fields as attributes, text or persist controls. Shape it by the primary editing dimension:

- **Board-first** (kanban, pipeline): records live inside their column's list. `sortable` gives cross-column drag; the column a card sits in is its status.
- **Table-first** (finance, CRM contacts, inventory): records are `<tr data-id>` rows in one `<tbody>`. A board, if any, is a projection.
- **Document-first** (writer, wiki page): records are blocks, siblings in one `sortable` container (10.2).

Never store a record twice. A JSON mirror of DOM records, or a rendered copy beside a model, drifts the first time a merge or a hand edit touches one of them.

### 9.2 Chrome

Clone chrome from a `<template>` into one `clay="editor-ui"` wrapper after `clay.ready`:

```js
const chrome = document.createElement("div");
chrome.id = "chrome";
chrome.setAttribute("clay", "editor-ui");
chrome.append(document.getElementById("chrome-tpl").content.cloneNode(true));
board.querySelector(".board-head").append(chrome);
```

Chrome may sit inside the record container (the kanban puts its filter in the board header): `editor-ui` removes it wherever it is. Per-item chrome (the writer's block gutter, the kanban's count badges) is inserted into each item as its own `editor-ui` element and re-inserted by `render()` when missing, so items added by a peer get theirs too.

Edit-only chrome lives in the same wrapper with `show-when:editmode="true"`, or is not built at all in view mode (`if (clay.isEditMode) …`).

### 9.3 Per-tab state

| State | Where | Why |
|---|---|---|
| Which card or entry is open, the filter, search text, current view, sort | URL hash: `#card=c-brief&q=pricing` | per tab, survives reload, shareable, Back closes the card, never saved or synced |
| Collapsed sections, column widths, density, last opened entry | `localStorage`, keyed by the file's path | per device and viewer; wrap reads and writes in `try/catch` |
| Selection, hover, drag state, open menu | memory, or chrome DOM | transient |
| A default view visitors land on, WIP limits, column names, label definitions | attributes on a settings element in the record | genuinely part of the document |

**Paint per-tab state with a runtime stylesheet** inside chrome, rewritten from the hash, instead of toggling classes or attributes on records:

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

### 9.4 Derived values

Pick by whether the saved file must show the value:

- **Tab only** (counts, progress badges, outlines, word counts, search results): write into `editor-ui` elements. The kanban inserts a `.count` span into each column header and a `.progress` span into each card, both `editor-ui`, so they are never saved, never synced and never undone. Each tab computes its own.
- **Visible in the saved file** (budget totals a reader needs without JavaScript): write into the record inside `clay="no-dirty"`. It saves with the next real edit, never counts as an edit itself, and remote wins under sync. Apply the 7.3 workaround. Sap does this in the finance tracker.
- **Only in the saved file**: compute it into the save clone with `clay.addDocumentTransform`, never the live page.

Always write derived text through a guard, because writing the same text is still a mutation:

```js
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
```

Recompute on three triggers: record mutations (a `MutationObserver` on the record container, coalesced with a microtask), `clay:sync-applied`, and `hashchange` when the hash affects the view. Observe the record, not the chrome, so derived writes do not trigger themselves.

### 9.5 Detail views: the record is the modal

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

### 9.6 Commands

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

### 9.7 Filters and view switching

- **Filter by hiding** records with a runtime stylesheet (skeleton, kanban) or sap `show=` plus snapshot normalization (finance). Never remove records to filter.
- **Switch layouts with CSS** over the same records where possible: a list view can be the board with `display: contents` on columns.
- **Projection views** (a table of all cards, a calendar, a due-today list) render into an `editor-ui` container and rebuild on record mutation, `clay:sync-applied` and `hashchange`. Edits made in a projection write to the record by id.

### 9.8 Computed totals

Plain JavaScript into `editor-ui` (9.4) for counts and progress. Sap for anything with arithmetic across rows, categories and formats (8.11). Store money as integers or as plain numbers in `value` attributes, never as formatted strings.

### 9.9 Import and export

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

### 9.10 The boot guard

A live-sync merge can re-insert an inline script, which runs it again: every listener doubles and every chrome element appears twice. Guard the app script:

```js
clay.ready.then(() => {
  if (window.__boardStarted) return;
  window.__boardStarted = true;
  …
});
```

### 9.11 Size

Every save captures and serializes the whole document, every change check captures it again, and every peer merges the whole document per accepted save. Measured in jsdom and scaled to a browser (estimates):

| Records (about 425 bytes each) | File size | Capture per check | Full save | Peer merge |
|---|---|---|---|---|
| 300 | 128 KB | ~10 ms | ~25 ms | ~10 ms |
| 1,500 | 640 KB | ~55 ms | ~140 ms | ~60 ms |
| 3,000 | 1.3 MB | ~120 ms | ~300 ms | ~190 ms |
| 6,000 | 2.6 MB | ~250 ms | ~650 ms | ~400 ms |

Up to about 1,000 records feels instant. From 1,000 to 3,000 there is a visible hitch at each save. Past about 3,000 records or 1.5 MB, autosave stalls typing and peers lag. Hosts cap a save at 5 MB (hyperclay.com), 20 MB (Hyperclay Local) and 50 MB (HTML Clay). Design for archiving: one file per year, a hidden archive section that can move to another file, or one file per project.

---

## 10. Recipes

### 10.1 Kanban with card detail

[`examples/kanban.html`](https://clayjs.com/examples/kanban.html). Plugins `sync,sortable,undo,indicator`, satellites `clay-options` and `clay-ui`.

- `#board > .columns[sortable="columns"] > section.column[data-id]`, each with a handle and an `h2`, then `ol.cards[sortable="cards"]` of `li.card[data-id]`.
- Each card holds a hidden `.detail`: an `editable` description, a checklist of `li[data-id]` with `persist` checkboxes, an `ol.activity` of `li[data-at]`, and edit-only actions.
- Count per column and progress per card are `editor-ui` spans re-rendered on every mutation.
- The open card is in the hash and painted by the view-state style (9.5). The filter is in the hash too.
- `clay:sorted` logs "Moved to *Column*" in the card when it changes column.
- Templates: card, checklist item, column, chrome.

Extend with labels (a settings element listing `<li data-label="bug" data-color="…">`, cards carrying `data-labels="bug ui"`), due dates (`data-due` plus a hash filter "due this week"), WIP limits (an attribute on the column, a warning in an `editor-ui` badge), and a list view (a projection or `display: contents`).

### 10.2 Block writer

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

- A gutter (handle, `+` insert, `⋯` block menu) is cloned from a template into each block as `editor-ui`, with `contenteditable="false"`. Because the handles are injected, the script sets Sortable's `handle` option (8.2).
- The menu is one `editor-ui` element positioned under the clicked button. Insert actions clone a block template and give it an id; block actions duplicate (re-iding every descendant, 5.5) or delete.
- The slash menu opens on keyup `/` when the caret's paragraph contains only `/`; choosing an item removes the `/` (and the block, if it held nothing else) and inserts after it.
- Images come from a hidden file input in chrome or from a pasted screenshot (`pasteImage`), through `clay.upload` with the `data:` fallback.
- The outline (H1 to H3 across blocks) and the word count are `editor-ui` projections; the outline rebuilds only when its signature changes.

Missing pieces to add on the same model: a table block (`<table>` with `editmode:contenteditable` cells and your own Tab and add-row code), a code block (`<pre><code editmode:contenteditable>` with a copy button in chrome), a toggle (`<details>`, noting `open` saves), anchor ids on headings (assign `id` from text on blur, not on load).

### 10.3 Finance tracker

[`examples/finance.html`](https://clayjs.com/examples/finance.html). Plugins `sync,undo,indicator&exclude=richclay`, satellites `clay-options`, `clay-ui`, `sap.js`.

- `main#app[sap]` with a summary of `no-dirty` outputs (budgeted, spent, left), a categories table (`items="categories"`, each row a name, a persisted budget input, computed spent and left, a progress bar via `css:used`) and a transactions table (`items="txns"`, each row date, memo, category with a datalist, amount).
- Category spent: `calc:spent="sum(root.txns.filter(t => t.cat === item.name), 'amount')"`.
- Search: a `transient` bound input, `calc:match` and `show="item.match"` per row, `hidden` stripped from snapshots.
- Rows get stable ids from `claimRowIds` (8.11).
- CSV import (edit only) and export (both modes).
- The 7.3 acknowledge workaround for `no-dirty` totals.

The authored file already shows every computed value, so sap mounts without changing the record and a reader without JavaScript sees correct totals.

### 10.4 CRM follow-up list

Table-first. `<tr data-id data-stage="lead" data-next="2026-10-14">` rows with `editmode:contenteditable` name and company cells, a persisted `<select>` for stage, a persisted `<input type="date">` for the next contact, and an `editable` notes cell or a hidden notes element shown in the record-as-modal detail. Projections into `editor-ui`: "due today" (rows whose `data-next` is today or earlier) and a pipeline board (columns by stage, each card a link to the row's detail). Totals by stage with sap if deals carry amounts. `mailto:` links for contact. CSV import merges by email or id. Single owner.

### 10.5 Flashcards

Decks as `<section data-id>` records, cards as `<article data-id data-due data-interval data-ease>` with `editmode:contenteditable` front and back. Study mode is tab-local: the hash holds the deck and the current card, a runtime stylesheet shows one card and hides the back until revealed. Grading writes the new `data-due`, `data-interval` and `data-ease` on the card (an SM-2 style schedule), inside one undo commit. The "due today" count is an `editor-ui` projection.

### 10.6 Typed table (a spreadsheet you can be honest about)

A fixed schema of named columns, rows as `<tr item data-id>` in a sap `items` list, inputs bound and persisted per cell, computed columns with `calc:`, totals with `sum`, filters by hiding, CSV in and out. Tab between cells with a keydown handler on the table. A few hundred to two thousand rows per file.

### 10.7 Slides

One `<section class="slide" data-id data-layout="title|bullets|image|quote">` per slide in a 16:9 box, `editable` text, `sortable` to reorder, images through upload. Present mode is tab-local (hash `#present=3`): fullscreen, `scroll-snap`, arrow keys, speaker notes in an `<aside>` hidden while presenting. PDF through `@page { size: 16in 9in }` and the browser's print.

### 10.8 Content site

Without the CMS: `editable` regions for copy, upload and quickcrop for images, `sortable` lists for features. With the CMS: a rules tag and `?plugins=cms` (8.12).

---

## 11. Limits, and what to build instead

ClayJS gives one file per document, whole-document saves, save-gated three-way merging, per-tab undo, and editing components that write plain HTML. It does not give keystroke-level co-editing, operational transforms or CRDTs, cursors, comments, per-row permissions, a formula engine, virtualization, background jobs or cross-file queries. Promise what the file can do.

| Competitor | What ClayJS gives | What is missing | Build this instead |
|---|---|---|---|
| **Google Docs** | Rich text with a bubble toolbar, word-level merge at save time, recoverable conflicts, version history from the host, ai-edit | Tables in rich text, comments, suggestion mode, live cursors, keystroke co-editing, pagination, footnotes, .docx export | A block writer (10.2): table, code, callout and image blocks; comments as `<aside data-id data-anchor>` elements; print CSS for PDF; turn-taking or different-section editing |
| **Google Sheets** | Persisted inputs, sap formulas over named fields, aggregates, formats, CSV | A1 references, ranges, fill-down, recalculation graph, virtualization, range selection, charts, pivots, 10k-row data | A typed table (10.6) of a few thousand rows, one file per year |
| **Google Slides** | Slides as sections, sortable, uploads, view mode as the published deck | Free positioning, guides, masters, presenter view in a second window, transitions, PPTX | A flow-layout deck with fixed layouts per slide (10.7) |
| **Trello, Linear** | Sortable columns, inline editing, checklists, attachments, undo, sync with per-card identity | Notifications, reminders, assignments, cross-board search, mentions, integrations, boards past a few thousand cards | The kanban (10.1) with labels, due dates and a due-soon projection |
| **Notion** | One rich document per file, blocks, structured pages | A workspace of many pages, databases with relations and rollups, backlinks, workspace search, page permissions | A folder of files, one per page or database, plus an index file; links are `<a href>` |
| **CRM** | Records, pipeline board, notes, CSV, totals | Email logging, reminders, dedupe, multi-user ownership, per-row permissions, public intake | The follow-up list (10.4) |
| **Finance apps** | Rows with amounts, budgets, sap totals, CSV import of bank exports | Bank sync, learned categorization, multi-currency, scheduled transactions, encryption at rest | A monthly or yearly budget file with CSV import (10.3) |
| **Full CMS** | Per-page CMS sidebar, uploads with crop, view mode as the site, a JSON data API | Multi-page collections, shared layouts, drafts and scheduled publishing, roles, media library, i18n | One file per page, a shared stylesheet, the CMS for non-technical editors of each page |

Cross-cutting:

- **Collaboration latency** is the autosave cadence: a few seconds after each pause.
- **Per-row permissions** do not exist: edit access is per file. Split data with different audiences into different files.
- **Background work** (reminders, recurring transactions) cannot run in a closed file. Compute "due" when the file is open.
- **Privacy:** the saved file is the data. Hiding an element with CSS or `show-when` is presentation, not access control (12.3).

---

## 12. Hosts, assets and privacy

### 12.1 What each host gives

| | HTML Clay | Hyperclay Local | hyperclay.com |
|---|---|---|---|
| Who edits | the local user | the local user; teammates through device sync | owner, team editors, edit-link holders |
| Live sync | tabs on this machine | tabs, plus other devices through the sync engine | every editor and viewer |
| Outside disk edits reach open tabs | yes (agents, text editors) | yes | no disk except through device sync |
| Presence | none | none | avatar stack, no API |
| `by` on frames, section notice | no | no | yes |
| Wire and ai-edit | yes | yes | no |
| Data API write | yes | yes | read only |
| Uploads | 25 MB, beside the file | 25 MB, in `assets-<name>/` | 10, 20 or 100 MB by plan |
| Version history | yes | 60 days, newest 20 | a version per save; a restore does not reach open editors' tabs, so reload after restoring |
| Max save | 50 MB | 20 MB | 5 MB |

A plain static server or a file opened from disk can show the file in view mode but cannot save it. Use the `demo` plugin for a public demo that saves into each visitor's browser.

On hyperclay.com every tab holds its own sync connection. Over HTTP/1.1 a browser allows six connections per origin, so a seventh tab of the same site can stall.

### 12.2 Getting started on each

- **HTML Clay:** save the file as `name.htmlclay` and open it with HTML Clay 1.9.0 or newer. The extension changes nothing about the content; it is ordinary HTML.
- **Hyperclay Local:** put the file in the synced folder and open it from the app.
- **hyperclay.com:** create a site and paste the file, or upload it.

### 12.3 Privacy

The saved file is the data. Everyone who can download it can read everything in it: hidden elements, `data-*` attributes, JSON scripts, CSS-hidden sections and everything the owner typed. `show-when:editmode`, `hidden` and `display: none` are presentation.

- To publish a version without private values, make a copy and remove them, or keep private data in a different file with different access.
- A file you hand out as a template should ship with sample data, not yours.
- Uploaded assets on hyperclay.com are reachable by URL even for private documents.
- Password inputs are never persisted; an authored `value` on them is still in the file.

---

## 13. Checklist and trap index

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
10. Derived values are in `editor-ui`, or `no-dirty` when the file must show them; every derived write is guarded.
11. Commands are wrapped in `clay.undo.commit`; checkboxes and inputs are re-synced from attributes on undo, redo and `clay:sync-applied`.
12. A `clay:sync-applied` handler re-renders and closes views whose record vanished.
13. The app script has a boot guard; all listeners are delegated.
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
| CSS keyed on `editmode="false"` shows edit chrome before boot | 4.2 |
| A never-saved file shows `show-when:editmode` controls to viewers without the fallback rule | 4.3 |
| `show-when` matches any ancestor, not the nearest | 4.3 |
| A view attribute on a saved element syncs to every collaborator | 4.3, 9.3 |
| Records authored with live `contenteditable` stay editable for viewers until the first save | 4.4 |
| Templates in the inert form give clones that cannot be edited until reload | 4.4 |
| Unguarded edit-only API calls throw in view mode | 4.5 |
| `showModal()`, `hidden`, `.selected` and library inline styles save | 5.1 |
| `no-save` chrome still reaches peers; use `editor-ui` | 5.2 |
| Edits in `no-watch` or `no-dirty` are invisible to `save()` and the close warning | 5.2 |
| Runtime changes inside `freeze` are never saved, even by `force()` | 5.2 |
| Rendering into `freeze` before `clay.ready` freezes the render | 5.2 |
| A control without `persist` loses its typed value | 5.3 |
| Undo and merges restore `checked`/`value` attributes but not what the control shows, and the next save writes what is shown | 5.3, 8.3 |
| JSON with an unescaped `</script>` corrupts the file | 5.4 |
| `<template>` content edits never autosave | 5.4 |
| Items without ids added in two tabs: one is dropped | 5.5, 7.2 |
| Cloned records share a `data-id`, which counts as no id | 5.5 |
| `crypto.randomUUID` is missing outside secure contexts | 5.5 |
| Writes in the first 0.5 to 3 s after load are absorbed into the baseline and not saved | 6.2 |
| A failed save is not retried until the next edit | 6.2 |
| `ok: false` also means "nothing to save" and "queued" | 6.4 |
| `clay.getHTML()` runs hooks and closes the undo batch | 6.4 |
| A 412 conflict stops autosave until resolved | 6.5 |
| Impure hooks keep the page permanently dirty | 6.6 |
| A throwing `onSnapshot` or `addDocumentTransform` callback blocks every save | 6.6 |
| `onaftersave` writing to the live DOM loops autosave | 6.6 |
| Without autosave, collaborators see nothing until a save | 7.1 |
| Listeners attached to records are lost when a merge recreates them | 7.2 |
| A peer's frame re-runs inline scripts | 7.2, 9.10 |
| A `no-dirty` region replaced by a peer raises a false conflict notice (1.8.2) | 7.3 |
| Same-key JSON edits under `merge` are lost silently | 7.3 |
| Rewriting the record at boot makes incoming frames hold | 7.4 |
| Parsed JSON goes stale after a merge | 7.5 |
| There is no presence API | 7.7 |
| `data-richclay` card mode deletes images on load | 8.1 |
| The richclay toolbar is unusable inside `showModal()` and popovers | 8.1 |
| Rich text has its own undo; page undo never records it | 8.1, 8.3 |
| Squire undo can roll back a peer's edit in the same region | 8.1 |
| Global `registerButton` after load does not reach mounted editors | 8.1 |
| Screenshot paste does nothing without a `pasteImage` listener | 8.1 |
| Sortable handle mode is fixed at bind time | 8.2 |
| `onsorting` cannot veto a move | 8.2 |
| Sortable residue saves | 8.2, 6.6 |
| The undo plugin takes Cmd+Z in every text field | 8.3 |
| Undoing an add removes the record even after a peer edited it | 8.3 |
| Pausing undo across an `await` loses the earlier mutations | 8.3 |
| Sap reads live control values: undo without re-syncing inputs saves the undone number | 5.3, 8.11 |
| `clay.upload` is not a picker; embed only on `unsupported` | 8.5 |
| `clay.confirm` rejects with `undefined` on cancel | 8.6 |
| A live element passed to `clay.modal.html` is deleted | 8.6 |
| Mutation hooks that write what they watch loop forever | 8.7 |
| `onclone` does not fire for template fragments | 8.7 |
| `el.nearest` reads a neighbour record's field | 8.7 |
| `hide()`, `show()`, `css()` write saved inline styles | 8.7 |
| Sap reuses `row-N` ids after reload | 8.11 |
| A file whose painted values do not match sap's state writes at load | 8.11 |
| Dialog prompts are HTML: record text in `clay.confirm` runs a collaborator's markup | 8.6 |
| `editmode:resource type="inert/javascript"` activates as `javascript` and never runs | 4.4 |
| Sap's template row shows before sap loads | 8.11 |
| CMS `cms-template` with `hidden` makes every new item invisible | 8.12 |
| Records stored twice drift | 9.1 |
| `applyData` pairs rows by content and order, not by id | 9.9 |
| Activity logged from a mutation observer also logs peers and undo | 9.6 |
| Saves slow down past about 1,000 records and stall past 3,000 | 9.11 |
| A version restore on hyperclay.com does not reach open editors | 12.1 |
| Hidden is not private | 12.3 |
