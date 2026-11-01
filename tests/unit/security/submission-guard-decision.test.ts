/**
 * @file tests/unit/security/submission-guard-decision.test.ts
 * @description Decision rule for the HTML form double-submit / replay guard.
 *
 * The guard used to trigger on ANY form field named `_id`, and then on a URL
 * `_id` whose value merely looked like a UUIDv7. Both were guesses about a
 * shared field name: `_id` is SveltyCMS's record id (the collection builder
 * posts its collection id as `_id`), so a save reached the token validator with
 * `_id=posts` and died with 400, and any route that ever put a record id in
 * `?_id` would have been throttled.
 *
 * The token is now taken from exactly two explicit channels and nowhere else:
 * the `X-Submission-Guard` header or the `_sub_token` query parameter. `_id` is
 * never read, so the ambiguity is gone by construction instead of by a
 * value-shape check.
 *
 * ### Features:
 * - no token channel -> not engaged (no error, no engagement)
 * - `_id` in the URL, payload-shaped or UUIDv7-shaped -> never engaged
 * - `_sub_token` / `X-Submission-Guard` -> engaged, then format-validated
 * - empty or contradictory tokens -> engaged with no id (fail closed, 400)
 * - replay keys are scoped per tenant+route+token
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUBMISSION_GUARD_HEADER,
  SUBMISSION_TOKEN_PARAM,
  clearSubmissionGuardWarnings,
  decideSubmissionGuard,
  generateSubmissionId,
  isValidSubmissionId,
  submissionReplayKey,
  warnRecordIdWithoutToken,
} from "@utils/security/submission-guard";
import { logger } from "@utils/logger";

const params = (qs = "") => new URLSearchParams(qs);

describe("decideSubmissionGuard — explicit token channels only", () => {
  it("does not engage when no channel carries a token", () => {
    expect(decideSubmissionGuard(params(""))).toEqual({ engaged: false, reason: "no-token" });
    expect(decideSubmissionGuard(params("_id=posts"))).toEqual({
      engaged: false,
      reason: "no-token",
    });
  });

  it("never engages on _id in the URL, even when it is a genuine v7 uuid", () => {
    const id = generateSubmissionId();
    expect(isValidSubmissionId(id)).toBe(true);
    // The old heuristic engaged here. `_id` is a record id, so it must not.
    expect(decideSubmissionGuard(params(`_id=${id}`))).toEqual({
      engaged: false,
      reason: "no-token",
    });
  });

  it("never engages on a payload-shaped _id", () => {
    expect(decideSubmissionGuard(params("_id=AuditNotes")).engaged).toBe(false);
    expect(decideSubmissionGuard(params("_id=audit-notes")).engaged).toBe(false);
    expect(decideSubmissionGuard(params("_id=")).engaged).toBe(false);
  });

  it("does not engage on the retired opt-in marker", () => {
    // `_submission_guard=1` is gone: it never carried a token, so it is not a
    // channel any more.
    expect(decideSubmissionGuard(params("_submission_guard=1")).engaged).toBe(false);
  });

  it("engages on the _sub_token query parameter", () => {
    const id = generateSubmissionId();
    expect(decideSubmissionGuard(params(`${SUBMISSION_TOKEN_PARAM}=${id}`))).toEqual({
      engaged: true,
      submissionId: id,
      reason: "token",
    });
  });

  it("engages on the X-Submission-Guard header", () => {
    const id = generateSubmissionId();
    expect(decideSubmissionGuard(params(""), id)).toEqual({
      engaged: true,
      submissionId: id,
      reason: "token",
    });
    // Absent header (null) is "no token", an empty one is a declared-but-empty token.
    expect(decideSubmissionGuard(params(""), null).engaged).toBe(false);
    expect(decideSubmissionGuard(params(""), "")).toEqual({
      engaged: true,
      submissionId: null,
      reason: "token",
    });
  });

  it("accepts the same token on both channels", () => {
    const id = generateSubmissionId();
    expect(decideSubmissionGuard(params(`${SUBMISSION_TOKEN_PARAM}=${id}`), id)).toEqual({
      engaged: true,
      submissionId: id,
      reason: "token",
    });
  });

  it("fails closed when the two channels disagree", () => {
    const id = generateSubmissionId();
    const other = generateSubmissionId();
    expect(decideSubmissionGuard(params(`${SUBMISSION_TOKEN_PARAM}=${id}`), other)).toEqual({
      engaged: true,
      submissionId: null,
      reason: "conflict",
    });
  });

  it("passes a declared but malformed token through for format rejection", () => {
    expect(decideSubmissionGuard(params(`${SUBMISSION_TOKEN_PARAM}=not-a-uuid`))).toEqual({
      engaged: true,
      submissionId: "not-a-uuid",
      reason: "token",
    });
  });

  it("exposes the channel names the hook reads", () => {
    expect(SUBMISSION_TOKEN_PARAM).toBe("_sub_token");
    expect(SUBMISSION_GUARD_HEADER).toBe("x-submission-guard");
  });
});

describe("submissionReplayKey — per tenant+route scope", () => {
  it("composes tenant, route and token", () => {
    expect(submissionReplayKey("acme", "/login", "tok")).toBe("acme:/login:tok");
  });

  it("falls back to a default tenant in single-tenant mode", () => {
    expect(submissionReplayKey(undefined, "/login", "tok")).toBe("default:/login:tok");
    expect(submissionReplayKey(null, "/login", "tok")).toBe("default:/login:tok");
  });

  it("keeps the same token on two routes in two separate entries", () => {
    expect(submissionReplayKey("acme", "/login", "tok")).not.toBe(
      submissionReplayKey("acme", "/register", "tok"),
    );
    expect(submissionReplayKey("acme", "/login", "tok")).not.toBe(
      submissionReplayKey("other", "/login", "tok"),
    );
  });
});

describe("warnRecordIdWithoutToken", () => {
  beforeEach(() => {
    clearSubmissionGuardWarnings();
    vi.restoreAllMocks();
  });

  it("warns once per route in dev without throwing", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(() => warnRecordIdWithoutToken("/config/collectionbuilder/new")).not.toThrow();
    warnRecordIdWithoutToken("/config/collectionbuilder/new");
    expect(warn).toHaveBeenCalledTimes(1);

    warnRecordIdWithoutToken("/register");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain("_id");
    expect(String(warn.mock.calls[0][0])).toContain("_sub_token");
  });
});
