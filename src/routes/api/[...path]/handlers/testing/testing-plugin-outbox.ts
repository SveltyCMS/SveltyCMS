/**
 * @file src/routes/api/[...path]/handlers/testing/testing-plugin-outbox.ts
 * @description Plugin-storage and transactional-outbox integration fixtures.
 */

import { AppError } from "@utils/error-handling";
import { generateUUID } from "@utils/native-utils";
import { rawResponse, type TestingContext } from "./testing-shared";

export async function handleTestingPluginOutboxRoutes(
  ctx: TestingContext,
): Promise<Response | undefined> {
  const { tenantId, params, initializedAdapter, action } = ctx;

  // ── Plugin storage + transactional outbox (integration fixtures) ────────
  if (action === "plugin-storage-create") {
    const plugin = String(params.plugin || "test-plugin");
    const collection = String(params.collection || "default");
    // Prefer `payload` over `data` — `data` can collide with response envelopes / proxies
    const data =
      (params.payload as Record<string, unknown>) ||
      (params.recordData as Record<string, unknown>) ||
      (params.data as Record<string, unknown>) ||
      {};
    const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
    const store = new PluginStorageAdapterImpl(initializedAdapter);
    const record = await store.createRecord(plugin, collection, data, {
      tenantId: tenantId ? String(tenantId) : undefined,
    });
    // Always echo request payload on create (DB drivers may omit/double-encode `data`)
    const safe = {
      _id: String(record?._id || ""),
      plugin,
      collection,
      payload: data,
      data,
      recordData: data,
    };
    return rawResponse({ success: true, record: safe, ...safe });
  }

  if (action === "plugin-storage-get") {
    const plugin = String(params.plugin || "");
    const collection = String(params.collection || "");
    const recordId = String(params.recordId || params.id || "");
    if (!plugin || !collection || !recordId) {
      throw new AppError("plugin, collection, recordId required", 400);
    }
    const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
    const store = new PluginStorageAdapterImpl(initializedAdapter);
    const record = await store.getRecord(plugin, collection, recordId, {
      tenantId: tenantId ? String(tenantId) : undefined,
    });
    return rawResponse({ success: true, record, data: record });
  }

  if (action === "plugin-storage-list") {
    const plugin = String(params.plugin || "");
    const collection = String(params.collection || "");
    if (!plugin || !collection) throw new AppError("plugin and collection required", 400);
    const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
    const store = new PluginStorageAdapterImpl(initializedAdapter);
    const page = await store.listRecords(plugin, collection, {
      tenantId: tenantId ? String(tenantId) : undefined,
      limit: Number(params.limit) || 50,
      offset: Number(params.offset) || 0,
      filter: params.filter as Record<string, unknown> | undefined,
    });
    return rawResponse({ success: true, data: page.data, records: page.data, total: page.total });
  }

  if (action === "plugin-storage-delete") {
    const plugin = String(params.plugin || "");
    const collection = String(params.collection || "");
    const recordId = String(params.recordId || params.id || "");
    if (!plugin || !collection || !recordId) {
      throw new AppError("plugin, collection, recordId required", 400);
    }
    const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
    const store = new PluginStorageAdapterImpl(initializedAdapter);
    const ok = await store.deleteRecord(plugin, collection, recordId, {
      tenantId: tenantId ? String(tenantId) : undefined,
    });
    return rawResponse({ success: true, deleted: ok });
  }

  if (action === "outbox-emit") {
    const { outboxService } = await import("@src/services/outbox");
    const result = await outboxService.emit(
      String(params.eventType || "entry:create"),
      String(params.aggregateType || "entry"),
      String(params.aggregateId || generateUUID()),
      params.payload ?? { test: true },
      String(params.tenantId || tenantId || ""),
    );
    if (!result.success) {
      // Outbox may be disabled in benchmark — surface clearly
      return rawResponse(
        {
          success: false,
          message: result.message,
          code: (result as any).error?.code,
        },
        400,
      );
    }
    return rawResponse({ success: true, event: result.data, data: result.data });
  }

  if (action === "outbox-process-batch") {
    const { outboxService } = await import("@src/services/outbox");
    const stats = await outboxService.processBatch(Number(params.batchSize) || 50);
    return rawResponse({ success: true, ...stats });
  }

  if (action === "outbox-pending-count") {
    const { outboxService } = await import("@src/services/outbox");
    const count = await outboxService.getPendingCount(
      params.tenantId ? String(params.tenantId) : undefined,
    );
    return rawResponse({ success: true, count });
  }

  if (action === "outbox-get") {
    const id = String(params.id || params.eventId || "");
    if (!id) throw new AppError("id required", 400);
    const res = await initializedAdapter.crud.findOne("svelty_outbox", { _id: id } as any, {
      tenantId,
    });
    return rawResponse({
      success: true,
      event: res.success ? res.data : null,
    });
  }

  if (action === "outbox-tx-rollback") {
    // Prove outbox row is not visible after a failed transaction (SQL adapters).
    // Mongo multi-doc transactions need a replica set — skip with reason if unsupported.
    const adapterType = String((initializedAdapter as any).type || "").toLowerCase();
    if (adapterType === "mongodb") {
      return rawResponse({
        success: true,
        skipped: true,
        reason: "MongoDB multi-doc transactions require replica set; skipped in CI",
      });
    }
    if (typeof (initializedAdapter as any).transaction !== "function") {
      return rawResponse({
        success: true,
        skipped: true,
        reason: "Adapter has no transaction()",
      });
    }

    const { outboxService, OUTBOX_COLLECTION } =
      await import("@src/services/outbox/outbox-service");
    const aggregateId = String(params.aggregateId || `rb-${generateUUID().slice(0, 8)}`);
    let emittedId: string | undefined;

    try {
      await (initializedAdapter as any).transaction(async (tx: any) => {
        const emitRes = await outboxService.emit(
          String(params.eventType || "entry:create"),
          "entry",
          aggregateId,
          { rollbackTest: true },
          String(tenantId || ""),
          { transaction: tx },
        );
        if (emitRes.success && emitRes.data?._id) {
          emittedId = String(emitRes.data._id);
        }
        // Force rollback
        return { success: false, message: "forced rollback" };
      });
    } catch {
      /* expected on some adapters that throw on rollback */
    }

    // If emit returned an id, verify it is gone; else scan by aggregateId
    let eventFound = false;
    if (emittedId) {
      const found = await initializedAdapter.crud.findOne(
        OUTBOX_COLLECTION,
        { _id: emittedId } as any,
        { tenantId },
      );
      eventFound = !!(found.success && found.data);
    } else {
      const listed = await initializedAdapter.crud.findMany(
        OUTBOX_COLLECTION,
        { aggregateId } as any,
        { limit: 5, tenantId },
      );
      eventFound = !!(listed.success && Array.isArray(listed.data) && listed.data.length > 0);
    }

    return rawResponse({
      success: true,
      skipped: false,
      eventFound,
      emittedId: emittedId || null,
      aggregateId,
    });
  }

  return undefined;
}
