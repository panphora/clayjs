import { PROMPT_CSS } from "./prompt-style.js";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500&display=swap";

const ASIDE = `<aside class="hcp" id="hcp" hidden aria-label="Download this app" data-hcp-state="tab" data-hcp-reason="open" sap-ignore clay="editor-ui">
  <section class="hcp-card" id="hcp-card" role="dialog" aria-modal="false" aria-labelledby="hcp-title">
    <button type="button" class="hcp-x" data-hcp="minimize" aria-label="Minimize"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 12h10v2H3z"/></svg></button>
    <div class="hcp-kicker">Free download</div>
    <h2 class="hcp-title" id="hcp-title"><span data-hcp-for="use">Your numbers are saved in this browser only.</span><span data-hcp-for="open">This app is free to keep.</span><span data-hcp-for="return">Your numbers are saved in this browser only.</span><span data-hcp-for="error">Your work isn't being saved in this browser.</span></h2>
    <p class="hcp-body"><span data-hcp-for="open">Download it as one file and use it on your computer, no account needed.</span><span data-hcp-for="use">Download the file to keep them on your computer for good.</span><span data-hcp-for="return">Download the file to keep them on your computer for good.</span><span data-hcp-for="error">Storage is full or turned off here. Download the file to keep what you've done.</span></p>
    <div class="hcp-file">
      <svg width="26" height="30" viewBox="0 0 26 30" fill="none" aria-hidden="true"><path d="M2 1h15l7 7v21H2z" fill="var(--hcp-surface)" stroke="currentColor" stroke-width="2"/><path d="M17 1v7h7" stroke="currentColor" stroke-width="2"/><path d="M7 15h12M7 19h12M7 23h8" stroke="var(--hcp-muted)" stroke-width="2"/></svg>
      <div><b class="hcp-name" data-hcp-name>This app</b><small>One file with the whole app and your numbers in it</small></div>
    </div>
    <p class="hcp-body">Open it with HTML Clay, a free app for Mac, Windows and Linux. It opens the file in a window and saves every change into it, so your numbers stay on your computer.</p>
    <div class="hcp-actions">
      <a class="hcp-btn hcp-btn--primary" data-hcp-link href="/_/download?as=htmlclay"><span><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7 1h2v8.6l2.8-2.8 1.4 1.4L8 13.4 2.8 8.2l1.4-1.4L7 9.6zM2 13h12v2H2z"/></svg>Download free</span></a>
      <button type="button" class="hcp-btn" data-hcp="minimize"><span>Not now</span></button>
    </div>
    <div class="hcp-foot"><small>Free, and the file is yours to keep.</small><button type="button" class="hcp-quiet" data-hcp="dismiss">Don&rsquo;t show again</button></div>
  </section>
  <div class="hcp-dock">
    <button type="button" class="hcp-btn hcp-tab" data-hcp="open" aria-controls="hcp-card" aria-expanded="false" aria-label="This app is free to keep"><span><svg width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden="true"><path d="M1.5 1h8.5l4.5 4.5V17h-13z" stroke="currentColor" stroke-width="2"/><path d="M10 1v5h4.5" stroke="currentColor" stroke-width="2"/><path d="M8 8v6M5.5 11.5 8 14l2.5-2.5" stroke="currentColor" stroke-width="1.8"/></svg><span class="hcp-tab__label">This app is free to keep</span></span></button>
    <button type="button" class="hcp-x" data-hcp="dismiss" aria-label="Hide this for good"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M1.4 0 6 4.6 10.6 0 12 1.4 7.4 6 12 10.6 10.6 12 6 7.4 1.4 12 0 10.6 4.6 6 0 1.4z"/></svg></button>
  </div>
</aside>`;

export function mountPrompt({ memory, appName, link, onError }) {
  if (!document.getElementById("hcp-style")) {
    document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" clay="editor-ui" href="${FONT_HREF}">\n<style clay="editor-ui" id="hcp-style">${PROMPT_CSS}</style>`);
  }
  if (!document.getElementById("hcp")) document.body.insertAdjacentHTML("beforeend", ASIDE);

  const root = document.getElementById("hcp");
  const ui = memory.get();
  if (!ui.prompt || typeof ui.prompt !== "object") ui.prompt = {};
  const mem = ui.prompt;
  const USES_TO_SHOW = 3;
  const IDLE_MS = 2500;
  const TEXTY = /^(INPUT|TEXTAREA|SELECT)$/;

  const linkEl = root.querySelector("[data-hcp-link]");
  linkEl.href = link;

  if (appName) root.querySelector("[data-hcp-name]").textContent = appName;

  const tab = root.querySelector("[data-hcp=open]");
  function set(state, reason) {
    root.hidden = false;
    root.setAttribute("data-hcp-state", state);
    if (reason) root.setAttribute("data-hcp-reason", reason);
    tab.setAttribute("aria-expanded", state === "card" ? "true" : "false");
    if (state === "card") { mem.shown = true; memory.save(); }
    lift();
  }

  function isHostField(el) {
    return el && !root.contains(el) && (TEXTY.test(el.tagName) || el.isContentEditable);
  }

  let timer = null;
  function maybeShow(reason) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (mem.shown || mem.dismissed || root.getAttribute("data-hcp-state") !== "tab") return;
      const a = document.activeElement;
      if (isHostField(a)) {
        const r = a.getBoundingClientRect();
        const w = Math.min(360, innerWidth - 32);
        if (innerWidth < 700 || (r.right > innerWidth - w - 32 && r.bottom > innerHeight - 380)) return;
      }
      set("card", reason);
    }, IDLE_MS);
  }

  const touched = [];
  function onUse(e) {
    if (root.contains(e.target) || !isHostField(e.target)) return;
    if (touched.indexOf(e.target) < 0) touched.push(e.target);
    mem.uses = Math.max(mem.uses || 0, touched.length);
    if (!mem.shown) memory.save();
    if (touched.length >= USES_TO_SHOW) maybeShow("use");
  }

  function onFocusIn(e) {
    if (!isHostField(e.target)) return;
    if (root.getAttribute("data-hcp-state") === "card") set(mem.shown ? "mini" : "tab");
    if (innerWidth < 700) root.setAttribute("data-hcp-typing", "");
  }
  function onFocusOut() {
    setTimeout(() => { if (!isHostField(document.activeElement)) root.removeAttribute("data-hcp-typing"); }, 50);
  }

  let liftFrame = 0;
  function lift() {
    if (liftFrame) return;
    liftFrame = requestAnimationFrame(() => {
      liftFrame = 0;
      const y = innerHeight - 3, x = innerWidth - 24;
      let raise = 0;
      const hits = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      for (let i = 0; i < hits.length; i++) {
        for (let el = hits[i]; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
          if (root.contains(el) || el.closest("[data-hcp-preview]")) break;
          const pos = getComputedStyle(el).position;
          if (pos === "fixed" || pos === "sticky") { raise = Math.max(raise, Math.ceil(innerHeight - el.getBoundingClientRect().top)); break; }
        }
      }
      root.style.setProperty("--hcp-lift", (raise > 0 && raise < innerHeight / 3 ? raise : 0) + "px");
    });
  }

  function downloadCurrent() {
    const getHTML = window.clay && window.clay.getHTML;
    if (typeof getHTML !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    const segment = location.pathname.split("/").filter(Boolean).pop() || "index.html";
    const objectUrl = URL.createObjectURL(new Blob([getHTML()], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = segment.replace(/\.html$/, ".htmlclay");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL?.(objectUrl), 1000);
    return true;
  }

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-hcp]");
    if (t) {
      const act = t.getAttribute("data-hcp");
      if (act === "open") { set("card", "open"); linkEl.focus(); }
      else if (act === "minimize") { set("mini"); tab.focus(); }
      else if (act === "dismiss") {
        if (root.getAttribute("data-hcp-reason") === "error") { set("mini"); tab.focus(); }
        else { mem.dismissed = true; memory.save(); set("dismissed"); }
      }
      return;
    }
    if (e.target.closest("[data-hcp-link]")) {
      if (root.getAttribute("data-hcp-reason") === "error") {
        e.preventDefault();
        downloadCurrent();
      }
      mem.downloaded = true; mem.shown = true; memory.save();
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.getAttribute("data-hcp-state") === "card") { set("mini"); tab.focus(); }
  });

  function showError() { set("card", "error"); }
  function clearError() {
    if (root.getAttribute("data-hcp-reason") === "error") root.setAttribute("data-hcp-reason", "use");
  }
  function hideForIntro(on) {
    if (on) root.setAttribute("data-hcp-intro", "");
    else root.removeAttribute("data-hcp-intro");
  }

  const api = { set, root, showError, clearError, hideForIntro };

  if (mem.dismissed) { root.setAttribute("data-hcp-state", "dismissed"); return api; }

  document.addEventListener("input", onUse, true);
  document.addEventListener("change", onUse, true);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  addEventListener("scroll", lift, { passive: true });
  addEventListener("resize", lift);
  document.addEventListener("transitionend", lift, true);

  set(mem.shown ? "mini" : "tab");
  if (!mem.shown && (mem.uses || 0) >= USES_TO_SHOW) maybeShow("return");

  return api;
}
