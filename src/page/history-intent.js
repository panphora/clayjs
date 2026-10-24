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

const DELETES = { deleteContentBackward: -1, deleteContentForward: 1 };
const pendingDeletes = new WeakMap();

// A native deletion arrives as a DOM change with no handler, so the beforeinput that
// announced it is held until the end of the task and claimed by the next transaction.
export function takePendingDelete(view) {
  const mark = pendingDeletes.get(view) ?? null;
  pendingDeletes.delete(view);
  return mark;
}

export function deletionIntent(tr, mark) {
  if (!mark || tr.steps.length !== 1) return null;
  const step = tr.steps[0];
  if (step.slice?.size !== 0 || step.from === step.to) return null;
  const $from = tr.before.resolve(step.from), $to = tr.before.resolve(step.to);
  if (!$from.parent.isTextblock || !$from.sameParent($to)) return null;
  return { kind: "delete", blockId: $from.depth ? $from.node(1).attrs.id : null, direction: mark.direction, from: step.from, to: step.to, at: mark.at };
}

export function intentOf(transactions, view = null) {
  if (transactions.length !== 1) return null;
  const tr = transactions[0];
  const marked = tr.getMeta(HISTORY_INTENT);
  if (marked) return marked;
  const composition = tr.getMeta("composition");
  if (composition != null) return { kind: "compose", id: composition, at: Date.now() };
  return view ? deletionIntent(transactions[0], takePendingDelete(view)) : null;
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
      handleDOMEvents: {
        beforeinput(view, event) {
          const direction = DELETES[event.inputType];
          if (!direction) return false;
          const mark = { direction, at: Date.now() };
          pendingDeletes.set(view, mark);
          setTimeout(() => { if (pendingDeletes.get(view) === mark) pendingDeletes.delete(view); }, 0);
          return false;
        },
      },
    },
  });
}
