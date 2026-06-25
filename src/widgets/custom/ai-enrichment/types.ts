export interface AIEnrichmentProps {
  /** The field name to use as source for AI enrichment */
  sourceField?: string;
  /** The action to perform: summarize, translate, seo, keywords */
  action: "summarize" | "translate" | "seo" | "keywords" | "custom";
  /** Custom prompt for 'custom' action */
  customPrompt?: string;
  /** Whether to auto-run on source field change */
  autoRun?: boolean;

  /** Index signature for WidgetProps compatibility */
  [key: string]: unknown;
}
