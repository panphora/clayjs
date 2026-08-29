# clayjs™

**Site, tutorial, and docs: [clayjs.com](https://clayjs.com)** · hosted platform: [hyperclay.com](https://hyperclay.com)

Self-saving, malleable HTML in one classic `<script>`. Load `clay.js` on a page and it
becomes editable in place, snapshots its own DOM, and saves that DOM back to the file it
came from. No build step, no framework, no account.

The document is the app *and* the database. State lives in the DOM, and a save is one POST
of the entire serialized document. There is no data layer, no JSON on a server, no schema.
Open the saved file in a text editor and your edit is right there in the HTML.

## See it save itself

[`examples/notes.html`](https://github.com/panphora/clayjs/blob/main/examples/notes.html) is a complete self-saving document. Two
attributes do the work: `autosave` on `<html>`, and `editable` on the parts you type into.

```html
<!DOCTYPE html>
<html lang="en" autosave>
<head><meta charset="utf-8"><title>Notes</title></head>
<body>
  <h1 editable>My notes</h1>
  <div editable><p>Type anything here.</p></div>
  <script src="https://clayjs.com/v1/clay.js"></script>
</body>
</html>
```

Type into it, then open the file in a text editor: your words are in the HTML.

**Something has to write the bytes.** clayjs runs in the browser; it makes the document
and posts it, and a host puts it on disk. The shortest path is
[HTML Clay](https://htmlclay.com), a desktop app: rename the file to `.htmlclay` and
double-click it, and it serves the file at `http://127.0.0.1` and writes every save back.
[hyperclay.com](https://hyperclay.com) hosts the same file online. Your own server needs
one route, about twenty lines: see [the endpoint spec](https://clayjs.com/docs#endpoint).
Full walkthrough: [the tutorial](https://clayjs.com/get-started) and
[`examples/`](https://github.com/panphora/clayjs/tree/main/examples).

## Use

```html
<script src="https://clayjs.com/v1/clay.js"></script>
```

The loader detects edit vs view mode and pulls only the modules it needs. Tune it with
query params on the script URL:

```html
<script src="https://clayjs.com/v1/clay.js?plugins=sync,cms&exclude=indicator"></script>
```

- `?plugins=` — add optional plugins: `sync`, `cms`, `undo`, `sortable`, `indicator`, `quickcrop`, `upload`, `wire`, `demo`.
  Only `richclay` loads by default, and only in edit mode. `cms` brings `quickcrop` with it, because
  the CMS uses it for `data-hcms-crop` image fields.
- `?exclude=` — drop a plugin that would otherwise load (a default, or one another plugin pulled in).
- `?editmode=false` — force view mode (URL param wins over everything else).

Edit mode is decided in this order: the `?editmode` param, then `window.clayEditMode`,
then a save token stamped on `<html>` by the host, then the platform's owner cookie. Hosts
and save tokens are covered in [the reference](https://github.com/panphora/clayjs/blob/main/docs/reference.md) and on
[clayjs.com/docs](https://clayjs.com/docs#editmode).

### One file, no network

`clay.js` is a small bootstrap that fetches the modules a page asked for. For a page
that has to load with no connection, download the standalone build instead: every
module, plugin and satellite in one readable file.

```html
<script src="clay.standalone.js?plugins=sync"></script>
```

Get it from [clayjs.com/v1/clay.standalone.js](https://clayjs.com/v1/clay.standalone.js)
(about 1 MB; `/1.1.0/clay.standalone.js` is that exact release, and the file's first
line says which version it is) or from the npm tarball at `dist/clay.standalone.js`.
Keep it beside the HTML file and use the same query params: `plugins=` decides what
runs, not what downloads, and `await clay.loaded.ui` and the other satellites work
without tags of their own (they are always on, so clay-ui's automatic save toasts run
on your page unless you handle the `clay:save-*` events yourself). If the page already
had satellite tags, delete them: a second `sap.js` mounts a second runtime. Saving
still needs a host that writes the file; [HTML Clay](https://htmlclay.com) does that
on the machine itself, with no network.
The two things that still reach out, and why they fail soft, are on
[clayjs.com/offline](https://clayjs.com/offline).

## Readiness

The bootstrap creates `window.clay` synchronously with just a `ready` promise, then augments
that same object once boot finishes. Wait for it before using any other member:

```js
await clay.ready;      // or: document.addEventListener("clay:ready", ...)
clay.save();
```

## API

Three tiers. The first two are a promise; the third is not.

| Tier | What it is | Promise |
|---|---|---|
| `clay.*` from `clay.js` | the everyday surface | stable |
| `clay.*` from a satellite (`clay-ui`, `clay-utils`, `clay-dom`, `clay-events`, `clay-options`, `clay-internals`) | opt-in, one script tag each | stable |
| anything else under `src/` | reachable by direct import, because `src/` ships | **may change in any release** |

The contract starts at **1.0.0**: no name below changes without a major version.

**`clay.js`** — `ready`, `save()`, `save.force()`, `getHTML()`, `addDocumentTransform(fn)`, `onSnapshot(fn)`,
`toggleEditMode()`, `isEditMode`, `isOwner`, `Mutation`, `region`, `cacheBust(el)`, plus `undo` / `cms` / `morph` /
`RichClay` / `quickcrop` when those plugins load. View mode keeps only the always-available members
(`toggleEditMode`, `isEditMode`, `isOwner`, `Mutation`, `region`, `ready`); edit-only members are simply absent.

**Satellites** — one script tag each, and each resolves its own `clay.loaded.*` promise. `clay-ui` adds
`toast`, `toastPersistent`, `ask`, `confirm`, `tell`, `snippet`, `modal`; `clay-utils` adds `clay.utils`
(`throttle`, `debounce`, `cookie`, `slugify`, `copyToClipboard`); `clay-internals` adds `clay.internals`,
the low-level surface for code that needs to sit *inside* the save lifecycle rather than call it.
`clay-events`, `clay-dom`, `clay-options` and `all.js` add HTML attributes and DOM helpers rather
than members on `clay`.

Every member, every attribute, and the endpoint spec: **[docs/reference.md](https://github.com/panphora/clayjs/blob/main/docs/reference.md)**,
also served at [clayjs.com/llms.txt](https://clayjs.com/llms.txt) and rendered as
[clayjs.com/docs](https://clayjs.com/docs).

## Regions

Mark parts of the DOM the save/sync engine should treat specially with one space-separated
attribute:

```html
<div clay="no-save no-snapshot freeze">…</div>
```

Tokens: `no-save`, `no-snapshot`, `no-trigger-autosave`, `no-dirty`, `no-watch`, `no-undo`,
`freeze`. Add `autosave` to `<html>` to save automatically on change.

`no-trigger-autosave` and `no-dirty` are the pair worth getting right. Both are saved in full and
neither starts an autosave. The difference is whether their content is *work*: a
`no-trigger-autosave` region holds real edits waiting for a manual save, so it warns you on close
and live sync will not overwrite it, while a `no-dirty` region renders itself from something else,
so it never warns and an incoming sync frame may replace it. Use `no-dirty` for filter bars,
projections and drag previews; use `no-trigger-autosave` for a heavy editor you save by hand.

## Repo map

**Everything in `entries/` is served under a version prefix on clayjs.com.**
`entries/clay.js` is `https://clayjs.com/v1/clay.js`, which rolls forward within major
version 1, and `https://clayjs.com/1.0.0/clay.js`, which never changes. Same for each
satellite. A saved document hardcodes its script URL and has no update channel, which is
why the version is in the URL and why a served path, once published, is permanent. Repo
paths are not: `build.js` flattens `entries/` into each prefix on the way out. `clay.js`
derives its own base URL from its script tag and imports `<base>/src/loader.js`, so `src/`
is public surface too and ships inside every prefix as its sibling.

| | |
|---|---|
| `entries/clay.js` | the bootstrap: everything starts here |
| `entries/clay-ui.js`, `-dom`, `-events`, `-options`, `-utils`, `-internals` | satellites, one script tag each |
| `entries/all.js` | `All(selector)`, a chainable `querySelectorAll` wrapper |
| `entries/sap.js` | reactive templating, **generated** from the `sapjs` repo |
| `entries/clay-data.js` | the HTML data API, **generated** from the `hyper-html-api` repo |
| `src/` | the implementation, and public surface by direct import |
| `conformance/` | the byte-exact gate: real browser, pinned Chromium, goldens from the spec |
| `tests/` | jest unit suite, fixtures, and a stub save server |
| `website/` | the source of clayjs.com |
| `docs/reference.md` | the full reference, served as `/llms.txt` |
| `build.js`, `wrangler.jsonc` | assemble and deploy `public/`, which is a gitignored build output |

## Develop

```bash
npm test                   # jest unit suite
npm run test:conformance   # byte-for-byte fixture gate, in a real browser
npm run dev                # stub save server on :4601 for the tests/fixtures pages
npm run build              # rebuild public/, the deploy output
```

Setup, the pinned-browser requirement, and the things about this repo that will surprise
you are in [CONTRIBUTING.md](https://github.com/panphora/clayjs/blob/main/CONTRIBUTING.md).

## License

Our code is MIT-0 (MIT No Attribution): use it, remix it, ship it, no attribution
needed. Vendored third-party files keep their original permissive licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Security reports go through
[the security policy](https://github.com/panphora/clayjs/blob/main/.github/SECURITY.md).
