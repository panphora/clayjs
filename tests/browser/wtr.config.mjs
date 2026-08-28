import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';

// The single-file build in a real browser. The repository root is served, so the
// fixtures reach /dist/ (built first by `npm run test:standalone`) and /entries/.
// Same pinned Chromium as the conformance suite; the byte comparison between the
// two builds in standalone.test.js depends on both running in one browser.
export default {
  nodeResolve: true,
  files: 'tests/browser/**/*.test.js',
  browsers: [playwrightLauncher({ product: 'chromium' })],
  testFramework: { config: { timeout: '20000' } },
  reporters: [summaryReporter(), defaultReporter()],
};
