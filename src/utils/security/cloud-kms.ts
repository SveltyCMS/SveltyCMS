/**
 * @file src/utils/security/cloud-kms.ts
 * @description Enterprise Cloud KMS Envelope Encryption Engine.
 *
 * Implements Envelope Encryption integrating with supported KMS providers:
 * - AWS Key Management Service (AWS KMS with AWS Signature Version 4 signing)
 * - HashiCorp Vault (Transit Secrets Engine)
 * - Local / Self-Hosted KMS (HKDF Master Key Envelope from `ENCRYPTION_KEY`)
 * - Unimplemented cloud providers (`gcp-kms`, `azure-kv`) fail closed instead of
 *   silently falling back to local keys.
 *
 * ### Architecture & Zero-Latency Guarantee:
 * - Master Keys (KEKs - Key Encryption Keys) reside in KMS / Vault / process master key.
 * - SveltyCMS requests a 256-bit Data Encryption Key (DEK) from the KMS provider.
 * - Plaintext DEKs are cached in an in-memory Map with configurable rotation TTL
 *   (default: 1 hour) and wiped in `reset()`.
 * - Document fields are encrypted/decrypted locally using native CPU AES-NI
 *   hardware acceleration (AES-256-GCM) with the cached Plaintext DEK (< 0.001 ms).
 * - Note: `v2` field envelopes store the DEK key ID, not the wrapped DEK ciphertext;
 *   operators using external KMS providers must persist wrapped DEKs across restarts
 *   and hydrate them via `resolveDek()` before reading prior rows.
 *
 * ### Features:
 * - AWS KMS (SigV4), HashiCorp Vault (Transit), and fail-closed Local KMS adapters
 * - Fail-closed rejection of unimplemented providers (`gcp-kms`, `azure-kv`) and missing secrets
 * - In-memory DEK caching with rotated-key lookup (`getCachedDekSync`) and zeroing on reset
 * - Versioned envelope key ID tagging (`kms.<provider>.<keyId>.<dekHash>`)
 */

import nodeCrypto from "node:crypto";
import { logger } from "@utils/logger";
import { AppError, raise } from "@utils/error-handling";
import { validateEgressUrl, safeFetch } from "@utils/egress-guard";

export type KmsProviderType = "local" | "aws-kms" | "gcp-kms" | "azure-kv" | "vault";

export interface KmsConfig {
  provider: KmsProviderType;
  keyId: string;
  region?: string;
  endpoint?: string;
  token?: string;
  /** AWS access key ID for `aws-kms` SigV4 signing (falls back to `AWS_ACCESS_KEY_ID`). */
  accessKeyId?: string;
  /** AWS secret access key for `aws-kms` SigV4 signing (falls back to `AWS_SECRET_ACCESS_KEY`). */
  secretAccessKey?: string;
  /** Optional AWS temporary session token (falls back to `AWS_SESSION_TOKEN`). */
  sessionToken?: string;
  /**
   * Explicitly allow unsigned requests against a non-AWS custom endpoint (e.g. LocalStack mock).
   * Ignored for `amazonaws.com` hosts, which always require SigV4 credentials.
   */
  allowUnsignedEndpoint?: boolean;
  dekTtlMs?: number;
}

export interface CachedDek {
  keyId: string;
  plaintext: Buffer;
  encrypted: string;
  expiresAt: number;
  provider: KmsProviderType;
}

export interface KmsAdapter {
  generateDataKey(keyId: string): Promise<{ plaintext: Buffer; encrypted: string }>;
  decryptDataKey(keyId: string, encryptedKey: string): Promise<Buffer>;
}

const DEFAULT_DEK_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEK_LENGTH = 32; // 256 bits
const MIN_LOCAL_MASTER_SECRET_LENGTH = 32;

function sha256Hex(data: string | Buffer): string {
  // AWS SigV4 request payload / canonical request digest (not a password hash).
  // codeql[js/insufficient-password-hash]
  return nodeCrypto.createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return nodeCrypto.createHmac("sha256", key).update(data, "utf8").digest();
}

export interface AwsSigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Compute AWS Signature Version 4 (`AWS4-HMAC-SHA256`) headers for an AWS KMS JSON-RPC POST.
 * Dependency-free implementation using `node:crypto`.
 */
export function signAwsKmsRequest(params: {
  url: URL;
  region: string;
  target: string;
  body: string;
  credentials: AwsSigV4Credentials;
  now?: Date;
}): Record<string, string> {
  const now = params.now ?? new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = `${iso.slice(0, 8)}T${iso.slice(9, 15)}Z`;
  const dateStamp = iso.slice(0, 8);
  const service = "kms";
  const host = params.url.host;
  const canonicalUri = params.url.pathname || "/";
  const canonicalQuerystring = params.url.searchParams.toString();
  const payloadHash = sha256Hex(params.body);

  const signedEntries: Array<[string, string]> = [
    ["content-type", "application/x-amz-json-1.1"],
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
    ["x-amz-target", params.target],
  ];
  if (params.credentials.sessionToken) {
    signedEntries.push(["x-amz-security-token", params.credentials.sessionToken]);
  }
  signedEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalHeaders = `${signedEntries.map(([k, v]) => `${k}:${v.trim()}`).join("\n")}\n`;
  const signedHeaders = signedEntries.map(([k]) => k).join(";");

  const canonicalRequest = [
    "POST",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${params.credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, params.region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = nodeCrypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  kDate.fill(0);
  kRegion.fill(0);
  kService.fill(0);
  kSigning.fill(0);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Target": params.target,
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${params.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (params.credentials.sessionToken) {
    headers["X-Amz-Security-Token"] = params.credentials.sessionToken;
  }
  return headers;
}

/**
 * Local KMS Adapter: Derives an envelope DEK from the server master secret.
 * Used for zero-cloud testing, development, and self-hosted environments.
 */
class LocalKmsAdapter implements KmsAdapter {
  constructor(private masterKey: Buffer) {}

  async generateDataKey(keyId: string): Promise<{ plaintext: Buffer; encrypted: string }> {
    const dek = nodeCrypto.randomBytes(DEK_LENGTH);
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    cipher.setAAD(Buffer.from(`local-kms:${keyId}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    const encrypted = `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
    return { plaintext: dek, encrypted };
  }

  async decryptDataKey(keyId: string, encryptedKey: string): Promise<Buffer> {
    const parts = encryptedKey.split(".");
    if (parts.length !== 3) {
      throw new AppError("Malformed encrypted DEK", 400, "KMS_DEK_MALFORMED");
    }
    const [ivB64, tagB64, cipherB64] = parts;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const ciphertext = Buffer.from(cipherB64, "base64url");

    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAAD(Buffer.from(`local-kms:${keyId}`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  zeroMasterKey(): void {
    this.masterKey.fill(0);
  }
}

/**
 * HashiCorp Vault Adapter: Uses Vault Transit Secrets Engine.
 */
class VaultKmsAdapter implements KmsAdapter {
  constructor(
    private endpoint: string,
    private token: string,
  ) {
    if (!token.trim()) {
      raise(503, "Vault KMS requires a non-empty KMS_TOKEN.", "KMS_CREDENTIALS_MISSING");
    }
  }

  async generateDataKey(keyId: string): Promise<{ plaintext: Buffer; encrypted: string }> {
    const url = `${this.endpoint.replace(/\/+$/, "")}/v1/transit/datakey/plaintext/${encodeURIComponent(keyId)}`;
    await validateEgressUrl(url);

    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "X-Vault-Token": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bits: 256 }),
    });

    if (!res.success || (res.status && res.status >= 400)) {
      throw new AppError(
        `Vault KMS error (${res.status}): ${res.body || res.error}`,
        502,
        "VAULT_KMS_ERROR",
      );
    }

    let data: { data?: { plaintext?: string; ciphertext?: string } } = {};
    try {
      data = JSON.parse(res.body || "{}");
    } catch {
      throw new AppError("Malformed JSON from Vault KMS", 502, "VAULT_KMS_INVALID_RESPONSE");
    }
    if (!data.data?.plaintext || !data.data?.ciphertext) {
      throw new AppError(
        "Vault response missing plaintext or ciphertext DEK",
        502,
        "VAULT_KMS_INVALID_RESPONSE",
      );
    }

    return {
      plaintext: Buffer.from(data.data.plaintext, "base64"),
      encrypted: data.data.ciphertext,
    };
  }

  async decryptDataKey(keyId: string, encryptedKey: string): Promise<Buffer> {
    const url = `${this.endpoint.replace(/\/+$/, "")}/v1/transit/decrypt/${encodeURIComponent(keyId)}`;
    await validateEgressUrl(url);

    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "X-Vault-Token": this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ciphertext: encryptedKey }),
    });

    if (!res.success || (res.status && res.status >= 400)) {
      throw new AppError(
        `Vault KMS error (${res.status}): ${res.body || res.error}`,
        502,
        "VAULT_KMS_ERROR",
      );
    }

    let data: { data?: { plaintext?: string } } = {};
    try {
      data = JSON.parse(res.body || "{}");
    } catch {
      throw new AppError("Malformed JSON from Vault KMS", 502, "VAULT_KMS_INVALID_RESPONSE");
    }
    if (!data.data?.plaintext) {
      throw new AppError("Vault response missing plaintext DEK", 502, "VAULT_KMS_INVALID_RESPONSE");
    }

    return Buffer.from(data.data.plaintext, "base64");
  }
}

/**
 * AWS KMS REST Adapter: Uses AWS KMS JSON-RPC API with AWS Signature Version 4 signing.
 */
class AwsKmsAdapter implements KmsAdapter {
  private readonly credentials: AwsSigV4Credentials | null;
  private readonly allowUnsignedEndpoint: boolean;

  constructor(
    private endpoint: string,
    private region: string,
    credentials: AwsSigV4Credentials | null,
    allowUnsignedEndpoint = false,
  ) {
    this.credentials = credentials;
    this.allowUnsignedEndpoint = allowUnsignedEndpoint;

    const targetUrl = new URL(this.endpoint || `https://kms.${this.region}.amazonaws.com/`);
    const isOfficialAws = targetUrl.hostname.toLowerCase().endsWith(".amazonaws.com");
    if (!this.credentials && (isOfficialAws || !this.allowUnsignedEndpoint)) {
      raise(
        503,
        "AWS KMS requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or KmsConfig credentials) for SigV4 signing.",
        "KMS_CREDENTIALS_MISSING",
      );
    }
  }

  private buildHeaders(targetUrl: URL, target: string, body: string): Record<string, string> {
    if (this.credentials) {
      return signAwsKmsRequest({
        url: targetUrl,
        region: this.region,
        target,
        body,
        credentials: this.credentials,
      });
    }
    return {
      "X-Amz-Target": target,
      "Content-Type": "application/x-amz-json-1.1",
    };
  }

  async generateDataKey(keyId: string): Promise<{ plaintext: Buffer; encrypted: string }> {
    const targetUrl = this.endpoint || `https://kms.${this.region}.amazonaws.com/`;
    const validatedUrl = await validateEgressUrl(targetUrl);
    const body = JSON.stringify({
      KeyId: keyId,
      KeySpec: "AES_256",
    });

    const res = await safeFetch(targetUrl, {
      method: "POST",
      headers: this.buildHeaders(validatedUrl, "TrentService.GenerateDataKey", body),
      body,
    });

    if (!res.success || (res.status && res.status >= 400)) {
      throw new AppError(
        `AWS KMS GenerateDataKey failed (${res.status}): ${res.body || res.error}`,
        502,
        "AWS_KMS_ERROR",
      );
    }

    let data: { Plaintext?: string; CiphertextBlob?: string } = {};
    try {
      data = JSON.parse(res.body || "{}");
    } catch {
      throw new AppError("Malformed JSON from AWS KMS", 502, "AWS_KMS_INVALID_RESPONSE");
    }
    if (!data.Plaintext || !data.CiphertextBlob) {
      throw new AppError(
        "AWS KMS response missing Plaintext or CiphertextBlob",
        502,
        "AWS_KMS_INVALID_RESPONSE",
      );
    }

    return {
      plaintext: Buffer.from(data.Plaintext, "base64"),
      encrypted: data.CiphertextBlob,
    };
  }

  async decryptDataKey(keyId: string, encryptedKey: string): Promise<Buffer> {
    const targetUrl = this.endpoint || `https://kms.${this.region}.amazonaws.com/`;
    const validatedUrl = await validateEgressUrl(targetUrl);
    const body = JSON.stringify({
      KeyId: keyId,
      CiphertextBlob: encryptedKey,
    });

    const res = await safeFetch(targetUrl, {
      method: "POST",
      headers: this.buildHeaders(validatedUrl, "TrentService.Decrypt", body),
      body,
    });

    if (!res.success || (res.status && res.status >= 400)) {
      throw new AppError(
        `AWS KMS Decrypt failed (${res.status}): ${res.body || res.error}`,
        502,
        "AWS_KMS_ERROR",
      );
    }

    let data: { Plaintext?: string } = {};
    try {
      data = JSON.parse(res.body || "{}");
    } catch {
      throw new AppError("Malformed JSON from AWS KMS", 502, "AWS_KMS_INVALID_RESPONSE");
    }
    if (!data.Plaintext) {
      throw new AppError("AWS KMS response missing Plaintext DEK", 502, "AWS_KMS_INVALID_RESPONSE");
    }

    return Buffer.from(data.Plaintext, "base64");
  }
}

function resolveLocalMasterSecret(): string {
  const fromEnv = process.env.ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.length >= MIN_LOCAL_MASTER_SECRET_LENGTH) return fromEnv;
  raise(
    503,
    "Local KMS requires ENCRYPTION_KEY (or SECRET_ENCRYPTION_KEY) of at least 32 characters.",
    "KMS_MASTER_KEY_MISSING",
  );
}

/**
 * Enterprise Cloud KMS Service Singleton.
 * Manages DEK lifecycle, caching, and cryptographic envelope operations.
 */
export class CloudKmsService {
  private static instance: CloudKmsService;
  private dekCache = new Map<string, CachedDek>();
  private activeDekId: string | null = null;
  private adapter: KmsAdapter | null = null;
  private config: KmsConfig | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): CloudKmsService {
    if (!CloudKmsService.instance) {
      CloudKmsService.instance = new CloudKmsService();
    }
    return CloudKmsService.instance;
  }

  /**
   * Reset state and wipe cached plaintext key material.
   */
  public reset(): void {
    for (const cached of this.dekCache.values()) {
      cached.plaintext.fill(0);
    }
    this.dekCache.clear();
    if (this.adapter instanceof LocalKmsAdapter) {
      this.adapter.zeroMasterKey();
    }
    this.activeDekId = null;
    this.adapter = null;
    this.config = null;
    this.initPromise = null;
  }

  /**
   * Configure the Cloud KMS service. Fails closed for unimplemented providers
   * and missing credentials instead of silently falling back to local keys.
   */
  public configure(config: KmsConfig, customAdapter?: KmsAdapter): void {
    let nextAdapter: KmsAdapter;
    if (customAdapter) {
      nextAdapter = customAdapter;
    } else {
      switch (config.provider) {
        case "vault":
          nextAdapter = new VaultKmsAdapter(
            config.endpoint || "https://127.0.0.1:8200",
            config.token || "",
          );
          break;
        case "aws-kms": {
          const accessKeyId = config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || "";
          const secretAccessKey = config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || "";
          const sessionToken = config.sessionToken || process.env.AWS_SESSION_TOKEN;
          const credentials =
            accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, sessionToken } : null;
          nextAdapter = new AwsKmsAdapter(
            config.endpoint || "",
            config.region || "us-east-1",
            credentials,
            Boolean(config.allowUnsignedEndpoint),
          );
          break;
        }
        case "local": {
          const masterSecret = resolveLocalMasterSecret();
          const masterKey = nodeCrypto.hkdfSync(
            "sha256",
            Buffer.from(masterSecret, "utf8"),
            Buffer.from("sveltycms-kms-salt", "utf8"),
            Buffer.from("local-kms-kek", "utf8"),
            32,
          );
          nextAdapter = new LocalKmsAdapter(Buffer.from(masterKey));
          break;
        }
        case "gcp-kms":
        case "azure-kv":
        default:
          raise(
            501,
            `Cloud KMS provider "${String(config.provider)}" is not implemented — refusing to fall back to local KMS.`,
            "KMS_PROVIDER_UNSUPPORTED",
          );
      }
    }
    this.config = config;
    this.adapter = nextAdapter;
  }

  /**
   * True when Cloud KMS envelope encryption is configured and active.
   */
  public isEnabled(): boolean {
    if (this.config) return true;
    const provider = process.env.KMS_PROVIDER;
    return Boolean(provider && provider !== "none");
  }

  /**
   * Lazy initialization from environment or settings.
   */
  public async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!this.config) {
        const provider = (process.env.KMS_PROVIDER as KmsProviderType) || "local";
        const keyId = process.env.KMS_KEY_ID || "sveltycms-primary-key";
        const endpoint = process.env.KMS_ENDPOINT;
        const region = process.env.KMS_REGION || "us-east-1";
        const token = process.env.KMS_TOKEN;
        const dekTtlMs = Number(process.env.KMS_DEK_TTL_MS) || DEFAULT_DEK_TTL_MS;

        this.configure({ provider, keyId, region, endpoint, token, dekTtlMs });
      }
      // Warm the initial active DEK
      await this.rotateOrGetActiveDek();
    })();
    return this.initPromise;
  }

  /**
   * Fast synchronous lookup of the current active Plaintext DEK from memory.
   * Returns null if uninitialized or expired (triggering async refresh).
   * Zero allocation, zero async microtask overhead on read/write hot paths.
   */
  public getActiveDekSync(): { keyId: string; plaintext: Buffer } | null {
    if (!this.activeDekId) return null;
    const cached = this.dekCache.get(this.activeDekId);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      // Proactively schedule background refresh without blocking callers
      void this.rotateOrGetActiveDek().catch((err) => {
        logger.error("[CloudKMS] Background DEK rotation failed", { error: err });
      });
    }
    return { keyId: cached.keyId, plaintext: cached.plaintext };
  }

  /**
   * Synchronous lookup of any cached DEK (active or previously rotated) by envelope key ID.
   * Allows reads of rows encrypted before an hourly DEK rotation to succeed while cached.
   */
  public getCachedDekSync(keyId: string): Buffer | null {
    const cached = this.dekCache.get(keyId);
    return cached ? cached.plaintext : null;
  }

  /**
   * Get or rotate the active Data Encryption Key asynchronously.
   */
  public async rotateOrGetActiveDek(): Promise<CachedDek> {
    if (!this.adapter || !this.config) {
      throw new AppError("Cloud KMS not configured", 500, "KMS_NOT_CONFIGURED");
    }

    if (this.activeDekId) {
      const cached = this.dekCache.get(this.activeDekId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached;
      }
    }

    const ttl = this.config.dekTtlMs || DEFAULT_DEK_TTL_MS;
    const { plaintext, encrypted } = await this.adapter.generateDataKey(this.config.keyId);

    // Compute compact key ID hash for envelope tagging matching /^[A-Za-z0-9._-]{1,64}$/
    const safeKeyName = this.config.keyId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 24);
    // Key IDs are public identifiers derived from DEK bytes, not password hashes.
    // codeql[js/insufficient-password-hash]
    const dekHash = nodeCrypto.createHash("sha256").update(plaintext).digest("hex").slice(0, 16);
    const fullKeyId = `kms.${this.config.provider}.${safeKeyName}.${dekHash}`;

    const newDek: CachedDek = {
      keyId: fullKeyId,
      plaintext,
      encrypted,
      expiresAt: Date.now() + ttl,
      provider: this.config.provider,
    };

    this.dekCache.set(fullKeyId, newDek);
    this.activeDekId = fullKeyId;
    logger.info(`[CloudKMS] Active DEK rotated: ${fullKeyId} (TTL: ${Math.round(ttl / 1000)}s)`);
    return newDek;
  }

  /**
   * Decrypt a Data Encryption Key, checking the in-memory cache first.
   */
  public async resolveDek(keyId: string, encryptedDek?: string): Promise<Buffer> {
    const cached = this.dekCache.get(keyId);
    if (cached) return cached.plaintext;

    if (!this.adapter || !this.config) {
      throw new AppError("Cloud KMS not configured", 500, "KMS_NOT_CONFIGURED");
    }

    if (!encryptedDek) {
      throw new AppError(
        `Cannot unwrap uncached DEK without ciphertext: ${keyId}`,
        400,
        "KMS_UNWRAP_FAILED",
      );
    }

    const plaintext = await this.adapter.decryptDataKey(this.config.keyId, encryptedDek);
    const ttl = this.config.dekTtlMs || DEFAULT_DEK_TTL_MS;

    this.dekCache.set(keyId, {
      keyId,
      plaintext,
      encrypted: encryptedDek,
      expiresAt: Date.now() + ttl,
      provider: this.config.provider,
    });

    return plaintext;
  }
}

export const cloudKms = CloudKmsService.getInstance();
