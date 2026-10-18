// Link addresses the editor will store. #fragments, same-site paths, http(s),
// mailto and tel pass; a bare domain gets https:// and a bare address mailto:.
// Any other scheme (javascript:, data:, vbscript:, file:) is refused with null.
import { state, view as pmView, history } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";

const { Plugin, PluginKey, TextSelection } = state;
const { Decoration, DecorationSet } = pmView;
const LINK = schema.marks.link;

const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

export function safeHref(raw) {
  const s = String(raw ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!s) return null;
  if (s.startsWith("#") || (s.startsWith("/") && !s.startsWith("//"))) return s;
  if (SAFE_SCHEME.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (/^(\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(s)) return `https://${s.replace(/^\/\//, "")}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  return null;
}

export const isUrlText = (text) => !/\s/.test(text.trim()) && safeHref(text) !== null && /[.:/]/.test(text);

export const safeSrc = (s) => (s && /^data:image\/(png|jpeg|gif|webp);/i.test(s) && s.length <= 2_100_000 ? s : safeHref(s));

export function linkRange(doc, pos) {
  const $p = doc.resolve(pos);
  if (!$p.parent.inlineContent) return null;
  const mark = LINK.isInSet(($p.nodeAfter ?? $p.nodeBefore)?.marks ?? []);
  if (!mark) return null;
  const kids = [];
  $p.parent.forEach((n, off) => kids.push({ n, off }));
  const i = kids.findIndex(({ n, off }) => off <= $p.parentOffset && $p.parentOffset <= off + n.nodeSize && mark.isInSet(n.marks));
  if (i < 0) return null;
  let a = i, b = i;
  while (a > 0 && mark.isInSet(kids[a - 1].n.marks)) a--;
  while (b < kids.length - 1 && mark.isInSet(kids[b + 1].n.marks)) b++;
  const start = $p.start();
  return { from: start + kids[a].off, to: start + kids[b].off + kids[b].n.nodeSize, href: mark.attrs.href };
}

export function setLinkTr(st, from, to, href) {
  const tr = st.tr.removeMark(from, to, LINK);
  if (href) tr.addMark(from, to, LINK.create({ href }));
  return history.closeHistory(tr);
}

export const linkKey = new PluginKey("page-link");
const popovers = new WeakMap();

export const openLinkEditor = (view) => popovers.get(view)?.openEdit() ?? false;

function pasteUrl(view, event) {
  if (event.clipboardData?.files?.length) return false;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!isUrlText(text)) return false;
  const sel = view.state.selection;
  if (!(sel instanceof TextSelection) || !sel.$from.sameParent(sel.$to) || sel.$from.parent.type.spec.code) return false;
  const href = safeHref(text);
  const tr = sel.empty
    ? view.state.tr.replaceSelectionWith(schema.text(text.trim(), [LINK.create({ href })]), false)
    : setLinkTr(view.state, sel.from, sel.to, href);
  view.dispatch(tr.scrollIntoView().setMeta("uiEvent", "paste"));
  return true;
}

export function linkPlugin() {
  return new Plugin({
    key: linkKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const m = tr.getMeta(linkKey);
        if (m !== undefined) return m;
        return value && tr.docChanged ? { from: tr.mapping.map(value.from, 1), to: tr.mapping.map(value.to, -1) } : value;
      },
    },
    props: {
      decorations(st) {
        const r = linkKey.getState(st);
        return r && r.from < r.to ? DecorationSet.create(st.doc, [Decoration.inline(r.from, r.to, { class: "page-link-pending" })]) : null;
      },
      handleKeyDown(view, event) {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          return openLinkEditor(view) || true;
        }
        return false;
      },
      handlePaste: pasteUrl,
      handleClick(view, pos, event) {
        if (!(event.metaKey || event.ctrlKey)) return false;
        const r = linkRange(view.state.doc, pos);
        if (!r) return false;
        view.dom.ownerDocument.defaultView.open(r.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
  });
}
