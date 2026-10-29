// The checklist's decoration: the owner and due chips on every check item. It
// loads the first time a document holds or takes one, through the view hooks, so a
// document with no checklist never fetches it. The keymap stays in checklist.js.
import { view as pmView } from "../../vendor/prosemirror.vendor.js";
import { schema } from "../schema.js";
import { asStep } from "../blocksel.js";
import { addViewHook } from "../view-hooks.js";

const { Decoration, DecorationSet } = pmView;

// The owner chips draw the same initials face a board card does. These two are the
// parts of that face this module needs, kept here so the checklist part does not
// share a chunk with the board's parts and cost the board its one request.
const el = (doc, tag, cls, attrs = {}, text = null) => {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  if (text !== null) node.textContent = text;
  return node;
};

const cardFace = (doc, name) => el(doc, "span", "page-board-face", { "aria-hidden": "true" }, ([...String(name).trim()][0] ?? "?").toUpperCase());

function itemAt(view, id) {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (node.attrs.id === id && node.type === schema.nodes.list_item && node.attrs.kind === "check") found = { node, pos }; });
  return found;
}

function setItem(view, id, attr, value) {
  const found = itemAt(view, id);
  if (!found) return;
  view.dispatch(asStep(view.state.tr.setNodeMarkup(found.pos, null, { ...found.node.attrs, [attr]: value || null })));
}

function chip(doc, label, aria, attr) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "page-check-chip";
  button.dataset.check = attr;
  button.textContent = label;
  button.setAttribute("aria-label", aria);
  return button;
}

// The design's three line icons, at the editor's 16px stroke-1.5 drawing.
const ICONS = {
  person: '<circle cx="8" cy="5.4" r="2.3"/><path d="M3.6 13.2c.6-2.1 2.2-3.3 4.4-3.3s3.8 1.2 4.4 3.3"/>',
  calendar: '<rect x="2.5" y="3.5" width="11" height="10"/><path d="M2.5 6.8h11M5.5 2v2.4M10.5 2v2.4"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 4.8v3.4l2.3 1.4"/>',
};

function icon(doc, paths) {
  const node = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("viewBox", "0 0 16 16");
  node.setAttribute("width", "14");
  node.setAttribute("height", "14");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "1.5");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = paths;
  return node;
}

// A tag's words. Today, tomorrow and a short date for the day, as a board card
// reads its own due badge (board-view.js), with the one word a tag needs that the
// badge never shows.
const pad = (n) => String(n).padStart(2, "0");
const DUE = /^\d{4}-\d{2}-\d{2}$/;
const todayKey = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const dayAfter = (key) => {
  const day = new Date(`${key}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};
function dueLabel(due, today) {
  if (!due) return "No date";
  if (!DUE.test(due)) return due;
  if (due === today) return "Today";
  if (due === dayAfter(today)) return "Tomorrow";
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  return new Date(`${due}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

function tag(doc, { name, paths, label, aria, filled, overdue = false }) {
  const button = el(doc, "button", "page-check-chip", {
    type: "button",
    "data-check": name,
    "data-filled": String(filled),
    "data-overdue": overdue ? "true" : null,
    "aria-expanded": "false",
    "aria-label": aria,
  });
  button.append(icon(doc, paths), el(doc, "span", "page-check-chip-label", {}, label));
  return button;
}

// The same owner field a board card's panel shows: people as chips, "No owner",
// then a name box for anyone not in the list.
function ownerPicker(view, id, anchor) {
  const doc = anchor.ownerDocument;
  const current = itemAt(view, id)?.node.attrs.owner || "";
  const popup = doc.createElement("span");
  popup.className = "page-check-popup page-check-owner";
  popup.contentEditable = "false";
  const box = el(doc, "span", "page-board-owners");
  const people = el(doc, "span", "page-board-people", { role: "group", "aria-label": "Owner" });
  const input = el(doc, "input", "page-board-owner-input", { type: "text", "aria-label": "Owner name", placeholder: "Or type a name…" });
  input.value = current;
  const choose = (name) => setItem(view, id, "owner", name);
  const person = (name, label, attr, pressed) => {
    const button = el(doc, "button", `page-board-person${name ? "" : " is-none"}`, { type: "button", "aria-pressed": String(pressed), "data-check": attr });
    if (name) button.append(cardFace(doc, name), el(doc, "span", null, {}, name));
    else button.textContent = label;
    button.addEventListener("click", () => choose(name));
    return button;
  };
  const draw = (available) => {
    const typed = input.value.trim().toLowerCase();
    const shown = (available || []).filter((p) => !typed || typed === current.toLowerCase() || p.name.toLowerCase().includes(typed));
    people.replaceChildren(...shown.map((p) => person(p.name, p.name, "owner-option", p.name === current)), person(null, "No owner", "clear-owner", !current));
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); choose(input.value.trim()); }
    if (event.key === "Escape") { event.preventDefault(); popup.remove(); anchor.focus(); }
    event.stopPropagation();
  });
  box.append(people, input);
  popup.append(box);
  anchor.after(popup);
  input.focus();
  let available = [];
  draw(available);
  input.addEventListener("input", () => draw(available));
  const source = globalThis.clay?.people?.available;
  if (source) Promise.resolve().then(() => source()).then((list) => { if (popup.isConnected) { available = list || []; draw(available); } }).catch(() => {});
}

function datePicker(view, id, anchor) {
  const doc = anchor.ownerDocument;
  const popup = doc.createElement("span");
  popup.className = "page-check-popup";
  popup.contentEditable = "false";
  const input = doc.createElement("input");
  input.type = "date";
  input.setAttribute("aria-label", "Due date");
  input.value = itemAt(view, id)?.node.attrs.due || "";
  input.addEventListener("change", () => setItem(view, id, "due", input.value));
  input.addEventListener("keydown", (event) => event.stopPropagation());
  const clear = chip(doc, "Clear", "Clear due date", "clear-date");
  clear.addEventListener("click", () => setItem(view, id, "due", null));
  popup.append(input, clear);
  anchor.after(popup);
  input.focus();
}

function controls(view, node) {
  const doc = view.dom.ownerDocument;
  const box = doc.createElement("span");
  box.className = "page-check-controls";
  box.contentEditable = "false";
  box.dataset.empty = String(!node.attrs.owner && !node.attrs.due);
  const today = todayKey();
  const ownerName = node.attrs.owner || "Unassigned";
  const owner = tag(doc, { name: "owner", paths: ICONS.person, label: ownerName, aria: `Assignee: ${ownerName}`, filled: !!node.attrs.owner });
  const dateName = dueLabel(node.attrs.due, today);
  const overdue = !!node.attrs.due && !node.attrs.checked && DUE.test(node.attrs.due) && node.attrs.due < today;
  const date = tag(doc, { name: "date", paths: overdue ? ICONS.clock : ICONS.calendar, label: dateName, aria: `Due date: ${dateName}`, filled: !!node.attrs.due, overdue });
  owner.addEventListener("click", () => ownerPicker(view, node.attrs.id, owner));
  date.addEventListener("click", () => datePicker(view, node.attrs.id, date));
  box.append(owner, date);
  return box;
}

export function focusControl(view, name) {
  const $pos = view.state.selection.$head;
  if ($pos.depth !== 1 || $pos.parent.type !== schema.nodes.list_item || $pos.parent.attrs.kind !== "check") return false;
  const id = $pos.parent.attrs.id;
  const widget = [...view.dom.querySelectorAll(".page-check-controls")].find((el) => el.dataset.item === id);
  const button = widget?.querySelector(`[data-check="${name}"]`);
  if (!button) return false;
  button.focus();
  return true;
}

export function decorations(st) {
  const widgets = [];
  st.doc.forEach((node, pos) => {
    if (node.type !== schema.nodes.list_item || node.attrs.kind !== "check") return;
    widgets.push(Decoration.widget(pos + node.nodeSize - 1, (view) => {
      const box = controls(view, node);
      box.dataset.item = node.attrs.id;
      return box;
    }, { key: `${node.attrs.id}:${node.attrs.owner}:${node.attrs.due}:${node.attrs.checked}`, side: 1, stopEvent: (event) => !!event.target.closest?.(".page-check-chip, .page-check-popup"), ignoreSelection: true }));
  });
  return DecorationSet.create(st.doc, widgets);
}

export function createFeature({ view = null } = {}) {
  const off = view ? addViewHook(view, { decorations, focusControl }) : () => {};
  if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta("addToHistory", false));
  return { id: "checklist", dispose() { off(); } };
}
