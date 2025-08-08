---
title: Widget Management System
description: Comprehensive guide to SveltyCMS widget architecture with core/custom categorization, dependency management, and multi-tenant support
type: dev
icon: mdi:widgets
folder: 05-developer-guide
order: 52
created: 2025-08-05
updated: 2025-08-05
---

# Widget Management System

## Overview

The SveltyCMS widget management system provides a robust architecture for handling both core and custom widgets with proper dependency management, tenant isolation, and database synchronization.

## Architecture

### Core Concepts

- **Core Widgets**: Essential widgets that are always enabled by default (e.g., `input`, `richText`, `date`)
- **Custom Widgets**: Optional widgets that can be enabled/disabled per tenant (e.g., `seo`, `colorPicker`, `rating`)
- **Widget Dependencies**: Widgets can depend on other widgets, preventing invalid configurations
- **Tenant Isolation**: Multi-tenant support with per-tenant widget configurations

### File Structure

```
src/
├── stores/
│   └── widgetStore.svelte.ts          # Centralized widget state management
├── widgets/
│   ├── core/                          # Core widgets (always enabled)
│   │   ├── input/
│   │   ├── richText/
│   │   └── ...
│   ├── custom/                        # Custom widgets (optional)
│   │   ├── seo/
│   │   ├── colorPicker/
│   │   └── ...
│   ├── widgetManager.svelte.ts        # Legacy compatibility layer
│   └── types.ts                       # Widget type definitions
└── routes/api/widgets/                # Widget API endpoints
    ├── active/+server.ts              # Get active widgets
    ├── status/+server.ts              # Update widget status
    └── collections/
        └── widgets/
            ├── required/+server.ts    # Get widgets required by collections
            └── validate/+server.ts    # Validate collections against widgets
```

## Usage

### Basic Widget Operations

```typescript
import { widgetStoreActions, isWidgetActive, canDisableWidget, getWidgetDependencies } from '@stores/widgetStore.svelte';

// Initialize widgets for a tenant
await widgetStoreActions.initializeWidgets('tenant123');

// Check widget status
const isActive = isWidgetActive('SEO');
const canDisable = canDisableWidget('SEO');
const deps = getWidgetDependencies('SEO');

// Update widget status
await widgetStoreActions.updateWidgetStatus('SEO', 'active', 'tenant123');

// Bulk activate widgets with dependency resolution
await widgetStoreActions.bulkActivateWidgets(['SEO', 'ColorPicker'], 'tenant123');
```

### Collection Analysis

```typescript
// Get widgets required by all collections
const requiredWidgets = await widgetStoreActions.getRequiredWidgetsByCollections('tenant123');

// Validate collections against current widget state
const validation = await widgetStoreActions.validateCollectionsAgainstWidgets('tenant123');
console.log(`Valid: ${validation.valid}, Invalid: ${validation.invalid}`);
console.log('Warnings:', validation.warnings);
```

### Widget Store State

The widget store maintains the following state:

```typescript
interface WidgetStoreState {
	widgets: Record<string, Widget>; // Widget instances
	widgetFunctions: Record<string, WidgetFunction>; // Widget factory functions
	activeWidgets: string[]; // Currently active widget names
	coreWidgets: string[]; // Core widget names (always enabled)
	customWidgets: string[]; // Custom widget names (optional)
	dependencyMap: Record<string, string[]>; // Widget dependencies
	isLoaded: boolean; // Initialization status
	isLoading: boolean; // Loading state
	tenantId?: string; // Current tenant context
}
```

## Widget Development

### Creating a Core Widget

1. Create directory: `src/widgets/core/myWidget/`
2. Add `index.ts` with widget function:

```typescript
// src/widgets/core/myWidget/index.ts
export default function MyWidget(config: Record<string, unknown>) {
	return {
		Name: 'MyWidget',
		component: MyWidgetComponent,
		config
		// ... other widget properties
	};
}

MyWidget.Name = 'My Widget';
MyWidget.Icon = 'mdi:widget';
MyWidget.Description = 'A core widget';
MyWidget.dependencies = []; // Optional dependencies
```

### Creating a Custom Widget

1. Create directory: `src/widgets/custom/myCustomWidget/`
2. Add `index.ts` with widget function (same structure as core widgets)
3. The widget will be automatically categorized as 'custom'

### Widget Dependencies

Declare dependencies in your widget:

```typescript
export default function SEOWidget(config: Record<string, unknown>) {
	// ... widget implementation
}

SEOWidget.dependencies = ['Input', 'RichText']; // Dependencies on other widgets
```

## API Endpoints

### GET `/api/widgets/active`

Get currently active widgets for a tenant.

**Headers:**

- `X-Tenant-ID`: Tenant identifier (optional)

**Response:**

```json
{
	"widgets": ["Input", "RichText", "SEO"],
	"tenantId": "tenant123"
}
```

### POST `/api/widgets/status`

Update widget activation status.

**Headers:**

- `X-Tenant-ID`: Tenant identifier (optional)

**Body:**

```json
{
	"widgetName": "SEO",
	"isActive": true
}
```

### GET `/api/collections/widgets/required`

Get widgets required by all collections.

**Headers:**

- `X-Tenant-ID`: Tenant identifier (optional)

**Response:**

```json
{
	"requiredWidgets": ["Input", "RichText", "Date"],
	"collectionsAnalyzed": 5,
	"tenantId": "tenant123"
}
```

### GET `/api/collections/widgets/validate`

Validate collections against current widget state.

**Query Parameters:**

- `activeWidgets`: Comma-separated list of active widget names

**Headers:**

- `X-Tenant-ID`: Tenant identifier (optional)

**Response:**

```json
{
	"valid": 3,
	"invalid": 2,
	"warnings": ["Collection 'posts' requires inactive widgets: SEO, SocialShare"],
	"total": 5,
	"tenantId": "tenant123"
}
```

## Multi-Tenant Support

The widget system supports multi-tenancy:

- Each tenant can have different widget activation states
- Core widgets are always active for all tenants
- Custom widgets can be enabled/disabled per tenant
- Widget configurations are isolated per tenant

## Error Handling

The system includes comprehensive error handling:

- **Dependency Validation**: Prevents disabling widgets that other widgets depend on
- **Core Widget Protection**: Prevents disabling essential core widgets
- **Missing Dependencies**: Warns when activating widgets with inactive dependencies
- **Collection Validation**: Identifies collections that require inactive widgets

## Performance Considerations

- Widget loading uses dynamic imports for code splitting
- Client-side state is synchronized with server-side database
- Hot Module Replacement (HMR) support for development
- Efficient dependency resolution algorithms

## Migration from Legacy System

The new system maintains backward compatibility through `widgetManager.svelte.ts`. Existing code will continue to work while you migrate to the new store-based approach.

To migrate:

1. Replace imports from `@widgets/widgetManager.svelte` with `@stores/widgetStore.svelte`
2. Update function calls to use the new store actions
3. Add tenant context where applicable
4. Utilize new features like dependency management and collection validation

## Troubleshooting

### Common Issues

1. **"Cannot disable core widget"**: Core widgets cannot be disabled as they're essential
2. **"Missing dependencies"**: Activate required widgets before activating dependent widgets
3. **"Widget database adapter not available"**: Ensure database connection is properly configured
4. **Collection validation warnings**: Activate required widgets or update collection schemas

### Debug Information

Enable debug logging to see detailed widget operations:

```typescript
import { logger } from '@utils/logger.svelte';
logger.setLevel('debug');
```

## Future Enhancements

- Widget versioning and migration support
- Advanced dependency resolution with automatic activation
- Widget marketplace integration
- Performance metrics and analytics
- A/B testing support for widget configurations
