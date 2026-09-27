/**
 * @file src/services/ai-builder/validator.ts
 * @description Structured-output validation for AI-generated collection proposals.
 *
 * Every proposal returned by a model backend is untrusted input. This module
 * validates the shape and content of proposals with Valibot and rejects
 * anything that would corrupt collection schemas (reserved field names,
 * invalid slugs, duplicate names, unknown widgets).
 *
 * ### Features:
 * - Valibot schema validation with actionable error messages
 * - reserved system field-name blocking
 * - field-name and slug convention enforcement
 * - widget registry awareness via {@link validateAgainstRegistry}
 */

import {
  array,
  boolean,
  check,
  minLength,
  object,
  optional,
  pipe,
  record,
  regex,
  safeParse,
  string,
  unknown,
} from "valibot";
import { AppError } from "@utils/error-handling";
import type { CollectionDesignProposal } from "./types";

/**
 * System-managed field names that the AI must never propose.
 * Removing these from a proposal would break multi-tenancy, publishing,
 * audit trails and content integrity.
 */
export const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  "_id",
  "tenantId",
  "status",
  "isDeleted",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
]);

/** camelCase db_fieldName convention: starts lowercase, alphanumeric + underscore. */
export const FIELD_NAME_REGEX = /^[a-z][a-zA-Z0-9_]*$/;

/** Product slug convention: lowercase letters, digits and hyphens only. */
export const SLUG_REGEX = /^[a-z0-9-]+$/;

const proposalFieldSchema = pipe(
  object({
    name: pipe(string(), minLength(1, "field name must not be empty")),
    label: optional(string()),
    widget: pipe(string(), minLength(1, "widget must not be empty")),
    type: optional(string()),
    required: optional(boolean()),
    translated: optional(boolean()),
    validation: optional(record(string(), unknown())),
  }),
  check(
    (field) => FIELD_NAME_REGEX.test(field.name),
    `field name must match ${FIELD_NAME_REGEX.toString()}`,
  ),
  check(
    (field) => !RESERVED_FIELD_NAMES.has(field.name),
    `field name is reserved for system use (${[...RESERVED_FIELD_NAMES].join(", ")})`,
  ),
);

const collectionDesignProposalSchema = object({
  name: pipe(string(), minLength(1, "collection name must not be empty")),
  slug: pipe(string(), regex(SLUG_REGEX, `slug must match ${SLUG_REGEX.toString()}`)),
  label: pipe(string(), minLength(1, "label must not be empty")),
  description: optional(string()),
  fields: pipe(
    array(proposalFieldSchema),
    minLength(1, "at least one field is required"),
    check(
      (fields) => new Set(fields.map((field) => field.name)).size === fields.length,
      "field names must be unique",
    ),
  ),
  rationale: optional(array(string())),
});

/**
 * Validate raw (untrusted) model output as a {@link CollectionDesignProposal}.
 *
 * @throws AppError 400 "AI_OUTPUT_INVALID" with an actionable message when the
 *         output does not satisfy the proposal contract.
 */
export function validateProposal(raw: unknown): CollectionDesignProposal {
  const result = safeParse(collectionDesignProposalSchema, raw);
  if (!result.success) {
    const issues = result.issues.map((issue) => issue.message).join("; ");
    throw new AppError(
      `The AI returned an invalid collection design proposal: ${issues}`,
      400,
      "AI_OUTPUT_INVALID",
      { issues: result.issues.map((issue) => issue.message) },
    );
  }
  return result.output;
}

/**
 * Ensure every widget referenced by a proposal exists in the widget registry.
 *
 * @throws AppError 400 "VALIDATION_FAILED" listing the unknown widget names.
 */
export function validateAgainstRegistry(
  proposal: CollectionDesignProposal,
  getWidget: (name: string) => unknown,
): void {
  const unknownWidgets = [
    ...new Set(proposal.fields.filter((field) => !getWidget(field.widget)).map((f) => f.widget)),
  ];

  if (unknownWidgets.length > 0) {
    throw new AppError(
      `The AI proposal references unknown widget(s): ${unknownWidgets
        .map((widget) => `"${widget}"`)
        .join(", ")}. Ensure the widget is installed and active in the widget registry.`,
      400,
      "VALIDATION_FAILED",
      { widgets: unknownWidgets },
    );
  }
}
