import { styleComparisonStripper } from "../../src/core/style-comparisons.js";

test("adoption removes only owned style spans and preserves every other byte", () => {
  const owned = '<style data-name="owned&amp;name" title="old attributes">.old { color:red }</style>';
  const duplicate = '<style data-name="owned&amp;name">.second { color:green }</style>';
  const link = '<link REL="stylesheet" href="/app.css?v=1&amp;a=2" title="old > attributes">';
  const legacy = '<style id="page-editor-style">.legacy { color:red }</style>';
  const prefix = '<!DOCTYPE html><html><head><noscript><b>RAW & text</b><style data-name="owned&amp;name">Keep noscript bytes</style></noscript>';
  const middle = '</head><body><p id="invalid"><div>DOM-created invalid nesting</div></p>\r\n<!--<style data-name="owned&amp;name">comment</style>--><script>const sample = \'<style data-name="owned&amp;name">literal</style>\';</script><template><style data-name="owned&amp;name">inert template</style></template><i title="&amp; &quot;">Text&nbsp;☃</i>';
  const suffix = '</body></html>';
  const source = prefix + owned + link + middle + duplicate + legacy + suffix;

  let actual = styleComparisonStripper({ name: "owned&name" })(source);
  expect(actual).toBe(prefix + link + middle + legacy + suffix);
  actual = styleComparisonStripper({ href: new URL("/app.css", window.location.href).href })(actual);
  expect(actual).toBe(prefix + middle + legacy + suffix);
  actual = styleComparisonStripper({ name: "page-editor-style", legacyId: "page-editor-style" })(actual);
  expect(actual).toBe(prefix + middle + suffix);
  expect(actual).not.toBe(source);
  expect(styleComparisonStripper({ name: "missing" })(source)).toBe(source);
});
