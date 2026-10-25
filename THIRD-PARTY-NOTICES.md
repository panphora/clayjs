# Third-party notices

Our own code in this repository is licensed under MIT-0 (see LICENSE): use it,
remix it, ship it, no attribution needed. The components below are third-party,
or carry third-party code, and keep their original licenses.

## SortableJS 1.15.6 (MIT)

- File: src/vendor/Sortable.vendor.js
- Copyright (c) SortableJS contributors
- https://github.com/SortableJS/Sortable

## Squire 2.4.8 (MIT)

- Carried inside src/vendor/richclay.vendor.js (richclay bundles Squire)
- Copyright (c) 2011-2023 by Neil Jenkins
- https://github.com/fastmail/Squire

## DOMPurify 3.4.11 (Apache-2.0 OR MPL-2.0)

- Carried inside src/vendor/richclay.vendor.js (richclay bundles DOMPurify)
- (c) Cure53 and other contributors
- https://github.com/cure53/DOMPurify

## parse5 7.3.0 (MIT)

- File: src/vendor/parse5.vendor.js (the `parse` export only, bundled by
  scripts/build-parse5-vendor.mjs)
- Used by the `source` plugin, which needs a spec-conformant parse that reports byte
  offsets. No browser exposes one: DOMParser builds the same tree and reports no
  offsets at all.
- Copyright (c) 2013-2019 Ivan Nikulin and contributors
- https://github.com/inikulin/parse5

## Prism 1.29.0 (MIT)

- File: website/prism.min.js (core + markup, css, clike, javascript, bash), used
  only to highlight the code samples on clayjs.com. Not part of the library.
- Copyright (c) 2012 Lea Verou
- https://github.com/PrismJS/prism

## MicroModal (MIT)

- The modal component in src/ui/modal.js derives its structure and class naming
  from MicroModal.
- Copyright (c) 2017 Indrashish Ghosh
- https://github.com/ghosh/Micromodal

## Phosphor Icons (MIT)

- File: the eye icon in src/core/conflict-notice.js
- Copyright (c) 2020 Phosphor Icons
- https://github.com/phosphor-icons/core

## Yjs 13.6.27 and lib0 0.2.119 (MIT)

- File: src/vendor/yjs.vendor.js (bundled by scripts/build-yjs-vendor.mjs)
- Copyright (c) 2023 Kevin Jahns
- https://github.com/yjs/yjs, https://github.com/dmonad/lib0

## Highlights from Pierre 0.2.0 (Apache-2.0)

- File: src/vendor/pierre/pierre.vendor.js (bundled by scripts/build-pierre-vendor.mjs)
- Copyright (c) The Pierre Computer Company
- https://github.com/pierrecomputer/pierre/tree/main/packages/highlights

## Cheerio 1.2.0 (MIT)

- Bundled into dist/server/rooms.cjs by scripts/build-server-rooms.mjs, the Node
  room core behind @panphora/clayjs/server/rooms.
- Copyright (c) 2022 The Cheerio contributors
- https://github.com/cheeriojs/cheerio

## OverType 2.6.1 (MIT)

- File: compat/overtype-2.6.1.min.js, the classic build an older Journal loads from
  https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js; license at
  compat/overtype-LICENSE, bytes pinned in compat/journal-assets.lock.json
- Copyright (c) OverType contributors
- https://github.com/panphora/overtype

## highlight.js 11.9.0 (BSD-3-Clause)

- File: compat/highlight-11.9.0.min.js, the classic build an older Journal loads from
  https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js; license at
  compat/highlight-LICENSE, bytes pinned in compat/journal-assets.lock.json
- Copyright (c) 2006 Ivan Sagalaev
- https://github.com/highlightjs/highlight.js

## First-party vendored modules

The remaining files in src/vendor/ (hypercms, hyper-morph, hyper-undo, quickcrop,
control-serialize) and the generated sap.js and clay-data.js are our own sibling
libraries. clayjs also derives from our own hyperclayjs library (MIT); as the
copyright holder of those portions we license them here under MIT-0 with the rest
of our code.
