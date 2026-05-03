/**
 * @file src/utils/schema/validation.worker.ts
 * @description Worker for offloading CPU-intensive schema parsing.
 */

import { parentPort } from "node:worker_threads";
import { safeParse } from "valibot";
import { CreateNodeSchema, MoveNodeSchema, UpdateNodeSchema, DeleteNodeSchema } from "./validation";

if (parentPort) {
  parentPort.on("message", (msg) => {
    let schema;
    switch (msg.action) {
      case "create":
        schema = CreateNodeSchema;
        break;
      case "move":
        schema = MoveNodeSchema;
        break;
      case "update":
        schema = UpdateNodeSchema;
        break;
      case "delete":
        schema = DeleteNodeSchema;
        break;
      default:
        parentPort?.postMessage({ id: msg.id, error: "Unknown action" });
        return;
    }

    const result = safeParse(schema, msg.data);
    parentPort?.postMessage({
      id: msg.id,
      success: result.success,
      data: result.success ? result.output : undefined,
      error: !result.success ? result.issues : undefined,
    });
  });
}
