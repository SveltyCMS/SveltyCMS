import { test, expect } from '@playwright/test';

test.describe('Collection Builder', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to collection builder
    await page.goto('/admin/collections/builder');
  });

  test('should display collection builder interface', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Collection Builder');
    await expect(page.locator('[data-testid="create-collection-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="collections-list"]')).toBeVisible();
  });

  test('should create new collection with basic fields', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    
    // Fill collection basic info
    await page.fill('[data-testid="collection-name"]', 'Blog Posts');
    await page.fill('[data-testid="collection-slug"]', 'blog-posts');
    await page.fill('[data-testid="collection-description"]', 'Blog posts collection for the website');
    
    // Add basic fields
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'text');
    await page.fill('[data-testid="field-name"]', 'Title');
    await page.fill('[data-testid="field-slug"]', 'title');
    await page.check('[data-testid="field-required"]');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Add content field
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'richtext');
    await page.fill('[data-testid="field-name"]', 'Content');
    await page.fill('[data-testid="field-slug"]', 'content');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Save collection
    await page.click('[data-testid="save-collection"]');
    
    await expect(page.locator('[data-testid="collection-saved"]')).toBeVisible();
    await expect(page.locator('[data-testid="collections-list"]')).toContainText('Blog Posts');
  });

  test('should validate collection name and slug', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    
    // Test empty name
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="name-error"]')).toContainText('Collection name is required');
    
    // Test invalid slug characters
    await page.fill('[data-testid="collection-name"]', 'Test Collection');
    await page.fill('[data-testid="collection-slug"]', 'test collection!@#');
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="slug-error"]')).toContainText('alphanumeric characters and hyphens');
    
    // Test duplicate slug
    await page.fill('[data-testid="collection-slug"]', 'existing-collection');
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="slug-error"]')).toContainText('already exists');
  });

  test('should support various field types', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    await page.fill('[data-testid="collection-name"]', 'Product Catalog');
    await page.fill('[data-testid="collection-slug"]', 'products');
    
    const fieldTypes = [
      { type: 'text', name: 'Product Name' },
      { type: 'textarea', name: 'Description' },
      { type: 'number', name: 'Price' },
      { type: 'boolean', name: 'In Stock' },
      { type: 'date', name: 'Release Date' },
      { type: 'image', name: 'Product Image' },
      { type: 'select', name: 'Category' },
      { type: 'tags', name: 'Tags' }
    ];
    
    for (const field of fieldTypes) {
      await page.click('[data-testid="add-field-button"]');
      await page.selectOption('[data-testid="field-type"]', field.type);
      await page.fill('[data-testid="field-name"]', field.name);
      await page.fill('[data-testid="field-slug"]', field.name.toLowerCase().replace(/\s+/g, '-'));
      
      // Configure field-specific options
      if (field.type === 'select') {
        await page.fill('[data-testid="select-options"]', 'Electronics\nClothing\nBooks\nHome & Garden');
      }
      
      await page.click('[data-testid="add-field-confirm"]');
    }
    
    // Verify all fields are added
    for (const field of fieldTypes) {
      await expect(page.locator('[data-testid="field-list"]')).toContainText(field.name);
    }
    
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="collection-saved"]')).toBeVisible();
  });

  test('should allow field reordering', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    await page.fill('[data-testid="collection-name"]', 'Test Reorder');
    
    // Add multiple fields
    const fields = ['Title', 'Content', 'Author', 'Date'];
    for (const field of fields) {
      await page.click('[data-testid="add-field-button"]');
      await page.selectOption('[data-testid="field-type"]', 'text');
      await page.fill('[data-testid="field-name"]', field);
      await page.fill('[data-testid="field-slug"]', field.toLowerCase());
      await page.click('[data-testid="add-field-confirm"]');
    }
    
    // Test drag and drop reordering
    const firstField = page.locator('[data-testid="field-item"]:first-child');
    const secondField = page.locator('[data-testid="field-item"]:nth-child(2)');
    
    await firstField.dragTo(secondField);
    
    // Verify order changed
    await expect(page.locator('[data-testid="field-item"]:first-child')).toContainText('Content');
    await expect(page.locator('[data-testid="field-item"]:nth-child(2)')).toContainText('Title');
  });

  test('should support field validation rules', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    await page.fill('[data-testid="collection-name"]', 'Validation Test');
    
    // Add text field with validation
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'text');
    await page.fill('[data-testid="field-name"]', 'Email');
    await page.fill('[data-testid="field-slug"]', 'email');
    await page.check('[data-testid="field-required"]');
    await page.selectOption('[data-testid="validation-type"]', 'email');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Add number field with min/max
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'number');
    await page.fill('[data-testid="field-name"]', 'Age');
    await page.fill('[data-testid="field-slug"]', 'age');
    await page.fill('[data-testid="min-value"]', '18');
    await page.fill('[data-testid="max-value"]', '120');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Add text field with length constraints
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'text');
    await page.fill('[data-testid="field-name"]', 'Username');
    await page.fill('[data-testid="field-slug"]', 'username');
    await page.fill('[data-testid="min-length"]', '3');
    await page.fill('[data-testid="max-length"]', '20');
    await page.click('[data-testid="add-field-confirm"]');
    
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="collection-saved"]')).toBeVisible();
  });

  test('should support relationship fields', async ({ page }) => {
    await page.click('[data-testid="create-collection-button"]');
    await page.fill('[data-testid="collection-name"]', 'Articles');
    
    // Add relationship field
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'relation');
    await page.fill('[data-testid="field-name"]', 'Author');
    await page.fill('[data-testid="field-slug"]', 'author');
    await page.selectOption('[data-testid="relation-collection"]', 'users');
    await page.selectOption('[data-testid="relation-type"]', 'many-to-one');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Add many-to-many relationship
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'relation');
    await page.fill('[data-testid="field-name"]', 'Categories');
    await page.fill('[data-testid="field-slug"]', 'categories');
    await page.selectOption('[data-testid="relation-collection"]', 'categories');
    await page.selectOption('[data-testid="relation-type"]', 'many-to-many');
    await page.click('[data-testid="add-field-confirm"]');
    
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="collection-saved"]')).toBeVisible();
  });

  test('should allow editing existing collections', async ({ page }) => {
    // Click on existing collection to edit
    await page.click('[data-testid="collection-item-blog-posts"] [data-testid="edit-button"]');
    
    await expect(page.locator('h1')).toContainText('Edit Collection: Blog Posts');
    
    // Modify collection name
    await page.fill('[data-testid="collection-name"]', 'Updated Blog Posts');
    
    // Add new field
    await page.click('[data-testid="add-field-button"]');
    await page.selectOption('[data-testid="field-type"]', 'date');
    await page.fill('[data-testid="field-name"]', 'Published Date');
    await page.fill('[data-testid="field-slug"]', 'published-date');
    await page.click('[data-testid="add-field-confirm"]');
    
    // Update existing field
    await page.click('[data-testid="field-item-title"] [data-testid="edit-field"]');
    await page.fill('[data-testid="field-description"]', 'The title of the blog post');
    await page.click('[data-testid="update-field"]');
    
    await page.click('[data-testid="save-collection"]');
    await expect(page.locator('[data-testid="collection-updated"]')).toBeVisible();
  });

  test('should support collection deletion with confirmation', async ({ page }) => {
    await page.click('[data-testid="collection-item-test"] [data-testid="delete-button"]');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="delete-warning"]')).toContainText('This action cannot be undone');
    
    // Test cancellation
    await page.click('[data-testid="cancel-delete"]');
    await expect(page.locator('[data-testid="delete-confirmation"]')).not.toBeVisible();
    
    // Test deletion
    await page.click('[data-testid="collection-item-test"] [data-testid="delete-button"]');
    await page.fill('[data-testid="confirm-delete-input"]', 'DELETE');
    await page.click('[data-testid="confirm-delete"]');
    
    await expect(page.locator('[data-testid="collection-deleted"]')).toBeVisible();
    await expect(page.locator('[data-testid="collections-list"]')).not.toContainText('Test Collection');
  });

  test('should preview collection structure', async ({ page }) => {
    await page.click('[data-testid="collection-item-blog-posts"] [data-testid="preview-button"]');
    
    await expect(page.locator('[data-testid="collection-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-schema"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-api-endpoints"]')).toBeVisible();
    
    // Verify API endpoints are shown
    await expect(page.locator('[data-testid="api-endpoints"]')).toContainText('GET /api/collections/blog-posts');
    await expect(page.locator('[data-testid="api-endpoints"]')).toContainText('POST /api/collections/blog-posts');
    
    // Test export functionality
    await page.click('[data-testid="export-schema"]');
    
    // Should download schema file
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-json"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('blog-posts-schema');
  });

  test('should import collection from schema', async ({ page }) => {
    await page.click('[data-testid="import-collection-button"]');
    
    const schemaJson = {
      name: 'Imported Collection',
      slug: 'imported-collection',
      description: 'Collection imported from schema',
      fields: [
        {
          name: 'Title',
          slug: 'title',
          type: 'text',
          required: true
        },
        {
          name: 'Content',
          slug: 'content',
          type: 'richtext',
          required: false
        }
      ]
    };
    
    await page.setInputFiles('[data-testid="schema-file-input"]', {
      name: 'collection-schema.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(schemaJson))
    });
    
    await page.click('[data-testid="import-confirm"]');
    
    await expect(page.locator('[data-testid="import-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="collections-list"]')).toContainText('Imported Collection');
  });
});