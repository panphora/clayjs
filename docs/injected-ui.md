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
- `bevelButton(label, { variant, small, onClick, extra, labelExtra })` returns a
  `<button>` wrapping a label `<span>`. `variant` is `default`, `primary`, `quiet` or
  `danger`; `small` shrinks type and padding; `onClick` runs on click while the button is
  not disabled. The element also carries `setLabel(text)`, `setDisabled(bool)` and
  `isDisabled()`.
- `bevelIconButton(svg, { label, onClick })` is a small square button whose label span
  holds the given SVG markup. `label` becomes the `aria-label` and the `title`.
- `bevelSurface(tag, rules)` is a Bevel surface: background, ink, border and shadow, on
  any tag, for panels and popovers.
- `bevelWell(rules)` is a recessed `<div>`, for the lighter container inside a surface.
- `bevelText(tag, rules, text)` is a text element that inherits the surface's font and
  ink; `text` is set when it is not `null`.
- `pageScheme()` is the scheme a UI root gives its subtree: the page's own when it
  declares one, else `light dark`.
- `protectIcon(svg, size)` restates an icon's own presentation attributes as inline
  `!important` declarations, so the page cannot hide, resize or repaint it, and pins a
  path's geometry through the `d` property as well.

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

## Surfaces

| Surface | File | Status | Notes |
|---|---|---|---|
| Lost edit and refused-save notice | `src/core/conflict-notice.js` | Bevel controls | Keeps its precedence over the section-changed bar. |
| Stale host warning | `src/core/stale-host-notice.js` | Bevel controls | Keeps view-mode and stale-host gating, and its dismiss. |
| Presence avatars, count, tooltip | `src/sync/presence.js` | Bevel controls | Participant colours keep their meaning; faces are square, in the mono face. |
| Section-changed bar | `src/sync/section-notice.js` | Bevel controls | Keeps attribution and dismiss timing, and stays hidden under the conflict notice. |
| Save indicator chip | `src/plugins/indicator.js` | not yet | Moves off plain `cssText`. |
| Toasts | `src/ui/toast.js` | not yet | Keeps caller options, timing and actions. |
| Modal shell | `src/ui/modal.js` | not yet | Keeps focus, Escape and return-focus; caller content untouched. |
| Ask, confirm, tell and snippet dialogs | `src/ui/dialogs.js` | not yet | Keeps promise and callback behaviour. |
| AI edit chrome | `src/plugins/ai-edit.js` | not yet | Ring, panel, chip and bubble only. |
| RichClay toolbar, menus, link dialog, image toolbar | `src/vendor/richclay.vendor.js` | not yet | Edited prose is never restyled. |
| Quickcrop | `src/vendor/quickcrop.vendor.js` | not yet | Crop geometry untouched. |
| CMS shell and controls | `src/vendor/hypercms.vendor.js` | not yet | Existing tokens map to the generated values. |
| Sortable drag decoration | `src/plugins/sortable.js` | not yet | Transient decoration only, never authored items. |
