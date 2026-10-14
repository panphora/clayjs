// The host side of clay.live's fast lane on a host that advertises `live-data`:
// one POST per frame of ops, one GET for the room's whole state. Both name the
// document with Document-URL, as the sync relay and presence do.

const DATA_PATH = "/_/sync/data";

function dataUrl() {
  return new URL(DATA_PATH, window.location.origin);
}

/**
 * Send one frame ({ name, n, ops }). Resolves { status, body, retryAfter }:
 * status 0 when the request never got an answer.
 */
export async function relayData(clientId, frame) {
  const url = dataUrl();
  url.searchParams.set("client-id", clientId);
  try {
    const response = await fetch(url.href, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Document-URL": window.location.href },
      body: JSON.stringify(frame),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {}
    const retryAfter = Number(response.headers?.get?.("Retry-After")) || 0;
    return { status: response.status, body, retryAfter };
  } catch {
    return { status: 0, body: null, retryAfter: 0 };
  }
}

/** The room's { epoch, seq, writer, stores }, or null when it could not be read. */
export async function fetchLiveState() {
  try {
    const response = await fetch(dataUrl().href, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Document-URL": window.location.href },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
