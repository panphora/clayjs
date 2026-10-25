// Which block types each optional feature serves, which node views its part
// supplies, and how to load it.
// Literal imports, so the chunk build gives each feature its own files.
export const FEATURES = {
  table: { types: ["table"], views: ["table", "table_cell"], load: () => import("./table.js") },
  board: { types: ["board"], load: () => import("./board.js") },
  media: { types: ["image", "file"], load: () => import("./media.js") },
  tool: { types: ["tool"], load: () => import("./tool.js") },
};

export const featureForType = (type) => Object.keys(FEATURES).find((id) => FEATURES[id].types.includes(type)) ?? null;
