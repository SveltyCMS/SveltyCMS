/**
 * @file src/utils/security/url-validator.ts
 * @description
 * Secure URL validation utility to prevent SSRF (Server-Side Request Forgery).
 * Blocks internal IP ranges, loopback addresses, and enforces HTTPS.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@utils/error-handling";

/**
 * Validates a remote URL to ensure it doesn't point to internal resources.
 *
 * @param url - The URL to validate
 * @throws {AppError} if the URL is invalid or points to a private/internal resource
 */
export async function validateRemoteUrl(url: string): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new AppError("Invalid URL format", 400, "INVALID_URL");
  }

  // 1. Enforce HTTPS for remote fetches
  if (parsedUrl.protocol !== "https:") {
    throw new AppError(
      "Only HTTPS URLs are allowed for remote security",
      400,
      "INVALID_URL_PROTOCOL",
    );
  }

  // 2. Resolve DNS to get actual IP (prevents DNS rebinding and bypasses)
  let address: string;
  try {
    const result = await lookup(parsedUrl.hostname);
    address = result.address;
  } catch {
    throw new AppError(
      `Failed to resolve hostname: ${parsedUrl.hostname}`,
      400,
      "DNS_RESOLUTION_FAILED",
    );
  }

  // 3. Check if the IP is private/internal
  console.log(`--- SSRF Check: ${parsedUrl.hostname} resolved to ${address}`);
  if (isPrivateIP(address)) {
    throw new AppError(
      "Access to internal/private network is forbidden for remote media",
      403,
      "SSRF_ATTEMPT",
    );
  }
}

/**
 * Checks if an IP address belongs to a private/internal range.
 * Supports both IPv4 and IPv6.
 */
export function isPrivateIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return true; // Invalid IP is treated as unsafe

  // Loopback
  if (ip === "127.0.0.1" || ip === "::1") return true;

  if (version === 4) {
    const parts = ip.split(".").map(Number);

    // RFC 1918
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16

    // RFC 6598 (Shared Address Space)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10

    // Carrier-grade NAT / Link-local
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16
  } else if (version === 6) {
    const lowerIp = ip.toLowerCase();
    // Link-local
    if (lowerIp.startsWith("fe80:")) return true;
    // Unique Local Address (ULA)
    if (lowerIp.startsWith("fc00:") || lowerIp.startsWith("fd00:")) return true;
  }

  return false;
}
