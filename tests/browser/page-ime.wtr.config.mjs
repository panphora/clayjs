import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';

// S5: typing in real browsers. page-ime.test.js in Chromium, Firefox and WebKit.
// The `ime` command drives Chromium's real IME path over CDP
// (Input.imeSetComposition, Input.insertText); the other two browsers answer
// `{ cdp: false }` and the test composes through the DOM instead.
// Run: npx web-test-runner --config tests/browser/page-ime.wtr.config.mjs
const cdps = new Map();

const ime = {
  name: 'page-ime',
  async executeCommand({ command, payload, session }) {
    if (command !== 'ime') return undefined;
    if (session.browser.type !== 'playwright' || session.browser.name !== 'Chromium') return { cdp: false };
    const page = session.browser.getPage(session.id);
    let cdp = cdps.get(session.id);
    if (!cdp) {
      cdp = await page.context().newCDPSession(page);
      cdps.set(session.id, cdp);
    }
    if (payload.op === 'set') await cdp.send('Input.imeSetComposition', { text: payload.text, selectionStart: payload.text.length, selectionEnd: payload.text.length });
    else if (payload.op === 'commit') await cdp.send('Input.insertText', { text: payload.text });
    return { cdp: true };
  },
};

export default {
  nodeResolve: true,
  files: 'tests/browser/page-ime.test.js',
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],
  plugins: [ime],
  testFramework: { config: { timeout: '30000' } },
  reporters: [summaryReporter(), defaultReporter()],
};
