import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { filePlugin } from '@web/test-runner-commands/plugins';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

// Byte-exact goldens are browser-serialization dependent, so the browser is
// pinned: Playwright ships one fixed Chromium build per Playwright version
// (pinned in package.json), so the same bytes are produced locally and in CI.
// The default @web/test-runner-chrome launcher uses the machine's system Chrome,
// whose version drifts and would fail the byte gate on a non-bug.
export default {
  nodeResolve: true,
  files: 'conformance/**/*.test.js',
  browsers: [playwrightLauncher({ product: 'chromium' })],
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
  plugins: [filePlugin()],
  reporters: [summaryReporter(), defaultReporter()],
};
