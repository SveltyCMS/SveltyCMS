/**
 * @file src/databases/auth/credential-auth-cache.ts
 * @description Bearer credential auth cache helpers aligned with the dual-layer cache system.
 *
 * Website tokens and API keys are cached by cryptographic hash (never plaintext), tagged for
 * O(1) invalidation, and use CacheCategory.SESSION per cache-system.mdx.
 *
 * ### Features:
 * - hash-keyed L1/L2 positive cache (SESSION category)
 * - Bloom negative cache via cacheService.recordMiss / isNegativeHit
 * - tag-based invalidation on token delete (`website-token:{id}`)
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import type { DatabaseId } from "@src/databases/db-interface";

/** Short TTL — balances cache-system SESSION category with fast revocation. */
export const CREDENTIAL_AUTH_CACHE_TTL_S = 60;

export interface CredentialAuthCacheEntry {
  user: Record<string, unknown>;
  tenantId: string;
}

export function websiteTokenCacheKey(tokenHash: string): string {
  return `apitoken:${tokenHash}`;
}

export function apiKeyCacheKey(keyHash: string): string {
  return `apikey:${keyHash}`;
}

export function websiteTokenAuthTags(tokenId: string): string[] {
  return ["auth", "auth:credential", "website-token", `website-token:${tokenId}`];
}

export function apiKeyAuthTags(apiKeyId: string): string[] {
  return ["auth", "auth:credential", "api-key", `api-key:${apiKeyId}`];
}

export function getWebsiteTokenAuthCacheSync(
  tokenHash: string,
  tenantId?: DatabaseId | string | null,
): CredentialAuthCacheEntry | null {
  return cacheService.getSync<CredentialAuthCacheEntry>(
    websiteTokenCacheKey(tokenHash),
    tenantId as DatabaseId,
  );
}

export function getApiKeyAuthCacheSync(
  keyHash: string,
  tenantId?: DatabaseId | string | null,
): CredentialAuthCacheEntry | null {
  return cacheService.getSync<CredentialAuthCacheEntry>(
    apiKeyCacheKey(keyHash),
    tenantId as DatabaseId,
  );
}

export function isWebsiteTokenAuthNegativeHit(
  tokenHash: string,
  tenantId?: DatabaseId | string | null,
): boolean {
  return cacheService.isNegativeHit(websiteTokenCacheKey(tokenHash), tenantId as DatabaseId);
}

export function isApiKeyAuthNegativeHit(
  keyHash: string,
  tenantId?: DatabaseId | string | null,
): boolean {
  return cacheService.isNegativeHit(apiKeyCacheKey(keyHash), tenantId as DatabaseId);
}

export async function setWebsiteTokenAuthCache(
  tokenHash: string,
  entry: CredentialAuthCacheEntry,
  tokenId: string,
  tenantId?: DatabaseId | string | null,
): Promise<void> {
  await cacheService.setWithCategory(
    websiteTokenCacheKey(tokenHash),
    entry,
    CacheCategory.SESSION,
    tenantId as DatabaseId,
    CREDENTIAL_AUTH_CACHE_TTL_S,
    websiteTokenAuthTags(tokenId),
  );
}

export async function setApiKeyAuthCache(
  keyHash: string,
  entry: CredentialAuthCacheEntry,
  apiKeyId: string,
  tenantId?: DatabaseId | string | null,
): Promise<void> {
  await cacheService.setWithCategory(
    apiKeyCacheKey(keyHash),
    entry,
    CacheCategory.SESSION,
    tenantId as DatabaseId,
    CREDENTIAL_AUTH_CACHE_TTL_S,
    apiKeyAuthTags(apiKeyId),
  );
}

export function recordWebsiteTokenAuthMiss(
  tokenHash: string,
  tenantId?: DatabaseId | string | null,
): void {
  cacheService.recordMiss(websiteTokenCacheKey(tokenHash), tenantId as DatabaseId);
}

export function recordApiKeyAuthMiss(keyHash: string, tenantId?: DatabaseId | string | null): void {
  cacheService.recordMiss(apiKeyCacheKey(keyHash), tenantId as DatabaseId);
}

/**
 * Clears positive auth cache for a website token (tag bucket + hash key).
 * Call before or after DB delete; pass storedTokenHash when available.
 */
export async function invalidateWebsiteTokenAuth(
  tokenId: string,
  tenantId?: DatabaseId | string | null,
  storedTokenHash?: string | null,
): Promise<void> {
  const tid = tenantId ?? "*";
  await cacheService.clearByTags([`website-token:${tokenId}`], tid);
  if (storedTokenHash) {
    await cacheService.delete(websiteTokenCacheKey(storedTokenHash), tenantId);
  }
}

/** Clears positive auth cache for an API key by id tag and optional hash key. */
export async function invalidateApiKeyAuth(
  apiKeyId: string,
  tenantId?: DatabaseId | string | null,
  storedKeyHash?: string | null,
): Promise<void> {
  const tid = tenantId ?? "*";
  await cacheService.clearByTags([`api-key:${apiKeyId}`], tid);
  if (storedKeyHash) {
    await cacheService.delete(apiKeyCacheKey(storedKeyHash), tenantId);
  }
}
