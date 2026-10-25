// Which block types each optional feature serves, and how to load its view part.
// Literal imports, so the chunk build gives each feature its own files.
export const FEATURES = {
  table: { types: ["table"], load: () => import("./table.js") },
  board: { types: ["board"], load: () => import("./board.js") },
};

export const featureForType = (type) => Object.keys(FEATURES).find((id) => FEATURES[id].types.includes(type)) ?? null;
