/**
 * @file src/utils/schema/validation.ts
 * @description Valibot schemas for content node operations
 */

import { number, object, optional, string } from "valibot";
import { fileURLToPath } from "node:url";

// Basic Schema for DatabaseId validation
export const DatabaseIdSchema = string(); // Can be refined with regex/length if needed

// Schema for a Content Node (simplified for validation)
export const ContentNodeSchema = object({
  _id: DatabaseIdSchema,
  name: string(),
  slug: optional(string()),
  nodeType: string(), // 'category' | 'collection'
  parentId: optional(DatabaseIdSchema),
  order: optional(number()),
});

// Operations Types
export const CreateNodeSchema = object({
  type: string(), // 'create'
  node: ContentNodeSchema,
  parentId: optional(DatabaseIdSchema),
});

export const MoveNodeSchema = object({
  type: string(), // 'move'
  nodeId: DatabaseIdSchema,
  targetParentId: optional(DatabaseIdSchema),
  newOrder: number(),
});

export const UpdateNodeSchema = object({
  type: string(), // 'update'
  nodeId: DatabaseIdSchema,
  data: object({
    name: optional(string()),
    slug: optional(string()),
    icon: optional(string()),
  }),
});

export const DeleteNodeSchema = object({
  type: string(), // 'delete'
  nodeId: DatabaseIdSchema,
});

// --- Worker Integration ---

import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";

const IS_SERVER =
  typeof window === "undefined" || (typeof process !== "undefined" && process.versions != null);

const MAX_WORKERS = Math.max(1, Math.floor((os.cpus?.().length || 4) / 4));
const workerPool: Worker[] = [];
let nextWorker = 0;
let msgIdCounter = 0;
const pendingPromises = new Map<
  number,
  { resolve: (val: any) => void; reject: (err: any) => void }
>();
const WORKER_PATH = IS_SERVER
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "validation.worker.ts")
  : "";

function getWorker(): Worker {
  if (!IS_SERVER) throw new Error("Workers only available on server");

  if (workerPool.length < MAX_WORKERS) {
    const worker = new Worker(WORKER_PATH);
    worker.on("message", (msg) => {
      const p = pendingPromises.get(msg.id);
      if (p) {
        pendingPromises.delete(msg.id);
        if (msg.error && !msg.success) p.resolve({ success: false, issues: msg.error });
        else p.resolve({ success: true, output: msg.data });
      }
    });
    worker.on("error", (err) => logger.error("[ValidationWorker] Error:", err));
    workerPool.push(worker);
    return worker;
  }
  const worker = workerPool[nextWorker];
  nextWorker = (nextWorker + 1) % workerPool.length;
  return worker;
}

/**
 * Offloads schema validation to a worker thread.
 */
export async function validateInWorker(
  action: "create" | "move" | "update" | "delete",
  data: any,
): Promise<{ success: boolean; output?: any; issues?: any }> {
  if (!IS_SERVER) {
    // Fallback to main thread if not on server (e.g. some edge cases or browser tests)
    const { safeParse } = await import("valibot");
    let schema;
    if (action === "create") schema = CreateNodeSchema;
    else if (action === "move") schema = MoveNodeSchema;
    else if (action === "update") schema = UpdateNodeSchema;
    else if (action === "delete") schema = DeleteNodeSchema;
    else throw new Error("Unknown action");

    const result = safeParse(schema, data);
    return { success: result.success, output: result.output, issues: result.issues };
  }

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter;
    pendingPromises.set(id, { resolve, reject });
    getWorker().postMessage({ id, action, data });
  });
}
