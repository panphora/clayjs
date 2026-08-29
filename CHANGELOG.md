# Changelog

## [1.1.0] - 2026-08-28

### Added
- `clay.standalone.js`: the whole library in one readable file, for pages that must load with no network. Core, every plugin, every satellite and every vendored library, built from the same source by esbuild (`npm run build:standalone` writes `dist/clay.standalone.js`). Served at `https://clayjs.com/v1/clay.standalone.js` and under every pinned prefix from this release on, shipped in the npm tarball at `dist/`, documented at [clayjs.com/offline](https://clayjs.com/offline). It takes the same `?plugins=` and `?exclude=` params; they decide what runs, not what downloads. Every `clay.loaded.*` satellite promise exists without its own tag.
- `npm run build:standalone` regenerates the file alone; `prepack` builds it so every tarball carries it; pasted inline into a page it boots with the defaults.
- Conditional saves. On a host whose discovery meta lists `conditional`, every save carries `If-Match` with the etag this tab last saw, and a 412 is a refused save, not a failed one: the host wrote nothing. Autosave holds until a save lands; `clay.save.overwrite()` sends this tab's version unconditionally. Live-sync stamp frames carry the etag, so a tab in step with the document takes each new stamp while a held tab keeps its old one, and a cleared hold asks the host for the current stamp.
- A save-conflict notice: one line at the bottom of the page when a save is refused, with the two answers (keep this version, take the other). It is core, not a plugin, since the status chip that would otherwise say so is off by default.

### Changed
- The loader imports each module through a table of literal imports (`MODULES` in `src/loader-logic.js`) instead of computing `import(base + "/src/" + path)` at runtime, which is what lets a bundler see the graph. The URLs a page fetches from clayjs.com are unchanged. `boot()` keeps its `base` parameter, now unused: the entry and the loader are cached independently under `/v1/`, so the call shape between them cannot change.
- `sortable` imports its vendored Sortable by literal path too, so a bundler can see it; it reads `window.Sortable` with the module's default export as the fallback, whichever branch the UMD header takes. `src/lib/load-vendor-script.js` lost its last caller and is gone.
- The hypercms vendor bundle is updated.

### Fixed
- The sync serializer no longer reorders the root element's attributes. It stripped the tab-local ones and set them again afterwards, which appended them, so every save installed a baseline whose `<html>` tag never matched the live one again. On htmlclay, which splices its token in right after `<html`, that meant a close warning on every already-saved document and a full capture plus live-sync broadcast on every no-op autosave. The open tag is now serialized from a childless copy.

## [1.0.0] - 2026-08-27

### Breaking Changes
- **`https://clayjs.com/clay.js` is retired and returns 404.** Every clayjs URL now carries a version. `https://clayjs.com/v1/clay.js` serves the newest 1.x release and rolls forward within major version 1. `https://clayjs.com/1.0.0/clay.js` serves that exact release and never changes. Both forms exist for every satellite, so `/v1/clay-ui.js` and `/1.0.0/sap.js` replace `/clay-ui.js` and `/sap.js`. A saved document hardcodes its script URL in a `<script>` tag and has no update channel: no package manager, no lockfile, no way to reach it. The version has to be in the URL before those documents exist, not after.
- The npm tarball layout changed: the ten public scripts sit at `entries/<name>.js` rather than at the package root. `package.json` declares an `exports` map, so `@panphora/clayjs/clay.js`, every satellite subpath, and `src/*` all keep resolving. A URL that addresses the tarball path literally does not: `cdn.jsdelivr.net/npm/@panphora/clayjs@<version>/clay.js` is now `.../@<version>/entries/clay.js`.

### Added
- The entry scripts step out of an `entries/` path segment before resolving `src/`, so a CDN that serves package paths literally, jsDelivr and unpkg included, loads the module graph straight from the npm tarball. clayjs.com stays the documented CDN, and nothing changes there: `build.js` flattens `entries/` into each version prefix, so the segment never appears.
- `clay-editable`, `clay-persist` and `clay-autosave` are read everywhere the bare names are, with identical behaviour down to the option tokens, and are deliberately undocumented. clayjs spells its attributes without a prefix on purpose, but a saved document hardcodes them and can never be reached to migrate. These spellings exist in every 1.x build so that a file written today could be repaired by adding one attribute if a bare name ever stops being ours. An escape hatch added after a collision would be worthless.
- Pinned version prefixes are immutable, served with `Cache-Control: public, max-age=31536000, immutable`. `/v1/` keeps a short revalidated cache, because it rolls.
- `build.js` rebuilds every previously published version from the npm registry on each build, so shipping a new release can never make an older pin disappear, and it derives the rolling prefixes from every version that exists rather than from the working tree's own, so `/v1/` keeps serving the newest 1.x after 2.0.0 ships. Tarballs are cached locally, so a normal build stays offline.
- `public/versions.json` lists what is served: the latest release, what each rolling prefix points at, and every pinned version.
- `examples/notes.html`, a complete self-saving page you can download and open. `examples/README.md` covers the three ways to give it a save host: HTML Clay, hyperclay.com, or your own route.
- `docs/reference.md`, the full API reference, now in the repository. It is still served at `https://clayjs.com/llms.txt`.
- `.github/SECURITY.md`, plus `keywords` and `bugs` in `package.json`.

### Changed
- The repository top level went from 30 rows to 19. The ten public scripts moved into `entries/`, the jest configuration folded into `package.json`, the web-test-runner configuration into `conformance/`, and the Cloudflare `_headers` file into `website/`. None of this moves a served URL: `build.js` flattens `entries/` into each version prefix.
- README rewritten for a first-time reader; the reference material it carried is now `docs/reference.md`.
- CONTRIBUTING covers the repository layout, which files are generated and by which sibling repository, and how to run each test suite.
- `.gitattributes` marks the two generated bundles and the vendored sources, so GitHub stops counting 65 KB of minified vendor code as authored JavaScript.

### Fixed
- `build.js` refuses to produce a broken `public/` instead of exiting 0 with one. A registry read that fails for any reason other than "not published yet" now stops the build rather than silently emitting a site with every pinned URL deleted, and the local tarball cache is a second record of what was pinned, so a momentary registry lapse cannot drop one either. A version's bytes come from its published tarball as soon as it exists on the registry, so a deploy made between publishing and bumping the version can no longer rewrite an address advertised as immutable for a year. A prerelease in `package.json` is rejected outright: it would have taken `/v1/` from the released version and minted a pinned URL that vanished on the next build. Tarballs unpack into a staging directory and are renamed into place, so an interrupted extraction cannot be trusted forever as a complete release.
- The generated `_headers` rules name the path Cloudflare actually serves. Pages are served extensionless and the `.html` spelling answers with a 307, so rules naming only the file landed on the redirect and the pages themselves carried no `Cache-Control` at all. `build.js` also stops the build before the rule count reaches Cloudflare's limit of 100, which it would otherwise cross on its own after about forty releases and start silently ignoring rules.
- The entry scripts strip the query and the fragment before deriving their base URL. `clay.js?next=/a/b` split the base inside the query string and imported a path that does not exist, so the library never booted. The `entries/` step-out is now asked of the URL's pathname, so a host merely named `entries` is no longer mistaken for that directory and sent to another origin.
- **A custom element carrying a bare `editable` attribute is no longer turned into an editor** (richclay 0.3.0). `editable` is a common boolean property name on web components, where it means whatever that component decided and never rich text; clayjs was making such an element's rendered output typeable and writing that output into the author's file. The test is exact, since a custom element's tag name always contains a hyphen, and `clay-editable` is how one opts back in.
- The homepage loaded the retired unversioned `/clay.js`, which 404s. The script that follows it reads `window.clay.ready` without a guard, so the whole inline block threw and the demos, the mode toggles and the configurator did nothing.
- `THIRD-PARTY-NOTICES.md` cited `website/vendor/richclay.min.js`, a file that no longer exists.
- The README's description of what `build.js` emits was out of date.

## [0.7.4] - 2026-08-26

### Changed
- Site: clearer wording on the get-started page for how HTML Clay, the desktop host, is licensed. clayjs itself is unchanged and remains MIT-0.



## [0.7.3] - 2026-08-25

### Changed
- Update clayjs



## [0.7.2] - 2026-08-23

### Changed
- Listeners now receive the causing frame



## [0.7.1] - 2026-08-23

### Changed
- Update the vendored clayjs build

### Fixed
- Give the conformance hooks a realistic timeout so they no longer fail on slow runs
- Bound the CI job runtime and unblock the browser install on Node 26



## [0.7.0] - 2026-08-22

### Changed
- License: relicensed to MIT-0 (MIT No Attribution). Same rights, attribution no longer required for our code; vendored third-party files keep their original licenses (see THIRD-PARTY-NOTICES.md).
- Update quickcrop vendor to v1.1.0
- Update clayjs

### Fixed
- Split autosave and dirty-check comparison baselines



## [0.6.1] - 2026-08-19

### Changed
- Update hypercms vendor bundle
- Update clayjs



## [0.6.0] - 2026-08-18

### Changed
- Update clayjs

### Fixed
- Skip strip-from-comparison regions in the dirty gate



## [0.5.0] - 2026-08-17

### Added
- Scoped live sync so dirty regions survive incoming peer and disk frames

### Changed
- Updated the clayjs bundle
- Updated the hypercms vendor bundle

### Fixed
- Blockers in scoped live sync found during final review



## [0.4.3] - 2026-08-15

### Added
- CI test runs on Node 26



## [0.4.2] - 2026-08-15

### Changed
- Update clayjs



## [0.4.1] - 2026-08-14

### Changed
- Update clayjs



## [0.4.0] - 2026-08-12

### Added
- `clay.addDocumentTransform` for modifying the document before save

### Changed
- Updated clayjs

### Breaking Changes
- Removed the `window.hyperclay` compatibility shim


