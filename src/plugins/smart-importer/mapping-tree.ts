/**
 * @file src/plugins/smart-importer/mapping-tree.ts
 * @description Converts between wizard field-mapping rows and TransformationTree nodes.
 */

export type MappingNodeAction =
  | "map"
  | "split"
  | "merge"
  | "transform"
  | "enrich"
  | "relink"
  | "filter"
  | "ignore";

export type MappingNodeType =
  | "content_type"
  | "field"
  | "taxonomy"
  | "view"
  | "rule"
  | "ecom_variant";

export interface MappingNode {
  id: string;
  label: string;
  type: MappingNodeType;
  suggestedTarget: string;
  confidence: number;
  action: MappingNodeAction;
  children?: MappingNode[];
  aiSuggestion?: {
    level: "critical" | "warning" | "info" | "success";
    message: string;
  };
  sampleValue?: string;
  selected?: boolean;
  open?: boolean;
}

export interface WizardFieldMapping {
  source: string;
  target: string;
  confidence: number;
  type: string;
  action?: string;
}

function widgetTypeToNodeType(widgetType: string): MappingNodeType {
  if (widgetType === "taxonomy") return "taxonomy";
  if (widgetType === "relation") return "view";
  return "field";
}

/** Build TransformationTree nodes from flat wizard mapping rows */
export function fieldMappingsToNodes(mappings: WizardFieldMapping[]): MappingNode[] {
  return mappings.map((m, index) => ({
    id: `field-${index}-${m.source}`,
    label: m.source,
    type: widgetTypeToNodeType(m.type),
    suggestedTarget: m.target,
    confidence: m.confidence,
    action: (m.action as MappingNodeAction) || "map",
    open: true,
  }));
}

export function flattenMappingNodes(tree: MappingNode[]): MappingNode[] {
  const result: MappingNode[] = [];
  for (const node of tree) {
    result.push(node);
    if (node.children?.length) result.push(...flattenMappingNodes(node.children));
  }
  return result;
}

/** Sync tree node edits back into wizard mapping rows */
export function nodesToFieldMappings(
  nodes: MappingNode[],
  previous: WizardFieldMapping[] = [],
): WizardFieldMapping[] {
  const prevBySource = new Map(previous.map((m) => [m.source, m]));
  return flattenMappingNodes(nodes).map((node) => {
    const prev = prevBySource.get(node.label);
    return {
      source: node.label,
      target: node.suggestedTarget,
      confidence: node.confidence,
      type: prev?.type || "text",
      action: node.action,
    };
  });
}
