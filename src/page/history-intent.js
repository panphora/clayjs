// Typing joins one undo item the way it does in other editors: Mod-z removes the last
// word typed, not the last letter. Only the editor's own input path marks a
// transaction; a command or a programmatic dispatch stays one undo item by itself.
import { state } from "../vendor/prosemirror.vendor.js";

export const HISTORY_INTENT = "page-history-intent";
export const GROUP_MS = 500;

const blockIdAt = (doc, pos) => {
  const $pos = doc.resolve(pos);
  return $pos.depth ? $pos.node(1).attrs.id : null;
};

const markKey = (st) => (st.storedMarks ?? st.selection.$from.marks()).map((m) => m.type.name).sort().join(",");

export function continuesGroup(prev, next) {
  if (!prev || !next || prev.kind !== next.kind) return false;
  if (next.kind === "compose") return prev.id === next.id;
  if (prev.blockId !== next.blockId || next.at - prev.at > GROUP_MS) return false;
  if (next.kind === "insert") return next.from === prev.end && next.marks === prev.marks && !(/\s$/.test(prev.text) && /^\S/.test(next.text));
  return next.direction === prev.direction && (next.direction < 0 ? next.to === prev.from : next.from === prev.from);
}

export function intentOf(transactions) {
  if (transactions.length !== 1) return null;
  const tr = transactions[0];
  const marked = tr.getMeta(HISTORY_INTENT);
  if (marked) return marked;
  const composition = tr.getMeta("composition");
  return composition == null ? null : { kind: "compose", id: composition, at: Date.now() };
}

export function historyIntentPlugin() {
  return new state.Plugin({
    props: {
      handleTextInput(view, from, to, text, deflt) {
        const st = view.state;
        view.dispatch(deflt().setMeta(HISTORY_INTENT, {
          kind: "insert", blockId: blockIdAt(st.doc, from), from, end: from + text.length, text, marks: markKey(st), at: Date.now(),
        }));
        return true;
      },
    },
  });
}
