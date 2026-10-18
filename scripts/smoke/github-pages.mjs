// guides/github-pages.md, Step 3: the 404.html redirect and the index.html
// decoder must round-trip a deep link. Without the decoder (the bug fixed in
// 1.2.1) /my-react-app/about lands on the home route as /my-react-app/?/about.
import { DEEP_LINKS, inlineScripts, roundTrip } from "../lib/spa.mjs";

export default async function (t) {
   const [encoder] = inlineScripts(t.code("404.html"));
   const [decoder] = inlineScripts(t.code("index.html-decoder"));
   for (const link of DEEP_LINKS) {
      const r = roundTrip(encoder, decoder, link);
      t.assert(r.restored === r.expected, `${link} -> ${r.redirectedTo} -> ${r.restored}`);
   }
}
