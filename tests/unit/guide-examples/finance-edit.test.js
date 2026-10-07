import { readFileSync } from "node:fs";
import path from "node:path";
import { EXAMPLES, loadExample, click, flushMicrotasks, peer, saves, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);
const text = (s) => $(s).textContent.trim();

beforeAll(async () => {
  clay = await loadExample("finance.html");
  await clay.loaded.sap;
  await tick(50);
}, 15000);

test("sap mounts clean: the authored file already shows its computed values", () => {
  const status = window.Sap.status();
  expect(status.ok).toBe(true);
  expect(status.apps[0].errors).toBe(0);
  expect(document.querySelectorAll("[sap-error]").length).toBe(0);
  const file = new DOMParser().parseFromString(readFileSync(path.join(EXAMPLES, "finance.html"), "utf8"), "text/html");
  const sig = (e) => JSON.stringify([e.tagName, e.children.length ? null : e.textContent,
    ...[...e.attributes].filter((a) => !/^(contenteditable|inert-contenteditable|readonly)$/.test(a.name)).map((a) => a.name + "=" + a.value).sort()]);
  const authored = [...file.querySelectorAll("#app *")].map(sig);
  const live = [...document.querySelectorAll("#app *")].map(sig);
  expect(live).toEqual(authored);
});

test("opening the page writes nothing", () => {
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("totals and per-category values", () => {
  expect(text('[calc\\:totalspent]')).toBe("$1,384.40");
  expect(text('#cat-food [calc\\:left]')).toBe("$-162.40");
  expect($("#cat-food").classList.contains("over")).toBe(true);
});

test("editing an amount recomputes, persists, and saves", async () => {
  const amount = $('#t-k3 input[bind="amount"]');
  amount.value = "50";
  amount.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
  await flushMicrotasks();
  expect(text('#cat-food [calc\\:spent]')).toBe("$362.40");
  expect(text('[calc\\:totalspent]')).toBe("$1,334.40");
  expect(amount.getAttribute("value")).toBe("50");
  const result = await clay.save();
  expect(result.ok).toBe(true);
  expect(saves.at(-1)).toContain('value="50"');
  expect(saves.at(-1)).toContain("$1,334.40");
});

test("undo of an amount edit restores the shown value, the totals and the saved bytes", async () => {
  const amount = $('#t-k4 input[bind="amount"]');
  const before = amount.value;
  const total = text("[calc\\:totalspent]");
  clay.undo.flush();
  amount.value = String(Number(before) + 7);
  amount.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
  await flushMicrotasks();
  clay.undo.flush();
  expect(text("[calc\\:totalspent]")).not.toBe(total);
  clay.undo.undo();
  await flushMicrotasks();
  expect(amount.value).toBe(before);
  expect(text("[calc\\:totalspent]")).toBe(total);
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html");
  expect(saved.querySelector('#t-k4 input[bind="amount"]').getAttribute("value")).toBe(before);
  clay.undo.redo();
  await flushMicrotasks();
  expect(amount.value).toBe(String(Number(before) + 7));
  clay.undo.undo();
  await flushMicrotasks();
});

test("searching hides rows in this tab only", async () => {
  const q = $('input[bind="q"]');
  q.value = "rent";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
  await flushMicrotasks();
  expect($("#t-k2").hidden).toBe(true);
  expect($("#t-k1").hidden).toBe(false);
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html");
  expect(saved.querySelectorAll("[items='txns'] > [item][hidden]").length).toBe(0);
  expect(saved.querySelector('input[bind="q"]').hasAttribute("value")).toBe(false);
  expect(clay.hasUnsavedChanges()).toBe(false);
  q.value = "";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
});

test("added rows get unique ids, not sap's reusable row-N", async () => {
  click($('[trigger-add="txns"]'));
  click($('[trigger-add="txns"]'));
  window.Sap.refresh();
  await flushMicrotasks();
  const ids = [...document.querySelectorAll("[items] > [item]:not([template])")].map((r) => r.id);
  expect(ids.every((id) => id && !/^row-/.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

test("CSV import adds rows in one batch and totals follow", async () => {
  const picker = document.getElementById("csv-picker");
  const csv = 'date,memo,category,amount\n2026-10-09,"Movie, popcorn",Fun,"$18.50"\n2026-10-10,Bakery,Food,6\n';
  Object.defineProperty(picker, "files", { value: [new File([csv], "bank.csv", { type: "text/csv" })], configurable: true });
  picker.dispatchEvent(new Event("change"));
  for (let i = 0; i < 50 && !document.body.textContent.includes("Bakery"); i++) await tick(10);
  window.Sap.refresh();
  const memos = [...document.querySelectorAll('[items="txns"] > [item]:not([template]) [bind="memo"]')].map((m) => m.textContent);
  expect(memos).toContain("Movie, popcorn");
  expect(text('#cat-fun [calc\\:spent]')).toBe("$90.50");
  const ids = [...document.querySelectorAll("[items] > [item]:not([template])")].map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("two tabs adding transactions converge with no conflict from computed totals", async () => {
  await clay.save();
  const p = await peer();
  const doc = new DOMParser().parseFromString(p.base, "text/html");
  const row = doc.querySelector("#t-k4").cloneNode(true);
  row.id = "t-peer";
  row.querySelector('[bind="memo"]').textContent = "Peer lunch";
  row.querySelector('[bind="amount"]').setAttribute("value", "20");
  row.querySelector('[bind="cat"]').setAttribute("value", "Food");
  doc.querySelector("#t-k4").after(row);
  doc.querySelector('[calc\\:totalspent]').textContent = "$9,999.00";

  const local = $('#t-k1 input[bind="amount"]');
  local.value = "950";
  local.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
  await flushMicrotasks();

  await p.apply("<!DOCTYPE html>" + doc.documentElement.outerHTML);
  window.Sap.refresh();
  await flushMicrotasks();
  expect($("#t-peer")).not.toBeNull();
  expect($('#t-k1 input[bind="amount"]').value).toBe("950");
  expect(clay.conflicts.list().map((c) => [c.kind, c.detail, c.local, c.remote])).toEqual([]);
  const expected = window.Sap(document.getElementById("app")).txns.reduce((s, t) => s + Number(t.amount), 0);
  expect(text('[calc\\:totalspent]')).toBe("$" + expected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  p.stop();
});

test("zz no uncaught errors while the page runs", async () => {
  await tick(200);
  expect(window.__guideErrors).toEqual([]);
});
