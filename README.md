# clayjs

**Site, tutorial, and docs: [clayjs.com](https://clayjs.com)** · hosted platform: [hyperclay.com](https://hyperclay.com)

Self-saving, malleable HTML in one classic `<script>`. Load `clay.js` on a page and it
becomes editable in place, snapshots its own DOM, and saves that DOM back to the file it
came from. No build step, no framework.

## Use

```html
<script src="https://clayjs.com/clay.js"></script>
```

The loader detects edit vs view mode and pulls only the modules it needs. Tune it with
query params on the script URL:

```html
<script src="/clay.js?plugins=sync,cms&exclude=indicator"></script>
```

- `?plugins=` — add optional plugins: `sync`, `cms` (richclay, indicator, sortable, undo load by default in edit mode).
- `?exclude=` — drop a default plugin.
- `?editmode=false` — force view mode (URL param wins over cookies/globals).

## Readiness

The bootstrap creates `window.clay` synchronously with just a `ready` promise, then augments
that same object once boot finishes. Wait for it before using any other member:

```js
await clay.ready;      // or: document.addEventListener("clay:ready", ...)
clay.save();
```

Edit mode exposes `clay.save()` (+ `clay.save.force()`), `clay.getHTML()`, `clay.beforeSave(fn)`,
`clay.onSnapshot(fn)`, `clay.toggleEditMode()`, `clay.isEditMode`, `clay.isOwner`, `clay.Mutation`,
`clay.cacheBust(el)`, plus `clay.undo` / `clay.cms` / `clay.morph` when those plugins load. View
mode keeps only the always-available members (`toggleEditMode`, `isEditMode`, `isOwner`,
`Mutation`, `ready`); edit-only members are simply absent.

## Regions

Mark parts of the DOM the save/sync engine should treat specially with one space-separated
attribute:

```html
<div clay="no-save no-snapshot freeze">…</div>
```

Tokens: `no-save`, `no-snapshot`, `no-trigger-autosave`, `no-watch`, `no-undo`, `freeze`.
Add `autosave` to `<html>` to save automatically on change.

## Develop

```bash
npm test        # jest unit suite
npm run dev     # stub save server on :4601 for the tests/fixtures pages
```
