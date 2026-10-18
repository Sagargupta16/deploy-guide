// After `vitepress build`: every guide must have rendered to a page that
// contains its own title. VitePress logs a page's SSR error and keeps going,
// so a broken page would otherwise ship as an empty shell with exit code 0.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, guideFiles, rel } from "./lib/snippets.mjs";

const dist = join(ROOT, ".vitepress", "dist");
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pages = [...guideFiles(), join(ROOT, "README.md")];
const problems = [];

for (const src of pages) {
   const path = rel(src);
   const title = /^# (.+)$/m.exec(readFileSync(src, "utf8"))?.[1];
   const out = join(dist, path === "README.md" ? "index.html" : path.replace(/\.md$/, ".html"));
   if (!existsSync(out)) {
      problems.push(`${path}: no page at ${rel(out)}`);
      continue;
   }
   const html = readFileSync(out, "utf8");
   if (title && !html.includes(escape(title))) problems.push(`${path}: page does not contain its title "${title}"`);
}

if (problems.length) {
   console.error(`${problems.length} page(s) failed to render:\n  ${problems.join("\n  ")}`);
   process.exit(1);
}
console.log(`${pages.length} pages rendered with their titles`);
