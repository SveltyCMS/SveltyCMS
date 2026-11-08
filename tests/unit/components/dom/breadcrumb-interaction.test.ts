/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/breadcrumb-interaction.test.ts
 * @description Real DOM tests for the Breadcrumb primitive.
 *
 * Covers the default trail markup and the custom `crumb` snippet path that the
 * media gallery relies on (domain payload, drop-target attributes, ownership of
 * `aria-current`).
 *
 * ### Features:
 * - default trail renders nav > ol > li with separators and `aria-current`
 * - `ariaLabel`, `navClass`, and `listClass` override the primitive chrome
 * - `crumb` snippet replaces the link/span while `<li>` and separators stay
 * - `item.data` reaches the snippet untouched
 */

import { createRawSnippet } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";
import Breadcrumb from "@src/components/ui/breadcrumb.svelte";
import { renderComponent, settle } from "./render";
import BreadcrumbDynamic from "./fixtures/breadcrumb-dynamic.svelte";
import { breadcrumbItems, resetBreadcrumbItems } from "./fixtures/breadcrumb-items.svelte";

interface TestCrumb {
  label: string;
  icon?: string;
  href?: string;
  data?: Record<string, unknown>;
}

const items: TestCrumb[] = [
  { label: "Media Root", href: "/mediagallery" },
  { label: "Campaigns", href: "/mediagallery?folderId=f1" },
  { label: "Spring", href: "/mediagallery?folderId=f2" },
];

describe("Breadcrumb (client interaction)", () => {
  beforeEach(() => {
    resetBreadcrumbItems();
  });

  it("renders a labelled nav landmark around one list item per crumb", () => {
    const { target, cleanup } = renderComponent(Breadcrumb, { items });

    try {
      const nav = target.querySelector("nav");
      expect(nav).toHaveAttribute("aria-label", "Breadcrumb");
      expect(nav).toHaveClass("flex", "py-3");

      const list = nav?.querySelector("ol");
      expect(list).toHaveClass("flex", "items-center", "gap-2", "text-sm");
      expect(list?.children).toHaveLength(3);
      expect([...(list?.children ?? [])].every((child) => child.tagName === "LI")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("links every ancestor, marks the last crumb current, and separates crumbs", () => {
    const { target, cleanup } = renderComponent(Breadcrumb, { items });

    try {
      const links = [...target.querySelectorAll("ol a")];
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/mediagallery",
        "/mediagallery?folderId=f1",
      ]);

      const current = target.querySelector('ol li:last-child [aria-current="page"]');
      expect(current).toHaveTextContent("Spring");
      expect(target.querySelectorAll("ol a [aria-current]")).toHaveLength(0);

      // One separator sits before every crumb after the first.
      expect(target.querySelectorAll('iconify-icon[icon="mdi:chevron-right"]')).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("replaces the nav and list chrome through navClass/listClass", () => {
    const navClass = "flex min-w-0 overflow-x-auto border-b py-1";
    const listClass = "flex w-max items-center gap-1";
    const { target, cleanup } = renderComponent(Breadcrumb, {
      items,
      ariaLabel: "Folder path",
      navClass,
      listClass,
    });

    try {
      const nav = target.querySelector("nav");
      expect(nav).toHaveAttribute("aria-label", "Folder path");
      expect(nav?.getAttribute("class")).toBe(navClass);
      expect(nav?.getAttribute("class")).not.toContain("py-3");

      expect(target.querySelector("ol")?.getAttribute("class")).toBe(listClass);
    } finally {
      cleanup();
    }
  });

  it("renders a custom crumb inside the primitive list and separator chrome", () => {
    const crumb = createRawSnippet<[{ item: TestCrumb; index: number; isLast: boolean }]>(
      (getContext) => ({
        render: () => {
          const { item, index, isLast } = getContext();
          const folderId = String(item.data?.folderId ?? "root");
          const current = isLast ? ' aria-current="page"' : "";
          return `<span data-testid="crumb-${index}" data-folder="${folderId}" data-last="${isLast}"${current}>${item.label}</span>`;
        },
      }),
    );

    const { target, cleanup } = renderComponent(Breadcrumb, {
      items: [
        { label: "Media Root", href: "/mediagallery", data: { folderId: null } },
        { label: "Spring", href: "/mediagallery?folderId=f2", data: { folderId: "f2" } },
      ],
      crumb,
    });

    try {
      // The caller's markup replaces the default link/span…
      expect(target.querySelectorAll("ol a")).toHaveLength(0);
      expect(target.querySelectorAll("ol li > [data-testid^='crumb-']")).toHaveLength(2);

      // …the primitive still owns the list items and the separator.
      expect(target.querySelectorAll("ol li")).toHaveLength(2);
      expect(target.querySelectorAll('iconify-icon[icon="mdi:chevron-right"]')).toHaveLength(1);

      const first = target.querySelector('[data-testid="crumb-0"]');
      expect(first).toHaveTextContent("Media Root");
      expect(first).toHaveAttribute("data-folder", "root");
      expect(first).toHaveAttribute("data-last", "false");
      expect(first).not.toHaveAttribute("aria-current");

      const last = target.querySelector('[data-testid="crumb-1"]');
      expect(last).toHaveTextContent("Spring");
      expect(last).toHaveAttribute("data-folder", "f2");
      expect(last).toHaveAttribute("data-last", "true");
      expect(last).toHaveAttribute("aria-current", "page");
    } finally {
      cleanup();
    }
  });

  it("moves the current marker when the trail grows (client navigation)", async () => {
    const { target, cleanup } = renderComponent(BreadcrumbDynamic, { items: breadcrumbItems });

    try {
      expect(target.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(target.querySelector('[data-testid="crumb"]')?.tagName).toBe("SPAN");

      // Navigating into a folder appends a crumb: the root is no longer current.
      breadcrumbItems.push({ label: "Campaigns", href: "/mediagallery?folderId=f1" });
      await settle();

      const crumbs = [...target.querySelectorAll('[data-testid="crumb"]')];
      expect(crumbs).toHaveLength(2);
      expect(crumbs[0]?.tagName).toBe("A");
      expect(crumbs[1]?.tagName).toBe("SPAN");
      expect(target.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(target.querySelector('[aria-current="page"]')).toHaveTextContent("Campaigns");
    } finally {
      cleanup();
    }
  });
});
