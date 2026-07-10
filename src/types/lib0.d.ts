/**
 * @file src/types/lib0.d.ts
 * @description Ambient module declarations for lib0 (Yjs protocol dependency).
 */

declare module "lib0/decoding" {
  export interface Decoder {
    pos: number;
  }
  export function readVarUint(decoder: Decoder): number;
  export function readVarString(decoder: Decoder): string;
  export function createDecoder(data: Uint8Array): Decoder;
}

declare module "lib0/encoding" {
  export function writeVarUint(encoder: unknown, num: number): void;
  export function writeVarString(encoder: unknown, str: string): void;
  export function writeUint8Array(encoder: unknown, data: Uint8Array): void;
  export function createEncoder(): unknown;
  export function toUint8Array(encoder: unknown): Uint8Array;
}
