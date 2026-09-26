import { defineConfig } from "vitest/config";

// Force the browser build of solid-js in tests. Under plain node resolution
// the package's "node" export wins and loads dist/server.js, the SSR build,
// where createEffect is intentionally a no-op. The browser build gives us
// the real reactive runtime for testing client behavior.
export default defineConfig({
  resolve: {
    alias: {
      "solid-js": "./node_modules/solid-js/dist/solid.js",
    },
  },
  test: {
    environment: "node",
  },
});
