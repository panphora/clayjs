import { state, view, keymap, commands, model } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { identityPlugin } from "../../../src/page/model.js";
import { createYPageBinding, createPageDoc, walk, docOf, bareShape, docFromValue } from "../../../src/page/ybind/index.js";

const el = (tag, attrs = {}, text = "") => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.textContent = text;
  return node;
};

export function startLab({ root, store, interval = 500 }) {
  const editorEl = el("div", { class: "lab-editor", "data-lab": "editor" });
  const dl = el("dl");
  const stats = {};
  for (const [label, name] of [["mode", "mode"], ["pending", "pending"], ["store keys", "keys"], ["store chars", "chars"], ["groups", "groups"], ["mismatch", "mismatch"], ["last group", "last"], ["document", "check"]]) {
    dl.append(el("dt", {}, label));
    const dd = el("dd", { "data-stat": name });
    dl.append(dd);
    stats[name] = dd;
  }
  const acts = {};
  const button = (act, label) => {
    const b = el("button", { "data-act": act }, label);
    acts[act] = b;
    return b;
  };
  const noticesEl = el("ol", { "data-notices": "" });
  const panel = el("aside", { class: "lab-panel" });
  panel.append(dl, button("insert-big", "Insert 6,000 characters"), button("insert-blocks", "Insert 30 paragraphs"), button("undo", "Undo"), button("redo", "Redo"), button("check", "Check against a reload"), noticesEl);
  const labEl = el("div", { class: "lab" });
  labEl.append(editorEl, panel);
  root.append(labEl);

  const binding = createYPageBinding({ store });
  const editorView = new view.EditorView(editorEl, {
    state: state.EditorState.create({
      doc: binding.doc(),
      plugins: [identityPlugin(), keymap.keymap({ "Mod-z": () => (binding.undo(), true), "Shift-Mod-z": () => (binding.redo(), true), "Mod-y": () => (binding.redo(), true) }), keymap.keymap(commands.baseKeymap)],
    }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editorView);

  const set = (name, value) => { stats[name].textContent = value; };

  const refresh = () => {
    set("mode", store.handle.status.mode);
    set("pending", String(store.pending.length));
    const y = store.value.y ?? {};
    set("keys", String(Object.keys(y).length));
    set("chars", String(Object.values(y).reduce((n, s) => n + String(s).length, 0)));
    set("groups", String(binding.stats.groups));
    set("mismatch", String(binding.stats.mismatch));
    set("last", JSON.stringify(binding.stats.lastGroup));
    noticesEl.replaceChildren();
    for (const notice of binding.notices) {
      const li = el("li", {}, `${notice.kind}: ${String(notice.text ?? "").slice(0, 60)} `);
      const restore = el("button", { "data-act": "restore" }, "Restore");
      restore.addEventListener("click", () => { binding.restore(notice.key); refresh(); });
      li.append(restore);
      noticesEl.append(li);
    }
  };

  acts["insert-big"].addEventListener("click", () => {
    editorView.dispatch(editorView.state.tr.insertText("lorem ipsum ".repeat(500)));
    refresh();
  });
  acts["insert-blocks"].addEventListener("click", () => {
    const paras = Array.from({ length: 30 }, (_, n) => schema.nodes.paragraph.create({ id: null, pos: null }, schema.text("paragraph " + n)));
    editorView.dispatch(editorView.state.tr.replaceSelection(new model.Slice(model.Fragment.from(paras), 0, 0)));
    refresh();
  });
  acts.undo.addEventListener("click", () => { binding.undo(); refresh(); });
  acts.redo.addEventListener("click", () => { binding.redo(); refresh(); });
  acts.check.addEventListener("click", () => {
    const pd = createPageDoc(docFromValue(store.value));
    set("check", bareShape(editorView.state.doc) === bareShape(docOf(pd, walk(pd))) ? "same as a reload" : "DIFFERS");
  });

  refresh();
  const timer = setInterval(refresh, interval);

  const destroy = () => {
    clearInterval(timer);
    editorView.destroy();
    binding.dispose();
  };

  return { binding, view: editorView, refresh, destroy };
}
