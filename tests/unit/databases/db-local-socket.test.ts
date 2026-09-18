/**
 * @file tests/unit/databases/db-local-socket.test.ts
 * @description Loopback + Unix-socket detection for same-host DB transport.
 */

import { describe, expect, it } from "vitest";
import {
  isLoopbackHost,
  preferIpv4Loopback,
  detectPostgresSocketDir,
  detectMysqlSocketPath,
} from "@src/databases/db-local-socket";

describe("db-local-socket", () => {
  it("treats localhost and loopback as local", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("db.example.com")).toBe(false);
  });

  it("maps localhost to IPv4 to skip AAAA delay", () => {
    expect(preferIpv4Loopback("localhost")).toBe("127.0.0.1");
    expect(preferIpv4Loopback("10.0.0.5")).toBe("10.0.0.5");
  });

  it("does not invent a Unix socket on Windows", () => {
    if (process.platform === "win32") {
      expect(detectPostgresSocketDir("127.0.0.1")).toBeUndefined();
      expect(detectMysqlSocketPath("127.0.0.1")).toBeUndefined();
    }
  });
});
