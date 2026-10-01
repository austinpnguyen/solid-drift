import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <Suspense>
          <nav class="fixed top-0 left-0 right-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur">
            <div class="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
              <a href="/" class="font-bold tracking-tight">
                solid-drift starter
              </a>
              <a href="/" class="text-sm text-neutral-600 hover:text-black">
                Landing
              </a>
              <a
                href="/dashboard"
                class="text-sm text-neutral-600 hover:text-black"
              >
                Dashboard
              </a>
              <a href="/chat" class="text-sm text-neutral-600 hover:text-black">
                AI chat
              </a>
            </div>
          </nav>
          <div class="pt-14">{props.children}</div>
        </Suspense>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
