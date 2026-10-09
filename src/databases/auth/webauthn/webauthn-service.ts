/**
 * @file src/databases/auth/webauthn/webauthn-service.ts
 * @description Minimal WebAuthn ceremony helpers (challenge, registration, authentication).
 *
 * ### Features:
 * - CSPRNG challenges
 * - RP ID hash validation
 * - Registration parsing via attestation.ts
 * - Assertion verification via native crypto
 */

import { createHash, randomBytes } from "node:crypto";
import type { Authenticator, User } from "@src/databases/auth/types";
import { nowISODateString } from "@utils/date";
import { parseAuthData, verifyAssertionSignature } from "./attestation";
import { decodeCBOR } from "./cbor-decoder";

export const WEBAUTHN_CHALLENGE_TTL_S = 300;

export interface WebAuthnChallengePayload {
  userId: string;
  type: "registration" | "authentication";
  challenge: string;
}

export interface PublicKeyCredentialDescriptorJSON {
  id: string;
  type: "public-key";
  transports?: string[];
}

export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    attestationObject: string;
    clientDataJSON: string;
  };
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
}

export function generateWebAuthnChallenge(): string {
  return Buffer.from(randomBytes(32)).toString("base64url");
}

export function bufferToBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString("base64url");
}

export function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function resolveRpId(hostname: string): string {
  return hostname.split(":")[0].toLowerCase();
}

export function verifyRpIdHash(authData: Buffer, rpId: string): boolean {
  const expected = createHash("sha256").update(rpId).digest();
  return authData.subarray(0, 32).equals(expected);
}

export function buildRegistrationOptions(user: User, rpId: string, challenge: string) {
  return {
    challenge: base64UrlToBuffer(challenge),
    rp: { name: "SveltyCMS", id: rpId },
    user: {
      id: Buffer.from(String(user._id)),
      name: user.email,
      displayName: user.username || user.email,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" as const },
      { alg: -257, type: "public-key" as const },
    ],
    timeout: 60_000,
    attestation: "none" as const,
    authenticatorSelection: {
      userVerification: "preferred" as const,
      residentKey: "preferred" as const,
    },
    // Exclude credentials the user already registered, so the same authenticator
    // cannot be enrolled twice (mirrors `allowCredentials` in
    // buildAuthenticationOptions: stored ids are base64url and are converted to
    // buffers here, then re-encoded for transport by the remote function).
    excludeCredentials: (user.authenticators ?? []).map((cred) => ({
      type: "public-key" as const,
      id: base64UrlToBuffer(cred.credentialID),
      transports: cred.transports,
    })),
  };
}

export function buildAuthenticationOptions(
  rpId: string,
  challenge: string,
  allowCredentials: PublicKeyCredentialDescriptorJSON[],
) {
  return {
    challenge: base64UrlToBuffer(challenge),
    timeout: 60_000,
    rpId,
    allowCredentials: allowCredentials.map((cred) => ({
      type: "public-key" as const,
      id: base64UrlToBuffer(cred.id),
      transports: cred.transports,
    })),
    userVerification: "preferred" as const,
  };
}

function parseClientData(clientDataJSON: string): {
  type: string;
  challenge: string;
  origin: string;
} {
  const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
  if (!parsed?.type || !parsed?.challenge) {
    throw new Error("Invalid clientDataJSON");
  }
  return parsed;
}

/** Bit 0 of authenticator flags: the user was present for this ceremony. */
const USER_PRESENT_FLAG = 0x01;

function assertWebAuthnClient(
  clientDataJSON: string,
  expectedType: string,
  expectedChallenge: string,
  expectedOrigin: string,
): void {
  const clientData = parseClientData(clientDataJSON);
  if (clientData.type !== expectedType) {
    throw new Error(
      expectedType === "webauthn.create"
        ? "Invalid registration clientData type"
        : "Invalid authentication clientData type",
    );
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error(
      expectedType === "webauthn.create"
        ? "Registration challenge mismatch"
        : "Authentication challenge mismatch",
    );
  }
  if (!expectedOrigin || clientData.origin !== expectedOrigin) {
    throw new Error("WebAuthn origin mismatch");
  }
}

function assertUserPresent(flags: number): void {
  if ((flags & USER_PRESENT_FLAG) === 0) {
    throw new Error("WebAuthn user presence flag missing");
  }
}

/**
 * Parses attestationObject (CBOR) enough to extract authData for registration.
 * Uses a minimal scan: attestationObject is CBOR map; authData is byte string under key -2.
 */
export function extractAuthDataFromAttestation(attestationObjectB64: string): Buffer {
  const attestation = base64UrlToBuffer(attestationObjectB64);
  const decoded = decodeCBOR(attestation) as Record<string | number, unknown>;
  const authData = decoded["authData"] ?? decoded[-2];
  if (!authData || !Buffer.isBuffer(authData)) {
    throw new Error("authData missing from attestationObject");
  }
  return authData;
}

export function verifyRegistrationResponse(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  rpId: string,
  expectedOrigin: string,
): Authenticator {
  assertWebAuthnClient(
    response.response.clientDataJSON,
    "webauthn.create",
    expectedChallenge,
    expectedOrigin,
  );

  const authDataBuf = extractAuthDataFromAttestation(response.response.attestationObject);
  if (!verifyRpIdHash(authDataBuf, rpId)) {
    throw new Error("Registration RP ID hash mismatch");
  }

  const parsed = parseAuthData(authDataBuf);
  assertUserPresent(parsed.flags);
  if (!parsed.credentialID || !parsed.credentialPublicKeyJWK) {
    throw new Error("Registration missing credential data");
  }

  return {
    credentialID: bufferToBase64Url(parsed.credentialID),
    credentialPublicKey: bufferToBase64Url(
      Buffer.from(JSON.stringify(parsed.credentialPublicKeyJWK), "utf8"),
    ),
    counter: parsed.signCount,
    credentialDeviceType: "multi-device",
    credentialBackedUp: !!(parsed.flags & 0x10),
    transports: ["internal", "hybrid"],
    createdAt: nowISODateString(),
  };
}

export function verifyAuthenticationResponse(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  rpId: string,
  stored: Authenticator,
  expectedOrigin: string,
): { verified: boolean; newCounter: number } {
  assertWebAuthnClient(
    response.response.clientDataJSON,
    "webauthn.get",
    expectedChallenge,
    expectedOrigin,
  );

  const authDataBuf = base64UrlToBuffer(response.response.authenticatorData);
  if (!verifyRpIdHash(authDataBuf, rpId)) {
    throw new Error("Authentication RP ID hash mismatch");
  }

  const parsed = parseAuthData(authDataBuf);
  const publicKeyJWK = JSON.parse(
    Buffer.from(stored.credentialPublicKey, "base64url").toString("utf8"),
  );

  // The assertion signs authenticatorData || SHA-256(raw clientData bytes).
  // `clientDataJSON` on the wire is base64url of those bytes.
  const clientDataRaw = base64UrlToBuffer(response.response.clientDataJSON);
  const verified = verifyAssertionSignature({
    authenticatorData: authDataBuf,
    clientDataJSON: clientDataRaw,
    signature: base64UrlToBuffer(response.response.signature),
    publicKeyJWK,
  });

  if (!verified) {
    return { verified: false, newCounter: stored.counter };
  }

  assertUserPresent(parsed.flags);

  if (parsed.signCount > 0 && parsed.signCount <= stored.counter) {
    throw new Error("Authenticator sign counter did not increase");
  }

  return { verified: true, newCounter: parsed.signCount || stored.counter + 1 };
}

export function findAuthenticatorByCredentialId(
  authenticators: Authenticator[] | undefined,
  credentialId: string,
): Authenticator | undefined {
  return (authenticators || []).find((a) => a.credentialID === credentialId);
}
