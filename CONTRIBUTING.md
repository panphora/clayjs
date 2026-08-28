# Contributing

Issues and pull requests are welcome.

## Setup

```bash
npm ci
npx playwright install chromium
```

CI runs Node 26. The Chromium install is not optional: the conformance suite compares
bytes against goldens produced by one pinned browser build, so a different Chromium
produces different bytes and fails on a non-bug. The version is locked by the `playwright`
pin in `package.json`, which is what keeps your machine and CI in agreement.

## The two test lanes

They test different things and both have to pass.

```bash
npm test                   # jest, jsdom, tests/unit/ — behavior
npm run test:conformance   # web-test-runner, real browser, conformance/ — exact bytes
npm run test:standalone    # web-test-runner, real browser, the single-file build
npm run build              # assembles public/, asserts the deploy output is complete
```

The unit suite covers logic. The conformance suite is the byte gate: it runs each fixture
in `conformance/fixtures/` through the snapshot algorithm and compares the output
byte-for-byte against a committed golden, with no whitespace tolerance. It is how clayjs
proves it agrees with the Malleable HTML File spec, and with the other client
implementation.

**Do not hand-edit anything under `conformance/fixtures/`.** That directory is a
checked-in copy of the canonical fixtures, which live in the spec repo and are synced
down one way. Its own README explains how goldens get regenerated and promoted back up.

To work against a live page, `npm run dev` starts a stub save server on port 4601 that
serves the repo and accepts saves, writing them into `tests/tmp/` rather than back over
the source file. The pages in `tests/fixtures/` are built to run against it.

## Things that will surprise you

**Every file in `entries/` is a permanent public URL.** `build.js` flattens that directory
to the root of the served site, so `entries/clay.js` is `https://clayjs.com/v1/clay.js`.
Documents people have already saved hardcode those URLs in a script tag and can never be
updated, so the served name of a file in `entries/` can never change, and neither can
`src/`: `clay.js` derives its own base URL from `document.currentScript.src` and imports
`<base>/src/loader.js` from it. Renaming inside `entries/`, or moving `src/`, breaks every
document ever authored.

**Two of those entries are generated.** `entries/sap.js` and `entries/clay-data.js` are
built in sibling repositories (`sapjs` and `hyper-html-api`) and copied here by their own
`npm run copy-to-clayjs`. Edit them there. The same goes for everything in `src/vendor/`.

**`public/` is a build output.** It is gitignored, deleted and rebuilt from scratch on
every build, and never edited by hand. Its contents are derived from the `files` list in
`package.json` plus `website/`, and `files` lists `entries/` as a whole, so shipping a new
satellite means dropping the file into `entries/` and nothing else. The npm surface is
derived the same way: `exports` maps `./*` into `entries/`, so a new satellite is reachable
as `@panphora/clayjs/<name>.js` with no second edit. That derivation is deliberate: a
hand-copied mirror drifted once and the deployed `clay.js` could not boot.

**`dist/` is a build output too.** `npm run build:standalone` writes `dist/clay.standalone.js`,
the single-file build, with esbuild from `src/standalone.js`. It is gitignored, rebuilt
by `npm run build` and before publishing, and shipped in the tarball. `src/standalone.js`
is the twin of `entries/clay.js`: the same bootstrap, with the loader bundled in instead
of imported at runtime. A change to one bootstrap is a change to both.

**The docs are checked by tests.** `tests/unit/docs-contract.test.js` asserts that every
loadable plugin, every `clay.*` member the loader attaches, and every region token is
mentioned on the site and in the README. Adding a plugin or a public member means saying
so in the docs, or the suite fails.

## Pull requests

Keep them scoped to one thing, with a sentence on what breaks without the change. If it
changes behavior, it needs a test. If it changes what gets written to a saved file, it
needs a conformance fixture.

## License of contributions

This project is MIT-0. By submitting a contribution you agree it is licensed under MIT-0,
the same terms as the project, with no other conditions.
