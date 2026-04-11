import type { Page } from "@playwright/test";

export const TEST_USERS = {
  developer: {
    email: "developer@example.com",
    password: "Developer123!",
    role: "developer",
  },
  editor: {
    email: "editor@example.com",
    password: "Editor123!",
    role: "editor",
  },
};

/**
 * Seeds the database with additional test users (Developer, Editor)
 * using the Testing API. This is cleaner and more robust for E2E.
 */
export async function seedTestUsers(page: Page) {
  for (const [key, user] of Object.entries(TEST_USERS)) {
    console.log(`Seeding user: ${user.email}...`);

    // Use the Testing API bypass
    const response = await page.request.post("/api/testing", {
      data: {
        action: "create-user",
        email: user.email,
        password: user.password,
        role: user.role,
        username: key.charAt(0).toUpperCase() + key.slice(1), // Developer, Editor
      },
    });

    if (response.ok()) {
      console.log(`✅ User ${user.email} created.`);
    } else if (response.status() === 400 || (await response.text()).includes("exists")) {
      console.log(`ℹ️ User ${user.email} already exists.`);
    } else {
      console.error(
        `❌ Failed to create user ${user.email}: ${response.status()} ${await response.text()}`,
      );
    }
  }
}
