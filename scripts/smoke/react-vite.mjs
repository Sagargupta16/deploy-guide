// frameworks/react-vite.md, Option A: scaffold with create-vite, set the
// GitHub Pages base path, add the SPA redirect pair, build the way the
// deploy workflow does, then serve dist/ like GitHub Pages and follow a
// deep link through 404.html and back.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { DEEP_LINKS, inlineScripts, roundTrip } from "../lib/spa.mjs";

const BASE = "/my-react-app/";

export default async function (t) {
   t.runBlock("create");
   t.cd("my-react-app");
   t.write("vite.config.js");
   t.write("public/404.html");
   // The guide says: add the decoder to index.html, above the module script.
   const decoder = t.code("index.html-decoder");
   const indexPath = join(t.cwd, "index.html");
   const index = readFileSync(indexPath, "utf8");
   t.assert(index.includes('<script type="module"'), "create-vite index.html still has a module script to insert above");
   t.writeRaw("index.html", index.replace('<script type="module"', `${decoder.trim()}\n    <script type="module"`));
   t.sh("npm ci"); // the deploy workflow's install step
   t.sh("npm run build");

   const dist = join(t.cwd, "dist");
   const builtIndex = readFileSync(join(dist, "index.html"), "utf8");
   const built404 = readFileSync(join(dist, "404.html"), "utf8");
   t.assert(builtIndex.includes(`src="${BASE}assets/`), `built index.html loads assets from ${BASE}assets/`);

   for (const link of DEEP_LINKS) {
      const r = roundTrip(inlineScripts(built404)[0], inlineScripts(builtIndex)[0], link);
      t.assert(r.restored === r.expected, `${link} -> ${r.redirectedTo} -> ${r.restored}`);
   }

   // Serve dist/ the way GitHub Pages serves a project site: under the repo
   // name, with 404.html as the body of every miss.
   const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      if (!path.startsWith(BASE)) return send(res, 404, built404, ".html");
      let rel = normalize(path.slice(BASE.length)).replace(/^([/\\])+/, "");
      if (rel === "" || rel === ".") rel = "index.html";
      try {
         send(res, 200, readFileSync(join(dist, rel)), extname(rel));
      } catch {
         send(res, 404, built404, ".html");
      }
   });
   await new Promise((r) => server.listen(0, "127.0.0.1", r));
   const site = `http://127.0.0.1:${server.address().port}`;
   try {
      const home = await fetch(site + BASE);
      t.assert(home.status === 200, `GET ${BASE} -> ${home.status}`);
      const asset = /src="(\/my-react-app\/assets\/[^"]+\.js)"/.exec(builtIndex)[1];
      const js = await fetch(site + asset);
      t.assert(js.status === 200, `GET ${asset} -> ${js.status}`);
      const deep = await fetch(`${site}${BASE}about`);
      const body = await deep.text();
      t.assert(deep.status === 404 && body.includes("pathSegmentsToKeep"), `GET ${BASE}about -> ${deep.status} with the 404.html redirect`);
   } finally {
      server.close();
   }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
function send(res, status, body, ext) {
   res.writeHead(status, { "content-type": TYPES[ext] ?? "application/octet-stream" });
   res.end(body);
}
