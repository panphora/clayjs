import { jest } from "@jest/globals";

// The other ordering of the precedence rule: the section bar is already up when a
// conflict arrives. The conflict notice matters more and sits in the same corner, so it
// has to put the section bar away itself.

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = "";
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ spec: 1, extensions: ["sync", "presence"], document: null }) }));
});

test("a conflict that arrives while the section bar is showing hides the bar", async () => {
  window.clayEditMode = true;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    const { conflicts, beginApply, completeApply } = await import("../../src/sync/conflicts.js");
    window.clay = { conflicts };
    const { SectionNotice } = await import("../../src/sync/section-notice.js");
    await import("../../src/core/conflict-notice.js");
    document.body.innerHTML = "<h2>Pricing</h2>";
    const notice = new SectionNotice();
    notice.show("Ada Lovelace");
    expect(notice.root.style.display).toBe("flex");

    const applyId = beginApply({ source: "peer", domain: "sync", root: document.body.cloneNode(true) });
    completeApply(applyId, [{ kind: "text", node: document.querySelector("h2"), local: "Plans for teams", remote: "Pricing", base: "Pricing" }], { ticket: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(document.querySelector("[data-clay-conflict]").style.display).toBe("flex");
    expect(notice.root.style.display).toBe("none");
    for (const record of conflicts.list()) conflicts.acknowledge([record.id], { reason: "accepted" });
  } finally {
    window.requestAnimationFrame = raf;
    delete window.clayEditMode;
    delete window.clay;
  }
});
