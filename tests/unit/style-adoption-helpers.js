/**
 * Boots save.js and the close warning over a page holding one saved owned style,
 * with the loader's settle still held, so a test can stand inside the window a
 * style write opens: the stored baselines still carry the owned tag while the
 * stripper that takes it out has not landed.
 */

export const SAVED_STYLE = '<style data-name="saved" clay="no-data">.item { color: red; }</style>';

export async function bootStylePage({
  head = SAVED_STYLE,
  body = '<p id="content">Original</p><div id="mount"></div>',
} = {}) {
  window.clayEditMode = true;
  window.clay = {};
  const posts = [];
  globalThis.fetch = window.fetch = async (url, options) => {
    if (options?.method === "POST") {
      posts.push(String(options.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };

  document.head.innerHTML = head;
  document.body.innerHTML = body;

  const bootPhase = (await import("../../src/core/boot-phase.js")).bootPhase;
  bootPhase.holdSettle = true;

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  const snapshot = await import("../../src/core/snapshot.js");
  const save = await import("../../src/core/save.js");
  const warning = await import("../../src/core/unsaved-warning.js");
  const { style } = await import("../../src/lib/style.js");
  window.clay.hasUnsavedChanges = warning.hasUnsavedChanges;
  return { bootPhase, snapshot, save, warning, style, posts };
}

export const warn = () => {
  const event = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const until = async (predicate) => {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("test timed out");
};
