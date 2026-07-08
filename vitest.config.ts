/**
 * @file vitest.config.ts
 * @description Vitest configuration. Aliases from config/aliases.json.
 */

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aliases = JSON.parse(readFileSync(path.resolve(__dirname, "config/aliases.json"), "utf8"));

export default defineConfig({
  plugins: [svelte() as any],
  resolve: {
    alias: {
      ...Object.fromEntries(
        Object.entries(aliases).map(([k, v]) => [k, path.resolve(__dirname, v as string)]),
      ),
      "$app/environment": path.resolve(__dirname, "tests/unit/mocks/$app/environment.ts"),
      "$app/navigation": path.resolve(__dirname, "tests/unit/mocks/$app/navigation.ts"),
      "$app/state": path.resolve(__dirname, "tests/unit/mocks/$app/state.ts"),
      "$app/paths": path.resolve(__dirname, "tests/unit/mocks/$app/paths.ts"),
      "$app/forms": path.resolve(__dirname, "tests/unit/mocks/$app/forms.ts"),
      "$app/server": path.resolve(__dirname, "tests/unit/mocks/$app/server.ts"),
      "$env/dynamic/private": path.resolve(__dirname, "tests/unit/mocks/$env/dynamic/private.ts"),
      "sveltekit-rate-limiter/server": path.resolve(
        __dirname,
        "node_modules/sveltekit-rate-limiter/dist/server/index.js",
      ),
      "bun:sqlite": path.resolve(__dirname, "tests/unit/mocks/bun-sqlite.ts"),
    },
  },
  define: { "import.meta.env.SSR": "true" },
  test: {
    globals: true,
    testTimeout: 15000,
    setupFiles: [path.resolve(__dirname, "tests/unit/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["**/*.bun.ts", "**/*.bun.test.ts", "node_modules", ".svelte-kit"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.svelte"],
      exclude: ["src/paraglide/**", "src/**/*.d.ts"],
    },
    pool: "forks",
    server: {
      deps: {
        inline: [/@sveltejs\/kit/, /sveltekit-rate-limiter/],
      },
    },
  },
});
