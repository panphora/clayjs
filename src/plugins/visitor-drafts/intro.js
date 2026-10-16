import { INTRO_CSS } from "./intro-style.js";

export const COPY = {
  kicker: "Free app",
  download: "Download free",
  signupLabel: "I make one of these about every two weeks. Get the next one by email.",
  emailPlaceholder: "you@example.com",
  signup: "Send me the next one",
  signupThanks: "Thanks. Check your email for a link to confirm.",
  signupFailed: "That didn't go through. Check the address and try again.",
  start: (appName) => `Start using ${appName}`,
  about: "About this app",
  label: (appName) => `About ${appName}`,
};

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

function forced() {
  try {
    return new URLSearchParams(window.location.search).get("intro") === "1";
  } catch {
    return false;
  }
}

function stylesOnce() {
  if (document.getElementById("clay-intro-style")) return;
  const style = document.createElement("style");
  style.id = "clay-intro-style";
  style.setAttribute("clay", "editor-ui");
  style.textContent = INTRO_CSS;
  document.head.appendChild(style);
}

function focusApp() {
  const next = [...document.querySelectorAll(FOCUSABLE)].find(
    (el) => !el.disabled && !el.closest("[clay~='editor-ui']")
  );
  if (next) next.focus();
  else document.body.focus();
}

export function mountIntro({ memory, template, appName, link, tag, source, hadDraft, prompt, snapshot }) {
  if (!template) return null;
  const opts = { memory, template, appName, link, tag, source, hadDraft, prompt, snapshot };
  if (forced()) return mount(opts);
  if (memory.get().intro.done || hadDraft) return mountAbout(opts);
  if (window.location.hash) return null;
  if (window.matchMedia && window.matchMedia("print").matches) return null;
  return mount(opts);
}

function mountAbout(opts) {
  stylesOnce();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "clay-about";
  button.setAttribute("clay", "editor-ui");
  button.setAttribute("sap-ignore", "");
  button.textContent = COPY.about;
  button.addEventListener("click", () => {
    button.remove();
    mount({ ...opts, fromAbout: true });
  });
  document.body.appendChild(button);
  return button;
}

function mount(opts) {
  const { memory, template, appName, link, tag, source, prompt, snapshot, fromAbout } = opts;
  stylesOnce();

  const section = document.createElement("section");
  section.className = "clay-intro";
  section.setAttribute("clay", "editor-ui");
  section.setAttribute("sap-ignore", "");
  section.setAttribute("aria-label", COPY.label(appName));

  const inner = document.createElement("div");
  inner.className = "clay-intro__inner";

  const kicker = document.createElement("p");
  kicker.className = "clay-intro__kicker";
  kicker.textContent = COPY.kicker;

  const name = document.createElement("h1");
  name.className = "clay-intro__name";
  name.textContent = appName;

  const actions = document.createElement("div");
  actions.className = "clay-intro__actions";

  const download = document.createElement("a");
  download.className = "clay-intro__download";
  download.href = link;
  download.textContent = COPY.download;

  const form = document.createElement("form");
  form.className = "clay-intro__signup";
  form.noValidate = true;

  const label = document.createElement("label");
  label.setAttribute("for", "clay-intro-email");
  label.textContent = COPY.signupLabel;

  const row = document.createElement("div");
  row.className = "clay-intro__row";

  const email = document.createElement("input");
  email.id = "clay-intro-email";
  email.type = "email";
  email.autocomplete = "email";
  email.required = true;
  email.placeholder = COPY.emailPlaceholder;

  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = COPY.signup;

  row.append(email, send);

  const honey = document.createElement("input");
  honey.className = "clay-intro__hp";
  honey.name = "website";
  honey.tabIndex = -1;
  honey.autocomplete = "off";
  honey.setAttribute("aria-hidden", "true");

  const message = document.createElement("p");
  message.className = "clay-intro__msg";
  message.setAttribute("role", "status");
  message.hidden = true;

  form.append(label, row, honey, message);
  actions.append(download, form);

  const start = document.createElement("button");
  start.type = "button";
  start.className = "clay-intro__start";
  start.textContent = COPY.start(appName);

  inner.append(kicker, name, template.content.cloneNode(true), actions, start);
  section.appendChild(inner);

  let observer = null;
  let gone = false;

  function stop() {
    document.removeEventListener("input", onUse, true);
    document.removeEventListener("change", onUse, true);
    document.removeEventListener("clay:dirty", onUse, true);
    if (observer) { observer.disconnect(); observer = null; }
    if (prompt) prompt.hideForIntro(false);
  }

  function dismiss(reason, target) {
    if (gone) return;
    gone = true;
    const anchor = target && target.getBoundingClientRect ? target : document.activeElement;
    const before = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect().top : 0;
    memory.get().intro.done = reason;
    memory.save();
    stop();
    section.remove();
    if (reason === "button") {
      window.scrollTo({ top: 0 });
      focusApp();
    } else if (anchor && anchor.getBoundingClientRect) {
      window.scrollBy(0, anchor.getBoundingClientRect().top - before);
    }
    if (fromAbout) mountAbout(opts);
  }

  function unchanged() {
    return !snapshot || snapshot() === baseline;
  }

  function onUse(event) {
    if (section.contains(event.target)) return;
    if (event.type === "clay:dirty") {
      if (!unchanged()) dismiss("use", event.target);
      return;
    }
    if (!unchanged()) {
      dismiss("use", event.target);
      return;
    }
    const target = event.target;
    setTimeout(() => {
      if (!gone && !unchanged()) dismiss("use", target);
    }, 0);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    fetch("/_/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: email.value.trim(), tags: [tag], source, website: honey.value }),
    }).then((response) => {
      if (!response.ok) throw new Error("signup failed");
      row.hidden = true;
      message.textContent = COPY.signupThanks;
      message.hidden = false;
    }).catch(() => {
      message.textContent = COPY.signupFailed;
      message.hidden = false;
    });
  });

  start.addEventListener("click", () => dismiss("button"));

  const baseline = snapshot ? snapshot() : null;
  document.body.prepend(section);
  document.addEventListener("input", onUse, true);
  document.addEventListener("change", onUse, true);
  document.addEventListener("clay:dirty", onUse, true);

  if (prompt) {
    prompt.hideForIntro(true);
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) prompt.hideForIntro(entry.intersectionRatio > 0.3);
      });
      observer.observe(section);
    }
  }

  return section;
}
