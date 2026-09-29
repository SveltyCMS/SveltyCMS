/**
 * @file tests/unit/auth/webauthn/webauthn-ceremony.test.ts
 * @description Origin and user-presence checks on a WebAuthn assertion.
 *
 * ### Features:
 * - Foreign origin is rejected before the signature is accepted
 * - User-presence flag is required after a valid signature
 * - A matching origin and user-presence flag verify
 */

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@src/databases/auth/webauthn/webauthn-service";
import type { Authenticator } from "@src/databases/auth/types";

const RP_ID = "cms.example";
const ORIGIN = "https://cms.example";
const CHALLENGE = "ceremony-challenge";

function clientDataJSON(origin: string): string {
  return Buffer.from(
    JSON.stringify({ type: "webauthn.get", challenge: CHALLENGE, origin }),
  ).toString("base64url");
}

function authenticatorData(flags: number): Buffer {
  const buf = Buffer.alloc(37);
  createHash("sha256").update(RP_ID).digest().copy(buf, 0);
  buf[32] = flags;
  buf.writeUInt32BE(1, 33);
  return buf;
}

function assertion(
  origin: string,
  flags: number,
): {
  response: AuthenticationResponseJSON;
  stored: Authenticator;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const rawClientData = Buffer.from(clientDataJSON(origin), "base64url");
  const authData = authenticatorData(flags);
  const clientDataHash = createHash("sha256").update(rawClientData).digest();
  const signature = sign("sha256", Buffer.concat([authData, clientDataHash]), privateKey);

  return {
    response: {
      id: "cred",
      rawId: "cred",
      type: "public-key",
      response: {
        authenticatorData: authData.toString("base64url"),
        clientDataJSON: clientDataJSON(origin),
        signature: signature.toString("base64url"),
      },
    },
    stored: {
      credentialID: "cred",
      credentialPublicKey: Buffer.from(JSON.stringify(jwk), "utf8").toString("base64url"),
      counter: 0,
      credentialDeviceType: "multi-device",
      credentialBackedUp: false,
      createdAt: "2026-09-29T00:00:00.000Z",
    },
  };
}

describe("WebAuthn ceremony", () => {
  it("rejects a foreign origin before accepting the signature", () => {
    const { response, stored } = assertion("https://evil.example", 0x01);
    expect(() => verifyAuthenticationResponse(response, CHALLENGE, RP_ID, stored, ORIGIN)).toThrow(
      "WebAuthn origin mismatch",
    );
  });

  it("rejects a verified signature that did not set the user-presence flag", () => {
    const { response, stored } = assertion(ORIGIN, 0x00);
    expect(() => verifyAuthenticationResponse(response, CHALLENGE, RP_ID, stored, ORIGIN)).toThrow(
      "WebAuthn user presence flag missing",
    );
  });

  it("accepts a matching origin with the user present", () => {
    const { response, stored } = assertion(ORIGIN, 0x01);
    expect(verifyAuthenticationResponse(response, CHALLENGE, RP_ID, stored, ORIGIN)).toEqual({
      verified: true,
      newCounter: 1,
    });
  });
});
