// Render the README Cost Comparison tables from data/platforms.yml.
//
//   node scripts/gen-tables.mjs                 rewrite the tables in README.md
//   node scripts/gen-tables.mjs --check         exit 1 if README.md is out of date
//   node scripts/gen-tables.mjs --stale-days 90 list rows not verified in 90 days, exit 1 if any
//                               [--md FILE]     ...and write them as Markdown (for the issue body)
// Exit 2 means data/platforms.yml itself is invalid.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT } from "./lib/snippets.mjs";

const argv = process.argv.slice(2);
const readmePath = join(ROOT, "README.md");
const data = parse(readFileSync(join(ROOT, "data", "platforms.yml"), "utf8"));

const COLUMNS = {
   hosting: [
      ["Platform", (r) => `[${r.name}](${r.guide})`],
      ["Free Tier", (r) => r.free_tier],
      ["Cheapest Paid", (r) => r.cheapest_paid],
      ["Always-On", (r) => r.always_on],
      ["Custom Domain", (r) => r.custom_domain],
      ["Docker", (r) => r.docker],
      ["Verified", (r) => r.verified_on],
   ],
   databases: [
      ["Database", (r) => `[${r.name}](${r.guide})`],
      ["Free Tier", (r) => r.free_tier],
      ["Cheapest Paid", (r) => r.cheapest_paid],
      ["Type", (r) => r.type],
      ["Verified", (r) => r.verified_on],
   ],
};

const problems = [];
for (const [section, rows] of Object.entries(data)) {
   if (!COLUMNS[section]) problems.push(`unknown section "${section}"`);
   for (const r of rows ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.verified_on))) problems.push(`${r.name}: verified_on must be YYYY-MM-DD`);
      if (!r.guide || !existsSync(join(ROOT, r.guide))) problems.push(`${r.name}: guide ${r.guide} does not exist`);
      for (const [title, cell] of COLUMNS[section] ?? []) {
         const v = cell(r);
         if (v === undefined || v === null || v === "") problems.push(`${r.name}: missing value for ${title}`);
         else if (String(v).includes("|")) problems.push(`${r.name}: "|" in ${title} breaks the table`);
      }
   }
}
if (problems.length) {
   console.error(`data/platforms.yml has ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
   process.exit(2);
}

if (argv.includes("--stale-days")) {
   const days = Number(argv[argv.indexOf("--stale-days") + 1]);
   const today = new Date(new Date().toISOString().slice(0, 10));
   const stale = Object.values(data)
      .flat()
      .map((r) => ({ ...r, age: Math.round((today - new Date(r.verified_on)) / 86_400_000) }))
      .filter((r) => r.age > days)
      .sort((a, b) => b.age - a.age);
   if (!stale.length) {
      console.log(`every row was verified in the last ${days} days`);
      process.exit(0);
   }
   const table = [
      "| Row | Guide | Verified on | Age (days) |",
      "|-----|-------|-------------|------------|",
      ...stale.map((r) => `| ${r.name} | \`${r.guide}\` | ${r.verified_on} | ${r.age} |`),
   ].join("\n");
   console.log(`${stale.length} row(s) older than ${days} days:\n${table}`);
   if (argv.includes("--md")) {
      writeFileSync(
         argv[argv.indexOf("--md") + 1],
         `${stale.length} pricing row(s) in \`data/platforms.yml\` were last verified more than ${days} days ago.\n\n${table}\n\nRe-check each vendor's pricing page, update the row and its \`verified_on\`, then run \`pnpm gen:tables\`.\n`,
      );
   }
   process.exit(1);
}

function render(section) {
   const cols = COLUMNS[section];
   return [
      `| ${cols.map(([t]) => t).join(" | ")} |`,
      `|${cols.map(([t]) => "-".repeat(t.length + 2)).join("|")}|`,
      ...data[section].map((r) => `| ${cols.map(([, cell]) => cell(r)).join(" | ")} |`),
   ].join("\n");
}

const readme = readFileSync(readmePath, "utf8");
let next = readme;
for (const section of Object.keys(COLUMNS)) {
   const start = `<!-- generated:${section}:start (edit data/platforms.yml, then run pnpm gen:tables) -->`;
   const end = `<!-- generated:${section}:end -->`;
   const re = new RegExp(`<!-- generated:${section}:start[^>]*-->[\\s\\S]*?<!-- generated:${section}:end -->`);
   if (!re.test(next)) {
      console.error(`README.md is missing the <!-- generated:${section}:start --> ... end markers`);
      process.exit(1);
   }
   // Function form: cells like "$100-$200" must not be read as $1 patterns.
   next = next.replace(re, () => `${start}\n${render(section)}\n${end}`);
}

if (argv.includes("--check")) {
   if (next !== readme) {
      console.error("README.md Cost Comparison tables are out of date with data/platforms.yml. Run: pnpm gen:tables");
      process.exit(1);
   }
   console.log("README.md tables match data/platforms.yml");
} else if (next !== readme) {
   writeFileSync(readmePath, next);
   console.log("README.md tables regenerated");
} else {
   console.log("README.md tables already up to date");
}
