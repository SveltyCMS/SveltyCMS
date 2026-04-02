/**
 * @file src/databases/webhook-wrapper.ts
 * @description A Smart Proxy wrapper for the Database Adapter to trigger webhooks centrally.
 * This ensures that all mutations (CRUD, Media) trigger the appropriate webhooks
 * regardless of which API route or service initiates the change.
 *
 * IMPORTANT: Uses Proxy instead of object spread to preserve prototype methods
 * (count, findOne, findMany, etc.) on class-based adapter instances.
 */

import type { WebhookEvent } from "@src/services/webhook-service";
import { logger } from "@utils/logger.server";
import type { ICrudAdapter, IDBAdapter, IMediaAdapter } from "./db-interface";

// Constants for identifying events
const CONTENT_COLLECTION_PREFIX = "collection_";

export async function wrapAdapterWithWebhooks(adapter: IDBAdapter): Promise<IDBAdapter> {
  // Dynamically import services to avoid circular dependency with db.ts
  const [{ webhookService }, { eventBus }] = await Promise.all([
    import("@src/services/webhook-service"),
    import("@src/services/automation/event-bus"),
  ]);

  logger.info("🔌 Webhook & EventBus Proxy Wrapper active on Database Adapter");

  // --- Helper: Wrap CRUD Operations ---
  const wrapCrud = (capturedCrud: ICrudAdapter): ICrudAdapter => {
    const wrappedMethods: Partial<ICrudAdapter> = {
      insert: async (...args) => {
        const res = await capturedCrud.insert(...args);
        const [collection, , tenantId] = args as [string, any, string];
        if (
          res.success &&
          (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === "MediaItem")
        ) {
          const event: WebhookEvent = collection === "MediaItem" ? "media:upload" : "entry:create";
          webhookService.trigger(event, { collection, data: res.data as any }, tenantId);
          eventBus.emit(event as any, { collection, data: res.data as any, tenantId });
        }
        return res;
      },
      insertMany: async (...args) => {
        const res = await capturedCrud.insertMany(...args);
        const [collection, , tenantId] = args as [string, any[], string];
        if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
          for (const item of res.data) {
            webhookService.trigger("entry:create", { collection, data: item as any }, tenantId);
            eventBus.emit("entry:create", { collection, data: item as any, tenantId });
          }
        }
        return res;
      },
      update: async (...args) => {
        const res = await capturedCrud.update(...args);
        const [collection, id, data, tenantId] = args as [string, any, any, string];
        if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
          let event: WebhookEvent = "entry:update";
          if ("status" in (data as any)) {
            if ((data as any).status === "publish") event = "entry:publish";
            else if ((data as any).status === "unpublish") event = "entry:unpublish";
          }
          webhookService.trigger(
            event,
            { collection, id: id as any, data: res.data as any },
            tenantId,
          );
          eventBus.emit(event as any, {
            collection,
            entryId: id as any,
            data: res.data as any,
            tenantId,
          });
        }
        return res;
      },
      updateMany: async (...args) => {
        const res = await capturedCrud.updateMany(...args);
        const [collection, query, data, tenantId] = args as [string, any, any, string];
        if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
          webhookService.trigger(
            "entry:update",
            {
              collection,
              query: query as any,
              changes: data as any,
              modifiedCount: res.data.modifiedCount,
            },
            tenantId,
          );
          eventBus.emit("entry:update", {
            collection,
            data: { query, changes: data, modifiedCount: res.data.modifiedCount },
            tenantId,
          });
        }
        return res;
      },
      delete: async (...args) => {
        const res = await capturedCrud.delete(...args);
        const [collection, id, tenantId] = args as [string, any, string];
        if (
          res.success &&
          (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === "MediaItem")
        ) {
          const event: WebhookEvent = collection === "MediaItem" ? "media:delete" : "entry:delete";
          webhookService.trigger(event, { collection, id: id as any }, tenantId);
          eventBus.emit(event as any, { collection, entryId: id as any, tenantId });
        }
        return res;
      },
      deleteMany: async (...args) => {
        const res = await capturedCrud.deleteMany(...args);
        const [collection, query, tenantId] = args as [string, any, string];
        if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
          webhookService.trigger(
            "entry:delete",
            { collection, query: query as any, deletedCount: res.data.deletedCount },
            tenantId,
          );
          eventBus.emit("entry:delete", {
            collection,
            data: { query, deletedCount: res.data.deletedCount },
            tenantId,
          });
        }
        return res;
      },
      upsert: async (...args) => {
        const res = await capturedCrud.upsert(...args);
        const [collection, query, , tenantId] = args as [string, any, any, string];
        if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
          webhookService.trigger(
            "entry:update",
            { collection, query: query as any, data: res.data },
            tenantId,
          );
          eventBus.emit("entry:update", { collection, data: { query, data: res.data }, tenantId });
        }
        return res;
      },
    };

    return new Proxy(capturedCrud, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && prop in wrappedMethods) {
          return wrappedMethods[prop as keyof ICrudAdapter];
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  // --- Helper: Wrap Media Operations ---
  const wrapMedia = (capturedMedia: IMediaAdapter): IMediaAdapter => {
    const originalFiles = capturedMedia.files;
    const wrappedFiles: Partial<IMediaAdapter["files"]> = {
      upload: async (...args) => {
        const res = await originalFiles.upload(...args);
        const [, tenantId] = args as [any, any];
        if (res.success) {
          webhookService.trigger("media:upload", { data: res.data as any }, tenantId);
          eventBus.emit("media:upload", { data: res.data as any, tenantId });
        }
        return res;
      },
      uploadMany: async (...args) => {
        const res = await originalFiles.uploadMany(...args);
        const [, tenantId] = args as [any[], any];
        if (res.success) {
          for (const file of res.data) {
            webhookService.trigger("media:upload", { data: file as any }, tenantId);
            eventBus.emit("media:upload", { data: file as any, tenantId });
          }
        }
        return res;
      },
      delete: async (...args) => {
        const res = await originalFiles.delete(...args);
        const [id, tenantId] = args as [any, any];
        if (res.success) {
          webhookService.trigger("media:delete", { id }, tenantId);
          eventBus.emit("media:delete", { entryId: id as any, tenantId });
        }
        return res;
      },
      deleteMany: async (...args) => {
        const res = await originalFiles.deleteMany(...args);
        const [ids, tenantId] = args as [any[], any];
        if (res.success) {
          webhookService.trigger("media:delete", { ids }, tenantId);
          eventBus.emit("media:delete", { data: { ids }, tenantId });
        }
        return res;
      },
    };

    const filesProxy = new Proxy(originalFiles, {
      get(fTarget, fProp, fReceiver) {
        if (typeof fProp === "string" && fProp in wrappedFiles) {
          return wrappedFiles[fProp as keyof IMediaAdapter["files"]];
        }
        const fValue = Reflect.get(fTarget, fProp, fReceiver);
        return typeof fValue === "function" ? fValue.bind(fTarget) : fValue;
      },
    });

    return new Proxy(capturedMedia, {
      get(target, prop, receiver) {
        if (prop === "files") return filesProxy;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };

  // --- Initial Wrapping for CRUD ---
  let originalCrud: ICrudAdapter | undefined;
  if (Object.hasOwn(adapter, "crud")) {
    originalCrud = adapter.crud;
  } else {
    let proto = Object.getPrototypeOf(adapter);
    while (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, "crud");
      if (desc) {
        originalCrud = desc.get ? desc.get.call(adapter) : desc.value;
        break;
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  if (!originalCrud) {
    const internalAdapter = adapter as unknown as Record<string, ICrudAdapter>;
    originalCrud = internalAdapter._crud || internalAdapter._cachedCrud;
  }

  if (originalCrud) {
    let crudProxy = wrapCrud(originalCrud);
    Object.defineProperty(adapter, "crud", {
      get: () => crudProxy,
      set: (v: ICrudAdapter) => {
        crudProxy = wrapCrud(v);
      },
      configurable: true,
      enumerable: true,
    });
  }

  // --- Initial Wrapping for Media ---
  let originalMedia: IMediaAdapter | undefined;
  if (Object.hasOwn(adapter, "media")) {
    originalMedia = adapter.media;
  } else {
    let proto = Object.getPrototypeOf(adapter);
    while (proto) {
      const desc = Object.getOwnPropertyDescriptor(proto, "media");
      if (desc) {
        originalMedia = desc.get ? desc.get.call(adapter) : desc.value;
        break;
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  if (originalMedia) {
    let mediaProxy = wrapMedia(originalMedia);
    Object.defineProperty(adapter, "media", {
      get: () => mediaProxy,
      set: (v: IMediaAdapter) => {
        mediaProxy = wrapMedia(v);
      },
      configurable: true,
      enumerable: true,
    });
  }

  return adapter;
}
