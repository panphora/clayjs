import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { chromeOptions } from '../../scripts/chrome-for-testing/browser-runtime.cjs';

// The page colour detector in a real browser: it needs layout and hit-testing.
// Run: npx web-test-runner --config tests/browser/page-colour.wtr.config.mjs
export default {
  nodeResolve: true,
  files: 'tests/browser/page-colour.test.js',
  browsers: [
    playwrightLauncher({ product: 'chromium', launchOptions: chromeOptions() }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],
  reporters: [summaryReporter(), defaultReporter()],
};
