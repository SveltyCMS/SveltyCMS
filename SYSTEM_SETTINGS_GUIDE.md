# ⚙️ System Settings Guide - Complete Explanation

This guide explains all the system settings you see in the SveltyCMS configuration panel.

---

## 📋 Overview

The **System Settings** page allows you to configure your CMS's basic settings including site identity, language preferences, and media storage. These settings are stored in the database and take effect immediately.

**Location:** Navigate to **Config → System Settings** (`/config/systemsetting`)

---

## 🔧 Setting Explanations

### 1. **Site Name**

**What it is:**

- The public name of your CMS/website
- Displayed in the admin panel header, emails, and public-facing areas
- Used in page titles and metadata

**Current Value:** `SveltyCMS`

**How to Change:**

- Enter your desired site name (1-100 characters)
- Examples: "My Blog", "Company CMS", "News Portal"

**Best Practices:**

- Use a clear, descriptive name
- Keep it concise (under 50 characters recommended)
- Avoid special characters that might cause issues

---

### 2. **Production URL**

**What it is:**

- The full URL where your CMS will be accessible in production
- Used for:
  - OAuth callback URLs (Google, GitHub, etc.)
  - Email links (password reset, notifications)
  - API endpoint references
  - CORS configuration

**Current Value:** `https://localhost:5173`

**⚠️ Important:**

- This should be your **actual production domain**, not localhost
- Must start with `http://` or `https://`
- Should not have a trailing slash

**Examples:**

- ✅ `https://mycms.com`
- ✅ `https://cms.example.com`
- ❌ `mycms.com` (missing protocol)
- ❌ `https://mycms.com/` (trailing slash)

**For Development:**

- Keep `http://localhost:5173` for local development
- Change to your production URL before deploying

---

### 3. **Media Storage Type**

**What it is:**

- Determines where uploaded files (images, documents, videos) are stored
- Options available: **Local Storage**, **S3**, **R2**, **Cloudinary**

**Current Value:** `📁 Local Storage`

**Storage Options Explained:**

#### 📁 **Local Storage** (Current)

- Files stored on your server's filesystem
- **Pros:** Simple setup, no additional services needed
- **Cons:** Limited scalability, requires server storage space
- **Best for:** Small to medium sites, development, single-server deployments

#### ☁️ **S3 (Amazon S3)**

- Files stored in Amazon S3 buckets
- **Pros:** Scalable, reliable, CDN integration
- **Cons:** Requires AWS account and configuration
- **Best for:** Production sites, high traffic, global distribution

#### ☁️ **R2 (Cloudflare R2)**

- Files stored in Cloudflare R2 (S3-compatible)
- **Pros:** No egress fees, S3-compatible API
- **Cons:** Requires Cloudflare account
- **Best for:** Cost-effective cloud storage

#### 🖼️ **Cloudinary**

- Files stored and optimized by Cloudinary
- **Pros:** Automatic image optimization, transformations, CDN
- **Cons:** Requires Cloudinary account
- **Best for:** Image-heavy sites, automatic optimization needs

**How to Change:**

1. Select your preferred storage type from the dropdown
2. Configure additional settings (if needed):
   - **S3/R2:** Bucket name, region, access keys
   - **Cloudinary:** Cloud name, API key, API secret
3. Save changes

**⚠️ Warning:** Changing storage type requires migrating existing files!

---

### 4. **Media Folder Path**

**What it is:**

- The server path where media files are stored (for Local Storage)
- OR the bucket/container name (for cloud storage)

**Current Value:** `./mediaFolder`

**For Local Storage:**

- Relative path from your project root
- Examples:
  - `./mediaFolder` (recommended)
  - `./uploads`
  - `/var/www/media` (absolute path)

**For Cloud Storage:**

- Your S3 bucket name, R2 bucket name, or Cloudinary folder

**Best Practices:**

- Use relative paths for portability
- Ensure the folder exists and has write permissions
- Don't use spaces or special characters
- Keep it organized (e.g., `./mediaFolder` not `./files`)

**Permissions Required:**

- Read and write access for the web server user
- Typically: `chmod 755 mediaFolder` or `chmod 775 mediaFolder`

---

### 5. **Default System Language**

**What it is:**

- The default language for the **CMS admin interface**
- Used when a user hasn't selected a language preference
- Controls UI text, buttons, labels, etc.

**Current Value:** `English (EN)`

**Available Options:**

- English (EN)
- Deutsch (DE)
- And other languages configured in your system

**How it Works:**

- When you log in, the admin panel displays in this language
- Users can change their language preference (if multiple are available)
- This is separate from content languages

**Best Practices:**

- Choose the primary language your team uses
- Ensure your team understands this language
- Can be changed later without affecting content

---

### 6. **System Languages**

**What it is:**

- List of languages available for the **CMS admin interface**
- Users can switch between these languages in the admin panel
- Limited to languages configured in ParaglideJS

**Current Value:**

- `English (EN)`
- `Deutsch (DE)`

**How to Add More:**

1. Click the **"Add"** button
2. Search for or select a language code (ISO 639-1)
3. The language will be added to the list
4. Save changes

**Available System Languages:**

- Limited to languages that have translations in the system
- Typically: English, German, French, Spanish, etc.
- Check `/docs` for full list of supported languages

**⚠️ Note:**

- Removing a language doesn't delete existing translations
- But users won't be able to switch to removed languages
- Default language cannot be removed

---

### 7. **Default Content Language**

**What it is:**

- The default language for **content entries** (posts, pages, etc.)
- Used when creating new content without specifying a language
- Controls which language version is shown by default

**Current Value:** `English (EN)`

**How it Works:**

- When you create a new post/page, it defaults to this language
- You can add translations in other content languages
- This is separate from system languages (admin UI)

**Best Practices:**

- Choose your primary content language
- Should match your target audience
- Can be different from system language

---

### 8. **Content Languages**

**What it is:**

- List of languages available for **content creation**
- You can create content in any of these languages
- Supports 150+ languages (ISO 639-1 standard)

**Current Value:**

- `English (EN)`
- `Deutsch (DE)`

**How to Add More:**

1. Click the **"Add"** button
2. Search for or enter a language code (e.g., `fr` for French, `es` for Spanish)
3. The language will be added to the list
4. Save changes

**Available Languages:**

- Supports 150+ languages from ISO 639-1
- Examples: `fr` (French), `es` (Spanish), `ja` (Japanese), `zh` (Chinese), etc.

**⚠️ CRITICAL WARNING:**

- **Removing a content language can cause DATA LOSS!**
- If you remove a language after creating content in that language:
  - The translations remain in the database
  - But they become inaccessible through the UI
  - If you edit and save content, those translations may be permanently deleted
- **Always export/backup content before removing languages**

**Best Practices:**

- Add all languages you plan to use upfront
- Don't remove languages that have existing content
- Export content before removing languages
- Test language removal on a staging environment first

---

## 🔄 Reset Data Button

**What it does:**

- Resets all system settings in this group to their default values
- Removes any custom configurations you've made
- Restores factory defaults

**⚠️ Warning:**

- This action **cannot be undone**
- You'll lose all custom settings
- May require reconfiguration

**When to Use:**

- If you've made mistakes and want to start over
- To restore default values after testing
- When migrating from another system

**What Gets Reset:**

- Site Name → `SveltyCMS`
- Production URL → `https://yourdomain.com`
- Media Storage Type → `local`
- Media Folder Path → `./mediaFolder`
- Default System Language → `en`
- System Languages → `['en']`
- Default Content Language → `en`
- Content Languages → `['en']`

**How to Use:**

1. Click **"Reset Data"** button
2. Confirm the action in the popup
3. Settings will revert to defaults
4. You can then reconfigure as needed

---

## 💾 Saving Changes

**How to Save:**

1. Make your changes to any settings
2. Click the **"Save Changes"** button at the bottom
3. Wait for the success message
4. Changes take effect immediately (no restart needed)

**Validation:**

- Invalid values will be highlighted
- Error messages explain what's wrong
- You must fix errors before saving

**What Happens:**

- Settings are saved to the database
- Cache is automatically cleared
- Changes are applied immediately
- All users see the new settings

---

## 📝 Configuration Examples

### Example 1: Small Blog (English Only)

```
Site Name: My Blog
Production URL: https://myblog.com
Media Storage: Local Storage
Media Folder: ./mediaFolder
Default System Language: English (EN)
System Languages: English (EN)
Default Content Language: English (EN)
Content Languages: English (EN)
```

### Example 2: Multilingual News Site

```
Site Name: Global News CMS
Production URL: https://news.example.com
Media Storage: S3
Media Folder: news-media-bucket
Default System Language: English (EN)
System Languages: English (EN), Deutsch (DE), Français (FR)
Default Content Language: English (EN)
Content Languages: English (EN), Deutsch (DE), Français (FR), Español (ES)
```

### Example 3: E-Commerce Site (Cloud Storage)

```
Site Name: Shop CMS
Production URL: https://shop.example.com
Media Storage: Cloudinary
Media Folder: shop-media
Default System Language: English (EN)
System Languages: English (EN)
Default Content Language: English (EN)
Content Languages: English (EN), 中文 (ZH), 日本語 (JA)
```

---

## ⚠️ Important Notes

### Language Configuration

1. **System Languages vs Content Languages:**
   - **System Languages:** Admin interface languages (limited set)
   - **Content Languages:** Content creation languages (150+ available)

2. **Default Language Rules:**
   - Default System Language must be in System Languages list
   - Default Content Language must be in Content Languages list
   - You cannot remove a language that is set as default

3. **Data Safety:**
   - Always backup before removing content languages
   - Export content in languages you plan to remove
   - Test language changes on staging first

### Media Storage

1. **Local Storage:**
   - Ensure folder has proper permissions
   - Monitor disk space usage
   - Set up regular backups

2. **Cloud Storage:**
   - Configure credentials in separate settings
   - Test upload/download before production
   - Monitor storage costs

3. **Migration:**
   - Plan migration carefully
   - Test thoroughly before switching
   - Keep backups of all files

### Production URL

1. **Development:**
   - Use `http://localhost:5173` for local development
   - Don't use localhost in production

2. **Production:**
   - Use your actual domain
   - Must use HTTPS in production
   - Update OAuth callbacks if using OAuth

---

## 🔍 Troubleshooting

### Problem: Changes Not Saving

**Solutions:**

1. Check for validation errors (red highlights)
2. Ensure all required fields are filled
3. Check browser console for errors
4. Verify you have admin permissions
5. Try refreshing the page

### Problem: Language Not Appearing

**Solutions:**

1. Ensure language code is valid (2 letters, lowercase)
2. Check if language is in the correct list (system vs content)
3. Save changes and refresh page
4. Clear browser cache

### Problem: Media Uploads Failing

**Solutions:**

1. Check media folder permissions (for local storage)
2. Verify cloud storage credentials (for cloud storage)
3. Check available disk space
4. Review server logs for errors

### Problem: Production URL Issues

**Solutions:**

1. Ensure URL starts with `http://` or `https://`
2. Remove trailing slashes
3. Verify domain is correct
4. Check DNS settings if using custom domain

---

## 📚 Related Documentation

- [System Settings Architecture](/docs/architecture/system-settings-architecture.mdx)
- [Setup Wizard Guide](/docs/guides/configuration/setup-wizard.mdx)
- [Media Storage Guide](/docs/guides/content/media-gallery-guide.mdx)
- [Language Configuration](/docs/architecture/system-settings-architecture.mdx#language-configuration-warnings)

---

## ✅ Quick Checklist

Before saving your settings, verify:

- [ ] Site Name is clear and descriptive
- [ ] Production URL is correct (not localhost in production)
- [ ] Media Storage Type matches your needs
- [ ] Media Folder Path is correct and has permissions
- [ ] Default System Language is appropriate
- [ ] System Languages include all needed admin UI languages
- [ ] Default Content Language matches your audience
- [ ] Content Languages include all needed content languages
- [ ] No validation errors shown
- [ ] You've backed up before removing languages

---

**Need Help?** Check the [System Settings Documentation](/docs/guides/configuration/system-settings.mdx) or contact support.
