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
- `?editmode=false` — force view mode (URL param wins over everything below).

## Host attributes

A host can put these on `<html>` in the response it serves. They are ephemeral:
the host injects them and strips them back out of whatever gets saved, so they
never reach the file on disk.

- `savetoken="…"` — the per-document save credential. clayjs posts to
  `/_/save/{token}` and sends no cookies, because the token is the credential.
  A token also implies edit mode, which is the only such signal a sandboxed
  document can see. `htmlclaytoken` is the older spelling of the same thing.
- `clay-save-transport="desktop-json-v1"` — send the save as
  `{content, snapshotHtml, userDriven}` JSON instead of plain text. Only declare
  it on a host whose save lane reads that envelope.

Edit mode is decided in this order: the `?editmode` param, then
`window.clayEditMode`, then a save token, then the platform's owner cookie.

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

## API

Three tiers. The first two are a promise; the third is not.

| Tier | What it is | Promise |
|---|---|---|
| `clay.*` from `clay.js` | the everyday surface | stable |
| `clay.*` from a satellite (`clay-ui`, `clay-utils`, `clay-dom`, `clay-events`, `clay-options`, `clay-internals`) | opt-in, one script tag each | stable |
| anything else under `src/` | reachable by direct import, because `src/` ships | **may change in any release** |

The contract starts at **0.3.0**: no name below changes without a major version.

**`clay.js`** — `ready`, `save()`, `save.force()`, `getHTML()`, `beforeSave(fn)`, `onSnapshot(fn)`,
`toggleEditMode()`, `isEditMode`, `isOwner`, `Mutation`, `cacheBust(el)`, plus `undo` / `cms` / `morph`
when those plugins load. View mode keeps only the always-available members, as above.

**Satellites** — one script tag each, and each resolves its own `clay.loaded.*` promise. `clay-ui` adds
`toast`, `toastPersistent`, `ask`, `confirm`, `tell`, `snippet`, `modal`; `clay-utils` adds `clay.utils`
(`throttle`, `debounce`, `cookie`, `slugify`, `copyToClipboard`); `clay-internals` adds `clay.internals`,
below. `clay-events`, `clay-dom`, `clay-options` and `all.js` add HTML attributes and DOM helpers rather
than members on `clay`.

**`clay.internals`** — the pieces the library builds itself out of, for code that needs to sit inside the
save lifecycle rather than call it. Lower level than `clay.*` deliberately: it assumes you know the
lifecycle.

```html
<script src="https://clayjs.com/clay-internals.js"></script>
```

- `captureSnapshot()`, `captureForSave()`, `onPrepareForSave(fn)` — the snapshot pipeline, read side.
  `captureSnapshot` gives you the clone before any stripping; `captureForSave` gives you the bytes a
  save would send.
- `region.addRegionToken(el, token)`, `region.resolveRegionPolicy(node)`, `region.isInert(node)`,
  `region.isSnapshotRemoved(el)`, `region.PERSIST`, `region.REGION_ATTRS`, and
  `region.selectors.stripFromSave` / `.stripFromComparison` / `.snapshotRemove` / `.freeze` — write your
  own attribute without hardcoding our selectors.
- `save.saveHtml(html, cb, opts)`, `save.replacePageWith(url, cb)`, `save.isSaveInProgress()` — the save
  lane under `clay.save`. **`saveHtml` writes the bytes you hand it straight to the file**, bypassing the
  snapshot pipeline entirely; check `isSaveInProgress()` first.

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
npm test                   # jest unit suite
npm run test:conformance   # byte-for-byte fixture gate, in a real browser
npm run dev                # stub save server on :4601 for the tests/fixtures pages
```

## Deploy

`public/` is what wrangler serves to clayjs.com. It is a build output: gitignored,
disposable, and rebuilt from scratch every time.

```bash
npm run build    # rebuild public/ from source
npm run deploy   # rebuild, then wrangler deploy
```

Never edit `public/` by hand, and never copy a file into it. Its contents are
**derived**:

```
public/  =  package.json "files"  (minus NOTICE, which nothing requests)
         +  website/*             (flattened to the root, so /docs.html works)
```

That derivation is the point. `files` is the list npm publishes, so it is already
the line you edit to ship a new satellite, and deriving from it means a file cannot
reach npm and miss the site. Before this script existed the mirror was hand-copied,
and it drifted exactly that way: `src/core/host-attrs.js` never made it across, and
since `loader.js` imports `is-edit-mode.js`, which imports it, the deployed
`clay.js` could not boot at all.
