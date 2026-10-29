import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';

// The page colour detector in a real browser: it needs layout and hit-testing.
// Run: npx web-test-runner --config tests/browser/page-colour.wtr.config.mjs
export default {
  nodeResolve: true,
  files: 'tests/browser/page-colour.test.js',
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],
  reporters: [summaryReporter(), defaultReporter()],
};
