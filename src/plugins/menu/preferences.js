// The first-use notice, counted per browser for every page on this origin: it shows on
// the first three opens and never again once it is dismissed or the third open is past.
const INTRO_KEY = "clay:menu:intro-v1";
const INTRO_OPENS = 3;

let memory = { opens: 0, dismissed: false };

function read() {
  try {
    const raw = window.localStorage.getItem(INTRO_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      return { opens: Number(value.opens) || 0, dismissed: value.dismissed === true };
    }
  } catch {}
  return { ...memory };
}

function write(value) {
  memory = { ...value };
  try {
    window.localStorage.setItem(INTRO_KEY, JSON.stringify(value));
  } catch {}
}

export function introWanted() {
  const state = read();
  return !state.dismissed && state.opens < INTRO_OPENS;
}

export function countIntroOpen() {
  const state = read();
  if (state.dismissed || state.opens >= INTRO_OPENS) return;
  write({ ...state, opens: state.opens + 1 });
}

export function dismissIntro() {
  write({ ...read(), dismissed: true });
}

export const isMac = () =>
  /Mac|iPhone|iPad|iPod/.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "");

export const keys = (mac, other) => (isMac() ? mac : other);

export const isHideShortcut = (event) =>
  (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.code === "Period" && !event.repeat && !event.isComposing;
