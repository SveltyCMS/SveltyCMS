/**
 * @file tests/unit/services/intelligence/multiplatform-syndication.test.ts
 * @description Unit tests for Multi-Platform Syndication and Corporate Governance.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateCorporateAlignment,
  adaptContentForPlatform,
  DEFAULT_PLATFORM_CONSTRAINTS,
  workflowAlignmentGuard,
} from "@src/services/intelligence/multiplatform-syndication";

describe("Multi-Platform Corporate Governance Engine", () => {
  describe("evaluateCorporateAlignment", () => {
    it("approves clean, compliant content with 100 score", () => {
      const cleanContent = {
        title: "Modern Content Management with Headless Architecture",
        content:
          "<p>SveltyCMS provides high-performance data storage and visual editing capabilities.</p>",
        excerpt: "An overview of headless architecture with SveltyCMS.",
      };

      const report = evaluateCorporateAlignment({
        content: cleanContent,
        targetPlatform: "web",
        targetLocale: "en",
      });

      expect(report.compliant).toBe(true);
      expect(report.score).toBe(100);
      expect(report.violations).toHaveLength(0);
      expect(report.metrics.durationMs).toBeLessThan(15); // Fast execution
    });

    it("flags EU UWG §6 superlative claims and suggests compliant replacements", () => {
      const nonCompliantContent = {
        title: "Our Product is the best in the market",
        content: "<p>We offer the only solution that guarantees results.</p>",
        excerpt: "Why we are the best choice.",
      };

      const report = evaluateCorporateAlignment({
        content: nonCompliantContent,
        targetPlatform: "web",
        region: "EU",
      });

      expect(report.compliant).toBe(false);
      expect(report.score).toBeLessThanOrEqual(75);
      expect(report.violations.some((v) => v.ruleId === "comp-eu-uwg-claims")).toBe(true);
      expect(report.suggestedDiff?.title).toContain("industry-leading");
    });

    it("flags discrediting competitor language", () => {
      const discreditingContent = {
        title: "Why Competitor X suffers from severe issues",
        content: "<p>Their software is completely broken and unusable.</p>",
        excerpt: "Competitor analysis.",
      };

      const report = evaluateCorporateAlignment({
        content: discreditingContent,
        targetPlatform: "web",
      });

      expect(report.compliant).toBe(false);
      expect(report.violations.some((v) => v.ruleId === "comp-discrediting-tone")).toBe(true);
    });

    it("enforces brand terminology capitalization", () => {
      const content = {
        title: "Getting Started with svelty cms",
        content: "<p>A comprehensive guide to svelty-cms installation.</p>",
        excerpt: "Guide to SveltyCMS.",
      };

      const report = evaluateCorporateAlignment({
        content,
        targetPlatform: "web",
      });

      expect(report.violations.some((v) => v.ruleId === "term-product-branding")).toBe(true);
      expect(report.suggestedDiff?.title).toBe("Getting Started with SveltyCMS");
    });

    it("enforces channel-specific platform constraints (mobile title limit)", () => {
      const mobileContent = {
        title:
          "This is an extremely long title designed to exceed the sixty character mobile ceiling",
        content: "Short mobile body content.",
        excerpt: "Short mobile excerpt.",
      };

      const report = evaluateCorporateAlignment({
        content: mobileContent,
        targetPlatform: "mobile",
      });

      const titleViolation = report.violations.find(
        (v) => v.ruleId === "platform-mobile-title-length",
      );
      expect(titleViolation).toBeDefined();
      expect(titleViolation?.category).toBe("platform");
    });

    it("enforces kiosk body length limit and suggests excerpt when missing", () => {
      const kioskContent = {
        title: "Kiosk Welcome",
        content: "A".repeat(500), // Exceeds 350 char ceiling
      };

      const report = evaluateCorporateAlignment({
        content: kioskContent,
        targetPlatform: "kiosk",
      });

      expect(report.violations.some((v) => v.ruleId === "platform-kiosk-body-length")).toBe(true);
    });
  });

  describe("adaptContentForPlatform", () => {
    it("shapes and strips content for kiosk displays", () => {
      const masterContent = {
        title: "Special Exhibition Announcement",
        content: "<p>Join us for an <strong>exclusive</strong> look at modern art.</p>",
      };

      const adapted = adaptContentForPlatform(masterContent, "kiosk", "en");

      expect(adapted.content).not.toContain("<p>");
      expect(adapted.content).not.toContain("<strong>");
      expect(adapted._syndicationMetadata).toEqual(
        expect.objectContaining({
          platform: "kiosk",
          targetLocale: "en",
        }),
      );
    });

    it("clamps titles that exceed mobile channel limits", () => {
      const longTitle = "A".repeat(100);
      const adapted = adaptContentForPlatform({ title: longTitle, content: "Body" }, "mobile");

      expect((adapted.title as string).length).toBeLessThanOrEqual(
        DEFAULT_PLATFORM_CONSTRAINTS.mobile.maxTitleLength!,
      );
      expect((adapted.title as string).endsWith("...")).toBe(true);
    });
  });

  describe("workflowAlignmentGuard", () => {
    it("allows non-approval workflow states without gating", async () => {
      const result = await workflowAlignmentGuard({
        collectionId: "articles",
        entryId: "entry_1",
        targetState: "in_review",
      });

      expect(result.allow).toBe(true);
    });
  });
});
