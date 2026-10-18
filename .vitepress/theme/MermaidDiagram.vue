<script setup lang="ts">
// Renders a ```mermaid block on the client. The graph arrives URI-encoded so
// Vue's template compiler never sees its braces or arrows. Re-renders when
// the site switches between light and dark.
import { useData } from "vitepress";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{ graph: string }>();
const { isDark } = useData();
const svg = ref("");
// Drawn width from the viewBox; phones scroll at near this size instead of
// shrinking the labels to an unreadable scale.
const width = ref(0);
let seq = 0;

async function render() {
   const { default: mermaid } = await import("mermaid");
   // Mermaid sizes each box from measured text; measure with the page font
   // loaded, or labels get clipped once Inter swaps in.
   await document.fonts.ready;
   const dark = isDark.value;
   mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
         fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
         fontSize: "15px",
         primaryColor: dark ? "#141823" : "#eff6ff",
         primaryTextColor: dark ? "#e5e7eb" : "#0f172a",
         primaryBorderColor: dark ? "#3b82f6" : "#2563eb",
         lineColor: dark ? "#64748b" : "#94a3b8",
         edgeLabelBackground: dark ? "#0b0d12" : "#ffffff",
         tertiaryTextColor: dark ? "#cbd5e1" : "#334155",
      },
      // Lets `click X href "..."` lines in a diagram link to other guides.
      securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
   });
   const id = `mermaid-${Math.random().toString(36).slice(2)}-${seq++}`;
   const out = await mermaid.render(id, decodeURIComponent(props.graph));
   width.value = Number(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+)/.exec(out.svg)?.[1] ?? 0);
   svg.value = out.svg;
}

onMounted(render);
watch(isDark, render);
</script>

<template>
   <div
      class="mermaid-diagram"
      :style="width ? { '--mermaid-width': `${width}px` } : undefined"
      v-html="svg"
   />
</template>

<style scoped>
.mermaid-diagram {
   margin: 16px 0;
   overflow-x: auto;
   text-align: center;
}
.mermaid-diagram :deep(svg) {
   max-width: 100%;
   height: auto;
}
/* On a phone the wide LR trees would scale to about 0.4 and the labels to
   6px. Hold them near full size and let the container scroll sideways, the
   same way the comparison tables do. */
@media (max-width: 767px) {
   .mermaid-diagram {
      text-align: left;
      -webkit-overflow-scrolling: touch;
   }
   .mermaid-diagram :deep(svg) {
      min-width: min(var(--mermaid-width, 100%), 760px);
   }
}
/* .vp-doc gives every <p> a 28px line-height and margins; mermaid's HTML
   labels are <p> inside foreignObject and were measured without them. */
.mermaid-diagram :deep(foreignObject p) {
   margin: 0;
   line-height: 1.5;
}
</style>
