import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Absolute base path: the playground deploys to GitHub Pages as a
  // project site at https://austinpnguyen.github.io/solid-drift/.
  // Local dev serves the app under the same path (/solid-drift/).
  base: "/solid-drift/",
  plugins: [solid()],
  resolve: {
    alias: [
      // Demos always run against the current library source, never a build.
      {
        find: "solid-drift",
        replacement: new URL("../src/index.ts", import.meta.url).pathname,
      },
      // The library source lives outside the playground root, so its bare
      // "solid-js" imports would resolve from the repo root, which may not
      // be installed on a fresh clone or in CI. Pin the bare specifier to
      // the playground's own copy (directory form, so the package exports
      // map still picks the right browser build) so the library and the
      // demos share one reactive graph. The regex matches only the bare
      // specifier; subpath imports like solid-js/web keep resolving
      // normally. Without this, library signals never notify demo effects.
      {
        find: /^solid-js$/,
        replacement: new URL("./node_modules/solid-js", import.meta.url)
          .pathname,
      },
    ],
  },
});
