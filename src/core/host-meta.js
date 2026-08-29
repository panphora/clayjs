/**
 * host-meta.js — what this host can do (spec §5).
 *
 * The first discovery client clayjs has had. Not fetched at boot: the first
 * caller is the first file pick, so a page that never uploads never asks.
 *
 * The spec's own rule about what counts as an answer is deliberately strict on
 * the way in and forgiving on the way out. Only a 2xx carrying a JSON object with
 * a numeric `spec` is a capability document. A 404, an HTML error page from a
 * proxy, a redirect, a body that will not parse: all of them mean "bare core
 * host", and a bare core host is fully conforming. Discovery failing must never
 * cost a person their save, so this never throws and never rejects.
 */

import { saveToken } from "./host-attrs.js";

const META_PATH = "/_/meta";
const META_TIMEOUT_MS = 6000;

// The bare-core-host answer, which is also every failure's answer.
function bareHost() {
  return { spec: null, extensions: [], document: null };
}

let inFlight = null;
let refreshing = null;

/**
 * Ask the host what it supports, once per page.
 *
 * Memoizes the PROMISE rather than the value, so two pickers opened together
 * make one request instead of two and the second waits on the first.
 *
 * `spec` and `extensions` describe the host and never change under a loaded
 * document, which is why one answer serves the whole page. The `document` block
 * does change: its `etag` ticks on every save, by anyone. A caller that needs a
 * current one passes `fresh`, which asks again and replaces the memoized answer,
 * and concurrent fresh callers still share one request.
 *
 * @param {Object} [options]
 * @param {boolean} [options.fresh]
 * @returns {Promise<{spec: ?number, extensions: string[], document: ?Object}>}
 */
export function hostMeta({ fresh = false } = {}) {
  if (!fresh) {
    if (!inFlight) inFlight = fetchMeta().catch(bareHost);
    return inFlight;
  }
  if (!refreshing) {
    refreshing = fetchMeta().catch(bareHost).finally(() => { refreshing = null; });
    inFlight = refreshing;
  }
  return refreshing;
}

/**
 * True when the host announced this capability by name.
 *
 * §5: a client must not infer a host's capabilities any other way. Not from the
 * hostname, not from the port, not by probing a route to see whether it answers.
 *
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function hostSupports(name) {
  const meta = await hostMeta();
  return meta.extensions.includes(name);
}

/** Drop the memoized answer. Tests only. */
export function resetHostMeta() {
  inFlight = null;
  refreshing = null;
}

async function fetchMeta() {
  const token = saveToken();
  // A host that mints tokens answers discovery per token, because on a sandboxed
  // document the token is the only identity there is: the browser gives it an
  // opaque origin, so it holds no cookie and gets the answer any stranger would.
  // Without this the `document` block, which carries whether this person may
  // upload and how large a file the host takes, is unreachable on exactly the
  // hosts that mint tokens.
  const path = token ? `${META_PATH}/${token}` : META_PATH;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(new URL(path, window.location.origin).href, {
      method: "GET",
      // Same rule as the save lane. The token IS the credential, and a host that
      // mints per-document tokens must never send Access-Control-Allow-Credentials
      // back, so asking for cookies gets the answer blocked before it is read.
      credentials: token ? "omit" : "same-origin",
      headers: { "Document-URL": window.location.href },
      cache: "no-store",
      // A redirect is not an answer (§5), and following one would send the
      // Document-URL header somewhere this host did not choose.
      redirect: "manual",
      signal: controller.signal
    });
    if (!res.ok) return bareHost();
    const text = await res.text();
    if (!text) return bareHost();

    let body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      return bareHost();
    }
    if (!body || typeof body !== "object" || typeof body.spec !== "number") return bareHost();

    return {
      spec: body.spec,
      extensions: Array.isArray(body.extensions) ? body.extensions : [],
      document: body.document && typeof body.document === "object" ? body.document : null
    };
  } catch (_) {
    return bareHost();
  } finally {
    clearTimeout(timeoutId);
  }
}
