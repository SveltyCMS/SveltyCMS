/**
 * @file src/utils/media/cloudStorage.ts
 * @description Cloud storage abstraction layer for S3, R2, and Cloudinary
 *
 * Performace Enhancements:
 * - Singleton S3/Cloudinary clients (reuse connections)
 * - Keep-Alive agents for HTTP/HTTPS
 * - Unified interface exports
 *
 * ### Security Features:
 * - SSRF protection: validates S3 endpoints against private/internal IPs
 * - Blocks cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 */

import { getPublicSettingSync } from "@src/services/core/settings-service";
import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import type { StorageType } from "./media-models";

// SSRF Protection: blocked IP ranges and hostnames for S3 endpoint validation
const BLOCKED_ENDPOINT_IPS = [
  /^127\./, // 127.0.0.0/8 — loopback
  /^10\./, // 10.0.0.0/8 — private
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 — private
  /^192\.168\./, // 192.168.0.0/16 — private
  /^169\.254\./, // 169.254.0.0/16 — link-local / cloud metadata
  /^0\.0\.0\.0$/, // 0.0.0.0
  /^::1$/, // IPv6 loopback
  /^fe80:/, // IPv6 link-local
  /^fc00:/, // IPv6 unique local
];

const BLOCKED_ENDPOINT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

function validateS3Endpoint(endpoint: string | undefined): void {
  if (!endpoint) return;

  let hostname: string;
  try {
    const url = new URL(endpoint);
    hostname = url.hostname.toLowerCase();

    // Block non-HTTP protocols (e.g., file://, gopher://)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw error(500, `S3 endpoint has blocked protocol: ${url.protocol}`);
    }
  } catch (e: any) {
    if (e.status === 500) throw e; // rethrow our own errors
    // If URL parsing fails, treat the raw string as a hostname
    hostname = endpoint.toLowerCase();
  }

  // Block known internal hosts
  if (BLOCKED_ENDPOINT_HOSTS.has(hostname)) {
    throw error(500, `S3 endpoint blocked (internal host): ${hostname}`);
  }

  // Check IP ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    if (BLOCKED_ENDPOINT_IPS.some((r) => r.test(hostname))) {
      throw error(500, `S3 endpoint blocked (private IP): ${hostname}`);
    }
  }

  // Check bracketed IPv6
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ip = hostname.slice(1, -1);
    if (BLOCKED_ENDPOINT_IPS.some((r) => r.test(ip))) {
      throw error(500, `S3 endpoint blocked (private IPv6): ${ip}`);
    }
  }
}

// Lazy-load clients to avoid init cost if unused
let s3Client: any = null;
let cloudinary: any = null;

// Cloud storage configuration interface
export interface CloudStorageConfig {
  accessKeyId?: string;
  bucketName?: string;
  cloudinaryCloudName?: string;
  endpoint?: string;
  mediaFolder: string;
  publicUrl?: string;
  region?: string;
  secretAccessKey?: string;
  storageType: StorageType;
}

// Get cloud storage configuration from settings
export function getConfig(): CloudStorageConfig {
  const storageType = (getPublicSettingSync("MEDIA_STORAGE_TYPE") || "local") as StorageType;
  const mediaFolder = getPublicSettingSync("MEDIA_FOLDER") || "";
  const normalizedFolder = mediaFolder.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");

  return {
    storageType,
    bucketName: getPublicSettingSync("MEDIA_BUCKET_NAME") as string | undefined,
    mediaFolder: normalizedFolder,
    region: getPublicSettingSync("MEDIA_CLOUD_REGION"),
    endpoint: getPublicSettingSync("MEDIA_CLOUD_ENDPOINT"),
    publicUrl:
      getPublicSettingSync("MEDIA_CLOUD_PUBLIC_URL") || getPublicSettingSync("MEDIASERVER_URL"),
    accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
    secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY,
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  };
}

export function isCloud(): boolean {
  const type = getPublicSettingSync("MEDIA_STORAGE_TYPE");
  return type === "s3" || type === "r2" || type === "cloudinary";
}

/** Get S3 Client Singleton with Keep-Alive */
async function getS3Client(config: CloudStorageConfig) {
  if (s3Client) {
    return s3Client;
  }

  const { S3Client } = await import("@aws-sdk/client-s3");
  const { NodeHttpHandler } = await import("@smithy/node-http-handler");
  const { Agent: HTTPS_AGENT } = await import("node:https");
  const { Agent: HTTP_AGENT } = await import("node:http");

  if (!(config.accessKeyId && config.secretAccessKey)) {
    throw error(500, "S3/R2 credentials missing");
  }

  // 🛡️ SSRF Protection: validate endpoint before creating client
  validateS3Endpoint(config.endpoint);

  s3Client = new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new HTTPS_AGENT({
        keepAlive: true,
        timeout: 60_000,
        maxSockets: 50,
      }),
      httpAgent: new HTTP_AGENT({
        keepAlive: true,
        timeout: 60_000,
        maxSockets: 50,
      }),
    }),
  });

  return s3Client;
}

/** Get Cloudinary Singleton */
async function getCloudinary(config: CloudStorageConfig) {
  if (cloudinary) {
    return cloudinary;
  }

  const lib = await import("cloudinary");
  cloudinary = lib.v2;

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
}

export function getPath(relativePath: string, prefix?: string): string {
  const config = getConfig();
  const clean = relativePath.replace(/^\/+/, "");
  const p = prefix ? `${prefix}/${clean}` : clean;
  return config.mediaFolder ? `${config.mediaFolder}/${p}` : p;
}

export function getUrl(relativePath: string, prefix?: string): string {
  const config = getConfig();
  if (config.storageType === "local") {
    const base = prefix ? `/files/${prefix}/` : "/files/";
    return (base + relativePath.replace(/^\/+/, "")).replace(/\/+/g, "/");
  }

  if (!config.publicUrl) {
    // Fallback for Cloudinary if needed, usually handles own URLs
    if (config.storageType === "cloudinary") {
      return ""; // Cloudinary returns URL on upload
    }
    throw error(500, "Cloud public URL not configured");
  }

  const fullPath = getPath(relativePath, prefix);
  return `${config.publicUrl.replace(/\/+$/, "")}/${fullPath}`;
}

/** Upload file (Buffer or Stream) */
export async function upload(
  data: Buffer | ReadableStream | import("node:stream").Readable,
  relativePath: string,
): Promise<string> {
  const config = getConfig();
  const fullPath = getPath(relativePath);

  logger.debug("Cloud upload start", {
    type: config.storageType,
    path: fullPath,
  });

  if (config.storageType === "s3" || config.storageType === "r2") {
    const client = await getS3Client(config);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const mime =
      (await import("./media-utils")).getMimeType(relativePath) || "application/octet-stream";

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: fullPath,
        Body: data as any,
        ContentType: mime,
      }),
    );
    return getUrl(relativePath);
  }

  if (config.storageType === "cloudinary") {
    const cld = await getCloudinary(config);
    const publicId = relativePath.replace(/\.[^.]+$/, ""); // Remove ext

    return new Promise((resolve, reject) => {
      const stream = cld.uploader.upload_stream(
        {
          public_id: publicId,
          folder: config.mediaFolder,
          resource_type: "auto",
          overwrite: true,
        },
        (err: any, res: any) => {
          if (err) {
            return reject(err);
          }
          resolve(res.secure_url);
        },
      );

      if (data instanceof Buffer) {
        stream.end(data);
      } else if (data instanceof ReadableStream) {
        // Convert Web Stream to Node Stream for Cloudinary lib
        import("node:stream").then(({ Readable }) => {
          Readable.fromWeb(data as any).pipe(stream);
        });
      } else {
        (data as any).pipe(stream);
      }
    });
  }

  throw error(500, "Invalid storage type for cloud upload");
}

/** Get metadata (ETag, Size, etc.) */
export async function getMetadata(
  relativePath: string,
): Promise<{ etag?: string; size?: number; lastModified?: Date } | null> {
  const config = getConfig();
  const fullPath = getPath(relativePath);

  try {
    if (config.storageType === "s3" || config.storageType === "r2") {
      const client = await getS3Client(config);
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const res = await client.send(
        new HeadObjectCommand({ Bucket: config.bucketName, Key: fullPath }),
      );
      return {
        etag: res.ETag,
        size: res.ContentLength,
        lastModified: res.LastModified,
      };
    }

    if (config.storageType === "cloudinary") {
      const cld = await getCloudinary(config);
      const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
      const res = await cld.api.resource(publicId);
      return {
        etag: res.etag,
        size: res.bytes,
        lastModified: new Date(res.created_at),
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Delete file */
export async function remove(relativePath: string): Promise<void> {
  const config = getConfig();
  const fullPath = getPath(relativePath);

  if (config.storageType === "s3" || config.storageType === "r2") {
    const client = await getS3Client(config);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
    } catch (e) {
      logger.warn("S3 delete failed", { error: e });
    }
    return;
  }

  if (config.storageType === "cloudinary") {
    const cld = await getCloudinary(config);
    const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
    await cld.uploader.destroy(publicId);
    return;
  }
}

/** Check existence */
export async function exists(relativePath: string): Promise<boolean> {
  const config = getConfig();
  const fullPath = getPath(relativePath);

  try {
    if (config.storageType === "s3" || config.storageType === "r2") {
      const client = await getS3Client(config);
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
      return true;
    }

    if (config.storageType === "cloudinary") {
      const cld = await getCloudinary(config);
      const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
      await cld.api.resource(publicId);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Download file */
export async function download(relativePath: string): Promise<Buffer> {
  const config = getConfig();
  const fullPath = getPath(relativePath);

  logger.debug("Cloud download start", {
    type: config.storageType,
    path: fullPath,
  });

  if (config.storageType === "s3" || config.storageType === "r2") {
    const client = await getS3Client(config);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucketName, Key: fullPath }),
      );

      const stream = response.Body as any;
      if (!stream) throw error(500, "No body returned from S3/R2");

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (e: any) {
      logger.error("S3 download failed", { error: e });
      throw error(500, `Failed to download from S3/R2: ${e.message}`);
    }
  }

  if (config.storageType === "cloudinary") {
    try {
      const url = getUrl(relativePath);
      if (!url) throw error(500, "Cannot determine URL for Cloudinary download");
      const res = await fetch(url);
      if (!res.ok) throw error(res.status, `Failed to fetch from Cloudinary: ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e: any) {
      logger.error("Cloudinary download failed", { error: e });
      throw error(500, `Failed to download from Cloudinary: ${e.message}`);
    }
  }

  throw error(500, "Invalid storage type for cloud download");
}
