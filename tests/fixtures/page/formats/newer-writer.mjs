/**
 * The fixture newer writer: content from a format release after R, written and
 * read only through the generic extension contract.
 *
 * R is the tolerance release, so it has no native mention mark, no table of
 * contents block and no title icon. A later writer does. This module is that
 * later writer's own copy of the format: it declares the records, writes them
 * through the runtime's public projection, and reads them back out of whatever
 * article an R runtime produced. It is a fixture, not production code, and it
 * never patches the runtime's codec: everything it writes is a record whose
 * mark, block type or field the runtime has no schema for.
 */

export const NEWER_FORMAT = Object.freeze({
  floor: 1,
  marks: ["mention"],
  blocks: ["toc"],
  fields: ["maxLevel", "pageIcon", "pageCoverSrc", "pageCoverAlt", "pageCoverX", "pageCoverY"],
});

const copy = (value) => JSON.parse(JSON.stringify(value));

export function newerBlocks(manifest) {
  return copy(manifest.blocks);
}

// The newer writer reads an article the same way any reader does, then keeps the
// items whose record it knows. Nothing here reaches past the runtime's
// projection: an item's record comes back whole or not at all.
export function readNewer(projection, article, manifest) {
  const items = projection.parseModel(article, { seed: article.getAttribute("data-rev") ?? "" });
  return new Map(items.map((item) => [item.id, item]));
}

// The newer writer's own validator: a mention's descriptor must name the mark
// and carry an object of attrs, or the record is not one this writer wrote.
export function assertRecord(record) {
  for (const entry of record.m ?? []) {
    const key = Array.isArray(entry) ? entry[1] : entry;
    if (typeof key !== "string" || !key.startsWith("x[")) continue;
    const parsed = JSON.parse(key.slice(2));
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string" || parsed[1] === null || typeof parsed[1] !== "object") {
      throw new SyntaxError(`newer writer: malformed named mark ${key}`);
    }
  }
  return record;
}
