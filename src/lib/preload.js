// The chunked build's files that a boot plan will import, fetched in parallel before
// boot() imports them one at a time in its load-bearing order. clay="no-save" keeps
// the links out of every save and out of live sync's merge.
export function preloadEntries(manifest, paths, doc = document) {
  if (!manifest?.entries) return 0;
  const want = new Set();
  const add = (file) => {
    if (!file || want.has(file)) return;
    want.add(file);
    for (const dep of manifest.imports?.[file] ?? []) add(dep);
  };
  for (const p of paths) add(manifest.entries[p]);
  const have = new Set([...doc.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href));
  let added = 0;
  for (const file of want) {
    const href = new URL(file, manifest.base).href;
    if (have.has(href)) continue;
    const link = doc.createElement("link");
    link.rel = "modulepreload";
    link.href = href;
    link.setAttribute("clay", "no-save");
    doc.head.append(link);
    added++;
  }
  return added;
}
