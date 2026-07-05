/**
 * @file src/utils/media/storage-adapters.ts
 * @description Formal StorageAdapter implementations for Local, S3/R2, and Cloudinary storage.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
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
  /^::ffff:/, // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  /^2002:/, // 6to4 encapsulation
  /^2001:/, // Teredo tunneling
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
    if (e.status === 500) throw e;
    hostname = endpoint.toLowerCase();
  }

  if (BLOCKED_ENDPOINT_HOSTS.has(hostname)) {
    throw error(500, `S3 endpoint blocked (internal host): ${hostname}`);
  }

  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    if (BLOCKED_ENDPOINT_IPS.some((r) => r.test(hostname))) {
      throw error(500, `S3 endpoint blocked (private IP): ${hostname}`);
    }
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ip = hostname.slice(1, -1);
    if (BLOCKED_ENDPOINT_IPS.some((r) => r.test(ip))) {
      throw error(500, `S3 endpoint blocked (private IPv6): ${ip}`);
    }
  }
}

export interface StorageMetadata {
  etag?: string;
  size?: number;
  lastModified?: Date;
}

export interface StorageAdapter {
  upload(data: Buffer | ReadableStream | Readable, relativePath: string): Promise<string>;
  download(relativePath: string): Promise<Buffer>;
  remove(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  getMetadata(relativePath: string): Promise<StorageMetadata | null>;
  getUrl(relativePath: string, prefix?: string): string;
}

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

function resolveMediaRoot(): string {
  return getPublicSettingSync("MEDIA_FOLDER") ?? "mediaFolder";
}

function getPath(config: CloudStorageConfig, relativePath: string, prefix?: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  const p = prefix ? `${prefix}/${clean}` : clean;
  return config.mediaFolder ? `${config.mediaFolder}/${p}` : p;
}

/**
 * Local File System Storage Adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  async upload(data: Buffer | ReadableStream | Readable, relativePath: string): Promise<string> {
    const mediaRoot = resolveMediaRoot();
    const MEDIA_ROOT_FULL = path.resolve(process.cwd(), mediaRoot) + path.sep;
    const fullRelPath = path.resolve(process.cwd(), mediaRoot, relativePath);

    if (!fullRelPath.startsWith(MEDIA_ROOT_FULL)) {
      throw new Error("Invalid path: Potential traversal attack");
    }

    await fs.mkdir(path.dirname(fullRelPath), { recursive: true });

    if (data instanceof Buffer) {
      await fs.writeFile(fullRelPath, data);
    } else {
      const writeStream = createWriteStream(fullRelPath);
      const nodeStream =
        data instanceof ReadableStream ? Readable.fromWeb(data as any) : (data as Readable);

      await new Promise((resolve, reject) => {
        nodeStream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        nodeStream.on("error", reject);
      });
    }

    return this.getUrl(relativePath);
  }

  async download(relativePath: string): Promise<Buffer> {
    const mediaRoot = resolveMediaRoot();
    const MEDIA_ROOT_FULL = path.resolve(process.cwd(), mediaRoot) + path.sep;
    const fullPath = path.resolve(process.cwd(), mediaRoot, relativePath);

    if (!fullPath.startsWith(MEDIA_ROOT_FULL)) {
      throw new Error("Invalid path: Potential traversal attack");
    }

    return await fs.readFile(fullPath);
  }

  async remove(relativePath: string): Promise<void> {
    const rel = relativePath.replace(/^\/+/, "");
    const mediaRoot = resolveMediaRoot();
    const MEDIA_ROOT_FULL = path.resolve(process.cwd(), mediaRoot) + path.sep;
    const fullPath = path.resolve(process.cwd(), mediaRoot, rel);

    if (!fullPath.startsWith(MEDIA_ROOT_FULL)) {
      logger.error("Attempted path traversal delete blocked", {
        path: relativePath,
        resolved: fullPath,
      });
      return;
    }

    await fs.unlink(fullPath).catch(() => {
      logger.debug("Best-effort file deletion failed silently");
    });
  }

  async exists(relativePath: string): Promise<boolean> {
    if (relativePath.includes("..")) return false;
    const full = path.join(process.cwd(), resolveMediaRoot(), relativePath);
    try {
      await fs.access(full);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(relativePath: string): Promise<StorageMetadata | null> {
    const mediaRoot = resolveMediaRoot();
    const fullPath = path.resolve(process.cwd(), mediaRoot, relativePath);
    try {
      const stats = await fs.stat(fullPath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  getUrl(relativePath: string, prefix?: string): string {
    const base = prefix ? `/files/${prefix}/` : "/files/";
    return (base + relativePath.replace(/^\/+/, "")).replace(/\/+/g, "/");
  }
}

/**
 * S3 / R2 Cloud Storage Adapter
 */
export class S3StorageAdapter implements StorageAdapter {
  private config: CloudStorageConfig;
  private s3Client: any = null;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  private async getS3Client() {
    if (this.s3Client) return this.s3Client;

    const { S3Client } = await import("@aws-sdk/client-s3");
    const { NodeHttpHandler } = await import("@smithy/node-http-handler");
    const { Agent: HTTPS_AGENT } = await import("node:https");
    const { Agent: HTTP_AGENT } = await import("node:http");

    if (!(this.config.accessKeyId && this.config.secretAccessKey)) {
      throw error(500, "S3/R2 credentials missing");
    }

    validateS3Endpoint(this.config.endpoint);

    this.s3Client = new S3Client({
      region: this.config.region || "auto",
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 10_000,
        requestTimeout: 120_000,
        socketAcquisitionWarningTimeout: 15_000,
        httpsAgent: new HTTPS_AGENT({
          keepAlive: true,
          keepAliveMsecs: 30_000,
          timeout: 60_000,
          maxSockets: 50,
          maxFreeSockets: 10,
        }),
        httpAgent: new HTTP_AGENT({
          keepAlive: true,
          keepAliveMsecs: 30_000,
          timeout: 60_000,
          maxSockets: 50,
          maxFreeSockets: 10,
        }),
      }),
    });

    return this.s3Client;
  }

  async upload(data: Buffer | ReadableStream | Readable, relativePath: string): Promise<string> {
    const client = await this.getS3Client();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getMimeType } = await import("./media-utils");
    const mime = getMimeType(relativePath) || "application/octet-stream";
    const fullPath = getPath(this.config, relativePath);

    logger.debug("S3 upload start", { path: fullPath });

    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: fullPath,
        Body: data as any,
        ContentType: mime,
      }),
    );
    return this.getUrl(relativePath);
  }

  async download(relativePath: string): Promise<Buffer> {
    const client = await this.getS3Client();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const fullPath = getPath(this.config, relativePath);

    logger.debug("S3 download start", { path: fullPath });

    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: this.config.bucketName, Key: fullPath }),
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

  async remove(relativePath: string): Promise<void> {
    const client = await this.getS3Client();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const fullPath = getPath(this.config, relativePath);
    try {
      await client.send(new DeleteObjectCommand({ Bucket: this.config.bucketName, Key: fullPath }));
    } catch (e) {
      logger.warn("S3 delete failed", { error: e });
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const client = await this.getS3Client();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const fullPath = getPath(this.config, relativePath);
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.config.bucketName, Key: fullPath }));
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(relativePath: string): Promise<StorageMetadata | null> {
    const client = await this.getS3Client();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const fullPath = getPath(this.config, relativePath);
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: this.config.bucketName, Key: fullPath }),
      );
      return {
        etag: res.ETag,
        size: res.ContentLength,
        lastModified: res.LastModified,
      };
    } catch {
      return null;
    }
  }

  getUrl(relativePath: string, prefix?: string): string {
    if (!this.config.publicUrl) {
      throw error(500, "Cloud public URL not configured");
    }
    const fullPath = getPath(this.config, relativePath, prefix);
    return `${this.config.publicUrl.replace(/\/+$/, "")}/${fullPath}`;
  }
}

/**
 * Cloudinary Storage Adapter
 */
export class CloudinaryStorageAdapter implements StorageAdapter {
  private config: CloudStorageConfig;
  private cloudinary: any = null;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  private async getCloudinary() {
    if (this.cloudinary) return this.cloudinary;

    const lib = await import("cloudinary");
    this.cloudinary = lib.v2;

    this.cloudinary.config({
      cloud_name: this.config.cloudinaryCloudName,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    return this.cloudinary;
  }

  async upload(data: Buffer | ReadableStream | Readable, relativePath: string): Promise<string> {
    const cld = await this.getCloudinary();
    const publicId = relativePath.replace(/\.[^.]+$/, "");

    logger.debug("Cloudinary upload start", { path: relativePath });

    return new Promise((resolve, reject) => {
      const stream = cld.uploader.upload_stream(
        {
          public_id: publicId,
          folder: this.config.mediaFolder,
          resource_type: "auto",
          overwrite: true,
        },
        (err: any, res: any) => {
          if (err) return reject(err);
          resolve(res.secure_url);
        },
      );

      if (data instanceof Buffer) {
        stream.end(data);
      } else if (data instanceof ReadableStream) {
        Readable.fromWeb(data as any).pipe(stream);
      } else {
        data.pipe(stream);
      }
    });
  }

  async download(relativePath: string): Promise<Buffer> {
    try {
      const url = this.getUrl(relativePath);
      if (!url) throw error(500, "Cannot determine URL for Cloudinary download");
      const res = await fetch(url);
      if (!res.ok) throw error(res.status, `Failed to fetch from Cloudinary: ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e: any) {
      logger.error("Cloudinary download failed", { error: e });
      throw error(500, `Failed to download from Cloudinary: ${e.message}`);
    }
  }

  async remove(relativePath: string): Promise<void> {
    const cld = await this.getCloudinary();
    const publicId = `${this.config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
    await cld.uploader.destroy(publicId);
  }

  async exists(relativePath: string): Promise<boolean> {
    const cld = await this.getCloudinary();
    const publicId = `${this.config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
    try {
      await cld.api.resource(publicId);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(relativePath: string): Promise<StorageMetadata | null> {
    const cld = await this.getCloudinary();
    const publicId = `${this.config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, "")}`;
    try {
      const res = await cld.api.resource(publicId);
      return {
        etag: res.etag,
        size: res.bytes,
        lastModified: new Date(res.created_at),
      };
    } catch {
      return null;
    }
  }

  getUrl(relativePath: string, _prefix?: string): string {
    // Cloudinary returns full URL on upload; relative fallback URL uses configured publicUrl
    if (this.config.publicUrl) {
      const fullPath = getPath(this.config, relativePath);
      return `${this.config.publicUrl.replace(/\/+$/, "")}/${fullPath}`;
    }
    return "";
  }
}

// Singletons / Factory
let currentAdapter: StorageAdapter | null = null;
let currentAdapterType: StorageType | null = null;

export function getStorageAdapter(): StorageAdapter {
  const config = getConfig();

  // Return cached singleton if type hasn't changed
  if (currentAdapter && currentAdapterType === config.storageType) {
    return currentAdapter;
  }

  logger.info(`[Storage] Initializing storage adapter: ${config.storageType}`);
  currentAdapterType = config.storageType;

  if (config.storageType === "s3" || config.storageType === "r2") {
    currentAdapter = new S3StorageAdapter(config);
  } else if (config.storageType === "cloudinary") {
    currentAdapter = new CloudinaryStorageAdapter(config);
  } else {
    currentAdapter = new LocalStorageAdapter();
  }

  return currentAdapter;
}
