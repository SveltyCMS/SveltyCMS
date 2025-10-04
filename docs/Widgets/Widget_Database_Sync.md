# Widget Database Sync

## Understanding Widget Status

### The Dual Nature of Widgets

Your SveltyCMS widget system has **two layers**:

1. **File System Layer** (Code)
   - Located in `src/widgets/core/` and `src/widgets/custom/`
   - These are the actual widget implementations
   - **Always available for import** in collection files
   - Example: `import widgets from '@widgets';`

2. **Database Layer** (Configuration)
   - Stored in MongoDB's `widgets` collection
   - Tracks which widgets are "active" for the UI
   - Controls widget visibility in the dashboard
   - Used for permission management

### The Confusion

When you see **"Custom: 0"** in the Widget Dashboard but your `WidgetTest.ts` file uses custom widgets successfully, this is because:

- ✅ **File System**: Custom widgets exist and work in code
- ❌ **Database**: Custom widgets aren't registered as "active"

## Why This Happens

### Initial State

- Core widgets are automatically registered in the database on first initialization
- Custom widgets are loaded from the file system but NOT automatically registered in the database
- This is by design to give admins control over which widgets are "enabled"

### Your Situation

Your `config/collections/Collections/WidgetTest.ts` successfully uses widgets like:

```typescript
widgets.Input({ ... })
widgets.Email({ ... })
widgets.RemoteVideo({ ... })
// ... etc
```

These work because:

1. The widget store loads them from `src/widgets/` on initialization
2. Collection files import directly from the widget store
3. **Database status doesn't affect code imports**

## Solution: Sync Widgets

### Option 1: Use the Sync Button (Recommended)

1. Go to the Widget Dashboard at `/config/widgetManagement`
2. Click the **"Sync Widgets"** button in the top-right
3. This will:
   - Scan all widgets in `src/widgets/core/` and `src/widgets/custom/`
   - Create database records for any missing widgets
   - Activate all core widgets automatically
   - Leave custom widgets inactive (you can activate them individually)

### Option 2: Use the API Directly

```bash
# POST request to sync endpoint
curl -X POST http://your-site.com/api/widgets/sync \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: your-tenant-id"
```

### What the Sync Does

The sync operation will:

1. **Scan File System**
   - Discovers all widgets in `src/widgets/core/` and `src/widgets/custom/`
   - Extracts metadata (name, description, icon, dependencies)

2. **Compare with Database**
   - Identifies widgets that exist in files but not in DB
   - Identifies widgets that need activation

3. **Create Missing Records**

   ```json
   {
   	"name": "Email",
   	"description": "Email input widget",
   	"icon": "mdi:email",
   	"isCore": true,
   	"isActive": true, // Core widgets auto-activated
   	"version": "1.0.0",
   	"dependencies": []
   }
   ```

4. **Report Results**
   - Created: New widgets added to database
   - Activated: Core widgets that were inactive
   - Skipped: Widgets already in database and correct
   - Errors: Any widgets that failed to sync

## Expected Behavior After Sync

### Before Sync

```
Widget Dashboard:
- Total: 15
- Core: 15
- Custom: 0  ← Shows 0 because not in database
- Active: 15

Your Code:
✅ All widgets work fine (including custom)
```

### After Sync

```
Widget Dashboard:
- Total: 25 (example)
- Core: 15
- Custom: 10  ← Now shows custom widgets!
- Active: 15 (core only)

Your Code:
✅ All widgets still work fine
```

## Activating Custom Widgets

After syncing, custom widgets will be **registered but inactive**. To activate them:

### Via Dashboard

1. Filter by "Custom" or "Inactive"
2. Find the widget you want to enable
3. Click the toggle switch
4. Widget is now active and visible to users

### Via API

```javascript
await fetch('/api/widgets/status', {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-Tenant-ID': tenantId
	},
	body: JSON.stringify({
		widgetName: 'MyCustomWidget',
		isActive: true
	})
});
```

## Why This Design?

### Separation of Concerns

1. **File System** (Development)
   - Widget code lives here
   - Developers add/modify widgets
   - Always available for import

2. **Database** (Administration)
   - Admins control which widgets are "enabled"
   - Tenant-specific widget configurations
   - Permission management

### Benefits

- ✅ **Developer Freedom**: Add widgets without DB changes
- ✅ **Admin Control**: Enable/disable widgets without code changes
- ✅ **Multi-Tenant**: Different tenants can enable different widgets
- ✅ **Security**: Admins can disable widgets without deleting code

## Common Scenarios

### Scenario 1: Added a New Custom Widget

1. Create widget files in `src/widgets/custom/MyWidget/`
2. Widget works immediately in collection files
3. But doesn't show in dashboard
4. **Solution**: Click "Sync Widgets" button

### Scenario 2: Custom Widget Shows as Inactive

1. Widget is registered in database
2. But toggle switch is OFF
3. **Solution**: Click toggle to activate it

### Scenario 3: After Git Pull / Team Development

1. Team member added new widgets
2. You pulled their changes
3. Widgets work in code but dashboard shows old count
4. **Solution**: Click "Sync Widgets" to update database

## Troubleshooting

### Sync Button Doesn't Appear

- Check your user role (must be admin or super-admin)
- Verify `canManageWidgets` permission

### Sync Fails

- Check API logs for errors
- Verify database connection
- Ensure widget files have proper exports

### Widget Still Shows Inactive After Sync

- Core widgets auto-activate
- Custom widgets require manual activation
- Click the toggle switch to enable

## Technical Details

### API Endpoint

- **Path**: `/api/widgets/sync`
- **Method**: POST
- **Auth**: Required (admin only)
- **Tenant**: Uses `X-Tenant-ID` header or user's tenant

### Database Collection

```javascript
// widgets collection schema
{
  name: String,          // Widget name (e.g., "Email")
  description: String,   // Widget description
  icon: String,         // Iconify icon name
  isCore: Boolean,      // true for core, false for custom
  isActive: Boolean,    // Activation status
  version: String,      // Widget version
  dependencies: Array,  // Other widgets this depends on
  createdAt: Date,
  updatedAt: Date
}
```

### Widget Store

- Loads widgets from file system on initialization
- Queries database for active status
- Merges both sources for complete widget info

## Best Practices

1. **Run Sync After**:
   - Adding new widgets
   - Pulling changes from git
   - Deploying to new environment

2. **Check Dashboard**:
   - Verify widget counts match expectations
   - Activate custom widgets as needed
   - Review widget descriptions and metadata

3. **Team Communication**:
   - Notify team when adding new widgets
   - Document custom widget purposes
   - Share activation status across environments

## Summary

**The Widget Dashboard showing "Custom: 0" is not a bug** - it simply means your custom widgets aren't yet registered in the database. Your code works fine because it imports from the file system.

**Solution**: Click the "Sync Widgets" button to register all file system widgets in the database, then activate the custom widgets you want to use via the UI.

This design gives you the flexibility to develop widgets independently while giving admins control over which widgets are enabled for users.
