// Compile a page theme into the one stylesheet the site serves.
//
// A theme is authored as an @import chain: the font faces, content.css, then the theme's
// own rules. The chain keeps each piece readable and diffable in the repo, and the URL in
// a saved document points at the theme, so the served copy has to be the compiled text
// itself: one request, no @import, no Google Fonts.
import { readFile } from "node:fs/promises";
import path from "node:path";

// The one vendored sheet per family a theme may name. A Google Fonts import is where the
// families are written down, never something the served CSS may keep: a family with no
// sheet here fails the build instead of reaching the network.
export const FONT_SHEETS = { inter: "fonts/inter.css", newsreader: "fonts/newsreader.css" };

const IMPORT = /@import\s+url\("([^"]+)"\)\s*;/g;
const FONT_URL = /url\(\.\/([^)]+)\)/g;

export async function compileTheme({ root, name, outPath }) {
  // Font URLs are relative to the stylesheet that names them, and the same theme is
  // served at more than one path, so the depth comes from `outPath`, not a constant.
  const dir = path.dirname(outPath);
  const source = await readFile(path.join(root, "src/page/themes", `${name}.source.css`), "utf8");
  const rel = (file) => path.relative(dir, `fonts/${file}`).split(path.sep).join("/");

  let out = "";
  let last = 0;
  for (const match of source.matchAll(IMPORT)) {
    out += source.slice(last, match.index);
    last = match.index + match[0].length;
    const url = match[1];
    if (url.startsWith("./") || url.startsWith("../")) {
      const css = await readFile(path.join(root, "src/page/themes", url), "utf8");
      if (/@import/.test(css)) throw new Error(`${name}: ${url} imports another sheet; the compile inlines one level`);
      out += `${css}\n`;
    } else if (url.startsWith("https://fonts.googleapis.com/")) {
      const families = new URL(url).searchParams.getAll("family").map((value) => value.split(":")[0]);
      for (const family of families) {
        const sheet = FONT_SHEETS[family.toLowerCase()];
        if (!sheet) throw new Error(`${name}: no vendored font sheet for ${family}; the theme may not keep a Google Fonts import`);
        const css = await readFile(path.join(root, sheet), "utf8");
        if (!css.includes(`font-family: "${family}"`)) throw new Error(`${sheet} declares no "${family}" face`);
        out += `${css.replace(FONT_URL, (_, file) => `url(${rel(file)})`)}\n`;
      }
    } else {
      throw new Error(`${name}: cannot compile @import ${url}`);
    }
  }
  out += source.slice(last);

  // Whatever survived is the chain this exists to remove: a sheet that still imports or
  // names an absolute url() is not a compiled theme. Data URIs are not a request.
  const external = [...out.matchAll(/url\("?([^")]+)"?\)/g)]
    .map((match) => match[1])
    .filter((url) => /^(https?:)?\/\//.test(url));
  if (/@import/.test(out) || external.length) {
    throw new Error(`${name}: the compiled theme still reaches out for ${external[0] ?? "@import"}`);
  }
  return out;
}
