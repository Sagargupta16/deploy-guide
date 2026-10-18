// Fenced code block extraction shared by the snippet checks, the pin checker
// and the smoke tests. Plain line scanner: the guides only use ``` fences,
// sometimes indented under a list item.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const GUIDE_DIRS = ["guides", "frameworks"];

const FENCE = /^(\s*)(`{3,})\s*([^\s`]*)/;
// <!-- smoke: fastapi main.py --> on the line right above a fence marks it
// as a file the smoke test for "fastapi" writes to disk.
const SMOKE_MARK = /<!--\s*smoke:\s*(\S+)\s+(\S+)\s*-->/;
// <!-- snippet: outline --> marks a workflow that is deliberately a sketch
// (comments where the steps go), so actionlint skips it. YAML must still parse.
const OUTLINE_MARK = /<!--\s*snippet:\s*outline\s*-->/;

export function guideFiles() {
   return GUIDE_DIRS.flatMap((dir) =>
      readdirSync(join(ROOT, dir))
         .filter((f) => f.endsWith(".md"))
         .sort()
         .map((f) => join(ROOT, dir, f)),
   );
}

export function rel(path) {
   return relative(ROOT, path).replaceAll("\\", "/");
}

export function extractBlocks(path) {
   const lines = readFileSync(path, "utf8").split(/\r?\n/);
   const blocks = [];
   let open = null;
   for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!open) {
         const m = FENCE.exec(line);
         if (!m) continue;
         let prev = i - 1;
         while (prev >= 0 && lines[prev].trim() === "") prev--;
         const mark = prev >= 0 ? SMOKE_MARK.exec(lines[prev]) : null;
         open = {
            file: rel(path),
            line: i + 1,
            lang: m[3].toLowerCase(),
            indent: m[1].length,
            ticks: m[2].length,
            smoke: mark ? { name: mark[1], path: mark[2] } : null,
            outline: prev >= 0 && OUTLINE_MARK.test(lines[prev]),
            body: [],
         };
         continue;
      }
      const close = /^(\s*)(`{3,})\s*$/.exec(line);
      if (close && close[2].length >= open.ticks) {
         const { indent, ticks, body, ...rest } = open;
         blocks.push({ ...rest, code: body.join("\n") + "\n" });
         open = null;
         continue;
      }
      // Strip the list indent the fence itself carried.
      open.body.push(line.slice(Math.min(open.indent, line.length - line.trimStart().length)));
   }
   if (open) throw new Error(`${rel(path)}:${open.line} unclosed code fence`);
   return blocks;
}

export function allBlocks() {
   return guideFiles().flatMap(extractBlocks);
}
