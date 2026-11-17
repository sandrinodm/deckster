/**
 * Fails while any page still carries its writing brief, a `{/* BRIEF … *\/}` comment. Briefs are
 * MDX comments, so they stay out of the HTML, index.md and llms*.txt, but the site also serves each
 * page's authored source at /<page>/index.mdx, brief included. CI (.github/workflows/pages.yml)
 * runs it before the build, so a page with a brief can't be deployed:
 *
 *     npm run check:briefs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SITE_ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(SITE_ROOT, "src/content/docs");

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return /\.mdx?$/.test(entry.name) ? [full] : [];
  });
}

const briefed = pages(DOCS)
  .filter((file) => /\{\s*\/\*\s*BRIEF\b/.test(readFileSync(file, "utf8")))
  .map((file) => path.relative(SITE_ROOT, file).split(path.sep).join("/"))
  .sort();

if (briefed.length === 0) {
  console.log("No page carries a brief.");
} else {
  console.error(`${briefed.length} pages still carry a {/* BRIEF … */} comment, which /<page>/index.mdx would publish:`);
  console.error(`  ${briefed.join("\n  ")}`);
  process.exitCode = 1;
}
