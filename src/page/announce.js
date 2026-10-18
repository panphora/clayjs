export function announce(view, text) {
  const region = view.dom.parentElement?.querySelector(".page-live");
  if (!region) return;
  region.textContent = "";
  region.textContent = text;
}
