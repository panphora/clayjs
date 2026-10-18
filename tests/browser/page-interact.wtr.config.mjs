import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';

// Phase 4: block selection, drag, menus, links and uploads in real browsers.
// page-interact.test.js in Chromium, Firefox and WebKit.
// Run: npx web-test-runner --config tests/browser/page-interact.wtr.config.mjs
export default {
  nodeResolve: true,
  concurrentBrowsers: 1,
  files: 'tests/browser/page-interact.test.js',
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],
  testFramework: { config: { timeout: '30000' } },
  reporters: [summaryReporter(), defaultReporter()],
};
