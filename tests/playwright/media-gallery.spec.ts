import { test, expect } from '@playwright/test';
import { createReadStream } from 'fs';
import path from 'path';

test.describe('Media Gallery Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to media gallery
    await page.goto('/admin/media');
  });

  test('should display media gallery interface', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Media Gallery');
    await expect(page.locator('[data-testid="upload-area"]')).toBeVisible();
    await expect(page.locator('[data-testid="media-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-media"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-dropdown"]')).toBeVisible();
  });

  test('should upload single image file', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'testthumb.png');
    
    // Upload file via drag and drop area
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    
    // Verify upload progress
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-progress"]')).toContainText('100%');
    
    // Verify file appears in gallery
    await expect(page.locator('[data-testid="media-item"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="media-item"] img').first()).toBeVisible();
  });

  test('should upload multiple files at once', async ({ page }) => {
    const testFiles = [
      path.join(__dirname, 'testthumb.png'),
      // Add more test files if available
    ];
    
    await page.setInputFiles('[data-testid="file-input"]', testFiles);
    
    // Wait for all uploads to complete
    await expect(page.locator('[data-testid="upload-complete"]')).toBeVisible();
    
    // Verify all files are in gallery
    const mediaItems = page.locator('[data-testid="media-item"]');
    await expect(mediaItems).toHaveCount(testFiles.length);
  });

  test('should validate file types and sizes', async ({ page }) => {
    // Test unsupported file type
    const invalidFile = Buffer.from('invalid content');
    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'test.exe',
      mimeType: 'application/octet-stream',
      buffer: invalidFile
    });
    
    await expect(page.locator('[data-testid="upload-error"]')).toContainText('File type not supported');
    
    // Test file too large (mock large file)
    const largeFile = Buffer.alloc(20 * 1024 * 1024); // 20MB
    await page.setInputFiles('[data-testid="file-input"]', {
      name: 'large-image.jpg',
      mimeType: 'image/jpeg',
      buffer: largeFile
    });
    
    await expect(page.locator('[data-testid="upload-error"]')).toContainText('File size too large');
  });

  test('should display file information and metadata', async ({ page }) => {
    // Upload a test file first
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Click on media item to view details
    await page.click('[data-testid="media-item"]');
    
    await expect(page.locator('[data-testid="media-details"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-size"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-type"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-date"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-dimensions"]')).toBeVisible();
  });

  test('should edit media metadata', async ({ page }) => {
    // Upload and select a file
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    await page.click('[data-testid="media-item"]');
    
    // Edit metadata
    await page.click('[data-testid="edit-metadata"]');
    
    await page.fill('[data-testid="alt-text"]', 'Test image alt text');
    await page.fill('[data-testid="caption"]', 'This is a test image caption');
    await page.fill('[data-testid="description"]', 'Detailed description of the test image');
    await page.fill('[data-testid="tags"]', 'test, image, thumbnail');
    
    await page.click('[data-testid="save-metadata"]');
    
    await expect(page.locator('[data-testid="metadata-saved"]')).toBeVisible();
    
    // Verify metadata is saved
    await expect(page.locator('[data-testid="alt-text-display"]')).toContainText('Test image alt text');
    await expect(page.locator('[data-testid="caption-display"]')).toContainText('This is a test image caption');
  });

  test('should search and filter media files', async ({ page }) => {
    // Upload test files with different names and types
    await page.setInputFiles('[data-testid="file-input"]', path.join(__dirname, 'testthumb.png'));
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Test search functionality
    await page.fill('[data-testid="search-media"]', 'testthumb');
    await page.press('[data-testid="search-media"]', 'Enter');
    
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(1);
    
    // Test filter by type
    await page.selectOption('[data-testid="filter-type"]', 'image');
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(1);
    
    // Test filter by date
    await page.selectOption('[data-testid="filter-date"]', 'today');
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(1);
    
    // Clear filters
    await page.click('[data-testid="clear-filters"]');
    await expect(page.locator('[data-testid="search-media"]')).toHaveValue('');
  });

  test('should organize media into folders', async ({ page }) => {
    // Create new folder
    await page.click('[data-testid="create-folder"]');
    await page.fill('[data-testid="folder-name"]', 'Test Folder');
    await page.click('[data-testid="create-folder-confirm"]');
    
    await expect(page.locator('[data-testid="folder-item"]')).toContainText('Test Folder');
    
    // Upload file to folder
    await page.click('[data-testid="folder-item"]:has-text("Test Folder")');
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    
    // Verify file is in folder
    await expect(page.locator('[data-testid="current-folder"]')).toContainText('Test Folder');
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(1);
    
    // Navigate back to root
    await page.click('[data-testid="folder-breadcrumb-root"]');
    await expect(page.locator('[data-testid="current-folder"]')).toContainText('Root');
  });

  test('should move files between folders', async ({ page }) => {
    // Upload a file
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Create destination folder
    await page.click('[data-testid="create-folder"]');
    await page.fill('[data-testid="folder-name"]', 'Destination');
    await page.click('[data-testid="create-folder-confirm"]');
    
    // Select file and move
    await page.click('[data-testid="media-item"]');
    await page.click('[data-testid="move-file"]');
    await page.selectOption('[data-testid="destination-folder"]', 'Destination');
    await page.click('[data-testid="confirm-move"]');
    
    await expect(page.locator('[data-testid="file-moved"]')).toBeVisible();
    
    // Verify file is moved
    await page.click('[data-testid="folder-item"]:has-text("Destination")');
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(1);
  });

  test('should delete media files with confirmation', async ({ page }) => {
    // Upload a file
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Delete file
    await page.click('[data-testid="media-item"]');
    await page.click('[data-testid="delete-file"]');
    
    // Confirm deletion
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();
    await expect(page.locator('[data-testid="delete-warning"]')).toContainText('permanently deleted');
    
    await page.click('[data-testid="confirm-delete"]');
    
    await expect(page.locator('[data-testid="file-deleted"]')).toBeVisible();
    await expect(page.locator('[data-testid="media-item"]')).toHaveCount(0);
  });

  test('should bulk select and operate on multiple files', async ({ page }) => {
    // Upload multiple files
    const testFiles = [path.join(__dirname, 'testthumb.png')];
    await page.setInputFiles('[data-testid="file-input"]', testFiles);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Enable bulk selection mode
    await page.click('[data-testid="bulk-select-mode"]');
    
    // Select multiple files
    await page.click('[data-testid="media-item"]:nth-child(1) [data-testid="select-checkbox"]');
    
    await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible();
    await expect(page.locator('[data-testid="selected-count"]')).toContainText('1 selected');
    
    // Test bulk delete
    await page.click('[data-testid="bulk-delete"]');
    await page.click('[data-testid="confirm-bulk-delete"]');
    
    await expect(page.locator('[data-testid="bulk-delete-success"]')).toBeVisible();
  });

  test('should generate different image sizes and formats', async ({ page }) => {
    // Upload image
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // View image details
    await page.click('[data-testid="media-item"]');
    
    // Check image variants
    await expect(page.locator('[data-testid="image-variants"]')).toBeVisible();
    await expect(page.locator('[data-testid="thumbnail-variant"]')).toBeVisible();
    await expect(page.locator('[data-testid="medium-variant"]')).toBeVisible();
    await expect(page.locator('[data-testid="large-variant"]')).toBeVisible();
    
    // Test manual image optimization
    await page.click('[data-testid="optimize-image"]');
    await page.selectOption('[data-testid="output-format"]', 'webp');
    await page.fill('[data-testid="quality"]', '80');
    await page.click('[data-testid="apply-optimization"]');
    
    await expect(page.locator('[data-testid="optimization-complete"]')).toBeVisible();
  });

  test('should integrate with content editor', async ({ page }) => {
    // Upload image
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Open media picker from content editor context
    await page.goto('/admin/collections/blog-posts/create');
    await page.click('[data-testid="insert-media"]');
    
    await expect(page.locator('[data-testid="media-picker"]')).toBeVisible();
    await expect(page.locator('[data-testid="media-picker"] [data-testid="media-item"]')).toHaveCount(1);
    
    // Select image
    await page.click('[data-testid="media-picker"] [data-testid="media-item"]');
    await page.click('[data-testid="insert-selected"]');
    
    // Verify image is inserted in editor
    await expect(page.locator('[data-testid="content-editor"] img')).toBeVisible();
  });

  test('should handle media CDN and external storage', async ({ page }) => {
    // Mock CDN configuration
    await page.addInitScript(() => {
      window.localStorage.setItem('media-cdn-enabled', 'true');
    });
    
    // Upload file
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Check CDN URL is generated
    await page.click('[data-testid="media-item"]');
    await expect(page.locator('[data-testid="cdn-url"]')).toBeVisible();
    await expect(page.locator('[data-testid="cdn-url"]')).toContainText('cdn.');
    
    // Test different CDN endpoints
    await expect(page.locator('[data-testid="original-url"]')).toBeVisible();
    await expect(page.locator('[data-testid="optimized-url"]')).toBeVisible();
  });

  test('should display media usage and references', async ({ page }) => {
    // Upload and use a file in content
    const testImagePath = path.join(__dirname, 'testthumb.png');
    await page.setInputFiles('[data-testid="file-input"]', testImagePath);
    await page.waitForSelector('[data-testid="media-item"]');
    
    // Click to view details
    await page.click('[data-testid="media-item"]');
    
    // Check usage information
    await expect(page.locator('[data-testid="usage-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="referenced-content"]')).toBeVisible();
    
    // Should show warning if trying to delete used media
    await page.click('[data-testid="delete-file"]');
    await expect(page.locator('[data-testid="usage-warning"]')).toContainText('used in content');
  });
});