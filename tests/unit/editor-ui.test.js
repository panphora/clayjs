import { mountEditorUI, HOST_CSS } from "../../src/ui/editor-ui.js";
import { deepActiveElement } from "../../src/dom/active-element.js";
import { resolveRegionPolicy } from "../../src/lib/region-policy.js";
import { captureSnapshot } from "../../src/core/snapshot.js";
import { hostOf, rootOf, $, active, sheetText } from "./helpers/editor-ui.js";

// Scenario: ClayJS mounts its own interface inside an open shadow root so a page's CSS
// cannot restyle it, and nothing inside ever reaches the saved file.

function panel() {
  const content = document.createElement("div");
  content.className = "clay-test-panel";
  content.innerHTML = '<input class="clay-test-field" value="private"><button class="clay-test-go">Go</button>';
  return content;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("mountEditorUI", () => {
  test("mounts the content inside an open root on a marked host", () => {
    const content = panel();
    const ui = mountEditorUI({ name: "menu", content, attributes: { "clay-mode-toggle": "" } });

    expect(ui.host.tagName).toBe("CLAY-EDITOR-UI");
    expect(ui.host.getAttribute("data-clay-ui")).toBe("menu");
    expect(ui.host.getAttribute("clay")).toBe("editor-ui");
    expect(ui.host.hasAttribute("clay-mode-toggle")).toBe(true);
    expect(ui.host.shadowRoot).toBe(ui.shadow);
    expect(ui.shadow.mode).toBe("open");
    expect(ui.content).toBe(content);
    expect(content.parentNode).toBe(ui.shadow);
    expect(content.getAttribute("clay")).toBe("editor-ui");
    expect(hostOf("menu")).toBe(ui.host);
    expect($(".clay-test-go", "menu")).toBe(content.querySelector(".clay-test-go"));
    expect(document.querySelector(".clay-test-go")).toBeNull();
  });

  test("keeps the content's existing clay tokens", () => {
    const content = panel();
    content.setAttribute("clay", "no-undo");
    mountEditorUI({ name: "seo", content });
    expect(content.getAttribute("clay")).toBe("no-undo editor-ui");
  });

  test("inserts the host at parent and before", () => {
    document.body.innerHTML = '<main id="page">page</main>';
    const page = document.getElementById("page");
    const ui = mountEditorUI({ name: "seo", content: panel(), before: page });
    expect(document.body.firstElementChild).toBe(ui.host);

    const tail = mountEditorUI({ name: "menu", content: panel() });
    expect(document.body.lastElementChild).toBe(tail.host);
  });

  test("without adoptable sheets, puts one style per text inside the root, reset first", () => {
    mountEditorUI({ name: "menu", content: panel(), css: [".a { color: red }", ".b { color: blue }"] });
    const styles = rootOf("menu").querySelectorAll("style");
    expect(Array.from(styles, (style) => style.textContent)).toEqual([HOST_CSS, ".a { color: red }", ".b { color: blue }"]);
    expect(sheetText("menu")).toContain("all: initial !important");
    expect(sheetText("menu")).toContain("display: contents !important");
    expect(document.head.querySelector("style")).toBeNull();
  });

  test("remove() takes the host and everything inside away", () => {
    const ui = mountEditorUI({ name: "menu", content: panel() });
    ui.remove();
    expect(hostOf("menu")).toBeNull();
    expect(document.body.children.length).toBe(0);
  });

  test("a field inside the root is runtime-only for the region policy", () => {
    const content = panel();
    mountEditorUI({ name: "seo", content });
    const policy = resolveRegionPolicy(content.querySelector(".clay-test-field"));
    expect(policy.persist).toBe("none");
    expect(policy.watched).toBe(false);
    expect(policy.undoable).toBe(false);
  });

  test("a capture holds neither the host nor anything inside it", () => {
    document.body.innerHTML = '<main id="page">page text</main>';
    mountEditorUI({ name: "menu", content: panel() });
    const html = captureSnapshot({ flushUndo: false, authored: false }).outerHTML;
    expect(html).toContain("page text");
    expect(html).not.toContain("clay-editor-ui");
    expect(html).not.toContain("clay-test-panel");
    expect(html).not.toContain("private");
  });
});

describe("shared stylesheets", () => {
  let restore;

  beforeEach(() => {
    const made = [];
    class FakeSheet {
      constructor() {
        made.push(this);
      }
      replaceSync(text) {
        this.text = text;
      }
    }
    const original = window.CSSStyleSheet;
    const proto = window.ShadowRoot.prototype;
    window.CSSStyleSheet = FakeSheet;
    Object.defineProperty(proto, "adoptedStyleSheets", {
      configurable: true,
      get() {
        return this._adopted || [];
      },
      set(sheets) {
        this._adopted = sheets;
      },
    });
    restore = () => {
      window.CSSStyleSheet = original;
      delete proto.adoptedStyleSheets;
    };
    restore.made = made;
  });

  afterEach(() => restore());

  test("roots with the same text adopt one sheet, built once per document", () => {
    const menu = mountEditorUI({ name: "menu", content: panel(), css: [".menu {}"] });
    const seo = mountEditorUI({ name: "seo", content: panel(), css: [".menu {}", ".sheet {}"] });

    expect(menu.shadow.adoptedStyleSheets.map((sheet) => sheet.text)).toEqual([HOST_CSS, ".menu {}"]);
    expect(seo.shadow.adoptedStyleSheets.map((sheet) => sheet.text)).toEqual([HOST_CSS, ".menu {}", ".sheet {}"]);
    expect(seo.shadow.adoptedStyleSheets[0]).toBe(menu.shadow.adoptedStyleSheets[0]);
    expect(seo.shadow.adoptedStyleSheets[1]).toBe(menu.shadow.adoptedStyleSheets[1]);
    expect(restore.made.length).toBe(3);
    expect(menu.shadow.querySelector("style")).toBeNull();
  });
});

describe("deepActiveElement", () => {
  test("follows focus into an open root", () => {
    const content = panel();
    const ui = mountEditorUI({ name: "menu", content });
    const go = content.querySelector(".clay-test-go");
    go.focus();
    expect(document.activeElement).toBe(ui.host);
    expect(deepActiveElement()).toBe(go);
    expect(active()).toBe(go);
  });

  test("is the plain active element outside any root", () => {
    document.body.innerHTML = '<input id="outside">';
    const outside = document.getElementById("outside");
    outside.focus();
    expect(deepActiveElement()).toBe(outside);
  });
});

describe("typing inside a root", () => {
  test("a page's own key listeners never see plain typing in a field inside a root", () => {
    const content = panel();
    mountEditorUI({ name: "seo", content });
    const field = content.querySelector(".clay-test-field");
    const seen = [];
    const listen = (event) => seen.push(event.key);
    document.addEventListener("keydown", listen, true);
    try {
      field.focus();
      for (const key of ["/", "a", "Backspace", "ArrowLeft", "End"]) field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
      expect(seen).toEqual([]);

      for (const key of ["Escape", "Enter", "Tab"]) field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, composed: true }));
      expect(seen).toEqual(["Escape", "Enter", "Tab", "z"]);
    } finally {
      document.removeEventListener("keydown", listen, true);
    }
  });

  test("typing in a page field still reaches the page", () => {
    mountEditorUI({ name: "menu", content: panel() });
    document.body.insertAdjacentHTML("beforeend", '<input id="page-field">');
    const field = document.getElementById("page-field");
    const seen = [];
    const listen = (event) => seen.push(event.key);
    document.addEventListener("keydown", listen, true);
    try {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, composed: true }));
      expect(seen).toEqual(["/"]);
    } finally {
      document.removeEventListener("keydown", listen, true);
    }
  });

  test("the host leaves the printed page", () => {
    expect(HOST_CSS).toContain("@media print { :host { display: none !important; } }");
  });
});
