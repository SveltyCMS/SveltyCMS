/**
 * @file tests/unit/bun-preload.ts
 * @description Consolidated global preload and Agnostic Bridge for Bun/SveltyCMS.
 */

import { mock, spyOn } from "bun:test";
import { plugin } from "bun";
import { compile } from "svelte/compiler";

// 1. SVELTEKIT MODULE MOCKS (The Agnostic Bridge)
const svelteKitMock = {
  env: { browser: false, dev: true, building: false, version: "1.0.0" },
  nav: { goto: () => {}, preloadData: () => {}, invalidateAll: () => {} },
  state: {
    page: {
      url: new URL("http://localhost"),
      params: {},
      status: 200,
      error: null,
      data: {},
      route: { id: "/" },
    },
  },
  stores: {
    page: {
      subscribe: (fn: any) => {
        fn({ data: {}, status: 200, url: new URL("http://localhost") });
        return () => {};
      },
    },
  },
};

mock.module("$app/environment", () => svelteKitMock.env);
mock.module("$app/navigation", () => svelteKitMock.nav);
mock.module("$app/state", () => svelteKitMock.state);
mock.module("$app/stores", () => svelteKitMock.stores);

// 2. GLOBAL SHIMS
(globalThis as any).vi = {
  fn: (impl?: any) => {
    const m = mock(impl || (() => {}));
    (m as any).mockResolvedValue = (v: any) => m.mockImplementation(() => Promise.resolve(v));
    (m as any).mockReturnValue = (v: any) => m.mockImplementation(() => v);
    return m;
  },
  spyOn: (obj: any, method: string) => spyOn(obj, method),
  mock: (path: string, factory?: any) => {
    if (factory) mock.module(path, () => factory(() => import(path)));
  },
  stubGlobal: (name: string, value: any) => {
    (globalThis as any)[name] = value;
  },
  mocked: (v: any) => v,
  hoisted: (f: any) => f(),
};
(globalThis as any).vitest = (globalThis as any).vi;

// 3. SVELTE RUNES
const rune = (v: any) => v;
(globalThis as any).$state = rune;
(globalThis as any).$state.raw = rune;
(globalThis as any).$state.snapshot = rune;
(globalThis as any).$derived = rune;
(globalThis as any).$derived.by = rune;
(globalThis as any).$effect = () => {};
(globalThis as any).$props = rune;
(globalThis as any).$bindable = rune;
(globalThis as any).$inspect = rune;
(globalThis as any).SvelteMap = Map;
(globalThis as any).SvelteSet = Set;

// 4. SVELTE COMPILER PLUGIN
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
