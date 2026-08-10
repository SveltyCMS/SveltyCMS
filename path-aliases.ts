/**
 * @file path-aliases.ts
 * @description SvelteKit path aliases — single source for vite, vitest, and import validation.
 *
 * Passed to `sveltekit({ alias })` in vite.config.ts. SvelteKit syncs these to
 * `.svelte-kit/tsconfig.json` paths and Vite resolve.alias for client + SSR.
 */

export const pathAliases = {
  "@api": "./src/routes/api",
  "@auth": "./src/databases/auth",
  "@components": "./src/components",
  "@config": "./config",
  "@content": "./src/content",
  "@databases": "./src/databases",
  "@plugins": "./src/plugins",
  "@root": ".",
  "@services": "./src/services",
  "@src": "./src",
  "@stores": "./src/stores",
  "@tests": "./tests",
  "@themes": "./src/themes",
  "@utils": "./src/utils",
  "@widgets": "./src/widgets",
} as const satisfies Record<string, string>;
