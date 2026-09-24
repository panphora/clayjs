# Changelog

## [1.4.0] - 2026-09-24

### Added
- ai-edit plugin that turns comments into AI edits
- Documentation for the ai-edit plugin
- Documentation for partial reprints and viewonly pages

### Changed
- Control state attributes are written only when a reload differs
- Managed attributes are saved in the author's original spelling
- Save verification failures print only the failing element
- Updated vendored hyper-morph to 0.5.4, which limits sync-ignore markers to the morph root

### Fixed
- A viewonly page no longer enters edit mode
- The host save token is stripped from saved bytes
- Text-only noscript content is written raw on save



## [Unreleased]

### Added
- Live-sync tabs share one connection on hosts advertising `sync-worker`. Hidden tabs release their subscriptions and resume with a document refresh. Older hosts and hosts with presence retain the direct transport, which now releases idle hidden-tab connections too.
- **`?plugins=source`: a save writes the file, not a fresh printout of it.** Every program that edits a malleable HTML file rewrites the whole file, because each one parses to a tree and serializes the tree back out, and a serializer does not reproduce its input. A save that changed nothing still rewrote about 88% of a hand-written document's lines: attributes reordered, quoting renormalised, `&` became `&amp;`, every tag reprinted canonically. Nothing was lost and the file was no longer the file anybody wrote, which made diffs unreadable, made an agent's formatting disposable, and manufactured most of the same-line collisions a concurrent editor has to merge.

  With the plugin, clay keeps the bytes the document was loaded from, pairs every live node to a byte range in them at boot, and on save copies source bytes for everything unchanged and prints only what changed. A no-edit save gives the file back byte for byte on every document it has been tested against, including thousands of generated ones saved again and again; where the renderer cannot reproduce one element exactly, that element is printed and the rest is still copied (below). An edit to one list row changes that row's line and no other. Single quotes stay single, unquoted values stay unquoted, attribute order is the author's, a bare `&` is left alone, indentation is untouched, and a `<pre>` keeps the leading newline that the HTML serializer cannot preserve.

  **The floor is the behaviour it replaces.** Every save is reparsed and compared against the page, node for node, before anything is sent. A difference names the node where it starts, and that element is printed the way the browser would print it while everything around it is still copied; the render is checked again, widening to the parent while it still fails. Only a failure that reaches `<html>`, or one with no element to point at, sends the ordinary full serialization. So does a render that throws, and every save on a page where the plugin never installed. `clay:save-reprinted` fires for each accepted save that needed either, with `detail.scope` `'partial'` or `'full'`, and `clay.source.stats()` counts them apart as `partialReprints` and `reprints`. Both are counted when the host accepts the save, not when it is rendered, so an autosave with nothing to send or a save the host refused counts nothing. A fallback nobody can see is how a reprint stays in the code for a year. The comparison is deliberately exact and shares no predicate with the renderer: a verifier that reuses the renderer's idea of what matters cannot see the renderer's mistakes, and an earlier version of this design proved it by writing `by <a>Ana</a> <a>Bo</a>` back as `AnaBo` with a green check.

  It installs nothing and changes nothing when the request for the file's own bytes fails, redirects, is not `text/html`, or returns a document whose doctype and document-level comments are not this one's. That last check is the only guard on the region no tree comparison can reach, since a tree comparison starts at `documentElement`: without it, a boot fetch that answered with an error page could write that page's doctype into somebody's file.

  **On by default, in edit mode.** It is not free: an HTML parser (parse5, about 48 KB compressed) and one extra request at load, both in edit mode only. It is on anyway because the fallback rate it will be judged on can only be collected from real pages, and a plugin nobody enables produces no number to judge. `?exclude=source` turns it off and gets the previous behaviour back exactly.

- **`clay.source.locate(el)` and `clay.source.text()`: where a live element is in the file.** `text()` hands back the bytes clay believes are on disk right now, and `locate()` hands back `{ from, to, line, column }` for a live element in those same bytes. Together they are what an editing tool needs beyond the save itself: read the file as it will be written, point at something in the live page, and express the change as a range in the file rather than as a DOM mutation. No ids written into the document, no map that has to survive a reload, no patch list to keep in step. Both are lookups over data the save path already builds.

  **The offsets and `column` are UTF-16 code units into `text()`, not bytes.** Slicing the string `text()` returns is exact. The same numbers handed to something that counts bytes write to the wrong place, silently, and only on documents with non-ASCII content: one line of `café 🎉 naïve` puts the same position at 51 code units and 55 bytes.

  `locate()` answers `null` rather than guessing, and the reasons are worth telling apart. The element was created after load, so it is not in the file yet; or it is an implied `<html>`, `<head>` or `<body>` the author never wrote and that holds nothing, so there are no bytes to point at; or the plugin never installed, which makes the answer missing for the whole document rather than for that one element. `stats().installed` and `stats().refused` separate the last case from the first two.

### Fixed
- **A document containing one `<noscript>` would have fallen back on every save, forever.** The block is the one place where the answer depends on a flag neither half of the check controls. A browser parsed the page with scripting enabled, so the live tree holds the block's markup as a single text node; `DOMParser` always parses with scripting disabled, so reading the rendered bytes back turns that same markup into elements. The two trees could never agree, so the comparison rejected a render that was in fact exactly right, and the counter stage 2 reads would have carried a permanent false alarm. The comparison now hands both sides' content to one parser and compares the trees that come back, which is exact rather than tolerant: anything changed inside the block still changes the tree its markup parses to. Only Chromium could find this, and no file in the 198 document sweep contains a `<noscript>` at all.
- **A file could GROW on every save with the verifier green, in two shapes.** Both wrote the same bytes twice, and in both cases the duplicate was invisible to the tree comparison, so it accumulated silently: a page with `xmlns:xlink` grew by 59 bytes per save and one with a `<form>` written directly inside a `<table>` by 18. The first is a parse5 detail: it renames a foreign-content attribute in the tree, so `xmlns:xlink` arrives as name `xlink` with prefix `xmlns`, but keys its location map, as the DOM keys `attr.name`, by the name as written. Looked up by the renamed one, the attribute had no source range, its bytes were copied inside the surrounding run anyway, and the live copy was appended as if it were new. The second is a parser rule: a `<form>` inside a `<table>` is inserted and popped in one step, so nothing ever closes it and its reported end offset stays at its own `<`, which rewound the parent's copy cursor behind the tag it had just emitted.
- **The render is now also checked for parse errors the source does not have.** A parser discards some input rather than representing it, so a tree comparison cannot see it by construction: a repeated attribute is dropped during parsing, and a render that wrote one twice reparses to exactly the right tree. Counting, not presence, because real documents do already parse with errors and copying those back is correct.
- **An unquoted attribute value ending in `/` was corrupted.** An unquoted value ends at whitespace or `>`, never at `/`, so `<a href=x/>` has the value `x/`. That slash was read as the tag's own self-closing slash, cut off the copied value and written again before the `>`, giving `<a href=x//>`.
- **A CRLF file grew a blank line on every save that reprinted a text node.** The parser rewrites CRLF to LF before a text node ever sees it, so the check that strips whitespace the parser relocated past an end tag was comparing a normalized value against raw bytes and never matched. An unedited CRLF file was unaffected, and still keeps its CRLFs exactly.
- **Boot and every incoming live-sync frame ran the page's own `[onbeforesave]` and `[onbeforesnapshot]` handlers, and closed the undo batch.** Pairing inspects the page; it is not a save. Closing the batch split the user's undo history at a point they did not make, and the handlers are page-author JavaScript that was running once per frame instead of once per save.
- **A re-model the source check refused took the re-pair down with it.** The two fail independently now. A morph replaces live nodes, so the map has to be rebuilt whether or not the newly saved bytes modelled; skipping it left the map keyed by nodes no longer in the page, and every save after that reprinted the whole document.
- **Adding content at the end of `<body>` grew the file on every save, and so did adding it after an element left unclosed.** In the tree, whitespace after `</body>` and `</html>` belongs to the last text node inside body, so an element appended after that node wrote the whitespace a second time. The render now puts it back where the file had it. An element whose end tag the author left out, such as a final `<li>` or `<p>`, now gets its end tags written when something new follows it, so the new content does not parse inside it.
- **Attributes from a second `<body>` tag were written again on every save.** The parser merges them into the first `<body>`, where they have no bytes of their own, so they were appended as new each time.
- **Content rebuilt after load was printed even when nothing in it changed.** A `[freeze]` restore, a `[persist]` textarea and any `innerHTML` rebuild hand the save new nodes for content the file already holds. They are now matched to the file by exact content and copied.
- **A save with no edits rewrote attributes clay manages itself.** `inert-onclick=""` was saved as `inert-onclick="null"`; `inert-contenteditable="FALSE"` was made editable and saved back lowercased; `disabled="disabled"` on a `viewmode:disabled` input came back as `disabled=""`; and a `[persist]` input with no value gained `value=""`. Each is now written only when a reload would differ, and in the author's spelling.
- **A live-sync frame from disk left the source map describing the old file**, so this tab's next save copied the old formatting back over the other writer's. The disk frame's `clay:sync-applied` detail now carries `html`, the bytes now on disk, and the source map models them.
- **The host's save token went out in every save body.** htmlclay strips it on arrival, so it never reached disk, but the source map models the bytes a save sent and so described a root tag one attribute longer than the file. It is now removed before sending. The document id is kept, since htmlclay keeps it on disk.
- **`clay.source.text()` and `locate()` could answer for the file as it was before the last save**, because the model's refresh waited for an idle callback. They now run a waiting refresh first.
- **Two document shapes are now refused at install instead of rendered:** one the parser foster-parents content out of a `<table>` in, where the tree order and the byte order disagree so no forward copy of the source can be right, and one with no content inside `<html>` at all. Both already fell back on every save.
- **Nodes inside a `<template>` had no snapshot provenance.** A template's children are not its `childNodes`, they are its content fragment's, and the walk that pairs each clone node to the live node it came from stopped at the element. Nothing depended on it until now; `originalSnapshotNode` simply returned `null` for everything inside a template.
- **In Chrome, a save without the source plugin escaped every `<noscript>`.** The page holds a `<noscript>`'s markup as raw text, but the save serialized a copy in a document with no window, where the browser escapes it: `<p>` reached the file as `&lt;p&gt;`, a reload showed it as literal text, and each later save escaped it again. The same happened on any save the source plugin sent as a full serialization. Text-only `<noscript>` content is now written raw, as the page holds it.

## [1.3.0] - 2026-09-06

### Added
- **A stack of avatars showing who else is on the document.** One circle per participant the host named, initials inside, solid for somebody who can change the document and hollow for somebody reading it, plus a chip counting everyone the host did not name. It sits in the top right corner, and it appears only once there is more than one person on the page: somebody alone is told nothing at all. Who gets a name is the host's decision, taken per recipient from that recipient's own access. Nothing in the library asks for a name and nothing in it can widen what arrived. A full name reaches the DOM in one place, the hover label, and it is held in a closure until a pointer is actually on the circle.

  **Nothing this draws is ever saved, and nothing it draws reaches another tab.** Every element it creates carries `no-save no-watch no-snapshot`, the hover label included. `no-save` alone would have leaked: `captureForSaveAndComparison()` clones the document, hands that clone to peers on `clay:snapshot-ready`, and strips the save-only regions only after that, so a name kept out of the file still reached every peer on the document, including the visitor the host had deliberately answered with a count and no names. `no-snapshot` is the token that runs before the clone is emitted, which is why all three are on every root, and why the release-blocking test asserts that with two named people on screen neither name nor either roster id appears in `forSave` or in the clone peers receive.

  **It is gated on the host, not on the first frame.** A host that does not list `presence` among its discovery extensions draws nothing at all rather than an empty stack, which is what hyperclay-local, HTML Clay and makerclay do today. Read the absence as this release working correctly on those hosts, not as a fault, and it stays that way until they adopt the capability.
- **A notice when somebody else changes the part you are reading.** One dismissible line, `<name> changed this section`, shown when an applied live-sync frame carrying an author actually changed the editable region this reader was working in. Both of the obvious tests are wrong: every frame morphs `document.documentElement`, so "an ancestor was morphed" makes `body` an ancestor of everything and reports every unrelated edit anybody makes anywhere, and "an ancestor was replaced" misses the common case, because hyper-morph matches and mutates in place when a peer retypes a sentence. So the region's own content is compared across the morph instead. The baseline is recorded when the reader focuses the region and refreshed while they type, so their own keystrokes are never read as somebody else's edit, and it is re-recorded on every applied frame, named or not, so a change nobody is named for cannot be charged to whoever comes next.

  It is silent for this tab's own edits, for a frame carrying no author, for a frame the peer path held, and for a frame equal to what the page already has. It is silent on the saved lane by construction rather than by a rule of its own: the server stamps an author on live lane frames alone, so a visitor reading a public page is never told who wrote it. It offers `Dismiss` and nothing else, since an undo here would mean recovering displaced local work, which nothing in this library builds; unsaved local edits are already protected before the morph. It carries the same three runtime tokens as the avatar stack, for the same reason.
- `clay:sync-applied` carries `by`, the `{ id, name }` the host stamped on the frame that just applied, or `null` on a frame nobody stamped. It rides on the event rather than on the frame's arrival because a frame that held returns before the event fires, so nothing can name an author for a change this tab never took.

### Changed
- Both live-sync stream addresses now carry `client-id`, in the same kebab spelling as the rest of the query. It is the tab's own sender id, the value every outbound frame already carried and the one the host has been reading, so a host that reads it at admission knows the connection by the value its frames arrive under, and can tell two tabs of one signed out guest apart. A host that does not read it ignores an unknown parameter.

## [1.2.0] - 2026-08-29

### Breaking Changes
- **The save token is read under one name, `savetoken`.** `htmlclaytoken`, the pre-rename spelling, is no longer accepted as a credential and no longer turns edit mode on. Spec §9 names one save-token attribute, and carrying a second name in the save path indefinitely was the alternative, since "wait until every old host is gone" is a condition nobody measures.

  **This breaks documents served by HTML Clay 1.8.0 or earlier**, which inject only the old name. On those, the page stays editable, because that host also sets the edit-mode cookie, and every save fails: it posts to the bare `/_/save`, which that host does not route. **Upgrade HTML Clay to 1.9.0 or newer**, which serves both names and is the fix for every document at once. The library now says exactly this in the console when it finds the old name, rather than letting the page look like it is saving.

  The old name is still stripped from every save and still kept out of an incoming live-sync morph. What a host injects has to be removed whether or not this library reads it, or a live credential ends up written into a document or handed to another tab.

### Added
- **A notice when a save is refused.** A document whose host said no used to look exactly like one saving fine, while autosave sat suspended: the status chip that would have said so is a plugin, off by default, so most documents showed nothing at all. Core now shows one bordered line at the bottom of the page, "This page changed elsewhere. Your edits here are safe, and nothing will be overwritten until you choose.", offering `Load theirs` or `Keep mine`. It leads with the reassurance because that is what a person needs first: the bar arrives unannounced, and an opening clause about saving being paused reads as a failure when nothing has failed. Discarding arms for five seconds before it fires, since it is the only control here that destroys work with no undo, and Escape backs it out. Every declaration is set with `!important`, because a plain inline style loses to an author rule that carries one and `button { ... !important }` is something real pages do.
- **A notice when the host is too old to save.** A document served by HTML Clay 1.8.0 or earlier posts to a route that host does not have, so this library now says so on the page instead of letting the save fail silently. It stays off an explicitly editable page, since `?editmode=true` is a person at the keyboard asking and outranks the check.
- **A save that returns an `etag` sends the stamp on to the other editors,** carrying the bytes it just saved. A tab adopts a stamp only as part of applying the content that stamp describes, so no tab can come to believe it is in step with disk on the strength of a message that arrived before the content did. A receiver whose baseline already matches records the stamp and skips the morph, which is the common case.

### Changed
- **A save that times out is now recovered from, not guessed about.** Every save carries a `Save-ID`, an opaque id for that one attempt (spec §6, `receipts`). When a save times out, this library asks the host what became of it. If the host answers with that id, the write landed and the save is reported as the success it was, with nothing shown to anybody. Otherwise the save is sent again carrying the **original** `If-Match`, and the host settles it: nothing written means the stamp still matches and the save goes through; a write of this tab's own that landed after all means a refusal carrying its own receipt, which is recognised and finished quietly; and somebody else's write means a refusal carrying their bytes, which is the one case a person is shown.

  What this replaces was a guess in both directions. Taking the host's current stamp assumed the timed-out write was this tab's own, and the times that assumption is wrong are exactly the times someone else wrote, leaving the tab holding a stamp for bytes it had never seen and overwriting them on its next save with no refusal and no notice. Refusing to assume anything was safe but showed a conflict notice for a few seconds of bad wifi, which is nearly every timeout.

  Against a host that does not announce `receipts`, or one that cannot be reached at all, the older behaviour stands unchanged: the stamp is kept, the next save is refused rather than accepted, and the notice says the refusal may be answering the person's own timed-out save unless the host named a `changedBy`.
- **A refusal that is answering this tab's own earlier save is no longer reported as a conflict.** A `412` whose `saveId` this tab recognises is the host saying a late duplicate of this tab's own save is what moved the document. The stamp from that refusal is adopted and the save is sent again, rather than telling somebody they are in conflict with themselves.
- **A save queued behind one whose outcome is unknown waits instead of going out.** It used to be sent as soon as the timed-out save resolved, where it was refused, which is how a conflict notice appeared seconds after a person typed, unprompted, over what was really a network problem. The queued bytes are kept and still dirty, so they go out with the next save.
- `savetoken` is the documented name of the save token, in the reference and across the site.

### Fixed
- A document's durable file identity is no longer read as a save token. `documentid` and `htmlclayid` are injected by the host exactly as a token is, and need the same protection from an incoming morph, but they are not credentials and they do reach disk. They shared one list with the token spellings, so `saveToken()` returned an identity whenever the host had minted no token of its own, and the library posted to `/_/save/{id}` with credentials omitted and showed edit mode to every visitor. Identities have their own list now: still stripped before a save, still kept out of a peer's morph, never read as a credential.
- **The commit relay sends the bytes that save actually stored.** It read the last relay that completed, which lags the save whenever the response beats the 150ms send debounce, so a fast save fanned out old content carrying the new stamp. A peer applied those bytes, adopted that stamp, and its next save overwrote the newer version with `If-Match` matching all the way. The serialization captured for each save is now held through that save and paired with the stamp its own response carried, and the stamp is recorded after the morph rather than before, so a failed apply cannot leave a tab claiming a version it does not hold.
- **A disk change adopts the stamp on the frame rather than asking the host for one.** HTML Clay 1.9.0 sends the version stamp along with the changed content; a tab used to apply the change and then ask `/_/meta`, which answers about whatever is stored at that later moment, so a second write landing in between left the tab holding a stamp for bytes it had never seen. Frames that carry no stamp, an older host or a change too large to send inline, still fall back to asking.
- A bare stamp arriving with no content is dropped rather than adopted. It asserts "you are in step with disk" on no evidence: a stamp can outrun the content it describes, and a tab that recorded it would then overwrite the other save with its own older bytes on the next autosave, matching `If-Match` all the way.
- A stamp is no longer left stale after a live-sync hold clears. The guard re-seeds from the host, and only when both lanes are clear, since a background re-seed that could clear the stamp must never quietly drop the protection.
- The status chip drops its own `conflict` state rather than core learning that a plugin exists.

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


