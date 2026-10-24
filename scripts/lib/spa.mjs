// Run the GitHub Pages SPA redirect pair (404.html encoder + index.html
// decoder, from rafgraph/spa-github-pages) against a fake browser location
// and check that a deep link survives the round trip.
import vm from "node:vm";

export function inlineScripts(html) {
   return [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

function runInFakeBrowser(source, href) {
   const url = new URL(href);
   const calls = {};
   const location = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: (to) => (calls.replace = to),
   };
   const history = { replaceState: (_state, _title, to) => (calls.replaceState = to) };
   vm.runInNewContext(source, { window: { location, history } });
   return calls;
}

/**
 * @param {string} encoder JS from 404.html
 * @param {string} decoder JS from index.html
 * @param {string} deepLink e.g. https://user.github.io/my-react-app/about?tab=1&x=2#top
 * @returns {{ redirectedTo: string, restored: string, expected: string }}
 */
export function roundTrip(encoder, decoder, deepLink) {
   const { replace: redirectedTo } = runInFakeBrowser(encoder, deepLink);
   if (!redirectedTo) throw new Error("404.html script did not call location.replace");
   const { replaceState: restored } = runInFakeBrowser(decoder, redirectedTo);
   if (!restored) throw new Error(`decoder did not call history.replaceState for ${redirectedTo}`);
   const u = new URL(deepLink);
   return { redirectedTo, restored, expected: u.pathname + u.search + u.hash };
}

export const DEEP_LINKS = [
   "https://user.github.io/my-react-app/about",
   "https://user.github.io/my-react-app/users/42/settings?tab=billing&sort=desc#invoices",
];
