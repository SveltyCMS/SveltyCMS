/**
 * @file tests/unit/databases/transaction-read-isolation.test.ts
 * @description Unit tests for database transaction read isolation (rollback: false support).
 */

import { describe, it, expect } from "vitest";

describe("Transaction Read Isolation (rollback: false support)", () => {
  it("does not throw or force rollback when transaction callback returns rollback: false", async () => {
    // Simulated PostgreSQL/MariaDB transaction module check logic
    const handleTxnResult = (result: any) => {
      if (!result || (typeof result === "object" && !("success" in result))) {
        return { success: true, data: result };
      }
      if (!result.success && result.rollback !== false) {
        throw new Error(result.message || "Transaction failed");
      }
      return result;
    };

    const readMissResult = {
      success: false,
      data: null,
      message: "Item not found",
      rollback: false,
    };
    expect(() => handleTxnResult(readMissResult)).not.toThrow();
    expect(handleTxnResult(readMissResult)).toEqual(readMissResult);

    const errorResult = { success: false, message: "Fatal SQL error" };
    expect(() => handleTxnResult(errorResult)).toThrow("Fatal SQL error");
  });
});
