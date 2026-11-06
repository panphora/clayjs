import { readFileSync } from "node:fs";
import { resolveModules } from "../../src/loader-logic.js";

const golden = JSON.parse(readFileSync(new URL("../fixtures/load/resolve-golden.json", import.meta.url), "utf8"));

const URLS = {
  journal: "plugins=sync,visitor-drafts,bind-text,menu,upload&exclude=richclay",
  kanban: "plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu,undo&exclude=richclay",
  page: "plugins=page,menu,indicator",
  calculator: "plugins=visitor-drafts,menu",
};
const MODES = [["view", false, false, false], ["viewOwner", false, false, true], ["edit", true, false, true], ["draft", true, true, false]];
const SOURCE = "https://hyperclay.com/templates/x/hosted/latest.html";

function resolve(url, mode, extra = {}) {
  const [, edit, draft, canEdit] = mode;
  return resolveModules(new URLSearchParams(url), edit, { isDraftMode: draft, hasSap: true, canEdit, templateSource: SOURCE, ...extra });
}

function withPlugins(url, ...names) {
  const params = new URLSearchParams(url);
  params.set("plugins", [...params.get("plugins").split(","), ...names].join(","));
  return params.toString();
}

function withExclude(url, ...names) {
  const params = new URLSearchParams(url);
  const current = params.get("exclude");
  params.set("exclude", [...(current ? current.split(",") : []), ...names].join(","));
  return params.toString();
}

function paths(result) {
  return [...result.core, ...result.plugins, ...result.late];
}

test("the golden file covers every document and mode it claims to", () => {
  expect(Object.keys(golden).length).toBe(4);
  for (const urlName of Object.keys(URLS)) {
    expect(Object.keys(golden[urlName]).sort()).toEqual(MODES.map(([name]) => name).sort());
  }
});

describe("a document that does not name visitor-menu resolves as it always has", () => {
  for (const [urlName, url] of Object.entries(URLS)) {
    for (const mode of MODES) {
      test(`${urlName} in ${mode[0]}`, () => {
        expect(resolve(url, mode)).toEqual(golden[urlName][mode[0]]);
      });
    }
  }
});

describe("visitor-menu", () => {
  const journal = URLS.journal;

  test("alone in view mode gives no module and no draft activation", () => {
    const result = resolve("plugins=visitor-menu", MODES[0], { hasSap: false });
    expect(result.plugins).toEqual([]);
    expect(result.late).toEqual([]);
    expect(paths(result)).not.toContain("plugins/visitor-drafts-owner.js");
    expect(paths(resolve("plugins=visitor-menu", MODES[2]))).not.toContain("plugins/visitor-menu.js");
  });

  test("is absent for an owner who opens the document in view", () => {
    expect(paths(resolve(withPlugins(journal, "visitor-menu"), MODES[1]))).not.toContain("plugins/visitor-menu.js");
  });

  test("is still loaded for a visitor when the old menu is excluded", () => {
    const result = paths(resolve("plugins=visitor-drafts,menu,visitor-menu&exclude=menu", MODES[3]));
    expect(result).toContain("plugins/visitor-menu.js");
    expect(result).not.toContain("plugins/menu.js");
  });

  test("a menu named for its variants gives a draft no menu at all", () => {
    const result = paths(resolve("plugins=visitor-drafts,menu", MODES[3], { hasVariants: true }));
    expect(result).not.toContain("plugins/menu.js");
    expect(result).not.toContain("plugins/visitor-menu.js");
  });

  test("an owner naming both gets plugins/menu.js only", () => {
    const result = paths(resolve(withPlugins(journal, "menu,visitor-menu"), MODES[1], { hasVariants: true }));
    expect(result).toContain("plugins/menu.js");
    expect(result).not.toContain("plugins/visitor-menu.js");
  });

  test("the Journal in draft gets the visitor menu and not the owner menu", () => {
    const named = resolve(withPlugins(journal, "visitor-menu"), MODES[3]);
    expect(named.plugins).toContain("plugins/visitor-menu.js");
    expect(named.plugins).not.toContain("plugins/menu.js");
    expect(named.late).not.toContain("plugins/menu.js");
    expect(named.core).toEqual(golden.journal.draft.core);
  });

  test("every other mode of the named Journal equals the golden entry", () => {
    for (const mode of MODES.filter(([name]) => name !== "draft")) {
      expect(resolve(withPlugins(journal, "visitor-menu"), mode)).toEqual(golden.journal[mode[0]]);
    }
  });

  test("exclude=visitor-menu removes it", () => {
    const result = paths(resolve(withExclude(withPlugins(journal, "visitor-menu"), "visitor-menu"), MODES[3]));
    expect(result).not.toContain("plugins/visitor-menu.js");
  });
});
