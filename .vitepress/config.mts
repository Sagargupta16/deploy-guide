// Docs site for the guides, built straight from the Markdown in this repo:
// README.md becomes the home page, guides/ and frameworks/ keep their paths,
// and the sidebar is read from the README index tables so the two never drift.
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { defineConfig, type DefaultTheme } from "vitepress";

const REPO = "https://github.com/Sagargupta16/deploy-guide";
const SITE = "https://sagargupta.online/deploy-guide/";

// Sections of README.md whose tables list guides, in sidebar order.
const SECTIONS = ["Platforms", "Frameworks", "Databases", "Reference Guides"];

function sidebarFromReadme(): DefaultTheme.SidebarItem[] {
   const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
   const groups: DefaultTheme.SidebarItem[] = [];
   let current: DefaultTheme.SidebarItem | null = null;
   for (const line of readme.split(/\r?\n/)) {
      const heading = /^## (.+)$/.exec(line);
      if (heading) {
         current = SECTIONS.includes(heading[1]) ? { text: heading[1], collapsed: false, items: [] } : null;
         if (current) groups.push(current);
         continue;
      }
      const row = /^\| \[([^\]]+)\]\(((?:guides|frameworks)\/[\w-]+)\.md\)/.exec(line);
      if (current && row) current.items!.push({ text: row[1], link: `/${row[2]}` });
   }
   return groups;
}

const sidebar = sidebarFromReadme();
const count = (section: string) => sidebar.find((g) => g.text === section)?.items?.length ?? 0;
const smokeTests = readdirSync(new URL("../scripts/smoke/", import.meta.url)).filter((f) => f.endsWith(".mjs")).length;
const description = `Step-by-step deployment guides for ${count("Platforms")} platforms, ${count("Frameworks")} frameworks and ${count("Databases")} databases, with config snippets and workflows checked in CI.`;

export default defineConfig({
   title: "Deploy Guide",
   description,
   lang: "en-US",
   base: "/deploy-guide/",
   srcDir: ".",
   srcExclude: ["CLAUDE.md", "**/node_modules/**"],
   rewrites: { "README.md": "index.md" },
   cleanUrls: true,
   lastUpdated: true,
   sitemap: { hostname: SITE },
   // Guides link to the dev servers they start (http://localhost:5173).
   ignoreDeadLinks: "localhostLinks",
   head: [
      ["meta", { name: "theme-color", content: "#0b0d12" }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:title", content: "Deploy Guide" }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: SITE }],
   ],
   markdown: {
      languageAlias: { env: "dotenv" },
      config(md) {
         // ```mermaid blocks render client-side (see theme/MermaidDiagram.vue).
         const fence = md.renderer.rules.fence!;
         md.renderer.rules.fence = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            if (token.info.trim() === "mermaid") {
               return `<MermaidDiagram graph="${encodeURIComponent(token.content)}" />`;
            }
            return fence(tokens, idx, options, env, self);
         };
         // Inline code such as `${{ secrets.TOKEN }}` must reach the page as
         // text, not as a Vue interpolation.
         const codeInline = md.renderer.rules.code_inline!;
         md.renderer.rules.code_inline = (tokens, idx, options, env, self) =>
            codeInline(tokens, idx, options, env, self).replace(/^<code/, "<code v-pre");
         // Links to repo files that are not pages (LICENSE, workflows, data,
         // scripts) point at GitHub instead of 404ing on the site.
         const linkOpen = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o));
         md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
            const href = tokens[idx].attrGet("href");
            if (href && !/^([a-z]+:|#|\/)/i.test(href)) {
               const [path, hash] = href.split("#");
               if (path && !path.endsWith(".md")) {
                  const from = posix.dirname(env.relativePath ?? "index.md");
                  const target = posix.normalize(posix.join(from, path));
                  tokens[idx].attrSet("href", `${REPO}/blob/main/${target}${hash ? `#${hash}` : ""}`);
               }
            }
            return linkOpen(tokens, idx, options, env, self);
         };
      },
   },
   themeConfig: {
      nav: [
         { text: "Guides", link: "/guides/github-pages" },
         { text: "Changelog", link: "/CHANGELOG" },
         { text: "Contribute", link: "/CONTRIBUTING" },
      ],
      sidebar,
      outline: { level: [2, 3] },
      search: { provider: "local" },
      socialLinks: [{ icon: "github", link: REPO }],
      editLink: {
         // Serialized into the client bundle, so no outside variables here.
         pattern: ({ filePath }) => `https://github.com/Sagargupta16/deploy-guide/edit/main/${filePath}`,
         text: "Edit this guide on GitHub",
      },
      lastUpdated: { text: "Last updated" },
      footer: {
         message: `MIT licensed. Config snippets are parsed and workflows linted in CI, and ${smokeTests} guides are smoke-tested end to end.`,
         copyright: "Sagar Gupta",
      },
   },
});
