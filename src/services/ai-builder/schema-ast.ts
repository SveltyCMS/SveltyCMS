/**
 * @file src/services/ai-builder/schema-ast.ts
 * @description TypeScript AST generator for AI-approved collection schemas (Phase 1).
 *
 * Converts a validated {@link CollectionDesignProposal} into a collection
 * source file using the TypeScript compiler API — the same write path as the
 * Collection Builder (`generateCollectionFileWithAST`). Widget factory calls
 * are emitted as `widgets.Name({ ... })` so the compilation pipeline can
 * rewrite them to `globalThis.widgets.*`.
 *
 * ### Features:
 * - TypeScript factory AST (no string-concat widget calls)
 * - identifier-safe widget names only
 * - draft-gated schema (`status: "draft"`) until an editor publishes
 * - full Schema property set used by the Collection Builder write path
 */

import {
  type CallExpression,
  createPrinter,
  type Expression,
  factory,
  NewLineKind,
  NodeFlags,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  SyntaxKind,
} from "typescript";
import { AppError } from "@utils/error-handling";
import type { CollectionDesignProposal, ProposalField } from "./types";

/** Widget factory names must be identifier-safe (`widgets.Input(...)`). */
const WIDGET_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface SchemaAstOptions {
  /** Path shown in the file header (tenant-aware display path). */
  displayPath: string;
  /** Iconify icon. Defaults to `mdi:creation`. */
  icon?: string;
  /** Collection status. Defaults to `draft` (draft-gated approval). */
  status?: string;
}

function stringProp(name: string, value: string): PropertyAssignment {
  return factory.createPropertyAssignment(
    factory.createIdentifier(name),
    factory.createStringLiteral(value),
  );
}

function boolProp(name: string, value: boolean): PropertyAssignment {
  return factory.createPropertyAssignment(
    factory.createIdentifier(name),
    value ? factory.createTrue() : factory.createFalse(),
  );
}

function literalFromUnknown(value: unknown): Expression {
  if (typeof value === "string") return factory.createStringLiteral(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return factory.createNumericLiteral(value);
  }
  if (typeof value === "boolean") {
    return value ? factory.createTrue() : factory.createFalse();
  }
  if (value === null) return factory.createNull();
  if (Array.isArray(value)) {
    return factory.createArrayLiteralExpression(value.map(literalFromUnknown), true);
  }
  if (value && typeof value === "object") {
    const props: ObjectLiteralElementLike[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!WIDGET_NAME_RE.test(k)) continue;
      props.push(
        factory.createPropertyAssignment(factory.createIdentifier(k), literalFromUnknown(v)),
      );
    }
    return factory.createObjectLiteralExpression(props, true);
  }
  return factory.createStringLiteral(String(value));
}

function createFieldConfigLiteral(field: ProposalField): ObjectLiteralExpression {
  const properties: ObjectLiteralElementLike[] = [
    stringProp("db_fieldName", field.name),
    stringProp("label", field.label?.trim() || field.name),
    boolProp("required", field.required === true),
    boolProp("translated", field.translated === true),
  ];
  if (field.type && typeof field.type === "string") {
    properties.push(stringProp("type", field.type));
  }
  if (field.validation && typeof field.validation === "object") {
    for (const [key, value] of Object.entries(field.validation)) {
      if (!WIDGET_NAME_RE.test(key)) continue;
      if (value === undefined) continue;
      properties.push(
        factory.createPropertyAssignment(factory.createIdentifier(key), literalFromUnknown(value)),
      );
    }
  }
  return factory.createObjectLiteralExpression(properties, true);
}

function createWidgetCall(field: ProposalField): CallExpression {
  if (!WIDGET_NAME_RE.test(field.widget)) {
    throw new AppError(
      `Widget name "${field.widget}" is not a valid identifier for schema generation.`,
      400,
      "VALIDATION_FAILED",
      { widget: field.widget },
    );
  }
  return factory.createCallExpression(
    factory.createPropertyAccessExpression(
      factory.createIdentifier("widgets"),
      factory.createIdentifier(field.widget),
    ),
    undefined,
    [createFieldConfigLiteral(field)],
  );
}

function createSchemaObjectLiteral(
  proposal: CollectionDesignProposal,
  options: SchemaAstOptions,
): ObjectLiteralExpression {
  const collectionId = proposal.slug;
  const icon = options.icon?.trim() || "mdi:creation";
  const status = options.status?.trim() || "draft";

  const fieldsExpression = factory.createArrayLiteralExpression(
    proposal.fields.map((field) => createWidgetCall(field)),
    true,
  );

  return factory.createObjectLiteralExpression(
    [
      stringProp("_id", collectionId),
      stringProp("name", proposal.label || proposal.name),
      stringProp("icon", icon),
      stringProp("status", status),
      stringProp("description", proposal.description || ""),
      stringProp("slug", proposal.slug),
      factory.createPropertyAssignment(factory.createIdentifier("fields"), fieldsExpression),
    ],
    true,
  );
}

/**
 * Generate a collection TypeScript source file from a validated proposal.
 *
 * @throws AppError 400 VALIDATION_FAILED when a widget name is not identifier-safe
 */
export function generateCollectionSourceFromProposal(
  proposal: CollectionDesignProposal,
  options: SchemaAstOptions,
): string {
  const header = `/**
 * @file ${options.displayPath}
 * @description Collection file for ${proposal.label || proposal.name}
 *
 * Features:
 * - generated by AI-Assisted Builder (Phase 1)
 * - human-approved before write
 * - draft-gated until published in Collection Builder
 */

import { widgets } from '@widgets/widget-manager.svelte';
import type { Schema } from '@src/content/types';
`;

  const schemaObject = createSchemaObjectLiteral(proposal, options);
  const declaration = factory.createVariableStatement(
    [factory.createModifier(SyntaxKind.ExportKeyword)],
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createIdentifier("schema"),
          undefined,
          factory.createTypeReferenceNode("Schema"),
          schemaObject,
        ),
      ],
      NodeFlags.Const,
    ),
  );

  const sourceFile = factory.createSourceFile(
    [declaration],
    factory.createToken(SyntaxKind.EndOfFileToken),
    NodeFlags.None,
  );

  const printer = createPrinter({
    newLine: NewLineKind.LineFeed,
    removeComments: false,
  });
  const body = printer.printFile(sourceFile);
  return `${header}\n${body}`;
}
