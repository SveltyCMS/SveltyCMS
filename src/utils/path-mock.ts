/**
 * @file src/utils/path-mock.ts
 * @description Mock file for node:path built-in used in browser bundles.
 */

export const join = (...args: string[]) => args.filter(Boolean).join("/");
export const resolve = (...args: string[]) => args.filter(Boolean).join("/");
export const basename = (p: string) => p.split(/[/\\]/).pop() || "";
export const dirname = (p: string) => p.split(/[/\\]/).slice(0, -1).join("/") || ".";
export const extname = (p: string) => {
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  return idx < 0 ? "" : base.slice(idx);
};

export default {
  join,
  resolve,
  basename,
  dirname,
  extname,
};
