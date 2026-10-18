// Capture the README showcase screenshots from a running docs site.
//
//   pnpm docs:build && pnpm docs:preview --port 4791    (in one terminal)
//   pnpm screenshots http://localhost:4791/deploy-guide/ (in another)
//
// Needs a Playwright Chromium: `pnpm exec playwright install chromium`.
// Writes WebP files to assets/screenshots/ (encoded by Chromium itself, so no
// image library is needed).
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { ROOT } from "./lib/snippets.mjs";

const base = process.argv[2] ?? "http://localhost:4791/deploy-guide/";
const out = join(ROOT, "assets", "screenshots");
mkdirSync(out, { recursive: true });

const shots = [
   // name, path, viewport, color scheme, scroll target
   ["home-desktop", "", { width: 1440, height: 900 }, "dark", null],
   ["guide-desktop", "frameworks/django", { width: 1440, height: 900 }, "light", null],
   ["cost-table-phone", "", { width: 390, height: 844 }, "dark", "#cost-comparison"],
   ["search-phone", "", { width: 390, height: 844 }, "light", "search"],
];

async function toWebp(page, png) {
   const dataUrl = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", 0.86);
   }, png.toString("base64"));
   return Buffer.from(dataUrl.split(",")[1], "base64");
}

const browser = await chromium.launch();
for (const [name, path, viewport, colorScheme, target] of shots) {
   const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: viewport.width < 768 ? 2 : 1 });
   // VitePress stores the theme choice; seed it so colorScheme wins.
   await page.addInitScript((scheme) => localStorage.setItem("vitepress-theme-appearance", scheme), colorScheme);
   await page.goto(base + path, { waitUntil: "networkidle" });
   if (target === "search") {
      await page.locator(".VPNavBarSearch button").first().click();
      await page.locator(".VPLocalSearchBox input").fill("render free tier");
      await page.waitForSelector(".VPLocalSearchBox .result", { timeout: 10_000 });
   } else if (target) {
      await page.evaluate((sel) => {
         const el = document.querySelector(sel);
         window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
      }, target);
   }
   await page.waitForTimeout(400);
   const png = await page.screenshot();
   const file = join(out, `${name}.webp`);
   writeFileSync(file, await toWebp(page, png));
   console.log(`wrote ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
   await page.close();
}
await browser.close();
