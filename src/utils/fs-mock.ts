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
export const readdirSync = () => [];
export const mkdirSync = () => undefined;
export const writeFileSync = () => undefined;
export const statSync = () => ({ size: 0, mtime: new Date(0) });
export const unlinkSync = () => undefined;
export const renameSync = () => undefined;

export const stat = async () => ({ size: 0, mtime: new Date(0) });
export const appendFile = async () => {};
export const mkdir = async () => {};
export const readFile = async () => "";
export const writeFile = async () => undefined;
export const unlink = async () => undefined;
export const rename = async () => undefined;
export const readdir = async () => [];

export const promises = {
  stat,
  appendFile,
  mkdir,
  readFile,
  writeFile,
  unlink,
  rename,
  readdir,
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

export const createReadStream = () => {
  const stream = { on: () => stream, pipe: () => stream, resume: () => stream };
  return stream;
};
export const createWriteStream = () => {
  const stream = { on: () => stream, write: () => true, end: () => {}, finish: () => {} };
  return stream;
};

export default {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  statSync,
  unlinkSync,
  renameSync,
  createReadStream,
  createWriteStream,
  stat,
  appendFile,
  mkdir,
  readFile,
  writeFile,
  unlink,
  rename,
  readdir,
  promises,
  AsyncLocalStorage,
};
