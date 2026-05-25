/**
 * @file tests/unit/bun-preload.ts
 * @description Consolidated global preload and Agnostic Bridge for Bun/SveltyCMS.
 * Preloads the master unit testing setup to share mocks/shims, and registers
 * the Bun-specific Svelte component loader.
 */

// Signal to handle-system-state that we're in the Bun test runner.
// Bun 1.3.x does not set BUN_TEST automatically on Windows.
process.env.BUN_TEST = "true";

import { plugin } from "bun";
import { compile } from "svelte/compiler";

// 1. Run the master setup file which establishes all mocks and shims
import "./setup";

// 2. SVELTE COMPILER PLUGIN (Bun-specific compile hook for Svelte components)
plugin({
  name: "svelte-loader",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      try {
        const { js } = compile(source, { filename: path, generate: "server" });
        return { contents: js.code, loader: "js" };
      } catch {
        return { contents: "export default {}", loader: "js" };
      }
    });
  },
});
