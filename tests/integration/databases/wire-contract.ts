/**
 * @file tests/integration/databases/wire-contract.ts
 * @description Narrowing helpers for the Direct-to-Wire CRUD contract in integration tests.
 *
 * `findPointWireStream` is an optional member of `ICrudAdapter`
 * and `DatabaseResult<T>` only exposes `data` on the success branch, so a test that
 * wants the payload has to narrow. These helpers do it once, loudly:
 *
 * - `requireWireMethods` fails the test when an adapter does not implement the contract
 *   (no silent skip — the DB matrix must prove every engine ships it).
 * - `unwrapResult` throws the adapter's own message instead of asserting on `undefined`.
 *
 * ### Features:
 * - Type-safe access to the wire payloads without `any`
 * - Presence assertion that satisfies the "no soft-skip for contract rows" policy
 */

import type { DatabaseResult, ICrudAdapter } from "../../../src/databases/db-interface";

/** The wire methods, asserted to exist. */
export interface WireContract {
  findPointWireStream: NonNullable<ICrudAdapter["findPointWireStream"]>;
}

/**
 * Returns bound wire methods, or throws when the adapter under test does not
 * implement the Direct-to-Wire contract.
 *
 * @param crud  the adapter's CRUD surface
 * @param label engine name used in the failure message, so a matrix failure names
 *              the adapter that regressed instead of an anonymous "adapter"
 */
export function requireWireMethods(crud: ICrudAdapter, label = "adapter"): WireContract {
  if (typeof crud.findPointWireStream !== "function") {
    throw new Error(
      `${label} does not implement the Direct-to-Wire contract (findPointWireStream)`,
    );
  }
  return {
    findPointWireStream: crud.findPointWireStream.bind(crud),
  };
}

/** Unwraps a `DatabaseResult`, throwing the adapter's message on failure. */
export function unwrapResult<T>(result: DatabaseResult<T>): T {
  if (!result.success) throw new Error(result.message);
  return result.data;
}
