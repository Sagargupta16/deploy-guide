// Find version pins inside the guides' code blocks that have drifted from
// the latest release:
//   - `package==1.2.3` lines in requirements.txt blocks  (checked on PyPI)
//   - `uses: owner/repo@v7` lines in workflow blocks and in this repo's own
//     .github/workflows                                   (checked on GitHub)
//
//   node scripts/check-pins.mjs           print the drift table, exit 1 on drift (2 if a lookup failed)
//   node scripts/check-pins.mjs --write   rewrite drifted pins in place
//   node scripts/check-pins.mjs --md FILE also write the table as Markdown (for the issue body)
//
// Set GITHUB_TOKEN to lift the GitHub API rate limit.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, allBlocks, rel } from "./lib/snippets.mjs";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const mdOut = argv.includes("--md") ? argv[argv.indexOf("--md") + 1] : null;

const PY_PIN = /^([A-Za-z0-9][A-Za-z0-9_.-]*)(\[[^\]]+\])?==([0-9][^\s;#]*)\s*$/;
const USES = /uses:\s*["']?([\w.-]+\/[\w.-]+)((?:\/[\w.-]+)*)@([\w.-]+)/g;

// One entry per occurrence: { kind, name, pinned, file, line }
const pins = [];

for (const block of allBlocks()) {
   const lines = block.code.split("\n");
   if (["", "txt", "text"].includes(block.lang)) {
      lines.forEach((l, i) => {
         const m = PY_PIN.exec(l.trim());
         if (m) pins.push({ kind: "pypi", name: m[1].toLowerCase(), pinned: m[3], file: block.file, line: block.line + 1 + i });
      });
   }
   if (block.lang === "yaml" || block.lang === "yml") {
      lines.forEach((l, i) => {
         for (const m of l.matchAll(USES)) {
            pins.push({ kind: "action", name: m[1], pinned: m[3], file: block.file, line: block.line + 1 + i });
         }
      });
   }
}

const wfDir = join(ROOT, ".github", "workflows");
for (const f of readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
   readFileSync(join(wfDir, f), "utf8")
      .split(/\r?\n/)
      .forEach((l, i) => {
         for (const m of l.matchAll(USES)) {
            pins.push({ kind: "action", name: m[1], pinned: m[3], file: rel(join(wfDir, f)), line: i + 1 });
         }
      });
}

const ghHeaders = { accept: "application/vnd.github+json", "user-agent": "deploy-guide-pin-check" };
if (process.env.GITHUB_TOKEN) ghHeaders.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function getJson(url, headers = {}) {
   const res = await fetch(url, { headers });
   if (res.status === 404) return null;
   if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
   return res.json();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parts = (v) => v.replace(/^v/, "").split(".").map(Number);
function newer(a, b) {
   const [x, y] = [parts(a), parts(b)];
   for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
   }
   return false;
}

async function latestPypi(name) {
   const data = await getJson(`https://pypi.org/pypi/${name}/json`);
   if (!data) return { error: "not on PyPI" };
   return { latest: data.info.version, versions: new Set(Object.keys(data.releases)) };
}

async function latestAction(repo) {
   const release = await getJson(`https://api.github.com/repos/${repo}/releases/latest`, ghHeaders);
   if (release?.tag_name) return { latest: release.tag_name };
   const tags = await getJson(`https://api.github.com/repos/${repo}/tags?per_page=100`, ghHeaders);
   if (!tags) return { error: "repo not found" };
   const semver = tags.map((t) => t.name).filter((t) => /^v?\d+(\.\d+)*$/.test(t));
   if (!semver.length) return { error: "no version tags" };
   return { latest: semver.reduce((a, b) => (newer(b, a) ? b : a)) };
}

const cache = new Map();
async function lookup(kind, name) {
   const key = `${kind}:${name}`;
   if (!cache.has(key)) cache.set(key, kind === "pypi" ? latestPypi(name) : latestAction(name));
   return cache.get(key);
}

// Some actions (astral-sh/setup-uv since v8) publish only full version tags,
// so `@v10` looks current against the latest release but fails to resolve.
async function tagExists(repo, tag) {
   const key = `tag:${repo}@${tag}`;
   if (!cache.has(key)) cache.set(key, getJson(`https://api.github.com/repos/${repo}/git/ref/tags/${tag}`, ghHeaders).then(Boolean));
   return cache.get(key);
}

const rows = [];
for (const pin of pins) {
   let info;
   try {
      info = await lookup(pin.kind, pin.name);
      if (pin.kind === "action" && /^v?\d+(\.\d+)*$/.test(pin.pinned) && !info.error && !(await tagExists(pin.name, pin.pinned))) {
         rows.push({ ...pin, latest: info.latest, want: info.latest, status: "pinned tag does not exist" });
         continue;
      }
   } catch (e) {
      // A network or rate-limit failure is not drift: exit 2 so the weekly
      // job fails loudly instead of filing an issue about it.
      console.error(`lookup failed for ${pin.name}: ${e.message}`);
      process.exit(2);
   }
   if (info.error) {
      rows.push({ ...pin, status: info.error });
      continue;
   }
   if (pin.kind === "pypi") {
      if (!info.versions.has(pin.pinned)) rows.push({ ...pin, latest: info.latest, status: "pinned version does not exist" });
      else if (newer(info.latest, pin.pinned)) rows.push({ ...pin, latest: info.latest, want: info.latest, status: "drift" });
      continue;
   }
   if (/^[0-9a-f]{40}$/.test(pin.pinned)) continue; // SHA pin: deliberate
   if (!/^v?\d+(\.\d+)*$/.test(pin.pinned)) {
      rows.push({ ...pin, latest: info.latest, status: `mutable ref @${pin.pinned}` });
      continue;
   }
   // Keep the pin's precision: @v7 tracks majors, @1.6 tracks minors.
   const depth = parts(pin.pinned).length;
   const prefix = pin.pinned.startsWith("v") ? "v" : "";
   const want = prefix + parts(info.latest).slice(0, depth).join(".");
   if (newer(want, pin.pinned)) rows.push({ ...pin, latest: info.latest, want, status: "drift" });
}

const distinct = new Set(pins.map((p) => `${p.kind}:${p.name}`)).size;
console.log(`checked ${pins.length} pins (${distinct} distinct packages and actions)`);

if (!rows.length) {
   console.log("no drift");
   process.exit(0);
}

const table = [
   "| Location | Package | Pinned | Latest | Status |",
   "|----------|---------|--------|--------|--------|",
   ...rows.map((r) => `| \`${r.file}:${r.line}\` | ${r.name} | ${r.pinned} | ${r.latest ?? "-"} | ${r.status} |`),
].join("\n");
console.log(table);
if (mdOut) writeFileSync(mdOut, `${rows.length} pinned version(s) in the guides need attention.\n\n${table}\n\nRun \`pnpm check:pins --write\` to bump the drifted ones, then re-test the affected guides.\n`);

if (WRITE) {
   const byFile = Map.groupBy(rows.filter((r) => r.want), (r) => r.file);
   for (const [file, fileRows] of byFile) {
      const path = join(ROOT, file);
      const lines = readFileSync(path, "utf8").split("\n");
      for (const r of fileRows) {
         const i = r.line - 1;
         lines[i] =
            r.kind === "pypi"
               ? lines[i].replace(`==${r.pinned}`, `==${r.want}`)
               : lines[i].replace(new RegExp(`(${escape(r.name)}(?:/[\\w.-]+)*)@${escape(r.pinned)}`), `$1@${r.want}`);
      }
      writeFileSync(path, lines.join("\n"));
      console.log(`updated ${fileRows.length} pin(s) in ${file}`);
   }
}
process.exit(1);
