/**
 * @file src/widgets/scanner.ts
 * @description Centralized widget scanner using Vite's import.meta.glob.
 * Provides a single source of truth for widget discovery to avoid redundant scanning.
 */

// Scan for core widgets
let coreModulesRaw =
  (import.meta as any).glob?.("./core/*/index.ts", {
    eager: true,
  }) || {};

// Scan for custom widgets
let customModulesRaw =
  (import.meta as any).glob?.("./custom/*/index.ts", {
    eager: true,
  }) || {};

// Fallback for non-Vite environments or production preview where glob might be stripped
if (Object.keys(coreModulesRaw).length === 0 && typeof process !== "undefined") {
  try {
    const fs = require("node:fs");
    const path = require("node:path");

    // In production build (preview), we are often in .svelte-kit/output/server
    // but the source widgets might be reachable via process.cwd()
    const projectRoot = process.cwd();
    const corePath = path.join(projectRoot, "src/widgets/core");
    const customPath = path.join(projectRoot, "src/widgets/custom");

    const scan = (dirPath: string, subDir: string) => {
      if (!fs.existsSync(dirPath)) return {};
      const modules: Record<string, any> = {};
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(dirPath, entry.name, "index.ts");
          if (fs.existsSync(indexPath)) {
            try {
              // UNIVERSAL PROXY FACTORY:
              // In production fallback, we don't care about the real widget implementation
              // during schema parsing, just that it returns a valid descriptor object.
              const widgetName = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
              const originalName = entry.name; // e.g. rich-text
              const camelName = entry.name.replace(/-([a-z])/g, (_: string, g: string) =>
                g.toUpperCase(),
              ); // e.g. richText

              const factory = (args: any) => ({
                Name: widgetName,
                ...args,
                widget: { Name: widgetName },
              });

              // Add required property BEFORE assignment
              (factory as any).Name = widgetName;
              (factory as any).originalName = originalName;
              (factory as any).camelName = camelName;

              modules[`./${subDir}/${entry.name}/index.ts`] = { default: factory };
            } catch (e) {
              // Silent fail
            }
          }
        }
      }
      return modules;
    };

    coreModulesRaw = scan(corePath, "core");
    customModulesRaw = scan(customPath, "custom");
  } catch (err) {
    // Silent fail
  }
}

export const coreModules = coreModulesRaw;
export const customModules = customModulesRaw;
export const allWidgetModules = { ...coreModules, ...customModules };

/**
 * Extracts widget name from file path
 * @param path - The file path (e.g., './core/input/index.ts')
 * @returns The widget name (e.g., 'input')
 */
export function getWidgetNameFromPath(path: string): string | null {
  const parts = path.split("/");
  return parts.at(-2) || null;
}
