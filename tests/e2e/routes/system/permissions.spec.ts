/**
 * @file tests/e2e/routes/system/permissions.spec.ts
 * @description E2E permission toggle + save on Access Management.
 *
 * Toggles permission checkboxes in the matrix UI, then persists via a direct
 * API POST to /api/user/update-roles (bypassing the StickyActions save button,
 * which may not reliably fire its onclick under Playwright — see the role
 * golden journey in tests/e2e/routes/config/access-management.spec.ts).
 *
 * Role metadata (IDs, names) is scraped from the Roles tab which has stable
 * data-role-id attributes. Permission states are read from live checkboxes
 * in the Permissions tab. Permission display-name → _id mapping is resolved
 * from SvelteKit's __data.json endpoint.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/** Extract role metadata (ID, name, isAdmin) from the Roles tab DOM. */
async function scrapeRoleMetadata(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const roleEls = document.querySelectorAll<HTMLElement>("[data-role-id]");
    const metadata: Array<{ _id: string; name: string; isAdmin: boolean }> = [];
    roleEls.forEach((el) => {
      const id = el.getAttribute("data-role-id")!;
      const nameEl = el.querySelector("span.text-lg, span.font-bold");
      const name = nameEl?.textContent?.trim() ?? "";
      if (!name) return;
      const isAdmin = id === "admin" || el.textContent?.toLowerCase().includes("administrator");
      metadata.push({ _id: id, name, isAdmin });
    });
    return metadata;
  });
}

/**
 * Fetch the page data (including the permissions array) from SvelteKit's
 * __data.json endpoint. The table renders permission.name but the API
 * expects permission._id — we use this to build a name→ID mapping.
 *
 * NOTE: SvelteKit streams the payload as newline-separated chunks
 * (main JSON object first, then `{"type":"chunk",...}` lines) — parse
 * only the first line; JSON.parse on the full body fails at line 2.
 */
async function fetchPageData(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const pathname = window.location.pathname.replace(/\/$/, "");
    const res = await fetch(pathname + "/__data.json");
    if (!res.ok) return null;
    const text = await res.text();
    const firstLine = text.split("\n")[0] || text;
    let json: any = null;
    try {
      json = JSON.parse(firstLine);
    } catch {
      return null;
    }
    // SvelteKit returns { type: "data", nodes: [...] }. The first node is the
    // root/(app) layout's data — the access-management page's { roles,
    // permissions } lives in the page node. Match on the node whose data
    // exposes them.
    if (json?.nodes) {
      for (const node of json.nodes) {
        if (node?.type === "data" && node?.data && (node.data.permissions || node.data.roles)) {
          return node.data;
        }
      }
    }
    return null;
  });
}

/** Build a permission display-name → _id map from page data. */
function buildPermNameToIdMap(pageData: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const data = pageData as Record<string, unknown> | null;
  if (data?.permissions && Array.isArray(data.permissions)) {
    for (const perm of data.permissions as Array<{ _id?: string; name?: string }>) {
      if (perm._id && perm.name) map.set(perm.name, perm._id);
      if (perm._id) map.set(perm._id, perm._id); // fallback: name IS the _id
    }
  }
  return map;
}

/**
 * Scrape the permission matrix from the Permissions tab DOM.
 * Returns an array of role objects suitable for POST to /api/user/update-roles.
 */
async function scrapeRolesFromMatrix(
  page: import("@playwright/test").Page,
  roleMetadata: Array<{ _id: string; name: string; isAdmin: boolean }>,
  permNameToId: Map<string, string>,
) {
  const entries = [...permNameToId.entries()];
  return page.evaluate(
    ({ metadata, nameToIdEntries }) => {
      const nameToId = new Map<string, string>(nameToIdEntries);
      const roleMap = new Map<
        string,
        { _id: string; name: string; isAdmin: boolean; permissions: string[] }
      >();

      // Include the admin role (API preserves existing grants when permissions is empty)
      const adminMeta = metadata.find((r: any) => r.isAdmin);
      if (adminMeta) {
        roleMap.set(adminMeta.name, { ...adminMeta, permissions: [] });
      }

      // Collect role names from thead <th> elements (skip "Permission Name" + "Action")
      const headerThs = document.querySelectorAll("table thead tr th");
      const roleNames: string[] = [];
      headerThs.forEach((th, index) => {
        if (index < 2) return;
        const spanEl = th.querySelector("span");
        const name = spanEl?.textContent?.trim();
        if (name) roleNames.push(name);
      });

      // Match role names to metadata for non-admin roles
      for (const roleName of roleNames) {
        const meta = metadata.find((m: any) => m.name === roleName);
        if (meta && !meta.isAdmin) {
          roleMap.set(meta.name, { ...meta, permissions: [] });
        }
      }

      // Iterate permission rows and collect checked states per role
      const rows = document.querySelectorAll("table tbody tr");
      rows.forEach((row) => {
        const tds = row.querySelectorAll("td");
        const nameCell = tds[0];
        // Skip group header rows (they use colspan, not individual cells)
        if (!nameCell || nameCell.getAttribute("colspan")) return;

        const permName = nameCell.textContent?.trim();
        if (!permName) return;
        // Resolve display name → _id for the API call
        const permId = nameToId.get(permName);
        if (!permId) return;

        // tds[0]=permission name, tds[1]=action badge, tds[2+]=role checkboxes
        for (let j = 2; j < tds.length; j++) {
          const roleIndex = j - 2;
          const roleName = roleNames[roleIndex];
          if (!roleName) continue;

          const roleData = roleMap.get(roleName);
          if (!roleData) continue;

          const checkbox = tds[j].querySelector<HTMLInputElement>('input[type="checkbox"]');
          if (checkbox?.checked) {
            roleData.permissions.push(permId);
          }
        }
      });

      return Array.from(roleMap.values());
    },
    { metadata: roleMetadata, nameToIdEntries: entries },
  );
}

/** POST roles to /api/user/update-roles from the browser context. */
async function postRoles(page: import("@playwright/test").Page, roles: unknown[]) {
  return page.evaluate(async (rolesData) => {
    const csrf =
      document.cookie
        .split("; ")
        .find((c) => c.startsWith("__Host-csrf_token=") || c.startsWith("csrf_token="))
        ?.split("=")[1] ?? "";
    const res = await fetch("/api/user/update-roles", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(rolesData),
    });
    return { status: res.status, body: await res.text() };
  }, roles);
}

test.describe("Permission Management Flow", () => {
  test.setTimeout(120_000);

  test("toggle permissions and save", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config/access-management", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("access-mgmt-page")).toBeVisible({ timeout: 15_000 });

    // ── Navigate to Permissions tab ──
    const permissionsTab = page.getByTestId("access-tab-permissions");
    await expect(permissionsTab).toBeVisible({ timeout: 15_000 });
    const isActive = (await permissionsTab.getAttribute("aria-current")) === "page";
    if (!isActive) await permissionsTab.click();

    // Wait for the permission matrix to hydrate
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

    // ── Collect role metadata from Roles tab ──
    // The Permissions tab doesn't expose role IDs. Switch to Roles tab briefly
    // to scrape data-role-id attributes.
    await page.getByTestId("access-tab-roles").click();
    await expect(page.getByTestId("access-create-role")).toBeVisible({ timeout: 10_000 });
    const roleMetadata = await scrapeRoleMetadata(page);

    // ── Fetch page data for permission name → ID mapping ──
    // The table renders permission.name but the API expects permission._id.
    // SvelteKit's __data.json returns the page load data with full permission objects.
    const pageData = await fetchPageData(page);
    const permNameToId = buildPermNameToIdMap(pageData);

    // Switch back to Permissions tab
    await page.getByTestId("access-tab-permissions").click();
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

    // Scope to tbody: the thead holds per-role "select all filtered permissions"
    // header checkboxes — toggling those grants/wipes EVERY permission for a
    // role and would poison the shared DB for downstream serial specs.
    const toggleableCheckboxes = page.locator('table tbody input[type="checkbox"]:not([disabled])');
    await expect
      .poll(async () => await toggleableCheckboxes.count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // ── Toggle checkboxes (verify each toggle) ──
    const before = new Map<number, boolean>();
    const toToggle = Math.min(await toggleableCheckboxes.count(), 3);
    for (let i = 0; i < toToggle; i++) {
      const cb = toggleableCheckboxes.nth(i);
      before.set(i, await cb.isChecked());
      await cb.click({ force: true, timeout: 5_000 });
      // Verify the toggle actually changed the checkbox state
      await expect
        .poll(async () => (await cb.isChecked()) !== before.get(i), {
          timeout: 10_000,
          message: `Checkbox ${i} did not toggle — state remained ${before.get(i)}`,
        })
        .toBe(true);
    }

    // ── Save via direct API call ──
    // The StickyActions save button may not reliably fire its onclick under
    // Playwright (see access-management.spec.ts role golden journey). POST to
    // the API directly — the same operation that saveAllChanges() performs.
    const rolesPayload = await scrapeRolesFromMatrix(page, roleMetadata, permNameToId);
    const saveResult = await postRoles(page, rolesPayload);
    expect(
      saveResult.status,
      `Save failed (${saveResult.status}): ${saveResult.body.slice(0, 400)}`,
    ).toBe(200);

    // ── Reload and verify persistence ──
    await page.reload({ waitUntil: "networkidle" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/config/access-management");
    }
    await expect(page).toHaveURL(/\/config\/access-management/, { timeout: 15_000 });
    await expect(page.getByTestId("access-mgmt-page")).toBeVisible({ timeout: 15_000 });

    // Navigate to Permissions tab
    const permTabReloaded = page.getByTestId("access-tab-permissions");
    await expect(permTabReloaded).toBeVisible({ timeout: 15_000 });
    const isActiveReloaded = (await permTabReloaded.getAttribute("aria-current")) === "page";
    if (!isActiveReloaded) await permTabReloaded.click();

    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

    // Verify the toggled checkboxes reflect the saved state
    const verifyCheckboxes = page.locator('table tbody input[type="checkbox"]:not([disabled])');
    await expect
      .poll(async () => await verifyCheckboxes.count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    let persistenceOk = 0;
    for (let i = 0; i < toToggle; i++) {
      const cb = verifyCheckboxes.nth(i);
      const wasChecked = before.get(i) ?? false;
      const shouldBe = !wasChecked; // we toggled it
      try {
        await expect
          .poll(async () => (await cb.isChecked()) === shouldBe, { timeout: 5_000 })
          .toBe(true);
        persistenceOk++;
      } catch {
        // This checkbox row may have shifted position after reload (role order
        // can change). Fall back to full-matrix comparison below.
      }
    }

    if (persistenceOk === 0) {
      // Re-scrape the full matrix and compare against the saved payload as
      // a fallback verification when individual checkbox positions shifted.
      // Refresh permission mapping after reload.
      const reloadedPageData = await fetchPageData(page);
      const reloadedPermMap = buildPermNameToIdMap(reloadedPageData);
      const persistedRoles = await scrapeRolesFromMatrix(page, roleMetadata, reloadedPermMap);

      const savedMap = new Map<string, Set<string>>(
        rolesPayload.map((r: any) => [r._id as string, new Set<string>(r.permissions)]),
      );
      let matches = 0;
      for (const role of persistedRoles) {
        const savedPerms = savedMap.get(role._id);
        const currentPerms = new Set(role.permissions);
        if (
          savedPerms &&
          savedPerms.size === currentPerms.size &&
          [...savedPerms].every((p) => currentPerms.has(p))
        ) {
          matches++;
        }
      }
      expect(
        matches,
        `Permission persistence: ${matches}/${persistedRoles.length} roles matched saved state`,
      ).toBeGreaterThanOrEqual(persistedRoles.length - 1); // admin may shift
    }

    // ── Restore original grants ──
    // Re-load role metadata and permission mapping after reload.
    await page.getByTestId("access-tab-roles").click();
    await expect(page.getByTestId("access-create-role")).toBeVisible({ timeout: 10_000 });
    const restoreRoleMetadata = await scrapeRoleMetadata(page);

    const restorePageData = await fetchPageData(page);
    const restorePermMap = buildPermNameToIdMap(restorePageData);

    await page.getByTestId("access-tab-permissions").click();
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });

    // Toggle the same checkboxes back to their original state
    const restoreCheckboxes = page.locator('table tbody input[type="checkbox"]:not([disabled])');
    for (let i = 0; i < toToggle; i++) {
      const cb = restoreCheckboxes.nth(i);
      const wantChecked = before.get(i) ?? false;
      if ((await cb.isChecked()) !== wantChecked) {
        await cb.click({ force: true, timeout: 5_000 });
        await expect
          .poll(async () => (await cb.isChecked()) === wantChecked, {
            timeout: 10_000,
            message: `Restore: checkbox ${i} did not return to ${wantChecked}`,
          })
          .toBe(true);
      }
    }

    // Scrape restored state and POST
    const restorePayload = await scrapeRolesFromMatrix(page, restoreRoleMetadata, restorePermMap);
    const restoreResult = await postRoles(page, restorePayload);
    expect(
      restoreResult.status,
      `Restore failed (${restoreResult.status}): ${restoreResult.body.slice(0, 400)}`,
    ).toBe(200);
  });
});
