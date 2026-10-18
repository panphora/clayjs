// What a heal notice names, and what it costs, after a room loss drops what
// this tab typed. Round 12 review: the whole-word widening was quadratic on an
// unbroken run, and named a whole CJK run for a few lost characters.
import { createReplay } from "../../../../src/page/replay.js";
import { createHealCheck } from "../../../../src/page/heal-check.js";

function lose(inserted, remaining, shown = false) {
  const r = createReplay({ t: "p", c: "x." }, { me: "a", epoch: "e1" });
  const notices = [];
  const h = createHealCheck({ r, me: "a", setTimer: () => 1, clearTimer() {}, ready: () => true, notice: (t) => notices.push(t) });
  h.edit(1, 1, inserted);
  const X = { t: "p", c: "x" + inserted + ".", w: { a: "a", e: "e1", k: 0, s: [[1, 1, "", 2]] } };
  h.wrote(X);
  h.step(X, 1);
  h.released(r.S.c);
  h.arm();
  h.join({ t: "p", c: "x" + remaining + "." }, 20, { epoch: "e2", since: 0, ...(shown ? { shown: X.c } : {}) });
  h.released(r.S.c);
  const t = performance.now();
  h.check();
  return { notices, ms: performance.now() - t };
}

// Text without repeats: repeated characters cannot be aligned for sure, so a
// loss among them names every one (round 12, decision 3).
const unique = (n, from) => Array.from({ length: n }, (_, i) => String.fromCodePoint(from + ((i * 7919) % 20000))).join("");
function token(n, seed = 7) {
  let x = seed;
  return Array.from({ length: n }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[((x = (x * 1103515245 + 12345) >>> 0) >>> 16) % 62]).join("");
}

describe("heal notices name words", () => {
  test.each([
    [" hello", " hel", " hello"],
    [" the farm", " the", " farm"],
    [" 日本語", " 日本", " 日本語"],
    [" 😀😃", " 😀", "😃"],
    [" 👩‍💻", " 👩", " 👩‍💻"],
    ["　日本語", "　日本", "　日本語"],
  ])("typing %j and keeping %j names %j", (inserted, remaining, named) => {
    for (const shown of [false, true]) {
      const { notices } = lose(inserted, remaining, shown);
      expect(notices).toEqual([named]);
      expect(notices[0].isWellFormed()).toBe(true);
    }
  });

  test("a word longer than 64 units names only its lost units", () => {
    const url = " https://example.com/" + token(80);
    const { notices } = lose(url, url.slice(0, -10));
    expect(notices).toEqual([url.slice(-10)]);
  });

  test("a lost CJK tail names its words, not the whole run", () => {
    const typed = unique(300, 0x4e00);
    const { notices } = lose(typed, typed.slice(0, -20));
    expect(notices).toHaveLength(1);
    expect(notices[0].endsWith(typed.slice(-20))).toBe(true);
    expect(notices[0].length).toBeLessThan(60);
  });

  test("an unbroken run of 16,000 lost units is named in one linear pass", () => {
    const { notices, ms } = lose("漢".repeat(16000), "");
    expect(notices[0].length).toBe(16000);
    expect(ms).toBeLessThan(200);
  });
});
