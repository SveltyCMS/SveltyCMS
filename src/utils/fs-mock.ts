/**
 * @file src/utils/fs-mock.ts
 * @description Mock file for node:fs, node:fs/promises, and node:async_hooks
 * built-ins used in browser bundles. Provides no-op stubs for tree-shaking safety.
 *
 * ### Features:
 * - fs/promises stubs (appendFile, mkdir, stat)
 * - fs sync stubs (existsSync, readFileSync)
 * - async_hooks stub (AsyncLocalStorage)
 */

export const existsSync = () => false;
export const readFileSync = () => "";

export const stat = async () => ({ size: 0, mtime: new Date(0) });
export const appendFile = async () => {};
export const mkdir = async () => {};

export const promises = {
  stat,
  appendFile,
  mkdir,
};

export class AsyncLocalStorage<T = unknown> {
  getStore(): T | undefined {
    return undefined;
  }
  run<R>(_store: T, callback: (...args: unknown[]) => R): R {
    return callback();
  }
  enterWith(_store: T): void {}
  exit<R>(callback: (...args: unknown[]) => R): R {
    return callback();
  }
}

export default {
  existsSync,
  readFileSync,
  promises,
  AsyncLocalStorage,
};
