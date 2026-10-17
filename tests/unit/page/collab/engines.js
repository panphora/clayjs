// The engines the S1 rows and fuzz run on, by name: "text" (the simulated tab,
// text/tab.js) and "blocks" (real EditorViews bound by src/page/binding.js,
// blocks/editor-tab.js). ENGINES=blocks,text picks them.
export async function engines(names = process.env.ENGINES || "blocks") {
  const out = [];
  for (const name of names.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (name === "text") out.push((await import("./text/tab.js")).engine);
    else if (name === "blocks") out.push((await import("./blocks/editor-tab.js")).engine);
    else throw new Error(`unknown engine ${name}`);
  }
  return out;
}
