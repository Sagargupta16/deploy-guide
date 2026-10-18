// Smoke-test a guide by doing what it says: write the files it tells you to
// create, run the commands it tells you to run, start the app the way the
// platform would, and hit its endpoints.
//
//   node scripts/smoke.mjs fastapi          run one smoke test
//   node scripts/smoke.mjs --list           list the smoke tests
//   node scripts/smoke.mjs fastapi --keep   keep the scratch directory
//
// Which code blocks get written (or run) is marked in the guide itself with
// an HTML comment on the line above the fence, invisible on GitHub:
//   <!-- smoke: fastapi main.py -->   write this block to main.py
//   <!-- smoke: django run -->        run this block with bash
// The steps between those blocks live in scripts/smoke/<name>.mjs.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { allBlocks } from "./lib/snippets.mjs";

const WIN = process.platform === "win32";
const argv = process.argv.slice(2);
const testsDir = new URL("./smoke/", import.meta.url);
const available = readdirSync(testsDir)
   .filter((f) => f.endsWith(".mjs"))
   .map((f) => f.replace(/\.mjs$/, ""))
   .sort();

if (argv.includes("--list") || !argv[0]) {
   console.log(available.join("\n"));
   process.exit(argv[0] ? 0 : 1);
}
const name = argv[0];
if (!available.includes(name)) {
   console.error(`no smoke test "${name}". Available: ${available.join(", ")}`);
   process.exit(1);
}

const marked = allBlocks().filter((b) => b.smoke?.name === name);
const root = mkdtempSync(join(tmpdir(), `smoke-${name}-`));
const servers = [];
let cwd = root;
let env = { ...process.env };
let step = 0;

function log(msg) {
   console.log(`[${name}] ${++step}. ${msg}`);
}

function block(path) {
   const found = marked.filter((b) => b.smoke.path === path);
   if (found.length !== 1) throw new Error(`expected exactly one <!-- smoke: ${name} ${path} --> block, found ${found.length}`);
   return found[0];
}

const ctx = {
   WIN,
   get cwd() {
      return cwd;
   },
   /** Change directory, relative to the scratch root. */
   cd(dir) {
      cwd = join(root, dir);
   },
   env(vars) {
      Object.assign(env, vars);
   },
   /** Write the guide block marked `<!-- smoke: name path -->` to `path`. */
   write(path, transform = (s) => s) {
      const b = block(path);
      const dest = join(cwd, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, transform(b.code));
      log(`write ${path} from ${b.file}:${b.line}`);
   },
   /** Write a file the smoke test assembled itself (e.g. a guide edit applied to scaffold output). */
   writeRaw(path, content) {
      const dest = join(cwd, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      log(`write ${path} (edited as the guide describes)`);
   },
   /** Run the guide block marked `<!-- smoke: name <label> -->` with bash. */
   runBlock(label) {
      const b = block(label);
      log(`run ${b.file}:${b.line}\n${b.code.trimEnd().replace(/^/gm, "      $ ")}`);
      exec("bash", ["-e", "-c", b.code]);
   },
   /** Run a command the guide describes in prose (not in a marked block). */
   sh(cmd) {
      log(`sh ${cmd}`);
      exec("bash", ["-e", "-c", cmd]);
   },
   /** Run a Python snippet in the venv and return its stdout. */
   python(code, vars = {}) {
      log(`python -c ${JSON.stringify(code)}${Object.keys(vars).length ? ` with ${JSON.stringify(vars)}` : ""}`);
      const saved = env;
      env = { ...env, ...vars };
      try {
         return exec("python", ["-c", code]);
      } finally {
         env = saved;
      }
   },
   /** Return the guide block marked `<!-- smoke: name path -->` without writing it. */
   code(path) {
      return block(path).code;
   },
   /** Create a Python venv with uv and put it first on PATH. */
   venv(python = "3.13") {
      exec("uv", ["venv", "--seed", "--quiet", "--python", python, ".venv"]);
      const bin = join(cwd, ".venv", WIN ? "Scripts" : "bin");
      // Windows spells it Path; keep whichever key the environment already uses.
      const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env = { ...env, VIRTUAL_ENV: join(cwd, ".venv"), [key]: `${bin}${WIN ? ";" : ":"}${env[key]}` };
      log(`venv (Python ${python}) at .venv`);
   },
   /** Start a long-running server and wait until `probePath` answers. */
   async serve(cmd, probePath = "/", headers = {}) {
      const port = await freePort();
      const full = cmd.replaceAll("$PORT", String(port));
      log(`serve ${full}`);
      const child = spawn("bash", ["-c", `exec ${full}`], { cwd, env: { ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"], detached: !WIN });
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      servers.push(child);
      const base = `http://127.0.0.1:${port}`;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
         if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}:\n${output}`);
         try {
            await fetch(base + probePath, { headers, redirect: "manual" });
            return base;
         } catch {
            await new Promise((r) => setTimeout(r, 500));
         }
      }
      throw new Error(`server did not answer within 90s:\n${output}`);
   },
   /** Request `base + path` and assert the status and (a subset of) the JSON body. */
   async expect(base, { method = "GET", path, body, headers = {}, status = 200, json, check }) {
      const res = await fetch(base + path, {
         method,
         redirect: "manual",
         headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
         body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const where = `${method} ${path}`;
      if (res.status !== status) {
         const loc = res.headers.get("location");
         throw new Error(`${where}: expected ${status}, got ${res.status}${loc ? ` (Location: ${loc})` : ""}\n${text.slice(0, 600)}`);
      }
      let data;
      if (json !== undefined || check) data = JSON.parse(text);
      if (json !== undefined) assertSubset(data, json, where);
      if (check && !check(data)) throw new Error(`${where}: check failed on ${text.slice(0, 300)}`);
      log(`${where} -> ${res.status} ${text.slice(0, 80).replace(/\s+/g, " ")}`);
      return data;
   },
   assert(ok, message) {
      if (!ok) throw new Error(message);
      log(`ok: ${message}`);
   },
   log,
};

function exec(cmd, args) {
   const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
   if (r.error) throw r.error;
   if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
   return r.stdout;
}

function assertSubset(actual, expected, where) {
   const ok = (a, e) =>
      e !== null && typeof e === "object"
         ? a !== null && typeof a === "object" && Object.entries(e).every(([k, v]) => ok(a[k], v))
         : a === e;
   if (!ok(actual, expected)) throw new Error(`${where}: expected ${JSON.stringify(expected)} in ${JSON.stringify(actual)}`);
}

function freePort() {
   return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
         const { port } = srv.address();
         srv.close(() => resolve(port));
      });
   });
}

function stopServers() {
   for (const child of servers) {
      if (child.exitCode !== null) continue;
      if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else {
         try {
            process.kill(-child.pid, "SIGTERM");
         } catch {}
      }
   }
}

const started = Date.now();
let failed = false;
try {
   const { default: run } = await import(new URL(`${name}.mjs`, testsDir));
   console.log(`[${name}] scratch dir ${root}`);
   await run(ctx);
} catch (e) {
   failed = true;
   console.error(`\n[${name}] FAILED at step ${step + 1}: ${e.message}`);
} finally {
   stopServers();
   if (!argv.includes("--keep")) {
      await new Promise((r) => setTimeout(r, 500));
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
   }
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(failed ? `[${name}] FAIL in ${secs}s` : `[${name}] PASS in ${secs}s`);
process.exit(failed ? 1 : 0);
