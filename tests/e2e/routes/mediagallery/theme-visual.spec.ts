/**
 * @file tests/e2e/routes/mediagallery/theme-visual.spec.ts
 * @description Looks-right audit for the media gallery and image editor in light and dark mode.
 *
 * Behavioral specs prove a control exists and works; they cannot see a white icon on a
 * white toolbar. This spec reads the colors the browser actually rendered and fails on
 * anything a person would struggle to read.
 *
 * Features:
 * - Sweep: every visible, enabled control, label and icon vs its real (composited) background
 * - Text/controls need 4.5:1 (3:1 for large text); icon-only glyphs need 3:1 (WCAG 1.4.3 / 1.4.11)
 * - Axe `color-contrast` scan scoped to the same surface as a second opinion
 * - Editor: desktop + mobile width, every tool selected in turn
 * - Gallery: grid toolbar/sidebar and table view
 * - Failures list the offending element, its colors and the measured ratio
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { deleteMediaRow, openMediaGallery, uploadUniqueImage } from "../../helpers/media";

type Scheme = "light" | "dark";

const ACTION_TIMEOUT = 25_000;
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

interface Offender {
  element: string;
  label: string;
  color: string;
  background: string;
  ratio: number;
  required: number;
}

/** Mirror what the theme store does so tokens (`html.dark` / `html.light`) resolve for real. */
async function applyScheme(page: Page, scheme: Scheme) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((s) => {
    try {
      localStorage.setItem("theme", s);
    } catch {
      /* storage blocked: the class below is what the tokens read */
    }
    document.cookie = `theme=${s}; path=/; max-age=31536000`;
    const root = document.documentElement;
    root.classList.toggle("dark", s === "dark");
    root.classList.toggle("light", s === "light");
  }, scheme);
}

/**
 * Runs inside the page. Resolves any CSS color (oklch, color-mix, ...) to RGBA by painting it
 * over white and black on a canvas, then composites every ancestor background to get the
 * colour a pixel behind the element really has. Elements over images/gradients are skipped
 * (the backdrop is unknowable from CSS) and counted so the report shows what was not judged.
 */
async function sweepContrast(page: Page, rootSelector: string, scheme: Scheme) {
  return page.evaluate(
    ({ rootSelector, scheme }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      type RGBA = [number, number, number, number];

      const parse = (css: string): RGBA => {
        const paint = (base: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = base;
          ctx.fillRect(0, 0, 1, 1);
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!];
        };
        const onWhite = paint("#fff");
        const onBlack = paint("#000");
        // c_w = a*c + (1-a)*255 ; c_b = a*c  =>  a = 1 - (c_w - c_b)/255
        const alpha = Math.min(
          1,
          Math.max(
            0,
            1 -
              (onWhite[0]! - onBlack[0]! + onWhite[1]! - onBlack[1]! + onWhite[2]! - onBlack[2]!) /
                765,
          ),
        );
        if (alpha === 0) return [0, 0, 0, 0];
        return [onBlack[0]! / alpha, onBlack[1]! / alpha, onBlack[2]! / alpha, alpha];
      };
      const over = (top: RGBA, bottom: RGBA): RGBA => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a === 0) return [0, 0, 0, 0];
        const mix = (i: number) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / a;
        return [mix(0), mix(1), mix(2), a];
      };
      const lum = ([r, g, b]: RGBA) => {
        const c = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
      };
      const ratio = (a: RGBA, b: RGBA) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const hex = (c: RGBA) =>
        `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${c[3].toFixed(2)})`;

      /** Composited backdrop behind `el`, or null when an image/gradient sits behind it. */
      const backdrop = (el: Element): RGBA | null => {
        const layers: RGBA[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.backgroundImage !== "none") return null;
          const bg = parse(cs.backgroundColor);
          if (bg[3] > 0) layers.push(bg);
          if (bg[3] >= 1) break;
        }
        let acc: RGBA = scheme === "dark" ? [0, 0, 0, 1] : [255, 255, 255, 1];
        for (const layer of layers.reverse()) acc = over(layer, acc);
        return acc;
      };

      const opacityOf = (el: Element) => {
        let o = 1;
        for (let n: Element | null = el; n; n = n.parentElement)
          o *= Number(getComputedStyle(n).opacity);
        return o;
      };

      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        for (let n: Element | null = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
        }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        return r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
      };

      const isDisabled = (el: Element) =>
        el.closest("[disabled], [aria-disabled='true'], [inert]") !== null;

      const ownText = (el: Element) =>
        [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join("")
          .trim();

      const describe = (el: Element) => {
        const owner = el.closest("button, a, [role=tab], [role=button]");
        const ownerName =
          owner && owner !== el
            ? (owner.getAttribute("aria-label") ?? owner.getAttribute("title") ?? "")
            : "";
        if (ownerName) return `${el.tagName.toLowerCase()} in "${ownerName.slice(0, 30)}"`;
        const id = el.getAttribute("data-testid");
        const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 3).join(".");
        return `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ""}${cls ? `.${cls}` : ""}`;
      };

      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`sweep root not found: ${rootSelector}`);

      const targets = [
        ...root.querySelectorAll(
          "button, a[href], [role=tab], [role=button], [role=menuitem], label, input:not([type=hidden]):not([type=range]):not([type=color]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea, iconify-icon, h1, h2, h3, h4, th, td, p",
        ),
      ];

      const offenders: Offender[] = [];
      let judged = 0;
      let skippedBackdrop = 0;
      const seen = new Set<string>();

      for (const el of targets) {
        if (!isVisible(el) || isDisabled(el)) continue;
        const isIconElement = el.tagName === "ICONIFY-ICON";
        const isField = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
        // Interactive elements usually carry their label in a child <span>, so own
        // text alone judged almost nothing (and made the sweep depend on icons
        // having finished loading). Use the rendered text for those owners.
        const isOwner = el.matches("button, a[href], [role=tab], [role=button], label");
        const direct = ownText(el);
        const nested = isOwner ? (el.textContent ?? "").trim() : "";
        // Icon-only controls (mobile rails) have no text nodes at all. Judge them
        // through their accessible name at the non-text ratio — but not colour
        // swatches, whose background IS the value and whose `color` is meaningless.
        const hasGlyph = isOwner && el.querySelector("iconify-icon, svg") !== null;
        const accessibleOnly = isOwner && !direct && !nested && hasGlyph;
        const text =
          direct || nested || (accessibleOnly ? (el.getAttribute("aria-label") ?? "").trim() : "");
        const isIcon = isIconElement || accessibleOnly;
        // Containers with no text of their own are judged through their text/icon children.
        if (!isIcon && !isField && text === "") continue;

        const cs = getComputedStyle(el);
        const bg = backdrop(el);
        if (!bg) {
          skippedBackdrop++;
          continue;
        }
        const fg = parse(cs.color);
        const effective: RGBA = [fg[0], fg[1], fg[2], fg[3] * opacityOf(el)];
        const seenColor = over(effective, bg);

        const px = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = px >= 24 || (px >= 18.66 && bold);
        const required = isIcon ? 3 : large ? 3 : 4.5;
        const measured = ratio(seenColor, bg);
        judged++;

        if (measured + 0.01 < required) {
          const key = `${describe(el)}|${hex(seenColor)}|${hex(bg)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          offenders.push({
            element: describe(el),
            label: (el.getAttribute("aria-label") ?? text ?? "").slice(0, 40),
            color: hex(seenColor),
            background: hex(bg),
            ratio: Math.round(measured * 100) / 100,
            required,
          });
        }
      }
      return { offenders, judged, skippedBackdrop };
    },
    { rootSelector, scheme },
  );
}

/**
 * Owner-accepted brand pairs, copied from `routes/login/accessibility.spec.ts` and
 * `routes/dashboard/accessibility.spec.ts`: white on the bright brand green and the muted grey
 * chip. Every other pair is still judged, so only NEW contrast problems fail here.
 */
const ACCEPTED_PAIRS: ReadonlyArray<[string, string]> = [
  ["rgba(255, 255, 255, 1.00)", "rgba(95, 211, 23, 1.00)"],
  ["rgba(113, 113, 113, 1.00)", "rgba(245, 245, 245, 1.00)"],
];
const ACCEPTED_AXE = [/#ffffff.*#5fd317/, /#717171.*#f5f5f5/];

function formatOffenders(list: Offender[]) {
  return list
    .map(
      (o) =>
        `  ${o.ratio}:1 < ${o.required}:1  ${o.element} "${o.label}"  fg ${o.color} on ${o.background}`,
    )
    .join("\n");
}

/** Sweep + axe for one surface; collects every finding so one run shows the whole picture. */
async function auditSurface(
  page: Page,
  scope: Locator,
  rootSelector: string,
  scheme: Scheme,
  name: string,
) {
  // Freeze transitions so colors are read at rest, not halfway through a hover/active animation.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  const swept = await sweepContrast(page, rootSelector, scheme);
  const sweep = {
    ...swept,
    offenders: swept.offenders.filter(
      (o) => !ACCEPTED_PAIRS.some(([fg, bg]) => o.color === fg && o.background === bg),
    ),
  };
  const axe = await new AxeBuilder({ page })
    .include(rootSelector)
    .withRules(["color-contrast"])
    .analyze();
  const axeNodes = axe.violations.flatMap((v) =>
    v.nodes
      .filter(
        (n) =>
          !ACCEPTED_AXE.some((re) =>
            re.test(
              n.any
                .map((c) => JSON.stringify(c.data))
                .join(" ")
                .toLowerCase(),
            ),
          ),
      )
      .map(
        (n) =>
          `  axe ${v.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`,
      ),
  );

  expect(
    sweep.judged,
    `${name}: sweep judged nothing — selector or visibility is wrong`,
  ).toBeGreaterThan(2);
  const problems: string[] = [];
  if (sweep.offenders.length)
    problems.push(`sweep (${sweep.offenders.length}):\n${formatOffenders(sweep.offenders)}`);
  if (axeNodes.length)
    problems.push(`axe (${axeNodes.length}):\n${axeNodes.slice(0, 15).join("\n")}`);
  expect(
    problems,
    `${name} [${scheme}] — judged ${sweep.judged} elements, ${sweep.skippedBackdrop} over images skipped\n${problems.join("\n")}`,
  ).toEqual([]);
  await expect(scope).toBeVisible();
}

async function openEditorFor(page: Page, filename: string) {
  const cell = page.getByRole("gridcell").filter({ hasText: filename }).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();
  const edit = cell
    .getByTestId("media-edit-button")
    .or(cell.getByRole("button", { name: /edit/i }))
    .first();
  await expect(edit).toBeVisible({ timeout: ACTION_TIMEOUT });
  await edit.evaluate((btn) => (btn as HTMLButtonElement).click());
  const dialog = page.getByRole("dialog", { name: /image editor/i });
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(dialog.getByText("Loading editor..."))
    .toBeHidden({ timeout: 60_000 })
    .catch(() => undefined);
  return dialog;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Theme visual audit — ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test.setTimeout(180_000);

    for (const [label, viewport] of [
      ["desktop", DESKTOP],
      ["mobile", MOBILE],
    ] as const) {
      test(`image editor, every tool (${label})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openMediaGallery(page);
        const filename = `theme-${scheme}-${label}-${Date.now().toString(36)}.png`;
        const row = await uploadUniqueImage(page, filename);
        try {
          await applyScheme(page, scheme);
          const dialog = await openEditorFor(page, filename);
          await applyScheme(page, scheme);

          const desktopTabs = dialog.getByRole("tab");
          const mobileRail = dialog.getByLabel("Editing tools").getByRole("button");
          const triggers = label === "desktop" ? desktopTabs : mobileRail;
          await expect(triggers.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
          const count = await triggers.count();
          expect(count, "editor must expose its tool triggers").toBeGreaterThanOrEqual(6);

          const failures: string[] = [];
          for (let i = 0; i < count; i++) {
            const trigger = triggers.nth(i);
            const name =
              (await trigger.getAttribute("aria-label")) ??
              (await trigger.innerText()).trim() ??
              `tool ${i}`;
            await trigger.click();
            try {
              await auditSurface(
                page,
                dialog,
                '[role="dialog"][aria-label^="Image Editor"]',
                scheme,
                `editor/${label}/${name}`,
              );
            } catch (err) {
              failures.push(err instanceof Error ? err.message : String(err));
            }
          }
          expect(failures, failures.join("\n\n")).toEqual([]);
        } finally {
          await deleteMediaRow(page, row._id);
        }
      });
    }

    // The editor's popups are separate components that never render until opened, so a sweep of
    // the editor screen cannot see them. Each one needs its own open-and-check test.
    test("editor aspect ratio preview window", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await openMediaGallery(page);
      const filename = `theme-aspect-${scheme}-${Date.now().toString(36)}.png`;
      const row = await uploadUniqueImage(page, filename);
      try {
        await applyScheme(page, scheme);
        const dialog = await openEditorFor(page, filename);
        await applyScheme(page, scheme);

        await dialog.getByRole("tab", { name: /^focal/i }).click();
        await dialog
          .getByRole("button", { name: /focal point and aspect ratio preview/i })
          .first()
          .click();

        const preview = page.getByRole("dialog", { name: /aspect ratio preview/i });
        await expect(preview).toBeVisible({ timeout: ACTION_TIMEOUT });
        await expect(preview.getByText("21:9")).toBeVisible({ timeout: ACTION_TIMEOUT });
        // Let the open/scale transition finish so colors are the final ones.
        await page.waitForTimeout(400);
        await auditSurface(
          page,
          preview,
          '[aria-labelledby="aspect-preview-title"]',
          scheme,
          "editor/aspect-preview",
        );
      } finally {
        await deleteMediaRow(page, row._id);
      }
    });

    test("gallery toolbar, sidebar and table view", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await openMediaGallery(page);
      const filename = `theme-gallery-${scheme}-${Date.now().toString(36)}.png`;
      const row = await uploadUniqueImage(page, filename);
      try {
        await applyScheme(page, scheme);
        const failures: string[] = [];

        const toolbar = page.getByTestId("media-gallery-toolbar");
        await expect(toolbar).toBeVisible({ timeout: ACTION_TIMEOUT });
        try {
          await auditSurface(
            page,
            toolbar,
            '[data-testid="media-gallery-toolbar"]',
            scheme,
            "gallery/toolbar",
          );
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }

        await page.getByTestId("media-view-table").click();
        const table = page.getByTestId("media-table");
        await expect(table).toBeVisible({ timeout: ACTION_TIMEOUT });
        // The table renders a hidden mobile-card copy of each name; wait for the visible cell.
        await expect(table.getByText(filename).locator("visible=true").first()).toBeVisible({
          timeout: ACTION_TIMEOUT,
        });
        try {
          await auditSurface(page, table, '[data-testid="media-table"]', scheme, "gallery/table");
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }

        expect(failures, failures.join("\n\n")).toEqual([]);
      } finally {
        await deleteMediaRow(page, row._id);
      }
    });
  });
}
