import { hostMeta, hostMetaOutcome, hostMetaPath } from "./host-meta.js";
import { noteHostWritable } from "./is-edit-mode.js";

let accepted = null;

// A permission answer counts only for the document it was fetched for and only when discovery
// answered: a failed refresh, or an answer with no document block, is not evidence either way,
// and leaves the last accepted answer standing. A host that offers no discovery at all ("none")
// is no answer, so the hints apply again.
export async function checkHostPermission({ fresh = false } = {}) {
  const asked = location.pathname;
  let meta = await hostMeta({ fresh });
  if (location.pathname !== asked) return accepted;
  if (hostMetaPath(meta) !== asked) {
    meta = await hostMeta({ fresh: true });
    if (location.pathname !== asked || hostMetaPath(meta) !== asked) return accepted;
  }
  const outcome = hostMetaOutcome(meta);
  if (outcome === "failed" || (outcome === "ok" && !meta.document)) return accepted;
  const writable = outcome === "ok" ? meta.document.writable : undefined;
  accepted = typeof writable === "boolean" ? writable : null;
  noteHostWritable(accepted);
  return accepted;
}
