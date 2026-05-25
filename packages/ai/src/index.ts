/**
 * @file packages/ai/src/index.ts
 * @description Barrel export for @sveltycms/ai — AI Co-Pilot services.
 *
 * Re-exports the AIService singleton and all AI-powered methods:
 * - suggestFields() — Schema-aware field type suggestions
 * - scoreContent() — Content quality scoring (SEO, readability)
 * - enrichText() — AI text enrichment
 * - generateLayoutSpec() — Generative UI layout specs
 * - suggestMapping() — Smart import field mapping
 * - translateContent() — AI-powered translation
 * - generateTags() — AI image tagging
 */

export { AIService, aiService } from "../../../src/services/core/ai-service";

export type { KnowledgeResult } from "../../../src/services/core/ai-service";
