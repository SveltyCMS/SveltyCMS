import type { FieldInstance } from "@src/content/types";

export interface AIEnrichmentProps extends Partial<FieldInstance> {
  /** The field name to use as source for AI enrichment */
  sourceField?: string;
  /** The action to perform: summarize, translate, seo, keywords */
  action: "summarize" | "translate" | "seo" | "keywords" | "custom";
  /** Custom prompt for 'custom' action */
  customPrompt?: string;
  /** Whether to auto-run on source field change */
  autoRun?: boolean;
  /** Widget field label (required by the field-name helper). */
  label: string;

  /** Index signature for WidgetProps compatibility */
  [key: string]: unknown;
}
