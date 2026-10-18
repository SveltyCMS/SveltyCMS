/**
 * @file src/routes/api/[...path]/handlers/testing/testing-trash-invite-media.ts
 * @description Trash, invite-token, password-reset, and media-gallery fixtures.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getSchemaPath } from "@src/content/first-collection";
import { collectionTableName } from "@src/databases/core/collection-name";
import { generateUUID } from "@utils/native-utils";
import {
  loadDbModule,
  loadEngineServerModule,
  rawResponse,
  type TestingContext,
} from "./testing-shared";

export async function handleTestingTrashInviteMediaRoutes(
  ctx: TestingContext,
): Promise<Response | undefined> {
  const { cms, tenantId, params, initializedAdapter, action } = ctx;

  /**
   * Seed a soft-deleted collection entry for trash restore E2E.
   * Creates collection model + content node if needed, inserts row, soft-deletes.
   */
  if (action === "seed-trash") {
    const collectionId = String(params.collectionId || "e2e_trash_fixture").replace(
      /[^a-zA-Z0-9_]/g,
      "_",
    );
    if (!collectionId || collectionId.length > 64) {
      throw new AppError("Invalid collectionId", 400);
    }
    const entryId = String(params.entryId || generateUUID());
    const title = String(params.title || `E2E Trash Item ${generateUUID().slice(0, 6)}`);
    const collectionName = collectionTableName(collectionId);

    try {
      await initializedAdapter.collection.createModel({
        _id: collectionId,
        name: collectionId,
        fields: [
          {
            db_fieldName: "title",
            label: "Title",
            widget: { Name: "Input" },
            type: "string",
          },
        ],
      } as any);
    } catch {
      /* model may already exist */
    }

    if (initializedAdapter.content?.nodes?.upsertContentStructureNode) {
      await initializedAdapter.content.nodes.upsertContentStructureNode({
        _id: collectionId,
        path: getSchemaPath({ _id: collectionId, slug: collectionId }),
        name: collectionId,
        nodeType: "collection",
        collectionDef: {
          _id: collectionId,
          name: collectionId,
          fields: [{ db_fieldName: "title", widget: { Name: "Input" }, type: "string" }],
        },
        status: "publish",
        source: "api",
        tenantId,
      } as any);
    }

    const { refreshContent } = await loadEngineServerModule();
    await refreshContent(tenantId, {
      mode: "schemas",
      adapter: initializedAdapter,
    });
    if (cms.collections?.refresh) {
      await cms.collections.refresh(tenantId as any, true);
    }

    const insertRes = await initializedAdapter.crud.insert(
      collectionName,
      {
        _id: entryId as any,
        title,
        status: "publish",
        tenantId,
      } as any,
      { tenantId },
    );
    if (!insertRes.success) {
      // Idempotent: try soft-delete if already exists
      logger.warn(`[testing] seed-trash insert: ${insertRes.message || "failed"}`);
    }

    const delRes = await initializedAdapter.crud.delete(collectionName, entryId as any, {
      tenantId,
      permanent: false,
      userId: "system" as any,
    });
    if (!delRes.success) {
      throw new AppError(`seed-trash soft-delete failed: ${delRes.message || "unknown"}`, 500);
    }

    return rawResponse({
      success: true,
      collectionId,
      entryId,
      title,
      collectionName,
    });
  }

  if (action === "purge-trash") {
    const collectionId = String(params.collectionId || "").replace(/[^a-zA-Z0-9_]/g, "_");
    const entryId = String(params.entryId || "");
    if (!collectionId || !entryId) {
      throw new AppError("collectionId and entryId required for purge-trash", 400);
    }
    const collectionName = collectionTableName(collectionId);
    await initializedAdapter.crud.delete(collectionName, entryId as any, {
      tenantId,
      permanent: true,
      userId: "system" as any,
    });
    return rawResponse({ success: true, purged: entryId, collectionId });
  }

  /**
   * seed-invite-token — create a registration (user_invite) token for token-list E2E.
   * Body: { action, email?, role? }
   */
  if (action === "seed-invite-token") {
    const email = String(params.email || `invite_${generateUUID().slice(0, 8)}@example.com`)
      .toLowerCase()
      .trim();
    const role = String(params.role || "editor");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // Use the same namespace path as the UI invite flow (POST /api/token/create-token).
    // NOTE: authFacade.createToken({ user_id: "pending" }) fails — that facade
    // resolves a real user by id before creating the token, which never exists for
    // email invites. tokens.create writes the token directly for the invited email.
    const result = await cms.auth.tokens.create({
      email,
      role,
      expires,
      // auth_tokens.user_id is NOT NULL — "pending" marks an unregistered invite.
      userId: "pending" as any,
      tenantId,
    });
    if (!result?.success || !result.data) {
      throw new AppError(
        (result as { message?: string })?.message || "Failed to create user_invite token",
        500,
      );
    }
    return rawResponse({
      success: true,
      token: result.data,
      email,
      role,
      expires,
      type: "user_invite",
    });
  }

  // ── Password-reset / media gallery test seeds ───────────────────────────
  if (action === "seed-expired-password-reset") {
    const email = String(params.email || "admin@example.com")
      .toLowerCase()
      .trim();
    const { auth: authFacade } = await loadDbModule();
    if (!authFacade) {
      throw new AppError("Auth facade unavailable for seed-expired-password-reset", 503);
    }

    const user = await authFacade.checkUser({ email });
    const userId = user?._id;
    if (!userId) {
      throw new AppError(`User not found for seed-expired-password-reset: ${email}`, 404);
    }

    // Expired 1 hour ago — consumeToken must return TOKEN_EXPIRED
    const expires = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const token = await authFacade.createToken({
      user_id: userId,
      expires,
      type: "password_reset",
      // Prefer user's tenant so isolation matches consumeToken lookups
      tenantId: (user as { tenantId?: string | null }).tenantId ?? tenantId,
    });

    if (!token || typeof token !== "string") {
      throw new AppError("Failed to create expired password_reset token", 500);
    }

    return rawResponse({
      success: true,
      token,
      email: user.email || email,
      userId: String(userId),
      expires,
      type: "password_reset",
    });
  }

  if (action === "seed-media-with-metadata") {
    const stamp = generateUUID().slice(0, 8);
    const email = String(params.email || "admin@example.com")
      .toLowerCase()
      .trim();
    let userId = "system";
    try {
      const listResult = await cms.auth.listUsers({ tenantId, limit: 100 });
      const users = listResult.success ? listResult.data?.data : listResult.data;
      const found = Array.isArray(users)
        ? users.find((u: { email?: string }) => u.email === email)
        : undefined;
      if (found?._id) userId = String(found._id);
    } catch {
      /* system owner is fine for gallery admin views */
    }

    const defaultItems = [
      {
        filename: `e2e-canon-${stamp}.png`,
        originalFilename: `e2e-canon-${stamp}.png`,
        hash: `e2ehashcanon${stamp}`,
        path: `global/e2e-canon-${stamp}.png`,
        size: 128,
        mimeType: "image/png",
        metadata: { camera: "Canon", iso: 400, tags: ["nature"] },
      },
      {
        filename: `e2e-nikon-${stamp}.png`,
        originalFilename: `e2e-nikon-${stamp}.png`,
        hash: `e2ehashnikon${stamp}`,
        path: `global/e2e-nikon-${stamp}.png`,
        size: 128,
        mimeType: "image/png",
        metadata: { camera: "Nikon", iso: 100, tags: ["studio"] },
      },
    ];

    const itemsIn = Array.isArray(params.items) ? params.items : defaultItems;
    const created: Array<{ _id: string; hash: string; filename: string; metadata: unknown }> = [];

    const upload = initializedAdapter.media?.files?.upload;
    if (typeof upload !== "function") {
      throw new AppError("media.files.upload unavailable", 500);
    }

    for (const raw of itemsIn) {
      const item = raw as Record<string, unknown>;
      const hash = String(item.hash || `e2ehash${generateUUID().slice(0, 10)}`);
      const filename = String(item.filename || `${hash}.png`);
      const file = {
        filename,
        originalFilename: String(item.originalFilename || filename),
        hash,
        path: String(item.path || `global/${filename}`),
        size: Number(item.size ?? 128),
        mimeType: String(item.mimeType || "image/png"),
        folderId: (item.folderId as string | null | undefined) ?? null,
        thumbnails: (item.thumbnails as Record<string, unknown>) || {},
        metadata: (item.metadata as Record<string, unknown>) || {},
        access: (item.access as string) || "public",
        createdBy: userId,
        updatedBy: userId,
      };
      const res = await upload(file as any, { tenantId });
      if (!res?.success || !res.data) {
        throw new AppError(
          `seed-media-with-metadata upload failed: ${(res as any)?.message || "unknown"}`,
          500,
        );
      }
      const row = res.data as any;
      created.push({
        _id: String(row._id || row.id),
        hash: String(row.hash || hash),
        filename: String(row.filename || filename),
        metadata: row.metadata ?? file.metadata,
      });
    }

    return rawResponse({
      success: true,
      items: created,
      matchingHash: created[0]?.hash,
      nonMatchingHash: created[1]?.hash,
    });
  }

  return undefined;
}
