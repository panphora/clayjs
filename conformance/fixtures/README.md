# Conformance fixtures — canonical home

These are the canonical Malleable HTML File conformance fixtures (spec §11). They are
the published arbiter of exact bytes: a conforming client must reproduce each fixture's
`snapshot.html` and `document.html` byte-for-byte from its `input.html`.

This directory is the single source of truth. The two client repos (hyperclayjs, clayjs)
keep a **checked-in copy** under `conformance/fixtures/` so their own CI can run the byte
gate without this workspace. Do not hand-edit those copies — edit here, then sync.

## Layout

```
fixtures/
  manifest.json         the fixture list both client suites iterate
  <name>/
    input.html          the source document
    snapshot.html       expected bytes after algorithm steps 1-6
    document.html       expected bytes after steps 7-8
```

`snapshot.html` / `document.html` are exact bytes: no trimming, no whitespace collapse,
no line-ending tolerance. LF only (each client's `.gitattributes` forces `eol=lf` so a
CRLF checkout cannot fail the compare on a non-bug).

## Syncing down to the clients

From this repo:

```
npm run sync-fixtures      # mirror canonical -> hyperclayjs + clayjs copies
npm run check-fixtures     # verify each client copy matches canonical (CI/pre-release guard)
```

`check-fixtures` exits non-zero on any drift. Per-repo CI does not run it (no access to
this workspace); it runs `test:conformance` against the committed copy.

## Regenerating goldens

The goldens are browser-serialization output, so they are generated **in a client** (which
has the browser and the snapshot module), then promoted back up here. Do this only when a
fixture's `input.html`/setup or the snapshot algorithm changes on purpose.

1. Edit `input.html` / `manifest.json` here; `npm run sync-fixtures` to push down.
   (Imperative setup lives in each client's `conformance/setups.js`, kept identical by hand.)
2. In **each** client: `npm run conformance:update` to regenerate its goldens.
3. Cross-verify the two clients are byte-identical — this is the real conformance check:
   `diff -rq hyperclayjs/conformance/fixtures clayjs/conformance/fixtures` must be empty.
4. Promote up: `cp -R hyperclayjs/conformance/fixtures/. malleablehtmlfile/fixtures/`
   then `npm run check-fixtures` to confirm both clients now match canonical.

The browser is pinned (Playwright Chromium, version-locked in each client's `package.json`)
so regeneration is reproducible across machines and CI.
