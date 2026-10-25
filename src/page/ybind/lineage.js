import * as Y from "../../vendor/yjs.vendor.js";
import { parseModel } from "../projection.js";
import { blockFromItem } from "../adopt.js";
import { seedClientId } from "./migrate.js";
import { entriesOf } from "./parts.js";

// The seed client of an article: the Yjs client id seedPageFromArticle would write,
// without building the seed. Two articles with the same blocks share it.
export function seedLineage(article) {
  const items = parseModel(article, { seed: article.getAttribute("data-rev") ?? "" });
  if (!items.length) return { client: null };
  const blocks = {};
  items.forEach((item, i) => {
    const block = blockFromItem(item, null);
    block.pos = String(i + 1).padStart(8, "0");
    blocks[item.id] = block;
  });
  return { client: seedClientId(blocks) };
}

export function valueClients(value) {
  const clients = new Set();
  for (const [, text] of entriesOf(value?.y ?? {})) {
    try {
      for (const client of Y.decodeStateVector(Y.encodeStateVectorFromUpdateV2(Y.fromBase64(text))).keys()) clients.add(client);
    } catch {}
  }
  return clients;
}

export function sharesLineage(stored, incoming) {
  const theirs = valueClients(stored);
  const mine = valueClients(incoming);
  if (!theirs.size || !mine.size || [...mine].some((client) => theirs.has(client))) return true;
  const kept = new Map(entriesOf(stored?.y ?? {}));
  return entriesOf(incoming?.y ?? {}).some(([key, text]) => kept.get(key) === text);
}

export function seedOnly(doc, client) {
  for (const id of Y.decodeStateVector(Y.encodeStateVector(doc)).keys()) if (id !== client) return false;
  return Y.createDeleteSetFromStructStore(doc.store).clients.size === 0;
}
