import { jest } from "@jest/globals";

let wire;
let save;
let resetHostMeta;
let socket;
let calls;

class FakeEventSource {
  constructor() {
    this.closed = false;
    socket = this;
    Promise.resolve().then(() => this.onopen && this.onopen());
  }

  close() {
    this.closed = true;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ wire } = await import("../../src/plugins/wire.js"));
  save = await import("../../src/core/save.js");
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(async () => {
  socket = null;
  calls = [];
  resetHostMeta();
  document.body.innerHTML = "<main><p>one</p></main>";
  await Promise.resolve();
  window.clay = { save: save.savePage };

  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/meta")) {
      calls.push({ lane: "meta" });
      return {
        ok: true,
        text: async () => JSON.stringify({ spec: 1, extensions: ["wire"], document: {} }),
      };
    }
    if (String(url).includes("/_/wire/send")) {
      calls.push({ lane: "wire", body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ delivered: 1 }) };
    }
    calls.push({ lane: "save" });
    return { ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved" }) };
  });
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  delete window.clay;
});

test("an editing helper and a data helper use independent document lifecycles", async () => {
  document.querySelector("main p").textContent = "dirty";
  const data = wire.send({}, { id: "data-helper", helper: "search" });
  const edit = wire.send({}, { id: "editing-helper", helper: "redpen", document: "edit" });
  await settle();
  await settle();

  expect(calls.filter(({ lane }) => lane === "save")).toHaveLength(1);
  expect(calls.filter(({ lane }) => lane === "wire").map(({ body }) => body.document).sort())
    .toEqual(["edit", "none"]);

  socket.onmessage({
    data: JSON.stringify({ type: "wire/done", id: data.id, payload: { matches: [] } }),
  });
  socket.onmessage({
    data: JSON.stringify({ type: "wire/done", id: edit.id, payload: { changed: true } }),
  });

  expect(data.state).toBe("done");
  expect(edit.state).toBe("landing");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk" } }));
  await expect(edit.done).resolves.toMatchObject({ state: "done", result: { changed: true } });
});
