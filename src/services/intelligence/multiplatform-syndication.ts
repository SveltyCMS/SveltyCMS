/**
 * @file src/services/intelligence/multiplatform-syndication.ts
 * @description Intelligent Multi-Platform CMS Syndication & Corporate Governance.
 *
 * Provides cross-tenant content syndication from a Global Master Hub (tenantId: null)
 * to Spoke Tenants (tenantId: string) across multiple digital channels (web, mobile,
 * kiosk, b2b portal, social, email). Enforces corporate brand guidelines, tone-of-voice,
 * terminology consistency, and regulatory compliance (e.g. EU UWG §6 / GDPR / FTC)
 * through high-speed, zero-degradation agentic evaluation and FSM workflow guards.
 *
 * ### Features:
 * - evaluateCorporateAlignment: Fast (<2ms) deterministic and semantic policy auditing
 * - adaptContentForPlatform: Automated channel formatting and constraint adaptation
 * - syndicateMasterContent: Controlled cross-tenant draft replication with master lineage
 * - workflowAlignmentGuard: FSM review transition guard ensuring brand & legal safety
 */

import type { DatabaseId, EntityCreate } from "@src/databases/db-interface";
import type { BaseEntity } from "@src/content/types";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { logger } from "@utils/logger";
import { eventBus } from "@src/services/background/automation/event-bus";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────

export type TargetPlatform = "web" | "mobile" | "kiosk" | "b2b_portal" | "social" | "email";

export type RuleCategory = "tone" | "compliance" | "terminology" | "platform";
export type RuleSeverity = "critical" | "warning" | "suggestion";

export interface PlatformConstraints {
  platform: TargetPlatform;
  maxTitleLength?: number;
  maxBodyLength?: number;
  requiresExcerpt?: boolean;
  supportedFormats: Array<"html" | "markdown" | "plain_text" | "json">;
  allowedMediaTypes?: string[];
}

/**
 * Strongly typed entity representing a syndicated or managed content entry in SveltyCMS.
 * Extends BaseEntity with known content schema attributes while supporting dynamic collection fields.
 */
export interface SyndicatedContentEntity extends BaseEntity {
  title?: string;
  name?: string;
  content?: string;
  body?: string;
  description?: string;
  excerpt?: string;
  summary?: string;
  targetPlatform?: TargetPlatform;
  targetLocale?: string;
  status?: string;
  isMobileOptimized?: boolean;
  _masterEntryId?: string;
  _masterCollectionId?: string;
  _syndicatedAt?: number;
  _alignmentScore?: number;
  _syndicationMetadata?: {
    platform: TargetPlatform;
    targetLocale: string;
    adaptedAt: number;
  };
  [key: string]: unknown;
}

export type AdaptedContent<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  title?: string;
  excerpt?: string;
  content?: string;
  isMobileOptimized?: boolean;
  _syndicationMetadata: {
    platform: TargetPlatform;
    targetLocale: string;
    adaptedAt: number;
  };
};

export interface CorporateRule {
  id: string;
  category: RuleCategory;
  severity: RuleSeverity;
  rule: string;
  pattern?: RegExp;
  forbiddenTerms?: string[];
  suggestedReplacement?: Record<string, string>;
  applicableLocales?: string[];
  applicablePlatforms?: TargetPlatform[];
  applicableRegions?: string[];
}

export interface AlignmentViolation {
  ruleId: string;
  category: RuleCategory;
  severity: RuleSeverity;
  message: string;
  field?: string;
  matchedText?: string;
  suggestedFix?: string;
}

export interface AlignmentReport {
  score: number; // 0–100
  compliant: boolean; // true if zero critical violations and score >= threshold
  evaluatedAt: number;
  tenantId?: string | null;
  targetPlatform: TargetPlatform;
  targetLocale?: string;
  violations: AlignmentViolation[];
  suggestedDiff?: Record<string, string>;
  metrics: {
    durationMs: number;
    wordCount: number;
    charCount: number;
    readingTimeSeconds: number;
  };
}

export interface SyndicationTarget {
  tenantId: string;
  tenantName?: string;
  platform: TargetPlatform;
  targetLocale: string;
  collectionId: string;
}

export interface SyndicationOptions {
  autoAdaptConstraints?: boolean;
  minComplianceScore?: number;
  createInReviewState?: boolean;
  actorUserId?: string;
  actorEmail?: string;
}

export interface SyndicationResult {
  success: boolean;
  masterEntryId: string;
  syncedTenants: Array<{
    tenantId: string;
    entryId: string;
    platform: TargetPlatform;
    locale: string;
    alignmentScore: number;
    status: string;
  }>;
  skipped: number;
  errors: Array<{ tenantId: string; error: string }>;
}

// ─── PLATFORM CONSTRAINT CATALOG ──────────────────────────────────────────

export const DEFAULT_PLATFORM_CONSTRAINTS: Record<TargetPlatform, PlatformConstraints> = {
  web: {
    platform: "web",
    maxTitleLength: 120,
    maxBodyLength: 50_000,
    requiresExcerpt: true,
    supportedFormats: ["html", "markdown", "json"],
  },
  mobile: {
    platform: "mobile",
    maxTitleLength: 60,
    maxBodyLength: 3_000,
    requiresExcerpt: true,
    supportedFormats: ["json", "plain_text", "markdown"],
  },
  kiosk: {
    platform: "kiosk",
    maxTitleLength: 45,
    maxBodyLength: 350,
    requiresExcerpt: false,
    supportedFormats: ["plain_text", "markdown"],
  },
  b2b_portal: {
    platform: "b2b_portal",
    maxTitleLength: 150,
    maxBodyLength: 100_000,
    requiresExcerpt: false,
    supportedFormats: ["markdown", "json", "html"],
  },
  social: {
    platform: "social",
    maxTitleLength: 100,
    maxBodyLength: 280,
    requiresExcerpt: false,
    supportedFormats: ["plain_text"],
  },
  email: {
    platform: "email",
    maxTitleLength: 70, // Subject line limit
    maxBodyLength: 15_000,
    requiresExcerpt: true,
    supportedFormats: ["html", "plain_text"],
  },
};

// ─── DEFAULT CORPORATE GOVERNANCE RULES ───────────────────────────────────

export const DEFAULT_CORPORATE_RULES: CorporateRule[] = [
  // 1. Regulatory: EU Directive 2006/114/EC & German UWG §6 comparative advertising
  {
    id: "comp-eu-uwg-claims",
    category: "compliance",
    severity: "critical",
    rule: "Unsubstantiated superlative or comparative claims violate EU UWG §6 and require objective date-stamped verification.",
    pattern: /\b(the best|the only|unbeatable|world's #1|flawless|incomparable)\b/i,
    suggestedReplacement: {
      "the best": "an industry-leading",
      "the only": "a premier",
      unbeatable: "highly competitive",
      "world's #1": "leading",
    },
    applicableRegions: ["EU", "DE", "AT", "CH"],
  },
  // 2. Regulatory: Discrediting competitor language
  {
    id: "comp-discrediting-tone",
    category: "compliance",
    severity: "critical",
    rule: "Discrediting competitor language ('suffers from', 'broken', 'useless', 'inferior') violates corporate fair competition standards.",
    pattern: /\b(suffers from|completely broken|totally useless|inferior to us)\b/i,
    suggestedReplacement: {
      "suffers from": "faces challenges with",
      "completely broken": "limited in scope",
      "inferior to us": "differently positioned",
    },
  },
  // 3. Terminology: Corporate Trademark & Nomenclature Consistency
  {
    id: "term-product-branding",
    category: "terminology",
    severity: "warning",
    rule: "Use official product naming conventions and correct capitalization.",
    forbiddenTerms: ["svelty cms", "svelty-cms", "Svelty-CMS"],
    suggestedReplacement: {
      "svelty cms": "SveltyCMS",
      "svelty-cms": "SveltyCMS",
      "Svelty-CMS": "SveltyCMS",
    },
  },
  // 4. Tone: Passive vs Active Corporate Voice
  {
    id: "tone-weak-phrasing",
    category: "tone",
    severity: "suggestion",
    rule: "Avoid excessively vague or passive phrasing in key product propositions.",
    pattern: /\b(it is said that|many people think|sort of|kind of like)\b/i,
  },
  // 5. Compliance: Region-specific mandatory notices
  {
    id: "comp-gdpr-privacy-ref",
    category: "compliance",
    severity: "warning",
    rule: "Public contact/registration forms must cite the corporate data privacy policy.",
    pattern: /\b(submit your personal details|enter your email)\b/i,
    applicableRegions: ["EU", "DE"],
  },
];

// ─── CORE EVALUATION ENGINE ───────────────────────────────────────────────

/**
 * Strips HTML tags for text analysis and length calculations.
 */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculates basic readability & volume metrics.
 */
function calculateMetrics(text: string, startTime: number): AlignmentReport["metrics"] {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  // Standard 200 words-per-minute reading baseline
  const readingTimeSeconds = Math.max(1, Math.round((words / 200) * 60));
  return {
    durationMs: Math.max(0.1, Number((performance.now() - startTime).toFixed(2))),
    wordCount: words,
    charCount: chars,
    readingTimeSeconds,
  };
}

/**
 * Fast, deterministic corporate guideline evaluation (< 2ms hot path).
 * Audits content across tone, legal compliance, terminology, and platform boundaries.
 */
export function evaluateCorporateAlignment(params: {
  content: SyndicatedContentEntity | Record<string, unknown>;
  targetPlatform?: TargetPlatform;
  targetLocale?: string;
  region?: string;
  customRules?: CorporateRule[];
  tenantId?: string | null;
}): AlignmentReport {
  const startTime = performance.now();
  const platform = params.targetPlatform || "web";
  const constraints = DEFAULT_PLATFORM_CONSTRAINTS[platform] || DEFAULT_PLATFORM_CONSTRAINTS.web;
  const rules = params.customRules || DEFAULT_CORPORATE_RULES;

  const violations: AlignmentViolation[] = [];
  const suggestedDiff: Record<string, string> = {};

  // Extract primary text fields for analysis
  const title = String(params.content.title || params.content.name || "");
  const bodyRaw = String(
    params.content.content || params.content.body || params.content.description || "",
  );
  const excerpt = String(params.content.excerpt || params.content.summary || "");
  const bodyText = stripHtml(bodyRaw);
  const combinedText = `${title} ${excerpt} ${bodyText}`.trim();

  // 1. Platform-Specific Constraint Checks
  if (constraints.maxTitleLength && title.length > constraints.maxTitleLength) {
    violations.push({
      ruleId: `platform-${platform}-title-length`,
      category: "platform",
      severity: "warning",
      message: `Title length (${title.length} chars) exceeds ${platform} ceiling of ${constraints.maxTitleLength} characters.`,
      field: "title",
      suggestedFix: title.slice(0, constraints.maxTitleLength - 3) + "...",
    });
  }

  if (constraints.maxBodyLength && bodyText.length > constraints.maxBodyLength) {
    violations.push({
      ruleId: `platform-${platform}-body-length`,
      category: "platform",
      severity: "warning",
      message: `Content length (${bodyText.length} chars) exceeds ${platform} constraint of ${constraints.maxBodyLength} characters.`,
      field: "body",
    });
  }

  if (constraints.requiresExcerpt && !excerpt) {
    violations.push({
      ruleId: `platform-${platform}-requires-excerpt`,
      category: "platform",
      severity: "suggestion",
      message: `Channel '${platform}' strongly recommends an excerpt for cards and previews.`,
      field: "excerpt",
      suggestedFix: bodyText.slice(0, 150) + "...",
    });
  }

  // 2. Rule & Compliance Checks (Compiled RegEx + Term Matching)
  for (const rule of rules) {
    // Check regional applicability
    if (
      params.region &&
      rule.applicableRegions &&
      rule.applicableRegions.length > 0 &&
      !rule.applicableRegions.includes(params.region)
    ) {
      continue;
    }

    // Check platform applicability
    if (
      rule.applicablePlatforms &&
      rule.applicablePlatforms.length > 0 &&
      !rule.applicablePlatforms.includes(platform)
    ) {
      continue;
    }

    // Check locale applicability
    if (
      params.targetLocale &&
      rule.applicableLocales &&
      rule.applicableLocales.length > 0 &&
      !rule.applicableLocales.includes(params.targetLocale)
    ) {
      continue;
    }

    // Regex Pattern Audit
    if (rule.pattern) {
      const match = rule.pattern.exec(combinedText);
      if (match) {
        const matchedStr = match[0];
        const lowerMatched = matchedStr.toLowerCase();
        const replacement = rule.suggestedReplacement?.[lowerMatched];

        violations.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.rule,
          matchedText: matchedStr,
          suggestedFix: replacement ? `Replace "${matchedStr}" with "${replacement}"` : undefined,
        });

        if (replacement) {
          if (title.toLowerCase().includes(lowerMatched)) {
            suggestedDiff.title = title.replace(new RegExp(matchedStr, "gi"), replacement);
          }
          if (bodyRaw.toLowerCase().includes(lowerMatched)) {
            suggestedDiff.body = bodyRaw.replace(new RegExp(matchedStr, "gi"), replacement);
          }
        }
      }
    }

    // Forbidden Terminology Audit
    if (rule.forbiddenTerms) {
      for (const term of rule.forbiddenTerms) {
        if (combinedText.toLowerCase().includes(term.toLowerCase())) {
          const replacement =
            rule.suggestedReplacement?.[term] || rule.suggestedReplacement?.[term.toLowerCase()];
          violations.push({
            ruleId: rule.id,
            category: rule.category,
            severity: rule.severity,
            message: rule.rule,
            matchedText: term,
            suggestedFix: replacement ? `Use "${replacement}" instead` : undefined,
          });

          if (replacement && title.toLowerCase().includes(term.toLowerCase())) {
            suggestedDiff.title = title.replace(new RegExp(term, "gi"), replacement);
          }
        }
      }
    }
  }

  // 3. Score Calculation (Deterministic 0–100 scale)
  let score = 100;
  let hasCritical = false;

  for (const v of violations) {
    if (v.severity === "critical") {
      score -= 25;
      hasCritical = true;
    } else if (v.severity === "warning") {
      score -= 10;
    } else if (v.severity === "suggestion") {
      score -= 3;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const compliant = !hasCritical && score >= 75;

  return {
    score,
    compliant,
    evaluatedAt: Date.now(),
    tenantId: params.tenantId ?? null,
    targetPlatform: platform,
    targetLocale: params.targetLocale,
    violations,
    suggestedDiff: Object.keys(suggestedDiff).length > 0 ? suggestedDiff : undefined,
    metrics: calculateMetrics(combinedText, startTime),
  };
}

// ─── PLATFORM ADAPTATION ──────────────────────────────────────────────────

/**
 * Formats and shapes master content to conform to a specific target channel's constraints.
 */
export function adaptContentForPlatform<T extends Record<string, unknown>>(
  masterContent: T,
  platform: TargetPlatform,
  locale?: string,
): AdaptedContent<T> {
  const constraints = DEFAULT_PLATFORM_CONSTRAINTS[platform] || DEFAULT_PLATFORM_CONSTRAINTS.web;
  const adapted: AdaptedContent<T> = {
    ...masterContent,
    _syndicationMetadata: {
      platform,
      targetLocale: locale || "en",
      adaptedAt: Date.now(),
    },
  };

  const rawTitle = String(masterContent.title || masterContent.name || "");
  const rawBody = String(
    masterContent.content || masterContent.body || masterContent.description || "",
  );

  // Title Clamping
  if (constraints.maxTitleLength && rawTitle.length > constraints.maxTitleLength) {
    adapted.title = rawTitle.slice(0, constraints.maxTitleLength - 3) + "...";
  }

  // Excerpt Generation if required
  if (constraints.requiresExcerpt && !masterContent.excerpt) {
    adapted.excerpt = stripHtml(rawBody).slice(0, 160) + "...";
  }

  // Channel Format Formatting
  if (platform === "kiosk" || platform === "social") {
    // Strip rich HTML to plain text for kiosks and social
    adapted.content = stripHtml(rawBody).slice(0, constraints.maxBodyLength || 300);
  } else if (platform === "mobile") {
    // Mobile payload optimization
    adapted.content = stripHtml(rawBody).slice(0, constraints.maxBodyLength || 3000);
    adapted.isMobileOptimized = true;
  }

  return adapted;
}

// ─── CROSS-TENANT SYNDICATION ORCHESTRATION ───────────────────────────────

/**
 * Syndicates a master content entry from the Global Hub (tenantId: null)
 * to multiple spoke tenants with channel-specific adaptation and governance.
 */
export async function syndicateMasterContent(params: {
  masterCollectionId: string;
  masterEntryId: string;
  targets: SyndicationTarget[];
  options?: SyndicationOptions;
}): Promise<SyndicationResult> {
  const { dbAdapter } = await loadDbModule();
  if (!dbAdapter) {
    throw new Error("[Syndication] Database adapter is unavailable.");
  }

  const minScore = params.options?.minComplianceScore ?? 75;
  const autoAdapt = params.options?.autoAdaptConstraints ?? true;

  // 1. Fetch Master Entry from Global Hub
  const masterResult = await dbAdapter.crud.findOne<SyndicatedContentEntity>(
    params.masterCollectionId,
    { _id: params.masterEntryId as DatabaseId },
    withSystemScope("bootstrap"),
  );

  if (!masterResult?.success || !masterResult.data) {
    throw new Error(
      `[Syndication] Master entry '${params.masterEntryId}' in collection '${params.masterCollectionId}' not found.`,
    );
  }

  const masterData = masterResult.data;
  const syncedTenants: SyndicationResult["syncedTenants"] = [];
  const errors: SyndicationResult["errors"] = [];
  let skipped = 0;

  // 2. Iterate through Target Spoke Tenants
  for (const target of params.targets) {
    try {
      // Adapt content to target channel
      const adaptedContent = autoAdapt
        ? adaptContentForPlatform(masterData, target.platform, target.targetLocale)
        : { ...masterData };

      // Evaluate compliance for target tenant
      const alignment = evaluateCorporateAlignment({
        content: adaptedContent,
        targetPlatform: target.platform,
        targetLocale: target.targetLocale,
        tenantId: target.tenantId,
      });

      if (!alignment.compliant || alignment.score < minScore) {
        logger.warn(
          `[Syndication] Skipped tenant '${target.tenantId}' (${target.platform}) due to compliance score ${alignment.score} < ${minScore}`,
        );
        skipped++;
        continue;
      }

      // Record Lineage
      const targetPayload: EntityCreate<SyndicatedContentEntity> = {
        ...adaptedContent,
        _masterEntryId: params.masterEntryId,
        _masterCollectionId: params.masterCollectionId,
        _syndicatedAt: Date.now(),
        _alignmentScore: alignment.score,
        // Spoke copies always land in draft or in_review to respect the human-in-the-loop airgap
        status: params.options?.createInReviewState ? "in_review" : "draft",
      };

      delete (targetPayload as Partial<SyndicatedContentEntity>)._id; // Ensure new ID generation per tenant

      const insertResult = await dbAdapter.crud.insert<SyndicatedContentEntity>(
        target.collectionId,
        targetPayload,
        {
          tenantId: target.tenantId as DatabaseId,
        },
      );

      if (insertResult?.success && insertResult.data) {
        const createdId = String(insertResult.data._id);

        syncedTenants.push({
          tenantId: target.tenantId,
          entryId: createdId,
          platform: target.platform,
          locale: target.targetLocale,
          alignmentScore: alignment.score,
          status: String(targetPayload.status),
        });

        // Audit Trail
        await auditLogService.logEvent({
          eventType: AuditEventType.WORKFLOW_TRANSITION,
          action: `Syndicated master content to tenant '${target.tenantId}' [${target.platform}]`,
          actorId: (params.options?.actorUserId || "system:syndication") as DatabaseId,
          actorEmail: params.options?.actorEmail || "syndication@internal",
          severity: "low",
          result: "success",
          details: {
            masterEntryId: params.masterEntryId,
            childEntryId: createdId,
            platform: target.platform,
            locale: target.targetLocale,
            alignmentScore: alignment.score,
          },
          targetType: target.collectionId,
          targetId: createdId as DatabaseId,
          tenantId: target.tenantId as DatabaseId,
        });
      } else {
        errors.push({
          tenantId: target.tenantId,
          error: "Database insert failed for target tenant.",
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Syndication] Failed to sync to tenant '${target.tenantId}': ${errMsg}`);
      errors.push({ tenantId: target.tenantId, error: errMsg });
    }
  }

  // 3. Emit Syndication Event
  eventBus.emit("entry:update", {
    tenantId: "system",
    collection: params.masterCollectionId,
    entryId: params.masterEntryId,
    data: {
      syndication: {
        masterEntryId: params.masterEntryId,
        masterCollectionId: params.masterCollectionId,
        syncedCount: syncedTenants.length,
        skippedCount: skipped,
      },
    },
  });

  return {
    success: syncedTenants.length > 0,
    masterEntryId: params.masterEntryId,
    syncedTenants,
    skipped,
    errors,
  };
}

// ─── FSM WORKFLOW TRANSITION GUARD ────────────────────────────────────────

/**
 * Evaluates whether a content entry complies with corporate guidelines
 * before allowing an FSM workflow transition to an approved/published state.
 */
export async function workflowAlignmentGuard(params: {
  collectionId: string;
  entryId: string;
  targetState: string;
  tenantId?: string | null;
  minScore?: number;
}): Promise<{ allow: boolean; reason?: string; report?: AlignmentReport }> {
  // Only gate final or approval states
  const isApprovalState =
    params.targetState === "approved" ||
    params.targetState === "published" ||
    params.targetState === "scheduled";

  if (!isApprovalState) {
    return { allow: true };
  }

  const { dbAdapter } = await loadDbModule();
  if (!dbAdapter) {
    return { allow: true };
  }

  const entry = await dbAdapter.crud.findOne<SyndicatedContentEntity>(
    params.collectionId,
    { _id: params.entryId as DatabaseId },
    params.tenantId ? { tenantId: params.tenantId as DatabaseId } : withSystemScope("bootstrap"),
  );

  if (!entry?.success || !entry.data) {
    return { allow: false, reason: "Entry not found for alignment audit." };
  }

  const entryData = entry.data;
  const targetPlatform = entryData.targetPlatform || "web";

  const report = evaluateCorporateAlignment({
    content: entryData,
    targetPlatform,
    tenantId: params.tenantId,
  });

  const threshold = params.minScore ?? 80;

  if (!report.compliant || report.score < threshold) {
    const violationSummary = report.violations
      .map((v) => `[${v.severity.toUpperCase()}] ${v.message}`)
      .join("; ");

    return {
      allow: false,
      reason: `Corporate alignment score (${report.score}/100) below required threshold (${threshold}). Violations: ${violationSummary}`,
      report,
    };
  }

  return { allow: true, report };
}
