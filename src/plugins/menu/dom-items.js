const SELECTOR = "[clay-menu-item]:not([cms-template])";

const canSave = () => window.clay?.mode === "edit" || window.clay?.mode === "draft";

async function removeAndSave(el) {
  await window.clay?.ready;
  if (!canSave() || !el.isConnected) return false;
  const undo = window.clay?.undo;
  if (undo && typeof undo.commit === "function") undo.commit("Remove this item", () => el.remove());
  else el.remove();
  window.clay?.save?.soon?.();
  return true;
}

export function attachDomItems({ addItem, removeItem, beforeOpen }) {
  const shown = new Set();
  function sync() {
    const seen = new Set();
    for (const el of document.querySelectorAll(SELECTOR)) {
      const key = el.getAttribute("data-id") || el.id;
      if (!key) {
        console.warn("[clay] A clay-menu-item needs a data-id or an id.", el);
        continue;
      }
      const id = `dom.${key}`;
      seen.add(id);
      const dismiss = el.getAttribute("clay-menu-dismiss");
      addItem({
        id,
        label: el.textContent.trim(),
        href: el.getAttribute("href") || "",
        section: el.getAttribute("clay-menu-section") || undefined,
        quiet: el.hasAttribute("clay-menu-quiet"),
        run: el.hasAttribute("href") ? null : () => el.click(),
        dismiss: dismiss && canSave() ? { label: dismiss, run: () => removeAndSave(el) } : undefined,
      });
    }
    for (const id of shown) if (!seen.has(id)) removeItem(id);
    shown.clear();
    for (const id of seen) shown.add(id);
  }
  beforeOpen.push(sync);
  for (const name of ["clay:drafts-restored", "clay:sync-applied", "clay:modechange"]) document.addEventListener(name, sync);
  sync();
}
