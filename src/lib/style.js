import { insertStyles } from "../dom/insert-style-tag.js";

// A style a script owns. The tag saves with the page, so the next load paints
// styled before any script runs. Each call writes the current CSS into the saved
// tag in place (or points the saved <link> at the current href), so a page saved
// by an older script picks up newer styles. The tag is no-dirty: an update is
// carried by the next real save and never counts as an edit, starts an autosave
// or raises the close warning.
const markNoDirty = (el) => {
  const tokens = (el.getAttribute("clay") ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.includes("no-dirty")) el.setAttribute("clay", [...tokens, "no-dirty"].join(" "));
};

export function style(nameOrHref, css) {
  if (typeof css === "string") return insertStyles(nameOrHref, css, markNoDirty);
  return insertStyles(nameOrHref, (link) => {
    markNoDirty(link);
    if (link.getAttribute("href") !== nameOrHref) link.setAttribute("href", nameOrHref);
  });
}
