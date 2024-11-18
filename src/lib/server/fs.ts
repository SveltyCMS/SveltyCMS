import { promises as fs } from 'fs';

export const writeFile = fs.writeFile;
export const mkdir = fs.mkdir;
export const readFile = fs.readFile;
export const readdir = fs.readdir;
export const stat = fs.stat;
export const unlink = fs.unlink;
export const rmdir = fs.rmdir;
