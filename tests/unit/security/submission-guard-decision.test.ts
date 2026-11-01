/**
 * @file tests/unit/security/submission-guard-decision.test.ts
 * @description Decision rule for the HTML form double-submit / replay guard.
 *
 * The guard used to trigger on ANY form field named `_id`. That is the field
 * name SveltyCMS uses for a record id: the collection builder posts its
 * collection id as `_id` and `saveCollection` reads it back with
 * `formData.get("_id")`. A save therefore reached the token validator with
 * `_id=posts` and died with 400 "Invalid form submission token format".
 *
 * The decision is now taken from the request URL (
 * `?_id=<v7-uuid>`) plus an explicit opt-in marker, never from the body, so a
 * payload `_id` can never be mistaken for a token and no body is parsed to
 * find out.
 *
 * ### Features:
 * - payload `_id` (collection id / name) -> not engaged
 * - genuine v7 token in the URL -> engaged
 * - malformed token -> engaged (400) only for opted-in requests
 * - opted in without a token -> engaged with no id (fail closed)
 */

import { describe, expect, it } from "vitest";
import {
  SUBMISSION_GUARD_HEADER,
  SUBMISSION_GUARD_MARKER,
  decideSubmissionGuard,
  generateSubmissionId,
  isSubmissionGuardOptedIn,
  isValidSubmissionId,
} from "@utils/security/submission-guard";

const params = (qs = "") => new URLSearchParams(qs);

describe("decideSubmissionGuard — token vs ordinary _id", () => {
  it("does not engage for a payload _id (collection builder save)", () => {
    expect(decideSubmissionGuard(params("_id=posts"))).toEqual({
      engaged: false,
      reason: "ordinary-id",
    });
  });

  it("does not engage for a new collection name used as _id", () => {
    expect(decideSubmissionGuard(params("_id=AuditNotes")).engaged).toBe(false);
  });

  it("does not engage for an empty or hyphenated slug _id", () => {
    expect(decideSubmissionGuard(params("_id=audit-notes")).engaged).toBe(false);
    expect(decideSubmissionGuard(params("_id=")).engaged).toBe(false);
  });

  it("does not engage when no _id is present", () => {
    expect(decideSubmissionGuard(params(""))).toEqual({
      engaged: false,
      reason: "no-candidate",
    });
  });

  it("engages when the URL carries a genuine v7 submission token", () => {
    const id = generateSubmissionId();
    expect(decideSubmissionGuard(params(`_id=${id}`))).toEqual({
      engaged: true,
      submissionId: id,
    });
  });

  it("engages for a malformed token only when the request opts in", () => {
    expect(decideSubmissionGuard(params("_id=not-a-uuid"), true)).toEqual({
      engaged: true,
      submissionId: "not-a-uuid",
    });
  });

  it("fails closed when opted in without any token", () => {
    expect(decideSubmissionGuard(params(""), true)).toEqual({
      engaged: true,
      submissionId: null,
    });
  });

  it("does not mistake a UUID v4 for a submission token", () => {
    // v4 has version nibble 4, not 7: ordinary payload, not a token.
    const v4 = "018f4f8e-7b3a-4c2b-8d4e-1234567890ab";
    expect(isValidSubmissionId(v4)).toBe(false);
    expect(decideSubmissionGuard(params(`_id=${v4}`)).engaged).toBe(false);
  });
});

describe("isSubmissionGuardOptedIn", () => {
  it("accepts the query marker and the header, nothing else", () => {
    expect(isSubmissionGuardOptedIn(params(`${SUBMISSION_GUARD_MARKER}=1`), null)).toBe(true);
    expect(isSubmissionGuardOptedIn(params(""), "1")).toBe(true);
    expect(isSubmissionGuardOptedIn(params(""), null)).toBe(false);
    expect(isSubmissionGuardOptedIn(params(`${SUBMISSION_GUARD_MARKER}=0`), "0")).toBe(false);
    expect(isSubmissionGuardOptedIn(params("_id=posts"), "")).toBe(false);
  });

  it("exposes the marker names the hook reads", () => {
    expect(SUBMISSION_GUARD_MARKER).toBe("_submission_guard");
    expect(SUBMISSION_GUARD_HEADER).toBe("x-submission-guard");
  });
});
