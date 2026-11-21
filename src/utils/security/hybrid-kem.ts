/**
 * @file src/utils/security/hybrid-kem.ts
 * @description Dependency-free post-quantum at-rest envelopes using ML-KEM-768
 * (and optional X25519 + ML-KEM-768 composite KEM) with AES-256-GCM data encryption (DEM).
 *
 * Features:
 * - Fresh random 32-byte DEK per message; the KEM secret never encrypts data directly
 * - `v1:` envelope — ML-KEM-768 + HKDF-SHA-256 → 32-byte KEK (9 colon-separated fields)
 * - `v2:` envelope — X25519 + ML-KEM-768 composite KEM + HKDF-SHA-256 → 32-byte KEK
 *   (10 colon-separated fields; holds if either classical X25519 or ML-KEM-768 holds)
 * - Separate AES-256-GCM layers for the payload and the wrapped DEK, optional caller AAD
 * - Ephemeral DEK/KEK/shared-secret/private-key byte zeroing in `finally` blocks
 * - Strict versioned envelope parsing; failures never echo key material or plaintext
 * - Cached, non-throwing ML-KEM-768 and composite KEM runtime probes (Node 24 and Bun)
 */

const KEM_ALGORITHM = "ML-KEM-768";
const CLASSICAL_KEM_ALGORITHM = "X25519";
const ENVELOPE_VERSION_V1 = "v1";
const ENVELOPE_VERSION_V2 = "v2";
const ENVELOPE_FIELD_COUNT_V1 = 9;
const ENVELOPE_FIELD_COUNT_V2 = 10;
const HKDF_INFO_V1 = "sveltycms-hybrid-kem-v1";
const HKDF_INFO_V2 = "sveltycms-hybrid-kem-v2";
const DEK_LENGTH = 32;
const KEK_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ML_KEM_768_CIPHERTEXT_LENGTH = 1088;
const X25519_PUBLIC_KEY_LENGTH = 32;
const X25519_SHARED_SECRET_BITS = 256;
const AES_GCM_TAG_BITS = 128;

const SEAL_ERROR = "Hybrid KEM envelope sealing failed.";
const OPEN_ERROR = "Hybrid KEM envelope opening failed.";
const UNAVAILABLE_ERROR = "ML-KEM-768 is not available in this runtime.";
const INVALID_KEY_ERROR = "Invalid key encoding.";
const RANDOMNESS_ERROR = "Secure randomness is unavailable.";

const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export interface KemKeyPair {
  /** Base64 SPKI-encoded ML-KEM-768 public key. */
  publicKey: string;
  /** Base64 PKCS8-encoded ML-KEM-768 private key. Treat as a secret. */
  privateKey: string;
}

export interface CompositeKemKeyPair extends KemKeyPair {
  /** Base64 SPKI-encoded X25519 public key for classical+PQ composite envelopes (`v2:`). */
  classicalPublicKey: string;
  /** Base64 PKCS8-encoded X25519 private key. Treat as a secret. */
  classicalPrivateKey: string;
}

export interface HybridSealOptions {
  publicKey: string;
  /** Optional base64 SPKI-encoded X25519 public key to produce a `v2:` X25519+ML-KEM-768 envelope. */
  classicalPublicKey?: string;
  aad?: Uint8Array;
}

export interface HybridOpenOptions {
  privateKey: string;
  /** Required to open `v2:` X25519+ML-KEM-768 composite envelopes (base64 PKCS8-encoded X25519 private key). */
  classicalPrivateKey?: string;
  aad?: Uint8Array;
}

/** Opaque WebCrypto key handle; we only need identity, not its members. */
interface SubtleKey {
  readonly type: string;
  readonly extractable: boolean;
  readonly algorithm: { readonly name: string };
  readonly usages: readonly string[];
}

interface GcmParams {
  name: string;
  iv: Uint8Array;
  additionalData?: Uint8Array;
  tagLength: number;
}

interface HkdfParams {
  name: string;
  hash: string;
  salt: Uint8Array;
  info: Uint8Array;
}

interface EcdhKeyDeriveParams {
  name: string;
  public: SubtleKey;
}

/**
 * Minimal structural view of `SubtleCrypto` including the ML-KEM and X25519 extensions.
 * The DOM lib does not type `encapsulateBits`/`decapsulateBits` yet, so the
 * runtime object is narrowed through this interface instead of using `any`.
 */
interface HybridSubtle {
  generateKey(
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: readonly string[],
  ): Promise<{ publicKey: SubtleKey; privateKey: SubtleKey }>;
  exportKey(format: "spki" | "pkcs8" | "raw", key: SubtleKey): Promise<ArrayBuffer>;
  importKey(
    format: "spki" | "pkcs8" | "raw",
    keyData: Uint8Array,
    algorithm: string | { name: string },
    extractable: boolean,
    keyUsages: readonly string[],
  ): Promise<SubtleKey>;
  encapsulateBits(
    algorithm: { name: string },
    key: SubtleKey,
  ): Promise<{ sharedKey: ArrayBuffer; ciphertext: ArrayBuffer }>;
  decapsulateBits(
    algorithm: { name: string },
    key: SubtleKey,
    ciphertext: Uint8Array,
  ): Promise<ArrayBuffer>;
  deriveBits(
    algorithm: HkdfParams | EcdhKeyDeriveParams,
    baseKey: SubtleKey,
    length: number,
  ): Promise<ArrayBuffer>;
  encrypt(algorithm: GcmParams, key: SubtleKey, data: Uint8Array): Promise<ArrayBuffer>;
  decrypt(algorithm: GcmParams, key: SubtleKey, data: Uint8Array): Promise<ArrayBuffer>;
}

interface ParsedEnvelope {
  version: "v1" | "v2";
  kemCiphertext: Uint8Array;
  x25519EphemeralPub?: Uint8Array;
  hkdfSalt: Uint8Array;
  dekIv: Uint8Array;
  dekTag: Uint8Array;
  wrappedDek: Uint8Array;
  payloadIv: Uint8Array;
  payloadTag: Uint8Array;
  payloadCiphertext: Uint8Array;
}

interface SealedLayer {
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
}

let availabilityProbe: Promise<boolean> | undefined;
let compositeAvailabilityProbe: Promise<boolean> | undefined;

function resolveSubtle(): HybridSubtle | null {
  const runtime = globalThis as { crypto?: { subtle?: unknown } };
  const subtle = runtime.crypto?.subtle;
  if (subtle === undefined || subtle === null) return null;
  return subtle as HybridSubtle;
}

function requireSubtle(): HybridSubtle {
  const subtle = resolveSubtle();
  if (!subtle) throw new Error(UNAVAILABLE_ERROR);
  return subtle;
}

function randomBytes(length: number): Uint8Array {
  const runtime = globalThis as {
    crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
  };
  const getRandomValues = runtime.crypto?.getRandomValues;
  if (typeof getRandomValues !== "function") throw new Error(RANDOMNESS_ERROR);
  const bytes = new Uint8Array(length);
  getRandomValues.call(runtime.crypto, bytes);
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!BASE64URL_RE.test(value)) throw new Error(OPEN_ERROR);
  const bytes = new Uint8Array(Buffer.from(value, "base64url"));
  // Reject non-canonical encodings (non-zero trailing bits, whitespace, padding).
  if (encodeBase64Url(bytes) !== value) throw new Error(OPEN_ERROR);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value: string): Uint8Array {
  if (!BASE64_RE.test(value)) throw new Error(INVALID_KEY_ERROR);
  return new Uint8Array(Buffer.from(value, "base64"));
}

function assertLength(value: Uint8Array, expected: number): void {
  if (value.byteLength !== expected) throw new Error(OPEN_ERROR);
}

function buildGcmParams(iv: Uint8Array, aad: Uint8Array | undefined): GcmParams {
  return aad
    ? { name: "AES-GCM", iv, additionalData: aad, tagLength: AES_GCM_TAG_BITS }
    : { name: "AES-GCM", iv, tagLength: AES_GCM_TAG_BITS };
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first, 0);
  combined.set(second, first.byteLength);
  return combined;
}

function splitTag(sealed: Uint8Array): { ciphertext: Uint8Array; tag: Uint8Array } {
  if (sealed.byteLength < TAG_LENGTH) throw new Error(SEAL_ERROR);
  return {
    ciphertext: sealed.subarray(0, sealed.byteLength - TAG_LENGTH),
    tag: sealed.subarray(sealed.byteLength - TAG_LENGTH),
  };
}

async function deriveKek(
  subtle: HybridSubtle,
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<Uint8Array> {
  try {
    const baseKey = await subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: new TextEncoder().encode(info),
      },
      baseKey,
      KEK_LENGTH * 8,
    );
    const kek = new Uint8Array(bits);
    if (kek.byteLength !== KEK_LENGTH) throw new Error(SEAL_ERROR);
    return kek;
  } finally {
    ikm.fill(0);
  }
}

function concatAllBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < chunks.length; i++) total += chunks[i].byteLength;
  const combined = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    combined.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return combined;
}

async function sealLayer(
  subtle: HybridSubtle,
  rawKey: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array | undefined,
): Promise<SealedLayer> {
  const key = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const sealed = new Uint8Array(await subtle.encrypt(buildGcmParams(iv, aad), key, plaintext));
  const { ciphertext, tag } = splitTag(sealed);
  return { iv, tag, ciphertext };
}

async function openLayer(
  subtle: HybridSubtle,
  rawKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array | undefined,
): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const data = concatBytes(ciphertext, tag);
  return new Uint8Array(await subtle.decrypt(buildGcmParams(iv, aad), key, data));
}

function parseEnvelope(envelope: string): ParsedEnvelope {
  if (typeof envelope !== "string") throw new Error(OPEN_ERROR);
  const parts = envelope.split(":");
  const version = parts[0];

  if (version === ENVELOPE_VERSION_V1 && parts.length === ENVELOPE_FIELD_COUNT_V1) {
    const parsed: ParsedEnvelope = {
      version: "v1",
      kemCiphertext: decodeBase64Url(parts[1]),
      hkdfSalt: decodeBase64Url(parts[2]),
      dekIv: decodeBase64Url(parts[3]),
      dekTag: decodeBase64Url(parts[4]),
      wrappedDek: decodeBase64Url(parts[5]),
      payloadIv: decodeBase64Url(parts[6]),
      payloadTag: decodeBase64Url(parts[7]),
      payloadCiphertext: decodeBase64Url(parts[8]),
    };

    assertLength(parsed.kemCiphertext, ML_KEM_768_CIPHERTEXT_LENGTH);
    assertLength(parsed.hkdfSalt, SALT_LENGTH);
    assertLength(parsed.dekIv, IV_LENGTH);
    assertLength(parsed.dekTag, TAG_LENGTH);
    assertLength(parsed.wrappedDek, DEK_LENGTH);
    assertLength(parsed.payloadIv, IV_LENGTH);
    assertLength(parsed.payloadTag, TAG_LENGTH);
    return parsed;
  }

  if (version === ENVELOPE_VERSION_V2 && parts.length === ENVELOPE_FIELD_COUNT_V2) {
    const parsed: ParsedEnvelope = {
      version: "v2",
      kemCiphertext: decodeBase64Url(parts[1]),
      x25519EphemeralPub: decodeBase64Url(parts[2]),
      hkdfSalt: decodeBase64Url(parts[3]),
      dekIv: decodeBase64Url(parts[4]),
      dekTag: decodeBase64Url(parts[5]),
      wrappedDek: decodeBase64Url(parts[6]),
      payloadIv: decodeBase64Url(parts[7]),
      payloadTag: decodeBase64Url(parts[8]),
      payloadCiphertext: decodeBase64Url(parts[9]),
    };

    assertLength(parsed.kemCiphertext, ML_KEM_768_CIPHERTEXT_LENGTH);
    assertLength(parsed.x25519EphemeralPub!, X25519_PUBLIC_KEY_LENGTH);
    assertLength(parsed.hkdfSalt, SALT_LENGTH);
    assertLength(parsed.dekIv, IV_LENGTH);
    assertLength(parsed.dekTag, TAG_LENGTH);
    assertLength(parsed.wrappedDek, DEK_LENGTH);
    assertLength(parsed.payloadIv, IV_LENGTH);
    assertLength(parsed.payloadTag, TAG_LENGTH);
    return parsed;
  }

  throw new Error(OPEN_ERROR);
}

async function probeMlKem(): Promise<boolean> {
  const subtle = resolveSubtle();
  if (!subtle) return false;
  try {
    const pair = await subtle.generateKey({ name: KEM_ALGORITHM }, true, [
      "encapsulateBits",
      "decapsulateBits",
    ]);
    const encapsulated = await subtle.encapsulateBits({ name: KEM_ALGORITHM }, pair.publicKey);
    const decapsulated = await subtle.decapsulateBits(
      { name: KEM_ALGORITHM },
      pair.privateKey,
      new Uint8Array(encapsulated.ciphertext),
    );
    return new Uint8Array(decapsulated).byteLength === KEK_LENGTH;
  } catch {
    return false;
  }
}

async function probeCompositeKem(): Promise<boolean> {
  if (!(await isMlKemAvailable())) return false;
  const subtle = resolveSubtle();
  if (!subtle) return false;
  try {
    const a = await subtle.generateKey({ name: CLASSICAL_KEM_ALGORITHM }, true, ["deriveBits"]);
    const b = await subtle.generateKey({ name: CLASSICAL_KEM_ALGORITHM }, true, ["deriveBits"]);
    const shared = await subtle.deriveBits(
      { name: CLASSICAL_KEM_ALGORITHM, public: b.publicKey },
      a.privateKey,
      X25519_SHARED_SECRET_BITS,
    );
    return new Uint8Array(shared).byteLength === X25519_PUBLIC_KEY_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Probe once whether the runtime exposes ML-KEM-768 through WebCrypto.
 * Never throws; the result (including failures) is cached for the process.
 */
export async function isMlKemAvailable(): Promise<boolean> {
  availabilityProbe ??= probeMlKem();
  return availabilityProbe;
}

/**
 * Probe once whether the runtime exposes both ML-KEM-768 and X25519 through WebCrypto
 * (required for `v2:` classical+PQ composite envelopes). Never throws.
 */
export async function isCompositeKemAvailable(): Promise<boolean> {
  compositeAvailabilityProbe ??= probeCompositeKem();
  return compositeAvailabilityProbe;
}

/**
 * Generate an ML-KEM-768 key pair as base64 SPKI (public) / PKCS8 (private).
 * The private key is secret material; keep it in `config/private.ts` or a secret manager.
 */
export async function generateKemKeyPair(): Promise<KemKeyPair> {
  const subtle = requireSubtle();
  try {
    const pair = await subtle.generateKey({ name: KEM_ALGORITHM }, true, [
      "encapsulateBits",
      "decapsulateBits",
    ]);
    const [spki, pkcs8] = await Promise.all([
      subtle.exportKey("spki", pair.publicKey),
      subtle.exportKey("pkcs8", pair.privateKey),
    ]);
    return {
      publicKey: encodeBase64(new Uint8Array(spki)),
      privateKey: encodeBase64(new Uint8Array(pkcs8)),
    };
  } catch {
    throw new Error("Failed to generate an ML-KEM-768 key pair.");
  }
}

/**
 * Generate a composite ML-KEM-768 + X25519 key pair for `v2:` classical+PQ envelopes.
 * Both private keys are secret material; keep them in `config/private.ts` or a secret manager.
 */
export async function generateCompositeKemKeyPair(): Promise<CompositeKemKeyPair> {
  const subtle = requireSubtle();
  try {
    const [kemPair, x25519Pair] = await Promise.all([
      generateKemKeyPair(),
      subtle.generateKey({ name: CLASSICAL_KEM_ALGORITHM }, true, ["deriveBits"]),
    ]);
    const [x25519Spki, x25519Pkcs8] = await Promise.all([
      subtle.exportKey("spki", x25519Pair.publicKey),
      subtle.exportKey("pkcs8", x25519Pair.privateKey),
    ]);
    return {
      ...kemPair,
      classicalPublicKey: encodeBase64(new Uint8Array(x25519Spki)),
      classicalPrivateKey: encodeBase64(new Uint8Array(x25519Pkcs8)),
    };
  } catch {
    throw new Error("Failed to generate a composite X25519 + ML-KEM-768 key pair.");
  }
}

/**
 * Seal `plaintext` into a self-contained envelope:
 * - `v1:` (9 fields, ML-KEM-768 + AES-256-GCM) when `classicalPublicKey` is omitted.
 * - `v2:` (10 fields, X25519 + ML-KEM-768 composite + AES-256-GCM) when `classicalPublicKey` is provided.
 */
export async function hybridSeal(
  plaintext: Uint8Array,
  options: HybridSealOptions,
): Promise<string> {
  let dek: Uint8Array | undefined;
  let kek: Uint8Array | undefined;
  let mlKemShared: Uint8Array | undefined;
  let x25519Shared: Uint8Array | undefined;
  try {
    const subtle = requireSubtle();
    const publicKey = await subtle.importKey(
      "spki",
      decodeBase64(options.publicKey),
      { name: KEM_ALGORITHM },
      true,
      ["encapsulateBits"],
    );

    dek = randomBytes(DEK_LENGTH);
    const encapsulated = await subtle.encapsulateBits({ name: KEM_ALGORITHM }, publicKey);
    const kemCiphertext = new Uint8Array(encapsulated.ciphertext);
    mlKemShared = new Uint8Array(encapsulated.sharedKey);
    const salt = randomBytes(SALT_LENGTH);

    let x25519EphemeralPub: Uint8Array | undefined;
    if (options.classicalPublicKey) {
      const recipientX25519 = await subtle.importKey(
        "spki",
        decodeBase64(options.classicalPublicKey),
        { name: CLASSICAL_KEM_ALGORITHM },
        true,
        [],
      );
      const ephemeral = await subtle.generateKey({ name: CLASSICAL_KEM_ALGORITHM }, true, [
        "deriveBits",
      ]);
      const [rawPubBuf, sharedBuf] = await Promise.all([
        subtle.exportKey("raw", ephemeral.publicKey),
        subtle.deriveBits(
          { name: CLASSICAL_KEM_ALGORITHM, public: recipientX25519 },
          ephemeral.privateKey,
          X25519_SHARED_SECRET_BITS,
        ),
      ]);
      x25519EphemeralPub = new Uint8Array(rawPubBuf);
      assertLength(x25519EphemeralPub, X25519_PUBLIC_KEY_LENGTH);
      x25519Shared = new Uint8Array(sharedBuf);
      // Bind both shared secrets and both KEM ciphertexts (dual-PRF combiner).
      const compositeIkm = concatAllBytes(
        mlKemShared,
        x25519Shared,
        kemCiphertext,
        x25519EphemeralPub,
      );
      kek = await deriveKek(subtle, compositeIkm, salt, HKDF_INFO_V2);
    } else {
      kek = await deriveKek(subtle, mlKemShared, salt, HKDF_INFO_V1);
    }

    const payloadIv = randomBytes(IV_LENGTH);
    const payload = await sealLayer(subtle, dek, payloadIv, plaintext, options.aad);

    const dekIv = randomBytes(IV_LENGTH);
    const wrapped = await sealLayer(subtle, kek, dekIv, dek, options.aad);

    if (x25519EphemeralPub) {
      return [
        ENVELOPE_VERSION_V2,
        encodeBase64Url(kemCiphertext),
        encodeBase64Url(x25519EphemeralPub),
        encodeBase64Url(salt),
        encodeBase64Url(wrapped.iv),
        encodeBase64Url(wrapped.tag),
        encodeBase64Url(wrapped.ciphertext),
        encodeBase64Url(payload.iv),
        encodeBase64Url(payload.tag),
        encodeBase64Url(payload.ciphertext),
      ].join(":");
    }

    return [
      ENVELOPE_VERSION_V1,
      encodeBase64Url(kemCiphertext),
      encodeBase64Url(salt),
      encodeBase64Url(wrapped.iv),
      encodeBase64Url(wrapped.tag),
      encodeBase64Url(wrapped.ciphertext),
      encodeBase64Url(payload.iv),
      encodeBase64Url(payload.tag),
      encodeBase64Url(payload.ciphertext),
    ].join(":");
  } catch {
    throw new Error(SEAL_ERROR);
  } finally {
    dek?.fill(0);
    kek?.fill(0);
    mlKemShared?.fill(0);
    x25519Shared?.fill(0);
  }
}

/**
 * Open a `v1:` or `v2:` envelope produced by {@link hybridSeal}.
 * Any parse, decapsulation, key-unwrap, AAD, or authentication failure throws
 * the same generic error and never includes key material or plaintext.
 */
export async function hybridOpen(
  envelope: string,
  options: HybridOpenOptions,
): Promise<Uint8Array> {
  let dek: Uint8Array | undefined;
  let kek: Uint8Array | undefined;
  let mlKemShared: Uint8Array | undefined;
  let x25519Shared: Uint8Array | undefined;
  let privateKeyBytes: Uint8Array | undefined;
  let classicalPrivateKeyBytes: Uint8Array | undefined;
  try {
    const parsed = parseEnvelope(envelope);
    const subtle = requireSubtle();
    privateKeyBytes = decodeBase64(options.privateKey);
    const privateKey = await subtle.importKey(
      "pkcs8",
      privateKeyBytes,
      { name: KEM_ALGORITHM },
      false,
      ["decapsulateBits"],
    );

    const sharedKey = await subtle.decapsulateBits(
      { name: KEM_ALGORITHM },
      privateKey,
      parsed.kemCiphertext,
    );
    mlKemShared = new Uint8Array(sharedKey);

    if (parsed.version === "v2") {
      if (!options.classicalPrivateKey || !parsed.x25519EphemeralPub) {
        throw new Error(OPEN_ERROR);
      }
      classicalPrivateKeyBytes = decodeBase64(options.classicalPrivateKey);
      const [classicalPrivateKey, ephemeralPubKey] = await Promise.all([
        subtle.importKey(
          "pkcs8",
          classicalPrivateKeyBytes,
          { name: CLASSICAL_KEM_ALGORITHM },
          false,
          ["deriveBits"],
        ),
        subtle.importKey(
          "raw",
          parsed.x25519EphemeralPub,
          { name: CLASSICAL_KEM_ALGORITHM },
          true,
          [],
        ),
      ]);
      const sharedBuf = await subtle.deriveBits(
        { name: CLASSICAL_KEM_ALGORITHM, public: ephemeralPubKey },
        classicalPrivateKey,
        X25519_SHARED_SECRET_BITS,
      );
      x25519Shared = new Uint8Array(sharedBuf);
      const compositeIkm = concatAllBytes(
        mlKemShared,
        x25519Shared,
        parsed.kemCiphertext,
        parsed.x25519EphemeralPub,
      );
      kek = await deriveKek(subtle, compositeIkm, parsed.hkdfSalt, HKDF_INFO_V2);
    } else {
      kek = await deriveKek(subtle, mlKemShared, parsed.hkdfSalt, HKDF_INFO_V1);
    }

    dek = await openLayer(subtle, kek, parsed.dekIv, parsed.wrappedDek, parsed.dekTag, options.aad);
    assertLength(dek, DEK_LENGTH);

    return await openLayer(
      subtle,
      dek,
      parsed.payloadIv,
      parsed.payloadCiphertext,
      parsed.payloadTag,
      options.aad,
    );
  } catch {
    throw new Error(OPEN_ERROR);
  } finally {
    dek?.fill(0);
    kek?.fill(0);
    mlKemShared?.fill(0);
    x25519Shared?.fill(0);
    privateKeyBytes?.fill(0);
    classicalPrivateKeyBytes?.fill(0);
  }
}

/** Check if a value is a hybrid ML-KEM (`v1:`) or composite X25519+ML-KEM (`v2:`) envelope. */
export function isHybridEnvelope(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return (
    (parts[0] === ENVELOPE_VERSION_V1 && parts.length === ENVELOPE_FIELD_COUNT_V1) ||
    (parts[0] === ENVELOPE_VERSION_V2 && parts.length === ENVELOPE_FIELD_COUNT_V2)
  );
}
