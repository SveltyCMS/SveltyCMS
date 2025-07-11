---
title: 'First Steps'
description: 'Essential first steps to begin your journey with SveltyCMS'
icon: 'mdi:foot-print'
---

# First Steps with SveltyCMS

This guide will walk you through your first steps with SveltyCMS, from initial setup to creating your first content.

## Initial Setup

SveltyCMS includes an automated CLI installer that makes setup effortless:

1. **Clone or Download SveltyCMS**

   ```bash
   git clone https://github.com/SveltyCMS/SveltyCMS.git
   cd SveltyCMS
   ```

2. **Install Dependencies**

   ```bash
   bun install  # or npm install
   ```

3. **Start the Development Server**

   ```bash
   bun run dev  # or npm run dev
   ```

4. **Complete the Setup**
   - The CLI installer launches automatically when configuration files are missing
   - Follow the interactive prompts to configure your CMS
   - Set up database connection, admin credentials, and basic settings
   - The installer handles all configuration file creation

## Accessing Your CMS

After the installer completes:

1. Open your browser and navigate to:

   ```
   http://localhost:5173
   ```

2. Log in with the administrator credentials you created during setup

## Understanding the Dashboard

![Dashboard Overview](../../../static/docs/dashboard.png)

The dashboard is your control center, featuring:

1. **Left Sidebar**
   - Collections menu
   - Media library
   - User management
   - System settings

2. **Top Bar**
   - Site name
   - Language selector
   - User menu
   - Theme switcher

3. **Main Content Area**
   - Quick actions
   - Recent content
   - System status

## Creating Your First Collection

Collections are the building blocks of your content. Let's create a simple blog post collection:

1. Click "Collections" in the left sidebar
2. Click "Create New Collection"
3. Fill in the basics:
   - Name: "Blog Posts"
   - Handle: "blog_posts" (automatically generated)
   - Description: "Our blog articles"

4. Add some fields:
   - Title (Text field)
   - Content (Rich Text field)
   - Featured Image (Media field)
   - Publication Date (Date field)

5. Click "Save Collection"

## Adding Your First Content

Now let's create your first blog post:

1. Go to "Collections" → "Blog Posts"
2. Click "Create New Entry"
3. Fill in your content:
   - Title: Your post title
   - Content: Write or paste your content
   - Add a featured image
   - Set publication date

4. Click "Save" or "Publish"

## Managing Media

The Media Library helps you organize your files:

1. Click "Media" in the left sidebar
2. Upload files by:
   - Dragging and dropping
   - Using the upload button
   - Pasting from clipboard

3. Organize with virtual folders:
   - Create folders
   - Move files
   - Add tags

## Next Steps

Now that you're familiar with the basics, explore:

1. [Collections Guide](../01_Content_Management/Collections.md) - Learn more about content types
2. [Media Management](../01_Content_Management/Media.md) - Master file management
3. [User Interface](../02_User_Interface/Navigation.md) - Discover more UI features

## Tips for Success

- Use meaningful names for collections and fields
- Organize media into folders from the start
- Set up user roles before adding team members
- Regularly check your content's preview
- Use the multi-language features if needed

## Need More Help?

- Check our [User Interface Guide](../02_User_Interface/Dashboard.md)
- Review [Administration Settings](../03_Administration/Settings.md)
- Visit our [GitHub repository](https://github.com/SveltyCMS/SveltyCMS)
