/**
 * @file src/utils/fs-mock.ts
 * @description Mock file for node:fs built-in used in browser bundles.
 */

export const existsSync = () => false;
export const readFileSync = () => "";
export const stat = async () => ({ size: 0, mtime: new Date(0) });

export const promises = {
  stat,
};

export default {
  existsSync,
  readFileSync,
  promises,
};
