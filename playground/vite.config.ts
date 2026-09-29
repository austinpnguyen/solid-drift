import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Relative asset paths so the built dist works from any location,
  // including a plain file:// open.
  base: "./",
  plugins: [solid()],
  resolve: {
    // Demos always run against the current library source, never a build.
    alias: {
      "solid-drift": new URL("../src/index.ts", import.meta.url).pathname,
    },
    // The library source lives outside the playground root and resolves
    // solid-js from the repo root. Dedupe it to the playground's copy so
    // the library and the demos share one reactive graph. Without this,
    // library signals never notify demo effects.
    dedupe: ["solid-js"],
  },
});
