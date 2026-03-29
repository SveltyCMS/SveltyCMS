import { test, expect } from "@playwright/test";

test.describe("Public API Endpoints", () => {
  const baseURL = process.env.BASE_URL || "http://localhost:5173/api";
  let authToken: string;

  test.beforeAll(async ({ playwright }) => {
    // Authenticate to get token for protected endpoints
    const browser = await playwright.chromium.launch();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.goto("http://localhost:5173/login");
    await page.fill('input[name="email"]', process.env.TEST_EMAIL || "test@example.com");
    await page.fill('input[name="password"]', process.env.TEST_PASSWORD || "password123");
    await page.click('button:has-text("Log In")');

    // Get token from localStorage or response
    authToken = await page.evaluate(() => localStorage.getItem("authToken") || "");

    await context.close();
    await browser.close();
  });

  test.describe("GET /api/content", () => {
    test("returns list of public content", async ({ request }) => {
      const response = await request.get(`${baseURL}/content`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("items");
      expect(data).toHaveProperty("pagination");
      expect(Array.isArray(data.items)).toBeTruthy();
    });

    test("supports pagination", async ({ request }) => {
      const response = await request.get(`${baseURL}/content?page=1&limit=10`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.pagination).toHaveProperty("page", 1);
      expect(data.pagination).toHaveProperty("limit", 10);
      expect(data.pagination).toHaveProperty("total");
    });

    test("filters by status", async ({ request }) => {
      const response = await request.get(`${baseURL}/content?status=published`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      data.items.forEach((item: any) => {
        expect(item.status).toBe("published");
      });
    });

    test("filters by tags", async ({ request }) => {
      const response = await request.get(`${baseURL}/content?tags=test`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      data.items.forEach((item: any) => {
        expect(item.tags).toContain("test");
      });
    });

    test("supports search query", async ({ request }) => {
      const response = await request.get(`${baseURL}/content?search=test`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.items)).toBeTruthy();
    });
  });

  test.describe("GET /api/content/:id", () => {
    test("returns single content item", async ({ request }) => {
      // First, get a content ID
      const listResponse = await request.get(`${baseURL}/content?limit=1`);
      const listData = await listResponse.json();

      if (listData.items.length === 0) {
        test.skip();
      }

      const contentId = listData.items[0].id;

      const response = await request.get(`${baseURL}/content/${contentId}`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("id", contentId);
      expect(data).toHaveProperty("title");
      expect(data).toHaveProperty("body");
      expect(data).toHaveProperty("status");
    });

    test("returns 404 for non-existent content", async ({ request }) => {
      const response = await request.get(`${baseURL}/content/invalid-id-12345`);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("POST /api/content (authenticated)", () => {
    test("creates new content with valid data", async ({ request }) => {
      const newContent = {
        title: "API Test Article",
        slug: "api-test-article",
        body: "This is created via API",
        excerpt: "Created via API",
        tags: ["api", "test"],
        status: "draft",
      };

      const response = await request.post(`${baseURL}/content`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        data: newContent,
      });

      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty("id");
      expect(data.title).toBe(newContent.title);
      expect(data.slug).toBe(newContent.slug);
    });

    test("returns 400 with invalid data", async ({ request }) => {
      const response = await request.post(`${baseURL}/content`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        data: { title: "" }, // Missing required fields
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty("errors");
    });

    test("returns 401 without authentication", async ({ request }) => {
      const response = await request.post(`${baseURL}/content`, {
        data: { title: "Test" },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe("PUT /api/content/:id (authenticated)", () => {
    test("updates content with valid data", async ({ request }) => {
      // First get a content ID
      const listResponse = await request.get(`${baseURL}/content?limit=1`);
      const listData = await listResponse.json();

      if (listData.items.length === 0) {
        test.skip();
      }

      const contentId = listData.items[0].id;

      const updateData = {
        title: "Updated via API",
      };

      const response = await request.put(`${baseURL}/content/${contentId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        data: updateData,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.title).toBe(updateData.title);
    });
  });

  test.describe("DELETE /api/content/:id (authenticated)", () => {
    test("deletes content successfully", async ({ request }) => {
      // Create content to delete
      const createResponse = await request.post(`${baseURL}/content`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          title: "To Delete",
          slug: "to-delete",
          body: "Delete me",
          status: "draft",
        },
      });

      const contentId = (await createResponse.json()).id;

      const deleteResponse = await request.delete(`${baseURL}/content/${contentId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(deleteResponse.status()).toBe(200);

      // Verify deletion
      const getResponse = await request.get(`${baseURL}/content/${contentId}`);
      expect(getResponse.status()).toBe(404);
    });
  });

  test.describe("GET /api/users (authenticated admin)", () => {
    test("returns list of users", async ({ request }) => {
      const response = await request.get(`${baseURL}/users`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect([200, 403]).toContain(response.status()); // 403 if not admin

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data.items) || Array.isArray(data)).toBeTruthy();
      }
    });
  });

  test.describe("Error Handling", () => {
    test("handles server errors gracefully", async ({ request }) => {
      const response = await request.get(`${baseURL}/content/invalid`);

      expect([400, 404, 500]).toContain(response.status());

      const data = await response.json();
      expect(data).toHaveProperty("message") || expect(data).toHaveProperty("error");
    });

    test("returns proper error messages", async ({ request }) => {
      const response = await request.post(`${baseURL}/content`, {
        headers: {
          Authorization: `Bearer invalid-token`,
        },
        data: {},
      });

      expect(response.status()).toBe(401);

      const data = await response.json();
      expect(typeof data.message).toBe("string");
    });
  });

  test.describe("Response Format Validation", () => {
    test("responses include proper headers", async ({ request }) => {
      const response = await request.get(`${baseURL}/content`);

      expect(response.headers()["content-type"]).toContain("application/json");
      expect(response.status()).toBe(200);
    });

    test("responses include proper timestamps", async ({ request }) => {
      const response = await request.get(`${baseURL}/content?limit=1`);
      const data = await response.json();

      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty("createdAt");
        expect(item).toHaveProperty("updatedAt");
      }
    });
  });
});
