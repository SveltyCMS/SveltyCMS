/**
 * @file tests/unit/agent/plugin-gating.test.ts
 * @description Unit tests for the dev-only gate and the plugin metadata of the agent dev loop.
 */

import { describe, expect, it } from "vitest";
import { AGENT_CAPS, AGENT_ENV_FLAG, isAgentEnabled } from "@src/utils/vite-plugin-agent/caps";
import { AGENT_ROUTE_PREFIX, vitePluginAgent } from "@src/utils/vite-plugin-agent/index";
import { AGENT_TOOLS } from "@src/utils/vite-plugin-agent/tools-server";
import { DENIED_SEGMENTS, isAddressableName } from "@src/utils/vite-plugin-agent/path-policy";

describe("agent dev loop gating", () => {
  it("enables only on the exact flag value", () => {
    expect(isAgentEnabled({ [AGENT_ENV_FLAG]: "1" })).toBe(true);
    expect(isAgentEnabled({ [AGENT_ENV_FLAG]: "true" })).toBe(false);
    expect(isAgentEnabled({ [AGENT_ENV_FLAG]: "yes" })).toBe(false);
    expect(isAgentEnabled({ [AGENT_ENV_FLAG]: "" })).toBe(false);
    expect(isAgentEnabled({})).toBe(false);
  });

  it("never runs during a build", () => {
    const plugin = vitePluginAgent();
    expect(plugin.name).toBe("svelty-agent-dev-loop");
    expect(plugin.apply).toBe("serve");
  });
});

describe("agent tool catalog", () => {
  it("ships read-only tools only", () => {
    const names = AGENT_TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual(["file_exists", "grep", "list_tree", "read_file"]);
    expect(AGENT_TOOLS.every((tool) => tool.readOnly)).toBe(true);
    expect(names.some((name) => /write|edit|delete|remove/.test(name))).toBe(false);
  });

  it("uses a single route prefix and documented caps", () => {
    expect(AGENT_ROUTE_PREFIX).toBe("/agent");
    expect(AGENT_CAPS.readFileLines).toBe(500);
    expect(AGENT_CAPS.listTreeDepth).toBe(3);
    expect(AGENT_CAPS.grepMatchesPerFile).toBeLessThanOrEqual(5);
    expect(DENIED_SEGMENTS).toContain("node_modules");
    expect(isAddressableName("node_modules")).toBe(false);
    expect(isAddressableName(".git")).toBe(false);
    expect(isAddressableName("src")).toBe(true);
  });
});
