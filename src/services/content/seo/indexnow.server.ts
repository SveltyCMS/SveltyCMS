/**
 * @file src/services/content/seo/indexnow.server.ts
 * @description IndexNow publish pings (https://www.indexnow.org/) — instant URL
 * submission to the Bing/Yandex/Seznam/Naver ecosystem when an entry is
 * published. Google does not participate in IndexNow (its sitemap ping
 * endpoint was deprecated in June 2023), so no Google call is made.
 *
 * ### Tiering
 * - Premium (SEO license): the ping fires only when the SEO widget license is
 *   active (same tier as the dynamic sitemap). Without a license the publish
 *   path performs zero extra work beyond the document shape check.
 * - Fire-and-forget: scheduled after a successful persist, never on the write
 *   hot path's blocking tail, and never throws into the caller.
 *
 * ### Security
 * - The IndexNow key is generated with the WebCrypto CSPRNG, persisted as a
 *   public setting, and served as `/{key}.txt` for host verification.
 * - The submission POST goes to the fixed `api.indexnow.org` endpoint via
 *   `safeFetch` (egress guard: redirect/timeout/size limits).
 */

import { checkExtensionLicense } from "@utils/license-manager";
import { getPublicSettingSync, setPublicSetting } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { publicEntryUrl } from "./sitemap-builder";
import { isPublishedStatus } from "@utils/security/publication-policy";
import { safeFetch } from "@utils/egress-guard";
import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** CSPRNG key (32 hex chars, per the indexnow.org key format). */
export function generateIndexNowKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let key = "";
  for (const byte of bytes) key += byte.toString(16).padStart(2, "0");
  return key;
}

export interface IndexNowSubmission {
  endpoint: string;
  body: Record<string, unknown>;
}

/**
 * Builds the IndexNow submission payload: host, key, the key-file location
 * used for ownership verification, and the URL list.
 */
export function buildIndexNowSubmission(
  origin: string,
  key: string,
  urls: string[],
): IndexNowSubmission {
  const host = new URL(origin).host;
  return {
    endpoint: INDEXNOW_ENDPOINT,
    body: {
      host,
      key,
      // The key file is served at a fixed path (never a root param route, so
      // no user-controlled `.txt` path can shadow another site file).
      keyLocation: `${origin.replace(/\/+$/, "")}/indexnow.txt`,
      urlList: urls,
    },
  };
}

/** Loads the IndexNow key from settings, generating + persisting it on first use. */
async function resolveIndexNowKey(): Promise<string | null> {
  const existing = getPublicSettingSync("INDEXNOW_KEY");
  if (existing) return existing;
  const generated = generateIndexNowKey();
  try {
    await setPublicSetting("INDEXNOW_KEY", generated);
    return generated;
  } catch {
    return null;
  }
}

export interface IndexNowPublishContext {
  collectionId: string;
  document: Record<string, unknown>;
  tenantId?: string;
}

/**
 * Best-effort IndexNow ping for a freshly published entry.
 *
 * No-op unless: the document status is a published status, the SEO license is
 * active (premium tier), a production origin is configured, and the entry has
 * a slug. Failures log at debug level and never propagate.
 */
export async function notifyIndexNowOnPublish(context: IndexNowPublishContext): Promise<void> {
  const { collectionId, document, tenantId } = context;
  try {
    if (!isPublishedStatus(document?.status)) return;

    const license = await checkExtensionLicense("widget", "seo");
    if (!license.active && !license.hasLicense) return;

    const origin = getPublicSettingSync("HOST_PROD");
    if (!origin || !/^https?:\/\//i.test(origin)) return;

    const slug = typeof document.slug === "string" ? document.slug.trim() : "";
    if (!slug) return;

    const url = publicEntryUrl({
      origin,
      collection: collectionId,
      slug,
      siteStarterEnabled: isSiteStarterEnabled(),
    });
    if (!url) return;

    const key = await resolveIndexNowKey();
    if (!key) return;

    const submission = buildIndexNowSubmission(origin, key, [url]);
    const response = await safeFetch(submission.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission.body),
    });
    // 200–299 = accepted (or already known); the engine replies 202 for
    // accepted submissions, 403 when the key file is missing/invalid.
    if (!response.success || (response.status ?? 0) >= 400) {
      logger.debug("[IndexNow] Submission rejected", {
        status: response.status,
        error: response.error,
        url,
        tenantId,
      });
      return;
    }
    logger.debug("[IndexNow] Published URL submitted", { url, tenantId });
  } catch (err) {
    rethrow(err);
    logger.debug("[IndexNow] Publish ping failed (non-fatal)", { error: err, tenantId });
  }
}
