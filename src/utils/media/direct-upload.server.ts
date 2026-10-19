/**
 * @file src/utils/media/direct-upload.server.ts
 * @description Presigned direct-to-storage upload instructions (S3 / R2) and
 * the staging-key contract used by the completion endpoint.
 *
 * ### Design
 * - **Zero client-chosen paths.** The server derives a CSPRNG `uploadId`, a
 *   tenant-scoped staging key, and an HMAC token binding `(uploadId, tenantId,
 *   userId, key, size)`. A client can only write the single object it was
 *   issued, and only the same principal can finalize it.
 * - **Staging never serves.** Keys live under `{tenant}/staging/{uploadId}/…`,
 *   which is outside the canonical `{tenant}/{hash}/original/…` namespace, so
 *   `/files` will not stream an unfinished object.
 * - **Finalize re-validates.** The completion endpoint downloads the staged
 *   bytes, enforces the declared length, resolves the MIME from magic bytes
 *   (polyglot rejection), then runs the normal `MediaService.saveMedia` path —
 *   dedupe, derivatives, tenant scoping and audit all still happen.
 * - **No extra SDK dependency.** SigV4 query presigning is implemented with
 *   `node:crypto`; it is small, auditable, and avoids pulling a second AWS
 *   package into the server graph.
 *
 * Features:
 * - `createUploadInstruction()` — presigned PUT for S3/R2, TUS for local
 * - `buildStagingKey()` / `verifyDirectUploadToken()`
 * - `presignS3Put()` — exported for deterministic unit tests
 */

import crypto from "node:crypto";
import path from "node:path";
import { API_MAX_BODY_SIZE_BYTES } from "@utils/api-body-limits";
import { raise } from "@utils/error-handling";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { signHmacToken, verifyHmacToken } from "@utils/server/hmac-token.server";
import { isAllowedUploadMime } from "@utils/media/media-utils";
import { getConfig, type CloudStorageConfig } from "@utils/media/storage-adapters";
import { dateToISODateString } from "@utils/date";

export const DIRECT_UPLOAD_STAGING_PREFIX = "staging";
const DIRECT_UPLOAD_TTL_MS = 60 * 60 * 1000;
const DIRECT_UPLOAD_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const S3_DEFAULT_REGION = "us-east-1";

export interface DirectUploadInput {
  tenantId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  folder?: string;
  access?: "public" | "private";
}

export interface UploadInstruction {
  strategy: "s3-presigned" | "tus";
  uploadId: string;
  key: string;
  method: "PUT";
  /** Absolute presigned URL for `s3-presigned`; relative TUS creation URL otherwise. */
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  token: string;
  completeUrl: string;
  tus: {
    creationUrl: string;
    version: string;
    maxBytes: number;
    extensions: string[];
  };
}

function safeTenantSegment(tenantId: string): string {
  if (!tenantId || tenantId.includes("/") || tenantId.includes("\\") || tenantId.includes("..")) {
    raise(400, "Invalid tenant id", "DIRECT_UPLOAD_INVALID_TENANT");
  }
  return tenantId;
}

function safeFilename(raw: string): string {
  const base = (raw || "upload")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    // eslint-disable-next-line no-control-regex -- strip control characters from user filenames
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  return (base && base !== "." && base !== ".." ? base : "upload").slice(0, 200);
}

/** Deterministic tenant-scoped staging key (never a canonical media path). */
export function buildStagingKey(tenantId: string, uploadId: string, filename: string): string {
  const tenant = safeTenantSegment(tenantId);
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
    raise(400, "Invalid upload id", "DIRECT_UPLOAD_INVALID_ID");
  }
  return `${tenant}/${DIRECT_UPLOAD_STAGING_PREFIX}/${uploadId}/${safeFilename(filename)}`;
}

function tokenSecret(): string {
  const secret = getPrivateSettingSync("JWT_SECRET_KEY") || process.env.JWT_SECRET_KEY;
  if (!secret) {
    raise(
      503,
      "Direct uploads are unavailable: signing secret missing",
      "DIRECT_UPLOAD_SECRET_MISSING",
    );
  }
  return String(secret);
}

function tokenParts(
  uploadId: string,
  tenantId: string,
  userId: string,
  key: string,
  size: number,
): string[] {
  return [uploadId, tenantId, userId, key, String(size)];
}

export function signDirectUploadToken(
  uploadId: string,
  tenantId: string,
  userId: string,
  key: string,
  size: number,
): string {
  return signHmacToken(
    "direct-upload",
    tokenParts(uploadId, tenantId, userId, key, size),
    Date.now() + DIRECT_UPLOAD_TOKEN_TTL_MS,
    tokenSecret(),
  );
}

export function verifyDirectUploadToken(params: {
  uploadId: string;
  tenantId: string;
  userId: string;
  key: string;
  size: number;
  token: string | null;
}): boolean {
  return verifyHmacToken(
    params.token,
    "direct-upload",
    tokenParts(params.uploadId, params.tenantId, params.userId, params.key, params.size),
    DIRECT_UPLOAD_TOKEN_TTL_MS,
    tokenSecret(),
  );
}

// ─── SigV4 query presigning ───────────────────────────────────────────────

/** RFC 3986 encoding used by every SigV4 canonical component. */
function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => awsEncode(segment))
    .join("/");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export interface PresignS3Options {
  accessKeyId: string;
  bucket: string;
  key: string;
  region?: string;
  secretAccessKey: string;
  /** Custom endpoint (R2, MinIO). Presence forces path-style addressing. */
  endpoint?: string;
  expiresInSeconds?: number;
  now?: Date;
}

/**
 * Produce a presigned `PUT` URL with `UNSIGNED-PAYLOAD`. The client may send a
 * `Content-Type` header (not part of the signature); the finalize step re-sniffs
 * the stored bytes, so an unsigned content type cannot weaken validation.
 */
export function presignS3Put(options: PresignS3Options): { url: string; expiresAt: string } {
  const region = options.region || S3_DEFAULT_REGION;
  const expires = Math.min(Math.max(1, options.expiresInSeconds ?? 900), 604800);
  const now = options.now ?? new Date();
  const { amzDate, dateStamp } = amzDates(now);

  let protocol = "https:";
  let host: string;
  let basePath = "";
  let canonicalUri: string;

  if (options.endpoint) {
    const endpoint = new URL(
      options.endpoint.startsWith("http") ? options.endpoint : `https://${options.endpoint}`,
    );
    protocol = endpoint.protocol;
    host = endpoint.host;
    basePath = endpoint.pathname.replace(/\/+$/, "");
    // Path-style is required by R2 and MinIO.
    canonicalUri = `${basePath}/${awsEncode(options.bucket)}/${encodeKeyPath(options.key)}`;
  } else {
    host = `${options.bucket}.s3.${region}.amazonaws.com`;
    canonicalUri = `/${encodeKeyPath(options.key)}`;
  }

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${options.accessKeyId}/${credentialScope}`;
  const signedHeaders = "host";

  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  query.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = query
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), region), "s3"),
    "aws4_request",
  );
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    url: `${protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    expiresAt: dateToISODateString(new Date(now.getTime() + expires * 1000)),
  };
}

// ─── Instruction builder ──────────────────────────────────────────────────

function canPresign(config: CloudStorageConfig): boolean {
  return (
    (config.storageType === "s3" || config.storageType === "r2") &&
    !!config.bucketName &&
    !!config.accessKeyId &&
    !!config.secretAccessKey
  );
}

/**
 * Build an upload instruction. S3/R2 get a presigned PUT; every other backend
 * (local, Cloudinary) gets the TUS creation URL, which uses the same ingestion
 * path and is resumable without exposing a privileged storage endpoint.
 */
export function createUploadInstruction(input: DirectUploadInput): UploadInstruction {
  const size = Number(input.size);
  if (!Number.isInteger(size) || size <= 0) {
    raise(400, "File size must be a positive integer", "DIRECT_UPLOAD_INVALID_SIZE");
  }
  if (size > API_MAX_BODY_SIZE_BYTES) {
    raise(413, `File exceeds the ${API_MAX_BODY_SIZE_BYTES} byte limit`, "DIRECT_UPLOAD_TOO_LARGE");
  }
  const mimeType = (input.mimeType || "application/octet-stream").split(";")[0]!.trim();
  if (mimeType !== "application/octet-stream" && !isAllowedUploadMime(mimeType)) {
    raise(415, `MIME not allowed: ${mimeType}`, "DIRECT_UPLOAD_MIME_NOT_ALLOWED");
  }

  const uploadId = crypto.randomUUID();
  const key = buildStagingKey(input.tenantId, uploadId, input.filename);
  const token = signDirectUploadToken(uploadId, input.tenantId, input.userId, key, size);
  const config = getConfig();

  const base: UploadInstruction = {
    strategy: "tus",
    uploadId,
    key,
    method: "PUT",
    url: "/api/media/tus",
    headers: {},
    expiresAt: dateToISODateString(new Date(Date.now() + DIRECT_UPLOAD_TTL_MS)),
    maxBytes: API_MAX_BODY_SIZE_BYTES,
    token,
    completeUrl: "/api/media/direct-upload/complete",
    tus: {
      creationUrl: "/api/media/tus",
      version: "1.0.0",
      maxBytes: API_MAX_BODY_SIZE_BYTES,
      extensions: ["creation", "termination"],
    },
  };

  if (!canPresign(config)) return base;

  const presigned = presignS3Put({
    accessKeyId: config.accessKeyId!,
    secretAccessKey: config.secretAccessKey!,
    bucket: config.bucketName!,
    region: config.region,
    endpoint: config.endpoint,
    key,
    expiresInSeconds: 900,
    now: new Date(),
  });

  return {
    ...base,
    strategy: "s3-presigned",
    url: presigned.url,
    headers: { "Content-Type": mimeType },
    expiresAt: presigned.expiresAt,
  };
}

/** Filename derived from a staging key (the last path segment). */
export function filenameFromStagingKey(key: string): string {
  return path.posix.basename(key.replace(/\\/g, "/"));
}
