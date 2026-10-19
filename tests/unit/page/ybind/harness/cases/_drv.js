import { Sim, createRoom, engine, legacy } from "../compat.js";
export { engine, Sim, createRoom };
export async function tabs(text, ids, { room: roomOpts, quiet } = {}) {
  const sim = new Sim(), initial = engine.initial(text);
  const room = createRoom(sim, { page: initial }, roomOpts);
  const list = ids.map((id) => engine.makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)), { quiet }));
  for (const t of list) t.start();
  await sim.run(500);
  const roomText = () => legacy(room).blocks.p?.c ?? null;
  const roomBlock = () => legacy(room).blocks.p ?? null;
  const result = () => ({ room: roomText(), views: list.map((t) => t.view), notices: list.flatMap((t) => t.allNotices()) });
  const done = () => { for (const t of list) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} } };
  return { sim, room, list, result, roomText, roomBlock, done };
}
