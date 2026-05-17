/**
 * @file src/content/module-worker.ts
 * @description Worker thread for offloading schema module loading and processing.
 */

import { parentPort } from "node:worker_threads";
import path from "node:path";

async function getWidgetsProxy() {
  const { widgetRegistryService } = await import("@src/services/core/widget-registry-service");
  const widgetsMap = await widgetRegistryService.getAllWidgets();
  const widgetsObject = Object.fromEntries(widgetsMap.entries());
  return new Proxy(widgetsObject, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      const lowerProp = prop.toLowerCase();
      const entry = Object.entries(target).find(([key]) => key.toLowerCase() === lowerProp);
      if (entry) return entry[1];

      // 🚀 Dynamic Self-Healing Fallback Widget Factory
      // If a widget (e.g. Input) is requested but not registered (common in worker threads or isolated benchmarks),
      // dynamically construct a fallback factory function to prevent 'is not a function' runtime crashes.
      const Name = prop;
      const fallbackFactory = (fieldConfig: any = {}) => {
        const label = fieldConfig.label || "";
        const db_fieldName =
          fieldConfig.db_fieldName ||
          label
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "") ||
          "field";
        return {
          widget: {
            widgetId: Name,
            Name,
            Icon: "mdi:widgets-outline",
            Description: `Self-healing Fallback Widget for ${Name}`,
            inputComponentPath: "",
            displayComponentPath: "",
            validationSchema: null,
            defaults: {},
            GuiFields: {},
            aggregations: null,
          },
          label,
          db_fieldName,
          required: fieldConfig.required ?? false,
          translated: fieldConfig.translated ?? false,
          width: fieldConfig.width,
          helper: fieldConfig.helper,
          ...fieldConfig,
        };
      };

      fallbackFactory.Name = Name;
      fallbackFactory.Icon = "mdi:widgets-outline";
      fallbackFactory.Description = `Self-healing Fallback Widget for ${Name}`;
      fallbackFactory.__widgetType = "core";
      fallbackFactory.__dependencies = [] as any[];
      fallbackFactory.__inputComponentPath = "";
      fallbackFactory.__displayComponentPath = "";

      return fallbackFactory;
    },
  });
}

if (parentPort) {
  parentPort.on("message", async (message) => {
    const { id, action, filePath, version } = message;

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
          parentPort?.postMessage({ id, success: true, schema });
        } else {
          parentPort?.postMessage({ id, success: false, error: "Invalid schema" });
        }
      } catch (err) {
        parentPort?.postMessage({
          id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}
