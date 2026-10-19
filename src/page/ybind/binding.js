import * as Y from "../../vendor/yjs.vendor.js";
import { NET, createPageDoc, walk, docOf } from "./core.js";
import { createBridge } from "./bridge.js";
import { createYProvider, entriesOf, dec } from "./provider.js";

export function createYPageBinding({ store, ydoc = new Y.Doc(), onNotice = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, compact, captureTimeout = 500 }) {
  for (const [, v] of entriesOf(store.value.y)) Y.applyUpdateV2(ydoc, dec(v), NET);
  const pd = createPageDoc(ydoc);
  const provider = createYProvider({ store, ydoc, setTimer, clearTimer, compact });
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, onNotice, stats, captureTimeout });
  return {
    ydoc, pd, provider, bridge, stats,
    doc: () => docOf(pd, walk(pd)),
    attach: (view) => bridge.attach(view),
    dispatch: (tr) => bridge.dispatch(tr),
    undo: () => bridge.undo(),
    redo: () => bridge.redo(),
    restore: (key) => bridge.restore(key),
    get notices() { return bridge.notices; },
    dispose() { bridge.dispose(); provider.dispose(); },
  };
}
