import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@content": path.resolve(__dirname, "./src/content"),
      "@databases": path.resolve(__dirname, "./src/databases"),
      "@services": path.resolve(__dirname, "./src/services"),
      "@config": path.resolve(__dirname, "./config"),
      "@api": path.resolve(__dirname, "./src/routes/api"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@stores": path.resolve(__dirname, "./src/stores"),
      "@widgets": path.resolve(__dirname, "./src/widgets"),
      "@root": path.resolve(__dirname, "./"),
      $paraglide: path.resolve(__dirname, "./src/paraglide"),
      "$app/environment": path.resolve(__dirname, "./tests/unit/mocks/$app/environment.ts"),
      "$app/navigation": path.resolve(__dirname, "./tests/unit/mocks/$app/navigation.ts"),
      "$app/state": path.resolve(__dirname, "./tests/unit/mocks/$app/state.ts"),
      "$app/paths": path.resolve(__dirname, "./tests/unit/mocks/$app/paths.ts"),
      "$app/forms": path.resolve(__dirname, "./tests/unit/mocks/$app/forms.ts"),
      "sveltekit-rate-limiter/server": path.resolve(
        __dirname,
        "node_modules/sveltekit-rate-limiter/dist/server/index.js",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["**/*.bun.ts", "node_modules", ".svelte-kit"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.svelte"],
      exclude: ["src/paraglide/**", "src/**/*.d.ts"],
    },
    pool: "threads",
    // @ts-expect-error - Vitest 4 top-level pool options
    threads: {
      singleThread: false,
    },
    server: {
      deps: {
        inline: [/@sveltejs\/kit/, /sveltekit-rate-limiter/, /@skeletonlabs\/skeleton-svelte/],
      },
    },
  },
});
