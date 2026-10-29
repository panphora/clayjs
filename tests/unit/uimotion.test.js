import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { assets } from "../../src/lib/assets.js";
import { mount, rewind, scene } from "../../src/lib/uimotion.js";

/**
 * `mount` is the one lifecycle every free app's intro scene runs under: it builds the
 * scene while the stage is in the page, rebuilds it when the stage's width changes,
 * pauses it while the tab is hidden or the stage is off screen, and stops it for good
 * once the stage leaves. jsdom has neither Element.animate nor the observers, so these
 * drive it with a fake stage and fake observers that hand their callbacks back.
 */

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeResizeObserver.instances.push(this);
  }
  observe(el) {
    this.target = el;
  }
  disconnect() {
    this.disconnected = true;
  }
}
FakeResizeObserver.instances = [];

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el) {
    this.target = el;
  }
  disconnect() {
    this.disconnected = true;
  }
  intersect(isIntersecting) {
    this.callback([{ isIntersecting }]);
  }
}
FakeIntersectionObserver.instances = [];

class FakeEl {
  constructor(doc, { w = 24, h = 24 } = {}) {
    this.ownerDocument = doc;
    this.style = {};
    this.dataset = {};
    this.classList = { contains: () => false };
    this.attrs = {};
    this.anims = [];
    this.children = [];
    this.parentElement = null;
    this.nextElementSibling = null;
    this.isConnected = true;
    this.offsetWidth = w;
    this.clientLeft = 0;
    this.clientTop = 0;
    this.box = { x: 0, y: 0, w, h };
  }
  getBoundingClientRect() {
    const { x, y, w, h } = this.box;
    return { left: x, top: y, width: w, height: h };
  }
  setAttribute(name, value) {
    this.attrs[name] = value;
  }
  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }
  remove() {
    this.isConnected = false;
    const at = this.parentElement?.children.indexOf(this) ?? -1;
    if (at >= 0) this.parentElement.children.splice(at, 1);
  }
  querySelectorAll(selector) {
    return this.map?.[selector] ?? [];
  }
  animate(frames, opts) {
    const anim = {
      frames,
      opts,
      currentTime: 0,
      playState: "idle",
      playbackRate: 1,
      cancelled: false,
      pause() {
        this.playState = "paused";
      },
      play() {
        this.playState = "running";
      },
      cancel() {
        this.playState = "idle";
        this.cancelled = true;
      },
    };
    this.anims.push(anim);
    return anim;
  }
}

const fakeDocument = ({ reduce = false } = {}) => {
  const listeners = new Set();
  const doc = {
    visibilityState: "visible",
    fonts: { status: "loaded" },
    createElement: () => new FakeEl(doc),
    addEventListener: (type, fn) => {
      if (type === "visibilitychange") listeners.add(fn);
    },
    removeEventListener: (type, fn) => listeners.delete(fn),
    defaultView: {
      getComputedStyle: (el) => ({ position: "relative", transformOrigin: el.transformOrigin ?? "0px 0px" }),
      matchMedia: () => ({ matches: reduce }),
    },
    fire: (type) => [...listeners].forEach((fn) => fn(type)),
    get listeners() {
      return listeners.size;
    },
  };
  return doc;
};

const fakeStage = ({ width = 800, height = 600, reduce = false } = {}) => {
  const doc = fakeDocument({ reduce });
  const stage = new FakeEl(doc, { w: width, h: height });
  const card = new FakeEl(doc, { w: 200, h: 100 });
  stage.offsetWidth = width;
  stage.map = { ".card": [card] };
  return { stage, card, doc };
};

// The scene every intro resembles: a rise, a cursor travelling to the card, and the
// reset that gives the loop its still pose.
const build = (stage) => {
  const s = scene(stage);
  s.rise(".card");
  s.move(".card");
  s.reset();
  return s;
};

const frames = [];
const flush = () => {
  while (frames.length) frames.shift()();
};
const animsOf = (handle) => handle.scene?.animations ?? [];
const playStates = (handle) => animsOf(handle).map((a) => a.playState);
const times = (handle) => animsOf(handle).map((a) => a.currentTime);

const saved = { ResizeObserver: undefined, IntersectionObserver: undefined, requestAnimationFrame: undefined };

beforeEach(() => {
  FakeResizeObserver.instances = [];
  FakeIntersectionObserver.instances = [];
  saved.ResizeObserver = globalThis.ResizeObserver;
  saved.IntersectionObserver = globalThis.IntersectionObserver;
  saved.requestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.ResizeObserver = FakeResizeObserver;
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
});

afterEach(() => {
  flush();
  globalThis.ResizeObserver = saved.ResizeObserver;
  globalThis.IntersectionObserver = saved.IntersectionObserver;
  globalThis.requestAnimationFrame = saved.requestAnimationFrame;
});

test("mount builds the scene once and plays it", () => {
  const { stage } = fakeStage();
  let builds = 0;
  const handle = mount(stage, (el) => {
    builds += 1;
    return build(el);
  });
  expect(builds).toBe(1);
  expect(handle.scene).toBe(stage.uimotionScene);
  expect(stage.dataset.uimotion).toBe("ready");
  expect(animsOf(handle).length).toBeGreaterThan(0);
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "running"));
  expect(FakeResizeObserver.instances[0].target).toBe(stage);
});

test("a stage with no width builds nothing", () => {
  const { stage } = fakeStage({ width: 0 });
  let builds = 0;
  const handle = mount(stage, (el) => {
    builds += 1;
    return build(el);
  });
  expect(builds).toBe(0);
  expect(handle.scene).toBe(null);
  expect(stage.dataset.uimotion).toBeUndefined();
});

test("a width change rebuilds the scene at the time it had reached", () => {
  const { stage } = fakeStage();
  let builds = 0;
  const handle = mount(stage, (el) => {
    builds += 1;
    return build(el);
  });
  const first = handle.scene;
  first.animations[0].currentTime = 120;
  stage.offsetWidth = 600;
  FakeResizeObserver.instances[0].callback([]);
  flush();
  expect(builds).toBe(2);
  expect(handle.scene).not.toBe(first);
  expect(first.animations.every((a) => a.cancelled)).toBe(true);
  expect(times(handle)).toEqual(animsOf(handle).map(() => 120));
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "running"));
});

test("a hidden tab pauses the scene and showing it plays again", () => {
  const { stage, doc } = fakeStage();
  const handle = mount(stage, build);
  doc.visibilityState = "hidden";
  doc.fire("visibilitychange");
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "paused"));
  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "running"));
});

test("a stage scrolled off screen pauses and coming back plays", () => {
  const { stage } = fakeStage();
  const handle = mount(stage, build);
  const io = FakeIntersectionObserver.instances[0];
  io.intersect(false);
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "paused"));
  io.intersect(true);
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "running"));
});

test("a stage taken out of the page stops for good", () => {
  const { stage, doc } = fakeStage();
  const handle = mount(stage, build);
  const s = handle.scene;
  const cursor = s.cursor;
  const ro = FakeResizeObserver.instances[0];
  const io = FakeIntersectionObserver.instances[0];
  stage.isConnected = false;
  ro.callback([]);
  expect(s.animations.every((a) => a.cancelled)).toBe(true);
  expect(cursor.isConnected).toBe(false);
  expect(stage.dataset.uimotion).toBeUndefined();
  expect(stage.uimotionScene).toBeUndefined();
  expect(handle.scene).toBe(null);
  expect(ro.disconnected).toBe(true);
  expect(io.disconnected).toBe(true);
  expect(doc.listeners).toBe(0);
  stage.offsetWidth = 500;
  ro.callback([]);
  flush();
  expect(handle.scene).toBe(null);
});

test("reduced motion leaves every animation halted at the scene's still pose", () => {
  const { stage } = fakeStage({ reduce: true });
  const handle = mount(stage, build);
  const s = handle.scene;
  expect(s.stillAt).toBeGreaterThan(0);
  expect(s.playing).toBe(false);
  expect(playStates(handle)).toEqual(animsOf(handle).map(() => "paused"));
  expect(times(handle)).toEqual(animsOf(handle).map(() => s.stillAt));
});

test("rewind adds a zero-length tween for each changed property, except opacity on keep", () => {
  const { stage, card } = fakeStage();
  const s = scene(stage);
  s.rise(".card");
  const before = s.tweens.length;
  rewind(s, [card]);
  const added = s.tweens.slice(before);
  expect(added.map((tw) => tw.prop)).toEqual(["translate"]);
  expect(added[0].el).toBe(card);
  expect(added[0].dur).toBe(0);
  expect(added[0].start).toBe(270);
  expect(added[0].to).toEqual([0, 14]);
});

test("rewind with nothing to keep returns the opacity the scene faded in", () => {
  const { stage } = fakeStage();
  const s = scene(stage);
  s.rise(".card");
  const before = s.tweens.length;
  rewind(s);
  const added = s.tweens.slice(before);
  expect(added.map((tw) => tw.prop).sort()).toEqual(["opacity", "translate"]);
  const opacity = added.find((tw) => tw.prop === "opacity");
  expect(opacity.dur).toBe(0);
  expect(opacity.to).toEqual([0.2]);
});

test("clay.assets.load('uimotion') resolves the engine", async () => {
  const uimotion = await assets.load("uimotion");
  expect(typeof uimotion.ease).toBe("object");
  expect(typeof uimotion.scene).toBe("function");
  expect(typeof uimotion.rewind).toBe("function");
  expect(typeof uimotion.mount).toBe("function");
});
