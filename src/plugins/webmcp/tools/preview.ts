/**
 * @file src/plugins/webmcp/tools/preview.ts
 * @description WebMCP tool that hands an AI agent a signed live-preview URL.
 *
 * ### Why this exists
 * The editable-website bridge keeps the preview tab human-only, so an agent had
 * no way to *see* what it just wrote. `update_entry` writes drafts; this tool
 * returns the same signed draft URL the preview tab uses, so an agent loop is
 * "edit draft → open preview → verify" without a rebuild.
 *
 * ### Security
 * - The URL is minted by `POST /api/preview/authorize`, which enforces session
 *   auth, CSRF, the editable-website license and the HMAC signing secret.
 * - No token is ever issued for a collection without `livePreview` configured
 *   unless the caller passes an explicit `previewTargetUrl`.
 * - The tool never writes: mutating stays on `update_entry`, which forces draft.
 *
 * Features:
 * - Collection schema resolution from the authenticated collections API
 * - Draft entry resolution by id
 * - Actionable errors (missing config, missing entry, unlicensed, unauthenticated)
 */

import { clientJsonHeaders } from "@utils/security/client-csrf";
import { logger } from "@utils/logger";

interface ModelContextApi {
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (params: Record<string, unknown>) => Promise<unknown>;
  }): void;
}

interface PreviewToolParams {
  collectionId?: string;
  entryId?: string;
  contentLanguage?: string;
  previewTargetUrl?: string;
}

function getModelContext(): ModelContextApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window.document as unknown as { modelContext?: ModelContextApi }).modelContext;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Unwrap both `{ success, data }` envelopes and raw payloads. */
function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

/** Find a collection schema by `_id` or `name` inside a collections payload. */
export function findPreviewSchema(
  collections: unknown,
  collectionId: string,
): Record<string, unknown> | undefined {
  const list = unwrap(collections);
  if (!Array.isArray(list)) return undefined;
  return (list as Array<Record<string, unknown>>).find(
    (candidate) =>
      String(candidate._id ?? "") === collectionId || String(candidate.name ?? "") === collectionId,
  );
}

/** Whether a schema can mint a preview URL from its own configuration. */
export function hasPreviewConfig(schema: Record<string, unknown> | undefined): boolean {
  if (!schema) return false;
  return (
    schema.livePreview === true ||
    (typeof schema.livePreview === "string" && schema.livePreview.length > 0)
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Register the preview tools with the browser `document.modelContext` bridge. */
export function registerPreviewTools(): void {
  const modelContext = getModelContext();
  if (!modelContext) return;

  modelContext.registerTool({
    name: "get_live_preview_url",
    description:
      "Return a signed live-preview URL for an entry. Use after update_entry to inspect the rendered draft page without a rebuild.",
    parameters: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection id or name" },
        entryId: { type: "string", description: "Entry id" },
        contentLanguage: {
          type: "string",
          description: "Content language code (default: en)",
        },
        previewTargetUrl: {
          type: "string",
          description: "Override the collection's livePreview URL pattern",
        },
      },
      required: ["collectionId", "entryId"],
    },
    execute: async (rawParams: Record<string, unknown>) => {
      const params = rawParams as PreviewToolParams;
      const collectionId = params.collectionId?.trim();
      const entryId = params.entryId?.trim();
      const contentLanguage = params.contentLanguage?.trim() || "en";

      if (!collectionId || !entryId) {
        return errorResult("collectionId and entryId are required.");
      }

      try {
        const listRes = await fetch("/api/collections?includeFields=true", {
          credentials: "include",
        });
        if (listRes.status === 401 || listRes.status === 403) {
          return errorResult("Not authorized to read collections. Sign in to the admin first.");
        }
        if (!listRes.ok) {
          return errorResult(`Could not read collections (HTTP ${listRes.status}).`);
        }

        const collections = unwrap(await readJson(listRes));
        const schema = findPreviewSchema(collections, collectionId);

        if (!schema) {
          return errorResult(`Collection "${collectionId}" was not found.`);
        }

        if (!hasPreviewConfig(schema) && !params.previewTargetUrl) {
          return errorResult(
            `Collection "${collectionId}" has no livePreview configured. Set livePreview: true or a URL pattern in the collection builder.`,
          );
        }

        const entryRes = await fetch(
          `/api/collections/${encodeURIComponent(collectionId)}/${encodeURIComponent(entryId)}`,
          { credentials: "include" },
        );
        if (!entryRes.ok) {
          return errorResult(
            `Entry ${entryId} could not be read (HTTP ${entryRes.status}). Check the id and your permissions.`,
          );
        }
        const entry = unwrap(await readJson(entryRes));
        if (!entry || typeof entry !== "object") {
          return errorResult(`Entry ${entryId} returned no data.`);
        }

        const authorizeRes = await fetch("/api/preview/authorize", {
          method: "POST",
          headers: clientJsonHeaders(),
          credentials: "include",
          body: JSON.stringify({
            schema,
            entry,
            contentLanguage,
            ...(params.previewTargetUrl ? { previewTargetUrl: params.previewTargetUrl } : {}),
          }),
        });

        const authorizeBody = await readJson(authorizeRes);
        if (!authorizeRes.ok) {
          const message =
            (authorizeBody as { message?: string } | null)?.message ??
            `Preview authorization failed (HTTP ${authorizeRes.status}). Licenses, PREVIEW_SECRET and CSRF are the usual causes.`;
          return errorResult(message);
        }

        const previewUrl = (authorizeBody as { previewUrl?: string } | null)?.previewUrl;
        if (!previewUrl) {
          return errorResult("Preview authorization returned no URL.");
        }

        return textResult(
          JSON.stringify(
            {
              previewUrl,
              collection: String(schema.name ?? schema._id ?? collectionId),
              entryId,
              contentLanguage,
              note: "Signed draft URL, valid for 30 minutes. It renders unsaved-to-live draft content; publishing still goes through the CMS workflow.",
            },
            null,
            2,
          ),
        );
      } catch (err: unknown) {
        logger.error("[WebMCP] get_live_preview_url failed", { error: err });
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  });
}
