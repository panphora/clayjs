export const OFF = "not all";
export const looks = () => [...document.querySelectorAll("head style[clay-variant]")];
export const nameOf = (style) => style.getAttribute("clay-variant");
export const labelOf = (style) => style.getAttribute("clay-variant-label") || `Variant ${nameOf(style)}`;

export function wantedLook() {
  const name = document.documentElement.getAttribute("look");
  return name && looks().some((style) => nameOf(style) === name) ? name : null;
}

export function activeLook() {
  const all = looks();
  const wanted = wantedLook();
  return all.find((style) => nameOf(style) === wanted) || all.find((style) => style.getAttribute("media") !== OFF) || all[0] || null;
}

export function paintLook(name = wantedLook()) {
  document.querySelector("style[clay-look-hint]")?.remove();
  if (!name) return;
  for (const style of looks()) {
    if (nameOf(style) === name) style.removeAttribute("media");
    else if (style.getAttribute("media") !== OFF) style.setAttribute("media", OFF);
  }
}

export const carriesLook = () => /"html@look"/.test(document.querySelector('script[data-rules-name~="api"]')?.textContent ?? "");

export function recordLook(name) {
  if (!carriesLook()) return;
  if (name) document.documentElement.setAttribute("look", name);
  else document.documentElement.removeAttribute("look");
}
