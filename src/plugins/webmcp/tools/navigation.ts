/**
 * @file src/plugins/webmcp/tools/navigation.ts
 * @description Admin navigation tools for WebMCP.
 */

import { goto } from "$app/navigation";
import { page } from "$app/state";
import { logger } from "@utils/logger";

export function registerNavigationTools() {
  const modelContext = (window.document as any)?.modelContext;
  if (!modelContext) return;

  modelContext.registerTool({
    name: "navigate_to",
    description: "Navigate to a specific path inside the SveltyCMS admin dashboard.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Admin path starting with / (e.g. /collections/posts)",
        },
      },
      required: ["path"],
    },
    execute: async ({ path }: { path: string }) => {
      if (!path.startsWith("/")) {
        return {
          isError: true,
          content: [{ type: "text", text: "Path must start with /" }],
        };
      }

      try {
        await goto(path);
        return {
          content: [{ type: "text", text: `Successfully navigated to ${path}` }],
        };
      } catch (err: unknown) {
        logger.error("[WebMCP] navigate_to failed", { path, error: err });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    },
  });

  modelContext.registerTool({
    name: "get_current_route",
    description: "Returns current admin route and query parameters.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              pathname: page.url.pathname,
              params: page.params,
              query: Object.fromEntries(page.url.searchParams),
            },
            null,
            2,
          ),
        },
      ],
    }),
  });
}
