import { expect } from '@esm-bundle/chai';

describe('conflict lineage in Chromium', () => {
  it('protects successive retags, reverts an independent conflict and preserves Download', async () => {
    const frame = document.createElement('iframe');
    frame.src = '/tests/browser/fixtures/conflict-lineage.html';
    try {
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        document.body.appendChild(frame);
      });
      await frame.contentWindow.runLineageScenario(expect);
    } finally {
      frame.remove();
    }
  });
});
