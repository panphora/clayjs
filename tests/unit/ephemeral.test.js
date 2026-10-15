import { jest } from "@jest/globals";
import { isEphemeralAttr, stripEphemeral, ephemeral } from "../../src/lib/ephemeral.js";
import { isTabLocalAttr, mergeIgnoresAttr, mergeVetoesAttr } from "../../src/lib/root-attrs.js";
import { HyperMorph } from "../../src/vendor/hyper-morph.vendor.js";

const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content.firstElementChild;
};

describe("isEphemeralAttr", () => {
  test("the ephemeral attribute itself, on any element", () => {
    expect(isEphemeralAttr("ephemeral", el("<li></li>"))).toBe(true);
  });

  test("a marked attribute, and only on the element that marks it", () => {
    expect(isEphemeralAttr("open", el("<details ephemeral:open open></details>"))).toBe(true);
    expect(isEphemeralAttr("aria-expanded", el('<button ephemeral:aria-expanded aria-expanded="true"></button>'))).toBe(true);
    expect(isEphemeralAttr("open", el("<details open></details>"))).toBe(false);
  });

  test("a dialog's open needs no marker", () => {
    expect(isEphemeralAttr("open", el("<dialog open></dialog>"))).toBe(true);
  });

  test("class, id, data-id, clay and the markers themselves are never ephemeral", () => {
    const node = el('<li ephemeral:class ephemeral:id ephemeral:data-id ephemeral:clay class="a" id="b" data-id="c" clay="freeze"></li>');
    for (const name of ["class", "id", "data-id", "clay", "ephemeral:class"]) expect(isEphemeralAttr(name, node)).toBe(false);
  });

  test("isTabLocalAttr includes ephemeral state", () => {
    expect(isTabLocalAttr("ephemeral", el("<li></li>"))).toBe(true);
    expect(isTabLocalAttr("open", el("<details ephemeral:open></details>"))).toBe(true);
    expect(isTabLocalAttr("title", el("<li></li>"))).toBe(false);
  });
});

test("stripEphemeral removes the state and keeps the markers and everything else", () => {
  const root = document.createElement("div");
  root.setAttribute("ephemeral", "busy");
  root.innerHTML =
    '<li class="card" data-id="c-1" ephemeral="selected">a</li>' +
    '<details ephemeral:open open><summary>s</summary></details>' +
    '<details open><summary>kept</summary></details>' +
    '<dialog open>d</dialog>' +
    '<li ephemeral:class class="keep">k</li>';
  stripEphemeral(root);
  expect(root.hasAttribute("ephemeral")).toBe(false);
  expect(root.querySelector("[ephemeral]")).toBeNull();
  const [marked, plain] = root.querySelectorAll("details");
  expect(marked.hasAttribute("open")).toBe(false);
  expect(marked.hasAttribute("ephemeral:open")).toBe(true);
  expect(plain.hasAttribute("open")).toBe(true);
  expect(root.querySelector("dialog").hasAttribute("open")).toBe(false);
  expect(root.querySelector("li.card").getAttribute("data-id")).toBe("c-1");
  expect(root.querySelector("li:last-child").getAttribute("class")).toBe("keep");
});

describe("clay.ephemeral helpers", () => {
  test("add, has, remove and toggle edit the word list", () => {
    const node = el("<li></li>");
    ephemeral.add(node, "selected");
    ephemeral.add(node, "selected");
    ephemeral.add(node, "dragging");
    expect(node.getAttribute("ephemeral")).toBe("selected dragging");
    expect(ephemeral.has(node, "dragging")).toBe(true);
    ephemeral.remove(node, "selected");
    expect(node.getAttribute("ephemeral")).toBe("dragging");
    expect(ephemeral.toggle(node, "dragging")).toBe(false);
    expect(node.hasAttribute("ephemeral")).toBe(false);
    expect(ephemeral.toggle(node, "open", true)).toBe(true);
    expect(ephemeral.toggle(node, "open", true)).toBe(true);
    expect(node.getAttribute("ephemeral")).toBe("open");
  });
});

describe("the mutation hub ignores ephemeral state", () => {
  let Mutation;
  beforeAll(async () => {
    Mutation = (await import("../../src/lib/mutation.js")).default;
  });

  test("ephemeral words, marked attributes and a dialog's open reach no subscriber", async () => {
    document.body.innerHTML = '<li id="c">a</li><details id="d" ephemeral:open></details><dialog id="g"></dialog>';
    await new Promise((r) => setTimeout(r, 10));
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });
    ephemeral.add(document.getElementById("c"), "selected");
    document.getElementById("d").setAttribute("open", "");
    document.getElementById("g").setAttribute("open", "");
    document.getElementById("d").removeAttribute("open");
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toHaveLength(0);
    sub();
  });

  test("an unmarked attribute still does", async () => {
    document.body.innerHTML = '<details id="d"></details>';
    await new Promise((r) => setTimeout(r, 10));
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });
    document.getElementById("d").setAttribute("open", "");
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.length).toBeGreaterThan(0);
    sub();
  });
});

test("captureSnapshot and the sync payload carry no ephemeral state", async () => {
  const { captureSnapshot, serializeForSync } = await import("../../src/core/snapshot.js");
  document.body.innerHTML = '<li data-id="c-1" ephemeral="selected">a</li><details ephemeral:open open></details><dialog open>d</dialog>';
  const html = serializeForSync(captureSnapshot({ flushUndo: false, authored: false }));
  expect(html).not.toMatch(/ephemeral="/);
  expect(html).not.toMatch(/<details[^>]*\sopen[\s>=]/);
  expect(html).not.toMatch(/<dialog[^>]*\sopen[\s>=]/);
  expect(html).toContain("ephemeral:open");
  expect(document.querySelector("li").getAttribute("ephemeral")).toBe("selected");
  expect(document.querySelector("details").hasAttribute("open")).toBe(true);
});

test("the saved bytes carry no ephemeral state", async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<li id="a" data-id="c-1" ephemeral="selected">start</li><details ephemeral:open open></details>';
  const saveMod = await import("../../src/core/save.js");
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
  document.getElementById("a").textContent = "changed";
  await saveMod.savePage();
  expect(global.fetch).toHaveBeenCalled();
  const body = global.fetch.mock.calls[0][1].body;
  expect(body).not.toMatch(/ephemeral="/);
  expect(body).not.toMatch(/<details[^>]*\sopen[\s>=]/);
  expect(body).toContain("ephemeral:open");
  expect(body).toContain("changed");
});

describe("an incoming frame cannot write or remove ephemeral state", () => {
  async function morphFrom(html) {
    await HyperMorph.morphDocument(document, html, {
      ignoreAttribute: mergeIgnoresAttr,
      hooks: { beforeAttributeUpdated: mergeVetoesAttr },
    });
  }

  test("a frame without the state leaves ours, and content changes still land", async () => {
    document.body.innerHTML = '<ul><li data-id="c-1" ephemeral="selected">a</li></ul><details ephemeral:open open><summary>s</summary></details>';
    await morphFrom('<html><head></head><body><ul><li data-id="c-1">a2</li></ul><details ephemeral:open><summary>s</summary></details></body></html>');
    expect(document.querySelector("li").getAttribute("ephemeral")).toBe("selected");
    expect(document.querySelector("li").textContent).toBe("a2");
    expect(document.querySelector("details").hasAttribute("open")).toBe(true);
  });

  test("a frame carrying a peer's state writes none of it", async () => {
    document.body.innerHTML = '<ul><li data-id="c-1">a</li></ul><dialog>d</dialog>';
    await morphFrom('<html><head></head><body><ul><li data-id="c-1" ephemeral="selected">a</li></ul><dialog open>d</dialog></body></html>');
    expect(document.querySelector("[ephemeral]")).toBeNull();
    expect(document.querySelector("dialog").hasAttribute("open")).toBe(false);
  });

  test("a frame that drops the marker hands the attribute back to the file", async () => {
    document.body.innerHTML = '<details open ephemeral:open><summary>s</summary></details>';
    await morphFrom('<html><head></head><body><details><summary>s</summary></details></body></html>');
    const d = document.querySelector("details");
    expect(d.hasAttribute("ephemeral:open")).toBe(false);
    expect(d.hasAttribute("open")).toBe(false);
  });

  test("a frame that drops the marker and sets the attribute applies it", async () => {
    document.body.innerHTML = '<details ephemeral:open><summary>s</summary></details>';
    await morphFrom('<html><head></head><body><details open><summary>s</summary></details></body></html>');
    const d = document.querySelector("details");
    expect(d.hasAttribute("ephemeral:open")).toBe(false);
    expect(d.hasAttribute("open")).toBe(true);
  });

  test("a frame that adds the marker keeps this tab's state", async () => {
    document.body.innerHTML = '<details open><summary>s</summary></details>';
    await morphFrom('<html><head></head><body><details ephemeral:open><summary>s</summary></details></body></html>');
    const d = document.querySelector("details");
    expect(d.hasAttribute("ephemeral:open")).toBe(true);
    expect(d.hasAttribute("open")).toBe(true);
  });

  test("a marked disabled input keeps its state through a frame", async () => {
    document.body.innerHTML = '<input name="q" ephemeral:disabled disabled><p>a</p>';
    await morphFrom('<html><head></head><body><input name="q" ephemeral:disabled><p>b</p></body></html>');
    expect(document.querySelector("input").disabled).toBe(true);
    expect(document.querySelector("p").textContent).toBe("b");
  });

  test("a marked disabled input keeps its state through a peer merge against a stripped capture", async () => {
    document.body.innerHTML = '<input name="q" ephemeral:disabled disabled><p>a</p>';
    const root = document.documentElement.cloneNode(true);
    const toLive = new Map();
    const pair = (c, l) => {
      toLive.set(c, l);
      for (let i = 0; i < c.childNodes.length; i++) pair(c.childNodes[i], l.childNodes[i]);
    };
    pair(root, document.documentElement);
    stripEphemeral(root);
    await HyperMorph.mergeDocument({
      live: document,
      base: "<!DOCTYPE html>" + root.outerHTML,
      local: { root, toLive: (n) => toLive.get(n) || null },
      remote: "<!DOCTYPE html>" + root.outerHTML.replace("<p>a</p>", "<p>b</p>"),
      keepLiveOnly: true,
      ignoreAttribute: mergeIgnoresAttr,
      hooks: { beforeAttributeUpdated: mergeVetoesAttr },
    });
    expect(document.querySelector("input").disabled).toBe(true);
    expect(document.querySelector("input").hasAttribute("ephemeral:disabled")).toBe(true);
    expect(document.querySelector("p").textContent).toBe("b");
  });

  test("a peer that drops the marker takes this tab's open state with it", async () => {
    document.body.innerHTML = '<details ephemeral:open open><summary>s</summary></details>';
    const root = document.documentElement.cloneNode(true);
    const toLive = new Map();
    const pair = (c, l) => {
      toLive.set(c, l);
      for (let i = 0; i < c.childNodes.length; i++) pair(c.childNodes[i], l.childNodes[i]);
    };
    pair(root, document.documentElement);
    stripEphemeral(root);
    const html = "<!DOCTYPE html>" + root.outerHTML;
    await HyperMorph.mergeDocument({
      live: document,
      base: html,
      local: { root, toLive: (n) => toLive.get(n) || null },
      remote: html.replace(' ephemeral:open=""', ""),
      keepLiveOnly: true,
      ignoreAttribute: mergeIgnoresAttr,
      hooks: { beforeAttributeUpdated: mergeVetoesAttr },
    });
    const d = document.querySelector("details");
    expect(d.hasAttribute("ephemeral:open")).toBe(false);
    expect(d.hasAttribute("open")).toBe(false);
  });
});

test("stripEphemeral reaches template contents", () => {
  const root = document.createElement("div");
  root.innerHTML = '<template><li ephemeral="selected">a</li><details ephemeral:open open></details><dialog open></dialog></template>';
  stripEphemeral(root);
  const html = root.querySelector("template").innerHTML;
  expect(html).not.toMatch(/ephemeral="/);
  expect(html).not.toMatch(/<details[^>]*\sopen[\s>=]/);
  expect(html).not.toMatch(/<dialog[^>]*\sopen[\s>=]/);
  expect(html).toContain("ephemeral:open");
});

test("region and form-state attributes can never be ephemeral", () => {
  const node = el('<input ephemeral:no-save ephemeral:freeze ephemeral:save-remove ephemeral:value ephemeral:checked no-save freeze save-remove value="v" checked>');
  for (const name of ["no-save", "freeze", "save-remove", "value", "checked", "editor-ui"]) {
    expect(isEphemeralAttr(name, node)).toBe(false);
  }
  const root = document.createElement("div");
  root.append(node);
  stripEphemeral(root);
  for (const name of ["no-save", "freeze", "save-remove", "value", "checked"]) {
    expect(node.hasAttribute(name)).toBe(true);
  }
});

test("an undo scope made with create() ignores ephemeral changes", async () => {
  const { undo } = await import("../../src/plugins/undo.js");
  document.body.innerHTML = '<section id="s"><li id="c">a</li><details id="d" ephemeral:open></details></section>';
  const scoped = undo.create({ scope: document.getElementById("s") });
  scoped.start?.();
  ephemeral.add(document.getElementById("c"), "selected");
  document.getElementById("d").setAttribute("open", "");
  await new Promise((r) => setTimeout(r, 10));
  scoped.flush?.();
  expect(scoped.canUndo).toBe(false);
  scoped.stop?.();
});
