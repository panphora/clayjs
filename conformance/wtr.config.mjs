import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { chromeOptions } from '../scripts/chrome-for-testing/browser-runtime.cjs';
import { filePlugin } from '@web/test-runner-commands/plugins';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

// Byte-exact goldens are browser-serialization dependent, so the browser is
// pinned by scripts/chrome-for-testing/browser-runtime.json for local and CI runs.
// The default @web/test-runner-chrome launcher uses the machine's system Chrome,
// whose version drifts and would fail the byte gate on a non-bug.
export default {
  nodeResolve: true,
  files: 'conformance/**/*.test.js',
  browsers: [playwrightLauncher({ product: 'chromium', launchOptions: chromeOptions() })],
  testRunnerHtml: (testFramework) => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>
      window.__hyperclayNoAutoExport = true;
      window.__GOLDEN_UPDATE = ${UPDATE ? 'true' : 'false'};
    </script>
    <script type="module" src="${testFramework}"></script>
  </head>
  <body></body>
</html>`,
  // Mocha defaults to a 2000ms per-hook timeout. Every fixture does its async setup in a
  // `before` hook, so on a contended machine the hook times out before any byte comparison
  // happens and a green suite reports as a product failure. That failed a release on
  // 2026-08-22 while the suite's own runtime was 0.6s. 20s is still a real hang detector.
  testFramework: { config: { timeout: '20000' } },
  plugins: [filePlugin()],
  reporters: [summaryReporter(), defaultReporter()],
};
