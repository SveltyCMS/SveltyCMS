/**
 * @file src/content/module-worker.ts
 * @description Worker thread for offloading schema module loading and processing.
 */

import { parentPort } from "node:worker_threads";
import path from "node:path";

async function getWidgetsProxy() {
  const { widgetRegistryService } = await import("@src/services/widget-registry-service");
  const widgetsMap = await widgetRegistryService.getAllWidgets();
  const widgetsObject = Object.fromEntries(widgetsMap.entries());
  return new Proxy(widgetsObject, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      const lowerProp = prop.toLowerCase();
      const entry = Object.entries(target).find(([key]) => key.toLowerCase() === lowerProp);
      return entry ? entry[1] : undefined;
    },
  });
}

if (parentPort) {
  parentPort.on("message", async (message) => {
    const { action, filePath, version } = message;

    if (action === "load") {
      try {
        const fullPath = path.resolve(filePath);
        const fileUrl = `file://${fullPath.replace(/\\/g, "/")}`;

        // Inject widgets
        (globalThis as any).widgets = await getWidgetsProxy();

        const module = await import(`${fileUrl}?v=${version}`);
        const schema = module.default || module.schema;

        if (schema && typeof schema === "object" && "fields" in schema) {
          if (!schema._id) {
            schema._id = (schema.slug || schema.name || "unknown")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");
          }
          parentPort?.postMessage({ success: true, schema });
        } else {
          parentPort?.postMessage({ success: false, error: "Invalid schema" });
        }
      } catch (err) {
        parentPort?.postMessage({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}
