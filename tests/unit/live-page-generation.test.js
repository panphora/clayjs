import { readFileSync } from "node:fs";
import { createRooms } from "../../src/server/rooms/index.js";
import { createStore } from "../../src/live/store.js";
import { cloneJson } from "../../src/live/ops.js";
import { createFastLane } from "../../src/live/fast-lane.js";

const TEMPLATE = new URL("../fixtures/ypage-template.html", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("page frames carry the room's page generation, other stores none", async () => {
  const rooms = createRooms({ newEpoch: (() => { let n = 0; return () => `e${++n}`; })() });
  const room = rooms.open("doc", readFileSync(TEMPLATE, "utf8"), { nodeId: 1 });
  expect(room.pageTransition.format).toBe("yjs");
  const pageValue = room.stores.get("page").value;
  const seed = pageValue.y[Object.keys(pageValue.y)[0]];

  const page = createStore({ name: "page", value: pageValue });
  const tools = createStore({ name: "page.tools", value: room.stores.get("page.tools").value });
  const entries = new Map([["page", { store: page }], ["page.tools", { store: tools }]]);
  const sent = [];
  const refused = [];
  let handlers;
  const state = () => cloneJson(rooms.state(room, "a", null));
  const resultOf = (frame) => {
    const body = rooms.apply(room, "a", frame);
    return body.error ? { status: 409, body: { code: body.error } } : { status: 200, body };
  };
  const lane = createFastLane({ entries, transport: {
    start(h) { handlers = h; return () => {}; },
    fetchState: async () => state(),
    send: async (_, frame) => {
      sent.push(cloneJson(frame));
      return resultOf(frame);
    },
  } });
  for (const store of [page, tools]) {
    store.onLocal((ops) => lane.local(store.name, ops, store.mark));
    store.onDelivery((event) => { if (event.phase === "refused") refused.push(event); });
  }
  lane.start();
  handlers.open({ clientId: "a" });
  await sleep(20);
  expect(lane.status.synced).toBe(true);

  page.handle.set(["y", "u1"], seed);
  await sleep(50);
  const pageFrames = sent.filter((frame) => frame.name === "page");
  expect(pageFrames.length).toBe(1);
  expect(pageFrames[0].pageGeneration).toBe(room.pageTransition.id);
  expect(refused.map((event) => event.code)).toEqual([]);
  expect(room.stores.get("page").value.y.u1).toBe(seed);

  tools.handle.set(["k"], 1);
  await sleep(50);
  const toolFrames = sent.filter((frame) => frame.name === "page.tools");
  expect(toolFrames.length).toBe(1);
  expect("pageGeneration" in toolFrames[0]).toBe(false);
  expect(refused.map((event) => event.code)).toEqual([]);
  expect(room.stores.get("page.tools").value.k).toBe(1);

  lane.stop();
});
