#!/usr/bin/env bun
/**
 * @file scripts/bootstrap-src-shims.ts
 * @description
 * Creates node_modules/@src shim packages so the Tailwind CSS v4 Vite plugin's
 * SSR scanner can resolve @src/routes and @src/content imports during build.
 *
 * @tailwindcss/vite v4.3.1 loses resolve.alias during its internal SSR content
 * scan, treating @src prefixes as scoped npm packages. These shims provide
 * Node.js-native resolution as a workaround.
 *
 * Run automatically by `bun run build` via vite.config.ts plugin.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const SHIMS_DIR = join(ROOT, "node_modules", "@src");

const SHIMS: Record<string, { main?: string; exports?: Record<string, string> }> = {
  routes: { main: "../../src/routes/+layout.svelte" },
  "routes/setup": { main: "../../../src/routes/setup/presets.ts" },
  content: { main: "../../src/content/types.ts" },
};

function bootstrap() {
  if (!existsSync(SHIMS_DIR)) {
    mkdirSync(SHIMS_DIR, { recursive: true });
  }

  let created = 0;
  for (const [name, config] of Object.entries(SHIMS)) {
    const dir = join(SHIMS_DIR, name);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) {
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: `@src/${name}`,
            version: "0.0.0",
            private: true,
            type: "module",
            ...config,
          },
          null,
          2,
        ),
      );
      created++;
    }
  }
  if (created > 0) {
    console.log(`[bootstrap-src-shims] Created ${created} @src shim(s) in node_modules/@src/`);
  }
}

// Run directly: bun run scripts/bootstrap-src-shims.ts
if (process.argv[1]?.includes("bootstrap-src-shims")) {
  bootstrap();
}

export { bootstrap };
