/**
 * @file tests/unit/services/scheduler-job.test.ts
 * @description Status-transition jobs accept only an allow-listed payload.
 */

import { describe, expect, it } from "vitest";
import { acceptStatusTransitionJob } from "@src/services/scheduler";
import { websocketOriginAllowed } from "@src/hooks.ws";

describe("acceptStatusTransitionJob", () => {
  it("stamps the caller and drops client actor and tenant fields", () => {
    const accepted = acceptStatusTransitionJob(
      "status-transition",
      {
        collectionId: "posts",
        entryId: "e1",
        targetStatus: "publish",
        entryPath: "/posts/e1",
        scheduledBy: "someone-else",
        tenantId: "other-tenant",
        taskType: "drop-table",
      },
      "user-1",
    );
    expect(accepted.taskType).toBe("status-transition");
    expect(accepted.payload).toEqual({
      collectionId: "posts",
      entryId: "e1",
      targetStatus: "publish",
      entryPath: "/posts/e1",
      scheduledBy: "user-1",
    });
  });

  it("rejects unknown tasks and statuses", () => {
    expect(() => acceptStatusTransitionJob("shell", { collectionId: "a" }, "user-1")).toThrow(
      /Unsupported task type/,
    );
    expect(() =>
      acceptStatusTransitionJob(
        "status-transition",
        { collectionId: "posts", entryId: "e1", targetStatus: "archive" },
        "user-1",
      ),
    ).toThrow(/Unsupported target status/);
    expect(() =>
      acceptStatusTransitionJob(
        "status-transition",
        { collectionId: "posts", entryId: "e1", targetStatus: "publish" },
        "",
      ),
    ).toThrow(/Authentication required/);
  });
});

describe("websocketOriginAllowed", () => {
  it("allows an empty origin and a matching host, and rejects a foreign host", () => {
    expect(websocketOriginAllowed("", "cms.example")).toBe(true);
    expect(websocketOriginAllowed("https://cms.example", "cms.example")).toBe(true);
    expect(websocketOriginAllowed("https://cms.example:443", "cms.example")).toBe(true);
    expect(websocketOriginAllowed("https://evil.example", "cms.example")).toBe(false);
    expect(websocketOriginAllowed("not a url", "cms.example")).toBe(false);
  });
});
