/**
 * @file src/plugins/commerce/downloads.server.ts
 * @description HMAC-signed, time-limited download tokens for digital goods.
 * Fail-closed without JWT_SECRET_KEY. Payload includes tenantId.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { raise } from "@utils/error-handling";

const TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (typeof s !== "string" || !s.trim()) {
    raise(503, "Download signing secret is not configured.", "DOWNLOAD_SECRET_MISSING");
  }
  return s.trim();
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signDownloadToken(input: {
  tenantId: string;
  orderId: string;
  productId: string;
  ttlMs?: number;
}): string {
  const exp = String(Date.now() + (input.ttlMs ?? TTL_MS));
  const payload = [input.tenantId, input.orderId, input.productId, exp].join("|");
  return `${b64url(payload)}.${hmac(payload)}`;
}

export function verifyDownloadToken(token: string): {
  tenantId: string;
  orderId: string;
  productId: string;
} {
  const [payloadB64, sig] = String(token || "").split(".");
  if (!payloadB64 || !sig) raise(403, "Invalid download token.", "DOWNLOAD_INVALID");
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    raise(403, "Invalid download token.", "DOWNLOAD_INVALID");
  }
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    raise(403, "Invalid download token.", "DOWNLOAD_INVALID");
  }
  const [tenantId, orderId, productId, exp] = payload.split("|");
  if (!tenantId || !orderId || !productId || !exp) {
    raise(403, "Invalid download token.", "DOWNLOAD_INVALID");
  }
  if (Number(exp) < Date.now()) raise(403, "Download link expired.", "DOWNLOAD_EXPIRED");
  return { tenantId, orderId, productId };
}

export function paidStatuses(): Set<string> {
  return new Set(["processing", "shipped", "delivered"]);
}
