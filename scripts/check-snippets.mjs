// Parse every YAML, JSON, JSONC and TOML block in the guides, and run
// actionlint over every block that is a complete GitHub Actions workflow.
//
//   node scripts/check-snippets.mjs                 parse + actionlint (if on PATH)
//   node scripts/check-snippets.mjs --no-actionlint parse only
//
// Exit code 1 if any block fails.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parseAllDocuments } from "yaml";
import { allBlocks } from "./lib/snippets.mjs";

const args = new Set(process.argv.slice(2));
const failures = [];
const counts = {};
const workflows = [];

function jsonError(text, lang) {
   if (lang === "json") {
      try {
         JSON.parse(text);
         return null;
      } catch (e) {
         return e.message;
      }
   }
   const errors = [];
   parseJsonc(text, errors, { allowTrailingComma: true });
   return errors.length ? `${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}` : null;
}

function fail(block, message) {
   failures.push(`${block.file}:${block.line} [${block.lang}] ${message}`);
}

for (const block of allBlocks()) {
   const { lang, code } = block;
   if (lang === "yaml" || lang === "yml") {
      counts.yaml = (counts.yaml ?? 0) + 1;
      const docs = parseAllDocuments(code);
      const errors = docs.flatMap((d) => d.errors);
      if (errors.length) {
         fail(block, errors[0].message.split("\n")[0]);
         continue;
      }
      const top = docs[0]?.toJS();
      if (top && typeof top === "object" && "jobs" in top && "on" in top && !block.outline) workflows.push(block);
   } else if (lang === "json" || lang === "jsonc") {
      counts[lang] = (counts[lang] ?? 0) + 1;
      // Excerpts such as `"assets": { ... }` are object members, not whole
      // documents: accept them if they parse once wrapped in braces.
      const error = jsonError(code, lang) && jsonError(`{${code}}`, lang);
      if (error) fail(block, error);
   } else if (lang === "toml") {
      counts.toml = (counts.toml ?? 0) + 1;
      try {
         parseToml(code);
      } catch (e) {
         fail(block, e.message.split("\n")[0]);
      }
   }
}

console.log(
   `parsed ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")} blocks; ${workflows.length} are complete workflows`,
);

if (!args.has("--no-actionlint")) {
   const probe = spawnSync("actionlint", ["-version"], { encoding: "utf8" });
   if (probe.error) {
      console.log("actionlint not on PATH, skipping workflow lint (CI installs it)");
   } else {
      // actionlint only treats files under .github/workflows as workflows.
      const dir = mkdtempSync(join(tmpdir(), "deploy-guide-wf-"));
      const wfDir = join(dir, ".github", "workflows");
      mkdirSync(wfDir, { recursive: true });
      const names = new Map();
      for (const block of workflows) {
         const name = `${block.file.replace(/[/.]/g, "_")}_L${block.line}.yml`;
         names.set(name, block);
         writeFileSync(join(wfDir, name), block.code, "utf8");
      }
      const run = spawnSync("actionlint", ["-no-color", "-oneline", ...[...names.keys()].map((n) => `.github/workflows/${n}`)], {
         cwd: dir,
         encoding: "utf8",
      });
      for (const line of (run.stdout ?? "").split("\n").filter(Boolean)) {
         const m = /^\.github[\\/]workflows[\\/]([^:]+):(\d+):\d+: (.*)$/.exec(line);
         const block = m && names.get(m[1]);
         if (block) failures.push(`${block.file}:${block.line + Number(m[2])} [workflow] ${m[3]}`);
         else failures.push(`[actionlint] ${line}`);
      }
      if (run.status !== 0 && run.status !== 1) failures.push(`[actionlint] exited ${run.status}: ${run.stderr}`);
      rmSync(dir, { recursive: true, force: true });
      console.log(`actionlint checked ${workflows.length} workflows`);
   }
}

if (failures.length) {
   console.error(`\n${failures.length} snippet problem(s):`);
   for (const f of failures) console.error(`  ${f}`);
   process.exit(1);
}
console.log("all snippets OK");
