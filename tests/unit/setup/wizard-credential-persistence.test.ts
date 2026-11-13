/**
 * @file tests/unit/setup/wizard-credential-persistence.test.ts
 * @description Regression pin for SV-033: the setup wizard must never persist the
 * admin password to browser storage.
 *
 * The manual QA found the whole `adminUser` — including `password` and
 * `confirmPassword` — written to `localStorage`, so a plaintext admin password
 * survived a reload and was restored into the form. The persist path now routes
 * through `stripAdminCredentials()`; this test pins the shape it returns so the
 * wrong field can never be serialised again.
 */

import { describe, expect, it } from "vitest";
import { stripAdminCredentials } from "@src/stores/setup-store.svelte";

const ADMIN = {
  username: "qa_admin",
  email: "qa.admin@example.test",
  password: "QaTest!2026#Svelty",
  confirmPassword: "QaTest!2026#Svelty",
};

describe("wizard credential persistence", () => {
  it("drops both password fields from the persisted snapshot", () => {
    const persisted = stripAdminCredentials(ADMIN);

    expect(Object.keys(persisted).sort()).toEqual(["email", "username"]);
    expect(persisted).not.toHaveProperty("password");
    expect(persisted).not.toHaveProperty("confirmPassword");

    // The serialised form is what actually reaches storage.
    expect(JSON.stringify(persisted)).not.toContain(ADMIN.password);
  });

  it("keeps the resumeable fields and does not mutate the in-memory state", () => {
    const persisted = stripAdminCredentials(ADMIN);

    expect(persisted.username).toBe(ADMIN.username);
    expect(persisted.email).toBe(ADMIN.email);
    expect(ADMIN.password).toBe("QaTest!2026#Svelty");
    expect(ADMIN.confirmPassword).toBe("QaTest!2026#Svelty");
  });
});
