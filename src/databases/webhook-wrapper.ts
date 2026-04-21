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
        const collection = args[0] as string;
        const options = args[2] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const options = args[2] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const id = args[1] as any;
        const data = args[2] as any;
        const options = args[3] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const query = args[1] as any;
        const data = args[2] as any;
        const options = args[3] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const id = args[1] as any;
        const options = args[2] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const query = args[1] as any;
        const options = args[2] as any;
        const tenantId = options?.tenantId;
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
        const collection = args[0] as string;
        const query = args[1] as any;
        const options = args[3] as any;
        const tenantId = options?.tenantId;
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

  // --- Final Proxy Construction ---
  // We use a Proxy for the main adapter instead of property mutation to ensure
  // all interface properties (collection, system, auth, etc.) are correctly preserved.
  const crudProxy = originalCrud ? wrapCrud(originalCrud) : undefined;
  const mediaProxy = originalMedia ? wrapMedia(originalMedia) : undefined;

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "crud" && crudProxy) return crudProxy;
      if (prop === "media" && mediaProxy) return mediaProxy;
      if (prop === "__isSveltyProxy__") return true;

      // Absolute property lookup
      let value = (target as any)[prop];
      if (value === undefined) {
        value = Reflect.get(target, prop, receiver);
      }

      // Final Resilience: If still missing but is a known critical interface, return empty object to prevent crash
      if (!value && (prop === "collection" || prop === "batch")) {
        console.warn(
          `🔴 [WebhookProxy] Critical: Interface '${String(prop)}' missing on target! Attempting recovery.`,
        );
        // Try one last thing: check if it's on the class prototype
        const protoValue = (target.constructor?.prototype as any)?.[prop];
        if (protoValue) {
          console.log(`🟢 [WebhookProxy] Recovered '${String(prop)}' from prototype.`);
          return protoValue;
        }
        // 🚀 Self-Healing Dummy: Returns a function that returns null/empty for any method call.
        // This prevents "is not a function" crashes during high-concurrency bootstrap races.
        return new Proxy(
          {},
          {
            get: (_, subProp) => {
              if (subProp === "getModel") {
                return () => ({
                  findOne: () => Promise.resolve(null),
                  aggregate: () => Promise.resolve([]),
                  find: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }),
                });
              }
              return () => Promise.resolve({ success: false, message: "Interface initializing" });
            },
          },
        );
      }

      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
    ownKeys(target) {
      const keys = Reflect.ownKeys(target);
      // Ensure essential keys are always reported as present if they exist on the target
      const required = ["collection", "batch", "crud", "auth", "system", "monitoring", "content"];
      for (const key of required) {
        if (!keys.includes(key) && (target as any)[key] !== undefined) {
          keys.push(key);
        }
      }
      return keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(target, prop);
      if (desc) return desc;
      // If we are forcing it in ownKeys, we must also provide a descriptor
      if ((target as any)[prop] !== undefined) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: (target as any)[prop],
        };
      }
      return undefined;
    },
    has(target, prop) {
      return Reflect.has(target, prop);
    },
  }) as unknown as IDBAdapter;
}
