/**
 * @file scripts/benchmark-matrix/mock-kit.ts
 * @description Lightweight mock for SvelteKit modules to enable running benchmarks in isolation.
 *
 * IMPORTANT: This plugin MUST be registered with Bun BEFORE any other imports.
 * It mocks the SvelteKit runtime ($app/*, @sveltejs/kit) so that server-side
 * benchmark code can run without a full SvelteKit dev server.
 */

import { plugin } from "bun";

// Mock SvelteKit modules for standalone execution (e.g. benchmarks)
plugin({
  name: "svelte-kit-mock",
  setup(build) {
    // 1. Mock $app/ modules
    build.onResolve({ filter: /^\$app\// }, (args) => {
      return { path: args.path, external: false, namespace: "svelte-kit-mock" };
    });

    // 2. Mock @sveltejs/kit
    build.onResolve({ filter: /^@sveltejs\/kit$/ }, (args) => {
      return { path: args.path, external: false, namespace: "svelte-kit-mock" };
    });

    build.onLoad({ filter: /.*/, namespace: "svelte-kit-mock" }, (args) => {
      if (args.path === "@sveltejs/kit") {
        return {
          contents: `
            export const error = (status, message) => {
              const err = new Error(typeof message === 'object' ? message.message : message);
              err.status = status;
              return err;
            };
            export const json = (data, options) => {
              return new Response(JSON.stringify(data), {
                status: options?.status || 200,
                headers: { 'Content-Type': 'application/json', ...options?.headers }
              });
            };
            export const redirect = (status, location) => {
              const err = new Error('Redirect');
              err.status = status;
              err.location = location;
              return err;
            };
          `,
          loader: "js",
        };
      }

      // Default mock for $app/ environment and navigation
      return {
        contents: `
          export const browser = false; 
          export const dev = false; 
          export const building = false; 
          export const version = '1.0.0';
          export const goto = () => Promise.resolve();
          export const invalidate = () => Promise.resolve();
          export const invalidateAll = () => Promise.resolve();
          export const preloadData = () => Promise.resolve();
          export const preloadCode = () => Promise.resolve();
          export const beforeNavigate = () => {};
          export const afterNavigate = () => {};
          export const pushState = () => {};
          export const replaceState = () => {};
        `,
        loader: "js",
      };
    });
  },
});
