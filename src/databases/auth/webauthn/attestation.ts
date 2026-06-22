/**
 * @file src/databases/auth/webauthn/attestation.ts
 * @description
 * WebAuthn attestation and signature verification engine.
 *
 * Responsibilities include:
 * - Parsing authData buffer structures.
 * - Decoding COSE public keys to JSON Web Keys (JWK).
 * - Verifying assertion signatures natively using node:crypto.
 *
 * ### Features:
 * - COSE to JWK translator
 * - authData structural validation
 * - Cryptographic signature verification using P-256 and RS256
 */

import * as crypto from "node:crypto";
import { decodeCBORPartial } from "./cbor-decoder";

export interface ParsedAuthData {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  aaguid?: Buffer;
  credentialID?: Buffer;
  credentialPublicKey?: Buffer;
  credentialPublicKeyJWK?: any;
}

/**
 * Parses the authenticatorData (authData) byte array from a WebAuthn response.
 */
export function parseAuthData(authDataBuffer: Buffer | Uint8Array): ParsedAuthData {
  const buffer = Buffer.from(authDataBuffer);
  if (buffer.length < 37) {
    throw new Error("authData buffer is too short");
  }

  const rpIdHash = buffer.subarray(0, 32);
  const flags = buffer[32];
  const signCount = buffer.readUInt32BE(33);

  const parsed: ParsedAuthData = {
    rpIdHash,
    flags,
    signCount,
  };

  // Flag bit 6: Attested credential data present
  const hasAttestedCredentialData = !!(flags & 0x40);

  if (hasAttestedCredentialData) {
    if (buffer.length < 55) {
      throw new Error("authData with attested credential data is too short");
    }

    const aaguid = buffer.subarray(37, 53);
    const credentialIdLength = buffer.readUInt16BE(53);

    if (buffer.length < 55 + credentialIdLength) {
      throw new Error("authData is too short for the credential ID length specified");
    }

    const credentialID = buffer.subarray(55, 55 + credentialIdLength);
    const cosePublicKeyBuffer = buffer.subarray(55 + credentialIdLength);

    // Decode the COSE public key from the start of the remaining buffer
    const { value: coseKey, bytesRead } = decodeCBORPartial(cosePublicKeyBuffer);

    // Translate COSE public key map to JWK format
    const jwk: any = {};
    const kty = coseKey[1]; // Label 1: Key Type (kty)

    if (kty === 2) {
      // EC2 Key Type
      jwk.kty = "EC";
      if (coseKey[-1] === 1) {
        jwk.crv = "P-256";
      } else {
        throw new Error(`Unsupported EC curve: ${coseKey[-1]}`);
      }
      jwk.x = coseKey[-2].toString("base64url");
      jwk.y = coseKey[-3].toString("base64url");
    } else if (kty === 3) {
      // RSA Key Type
      jwk.kty = "RSA";
      jwk.n = coseKey[-1].toString("base64url");
      jwk.e = coseKey[-2].toString("base64url");
    } else {
      throw new Error(`Unsupported COSE key type: ${kty}`);
    }

    parsed.aaguid = aaguid;
    parsed.credentialID = credentialID;
    parsed.credentialPublicKey = cosePublicKeyBuffer.subarray(0, bytesRead);
    parsed.credentialPublicKeyJWK = jwk;
  }

  return parsed;
}

/**
 * Verifies a WebAuthn assertion (login) signature using a stored JWK.
 */
export function verifyAssertionSignature(options: {
  authenticatorData: Buffer | Uint8Array;
  clientDataJSON: string | Buffer | Uint8Array;
  signature: Buffer | Uint8Array;
  publicKeyJWK: any;
}): boolean {
  // 1. Hash the clientDataJSON
  const clientDataHash = crypto
    .createHash("sha256")
    .update(Buffer.from(options.clientDataJSON))
    .digest();

  // 2. Concatenate authData and clientDataHash to form verification data
  const verifyData = Buffer.concat([Buffer.from(options.authenticatorData), clientDataHash]);

  // 3. Import public key from JWK format
  const publicKey = crypto.createPublicKey({
    key: options.publicKeyJWK,
    format: "jwk",
  });

  // 4. Verify signature with SHA-256
  return crypto.verify("sha256", verifyData, publicKey, Buffer.from(options.signature));
}
