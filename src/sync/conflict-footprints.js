import { conflicts } from './conflicts.js';

const replacements = new WeakMap();

export const replacementFootprint = (rec) => replacements.get(rec) || null;

export function trackConflictFootprints(merge) {
  const watched = new Map();
  for (const rec of conflicts.list()) {
    if (!rec.recovery?.text) continue;
    const live = rec.recovery.subject.live;
    const node = replacements.get(rec) || (live.length === 1 ? live[0] : null);
    if (node?.nodeType === 1 && node.ownerDocument === document && node.isConnected) watched.set(rec, node);
  }
  if (!watched.size) return merge();
  const observer = new MutationObserver(() => {});
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    const pending = merge();
    const changes = observer.takeRecords();
    if (changes.length !== 2) return pending;
    const [insert, remove] = changes;
    if (insert.type !== 'childList' || remove.type !== 'childList' || insert.target !== remove.target ||
        insert.addedNodes.length !== 1 || insert.removedNodes.length ||
        remove.removedNodes.length !== 1 || remove.addedNodes.length) return pending;
    const old = remove.removedNodes[0];
    const fresh = insert.addedNodes[0];
    if (old.nodeType !== 1 || fresh.nodeType !== 1 || old.isConnected || !fresh.isConnected ||
        old.namespaceURI !== fresh.namespaceURI || old.tagName === fresh.tagName ||
        insert.nextSibling !== old || remove.previousSibling !== fresh ||
        fresh.parentNode !== insert.target || fresh.previousSibling !== insert.previousSibling ||
        fresh.nextSibling !== remove.nextSibling) return pending;
    if (old.childNodes.length !== 1 || fresh.childNodes.length !== 1 || old.firstChild.nodeType !== 3 ||
        !old.firstChild.isEqualNode(fresh.firstChild) || old.attributes.length !== fresh.attributes.length ||
        [...old.attributes].some((a) => fresh.getAttributeNS(a.namespaceURI, a.localName) !== a.value)) return pending;
    for (const [rec, node] of watched) if (node === old) replacements.set(rec, fresh);
    return pending;
  } finally {
    observer.disconnect();
  }
}
