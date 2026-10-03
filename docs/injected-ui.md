# Injected UI

ClayJS draws some UI of its own onto pages whose stylesheets it does not control: the
conflict and refused-save notice, toasts, dialogs, the save indicator. That UI has to
look the same everywhere, on a page whose CSS is free to fight back. This page explains
how its styling holds, where its values come from, and which surfaces use it.

## Why every declaration is inline and `!important`

A page that restyles every `button` with `!important` is ordinary, and a plain inline
style loses to it. Only an inline `!important` outranks an author `!important`, so every
declaration ClayJS puts on its own UI goes on inline with `!important`
(`src/lib/hostile-css.js`). The first browser run of the conflict notice had both of its
buttons repainted in the host page's colours and font, which is the reason this is not
negotiable.

Each injected element additionally:

- starts from `all:initial`, then restores `color-scheme`, `direction` and
  `unicode-bidi`, which that reset also wipes;
- carries `clay="no-save no-watch no-snapshot"`, so it never reaches the saved file and
  never triggers a save;
- uses no classes and no ids, so no author selector can single it out.

## Where the values come from

`src/ui/bevel.js` is generated, not written. Its source is `../bevel/bevel.css`, the
Bevel design system in a sibling checkout, reduced to the recipes in
`scripts/bevel-manifest.mjs` by `scripts/build-bevel-subset.mjs`:

- `npm run build:bevel` regenerates `src/ui/bevel.js`.
- `npm run check:bevel` prints whether the checked-in module is in sync, and when the
  sibling source is absent it validates the checked-in module instead and passes with
  `source not available, checked-in src/ui/bevel.js used`.

Every `var(--bevel-*)` is resolved to its literal `light-dark(...)` value before the
module is written, so a host rule such as `* { --bevel-ink: red !important }` cannot
recolour the UI through custom properties. Fonts are plain system stacks, not webfonts.

The manifest is the closed list of recipes; nothing else in `bevel.css` is copied. The
generator refuses, naming the recipe it was working on, when it meets a `var()` it
cannot resolve, a rule under `@supports`, `@container` or another conditional at-rule, a
nested rule, or two rules for one selector that disagree about a declaration.

Never edit `src/ui/bevel.js` by hand: the next build overwrites it. To add a recipe, add
an entry to `scripts/bevel-manifest.mjs`, run `npm run build:bevel`, and add a test to
`tests/unit/bevel-subset.test.js`.

## Controls

`src/ui/bevel-controls.js` builds the elements.

- `RUNTIME_ONLY` is the `clay` attribute value every control carries
  (`no-save no-watch no-snapshot`).
- `bevelButton(label, { variant, small, onClick, extra, labelExtra, onState })` returns a
  `<button>` wrapping a label `<span>`. `variant` is `default`, `primary`, `quiet` or
  `danger`; `small` shrinks type and padding; `onClick` runs on click while the button is
  not disabled; `onState(flags)` runs after every rebuild with a copy of the hover,
  press, focus-visible and disabled flags, for a button whose children follow its state.
  The element also carries `setLabel(text)`, `setDisabled(bool)`, `isDisabled()` and
  `pin(props)`: declarations that must outlive every rebuild, such as where a floating
  button sits or whether it shows.
- `bevelIconButton(svg, { label, onClick })` is a small square button whose label span
  holds the given SVG markup. `label` becomes the `aria-label` and the `title`.
- `bevelSurface(tag, rules)` is a Bevel surface: background, ink, border and shadow, on
  any tag, for panels and popovers.
- `bevelWell(rules)` is a recessed `<div>`, for the lighter container inside a surface.
- `bevelText(tag, rules, text)` is a text element that inherits the surface's font and
  ink; `text` is set when it is not `null`.
- `pageScheme()` is the scheme a UI root gives its subtree: the page's own when it
  declares one, else `light dark`.
- `bevelInput(tag, { rules })` is a text field (`input` or `textarea`) in Bevel's input
  material, with hover and focus kept in flags like a button's. `paintInput(el, { rules })`
  does the same to a field that already exists. A textarea keeps the height a person
  dragged it to.
- `bevelBox(tag, rules)` is a plain box: the reset, then only the given rules, for rows,
  stacks and backdrops that carry no material of their own.
- `bevelCornerClose({ label, onClick })` is Bevel's overlay close: a 68px corner cut on
  the diagonal with the pixel X, lifting on hover and filling brass on keyboard focus.
- `setShown(el, shown, display)` shows or hides through both the `hidden` attribute and
  an `!important` display, because `hidden` alone loses to an inline display. On a
  Bevel button it goes through `pin`, so the next rebuild keeps it.
- `protectIcon(svg, size)` restates an icon's own presentation attributes as inline
  `!important` declarations, so the page cannot hide, resize or repaint it, and pins a
  path's geometry through the `d` property as well.

`src/ui/bevel-dialog.js` builds the dialog frame in the dashboard's style:
`bevelDialog({ zIndex, width, closable, titled })` returns the root (`data-clay-modal`),
the backdrop, the `<form>` panel, the header and its heading (when titled), the body, the
footer and the close. It holds no behaviour; the modal and the crop adapter keep their
own focus, Escape and settling rules.

Inline styles have no `:hover`, `:active` or `:focus-visible`, so a button keeps hover,
press, focus-visible and disabled in flags and rebuilds its whole inline style from them
on every change. A property one state set can therefore never survive into the next.
Style a button only through `extra` and `labelExtra`: anything set on it afterwards is
rebuilt away. Disabled wins over hover and press, focus-visible is decided from
`:focus-visible` plus the keyboard modality of the last input, reduced motion replaces
the pressed label offset, and `prefers-reduced-motion` and `forced-colors` are read at
build time for that element.

The UI root sets `color-scheme` to the page's scheme; descendants inherit it, so
`light-dark()` values resolve to the scheme the person is actually looking at.

## Testing note

jsdom drops `light-dark()` and `color-mix()` values, and the `translate` property, from
`el.style`. Tests assert those through a `CSSStyleDeclaration.prototype.setProperty`
spy (see `tests/unit/bevel-controls.test.js`). jsdom has no cascade, so the real
question, whether these declarations beat a hostile stylesheet, needs a browser.

## Vendor skins

RichClay, Quickcrop and the CMS draw their own UI with their own classes, and ClayJS
never edits a vendor. Each gets a skin instead: `scripts/build-vendor-skins.mjs`
reads the CSS the vendored bundle ships, plus Bevel's integration file where there is
one, and writes `src/ui/skins/<name>.js`, one `@layer clay-skin { ... }` block in
which every declaration is `!important`. `src/ui/vendor-skin.js` puts it first in
`<head>`, runtime-only, when the plugin loads. Important declarations in the earliest
cascade layer beat a page's unlayered `!important` rules.

- The vendor's custom properties are pinned to Bevel's literal values on its roots
  and every descendant.
- RichClay and Quickcrop also get Bevel's integration rules and their own chrome
  rules, re-emitted at `!important`. The CMS gets pins and the Bevel mono face only:
  its theme sits in cascade layers on purpose, so a page's utilities can restyle it.
- The CMS's "Edit content" toggle also gets Bevel's button face, ink and hover through
  HyperCMS's documented --hcms-toggle-bg and --hcms-toggle-color hooks, from the
  hand-written src/ui/skins/cms-toggle.js.
- Every selector in a source is listed in `scripts/skin-manifest.mjs` or the build
  fails, and edited prose is never in a skin.
- `npm run build:skins` regenerates; `npm run check:skins` fails when a skin is stale
  (it validates the checked-in modules when `../bevel` is not beside the repo).

## Surfaces

| Surface | File | Status | Notes |
|---|---|---|---|
| Lost edit and refused-save notice | `src/core/conflict-notice.js` | Bevel controls | Keeps its precedence over the section-changed bar. |
| Stale host warning | `src/core/stale-host-notice.js` | Bevel controls | Keeps view-mode and stale-host gating, and its dismiss. |
| Presence avatars, count, tooltip | `src/sync/presence.js` | Bevel controls | Participant colours keep their meaning; faces are square, in the mono face. |
| Section-changed bar | `src/sync/section-notice.js` | Bevel controls | Keeps attribution and dismiss timing, and stays hidden under the conflict notice. |
| Save indicator chip | `src/plugins/indicator.js` | Bevel controls | Error and offline wear the ox tone, unless clay-ui's toasts are loaded to carry them. With clay-ui's clay.saveToast = true, saved is a toast instead. |
| Toasts | `src/ui/toast.js` | Bevel controls | Keeps caller options and timing; the dashboard's toast style; markers are `data-clay-toasts` and `data-clay-toast`. |
| Modal shell | `src/ui/modal.js`, `src/ui/bevel-dialog.js` | Bevel controls | Keeps focus, Escape and settling; `title`, `html`, `yes` and `no` take markup or a node, and caller content is never styled. |
| Ask, confirm, tell and snippet dialogs | `src/ui/dialogs.js` | Bevel controls | Keeps promise and callback behaviour. |
| AI edit chrome | `src/plugins/ai-edit.js` | Bevel controls | Ring, panel, chip, bubble and the bottom status bar only; the contenteditable focus rule is unchanged. |
| RichClay toolbar, menus, floating toolbar, link dialog | `src/plugins/richclay.js`, `src/ui/skins/richclay.js` | vendor skin | Edited prose is never restyled. RichClay has no image toolbar; Squire's resize handles sit inside the prose. |
| Quickcrop frame | `src/plugins/quickcrop.js` | Bevel controls | Frames the vendored cropper; crop geometry untouched. |
| Quickcrop stage | `src/plugins/quickcrop.js`, `src/ui/skins/quickcrop.js` | vendor skin | Crop geometry untouched. |
| CMS shell and controls | `src/plugins/cms.js`, `src/ui/skins/cms.js` | vendor skin, pins | Existing tokens map to the generated values, in the Bevel mono face. |
| Sortable drag decoration | `src/plugins/sortable.js` | nothing to draw | ClayJS adds no decoration: the ghost is a clone of the authored item and Sortable's classes are the page's to style. |
