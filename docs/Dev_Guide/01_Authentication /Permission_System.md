---
title: 'Permission System'
description: 'Advanced permission system with role-based access control and silent security features.'
updated: '2025-07-11'
---

# Permission System

## Overview

SveltyCMS implements a comprehensive permission system that provides role-based access control (RBAC) with advanced security features including silent permission denial for enhanced security.

## Key Features

- ✅ **Role-Based Access Control** - Admin, Editor, User roles with granular permissions
- ✅ **Context-Aware Permissions** - Permissions tied to specific contexts (system, user, content)
- ✅ **Silent Security Mode** - Hide admin features from unauthorized users
- ✅ **Rate Limiting** - Built-in protection against permission abuse
- ✅ **Svelte 5 Compatible** - Modern reactive permission guards

## PermissionGuard Component

### Basic Usage

```svelte
<script>
	import PermissionGuard from '@components/PermissionGuard.svelte';
</script>

<!-- Standard mode - shows error messages -->
<PermissionGuard
	config={{
		name: 'Edit Content',
		contextId: 'content:edit',
		action: 'manage',
		contextType: 'content',
		description: 'Allows editing of content items'
	}}
>
	<EditContentButton />
</PermissionGuard>
```

### Silent Mode (Security-Sensitive)

```svelte
<!-- Silent mode - no error messages, component just doesn't render -->
<PermissionGuard
	config={{
		name: 'Admin Area Access',
		contextId: 'system:admin',
		action: 'manage',
		contextType: 'system',
		description: 'Allows access to admin area'
	}}
	silent={true}
>
	<AdminArea />
</PermissionGuard>
```

### Props

```typescript
interface Props {
	config: PermissionConfig | undefined;
	messages?: {
		rateLimited?: string;
		missingConfig?: string;
		insufficientPermissions?: string;
	};
	silent?: boolean; // If true, don't show error messages when permission is denied
	children?: import('svelte').Snippet;
}
```

## Permission Configuration

### PermissionConfig Interface

```typescript
interface PermissionConfig {
	name: string;
	description: string;
	contextId: string;
	action: PermissionAction;
	contextType: PermissionType;
	requiredRole?: string;
}

enum PermissionAction {
	CREATE = 'create',
	READ = 'read',
	UPDATE = 'update',
	DELETE = 'delete',
	MANAGE = 'manage',
	ACCESS = 'access'
}

enum PermissionType {
	SYSTEM = 'system',
	USER = 'user',
	CONTENT = 'content',
	MEDIA = 'media'
}
```

### Common Permission Patterns

```typescript
// System administration
const adminAreaConfig = {
	name: 'Admin Area Access',
	contextId: 'system:admin',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.SYSTEM,
	description: 'Allows access to admin area for user management'
};

// User management
const userManageConfig = {
	name: 'Manage User Tokens',
	contextId: 'user:manage',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.USER,
	description: 'Allows management of user tokens'
};

// Content editing
const contentEditConfig = {
	name: 'Edit Content',
	contextId: 'content:edit',
	action: PermissionAction.UPDATE,
	contextType: PermissionType.CONTENT,
	description: 'Allows editing of content items'
};
```

## Security Modes

### Standard Mode

- **Behavior**: Shows error messages when permission is denied
- **Use Case**: Configuration pages, feature toggles where users should know about unavailable features
- **Security**: Medium - reveals existence of protected features

```svelte
<PermissionGuard config={someConfig}>
	<FeatureComponent />
</PermissionGuard>
<!-- Shows: "You do not have permission to access this content." -->
```

### Silent Mode

- **Behavior**: No rendering or error messages when permission is denied
- **Use Case**: Admin areas, sensitive features that should be completely hidden
- **Security**: High - doesn't reveal existence of protected features

```svelte
<PermissionGuard config={adminConfig} silent={true}>
	<AdminComponent />
</PermissionGuard>
<!-- Shows: Nothing (component doesn't render at all) -->
```

## Role Hierarchy

### Default Roles

1. **Admin** (`admin`)
   - Full system access
   - Can manage users, tokens, and system settings
   - Bypasses most permission checks

2. **Editor** (`editor`)
   - Content management access
   - Can create/edit content
   - Limited user management

3. **User** (`user`)
   - Basic content access
   - Profile management
   - Read-only access to most features

### Permission Resolution

```typescript
// Permission check logic
const hasPermission = $derived(isAdmin || permissionData.hasPermission);
const shouldShowContent = $derived(!!config && hasPermission && !isRateLimited && !loading);
```

## Implementation Examples

### Protecting Admin Areas

```svelte
<!-- User page with admin area -->
<div class="user-profile">
	<!-- Regular user content always visible -->
	<UserProfile {user} />

	<!-- Admin area - completely hidden from non-admins -->
	<PermissionGuard
		config={{
			name: 'Admin Area Access',
			contextId: 'system:admin',
			action: 'manage',
			contextType: 'system'
		}}
		silent={true}
	>
		<AdminArea {adminData} {currentUser} />
	</PermissionGuard>
</div>
```

### Feature Toggles with Messaging

```svelte
<!-- Config page with feature sections -->
<div class="config-sections">
	{#each features as feature}
		<PermissionGuard config={feature.permission}>
			<FeatureSection {feature} />
		</PermissionGuard>
		<!-- Shows permission denied message for unavailable features -->
	{/each}
</div>
```

### Conditional Button Rendering

```svelte
<!-- Token management buttons -->
<PermissionGuard
	config={{
		name: 'Manage User Tokens',
		contextId: 'user:manage',
		action: 'manage',
		contextType: 'user'
	}}
	silent={true}
>
	<div class="token-management">
		<button onclick={createToken}>Create Token</button>
		<button onclick={blockSelected}>Block Tokens</button>
	</div>
</PermissionGuard>
```

## Best Practices

### Security Guidelines

1. **Use Silent Mode for Admin Features**

   ```svelte
   <!-- ✅ Good: Admin features are completely hidden -->
   <PermissionGuard config={adminConfig} silent={true}>
   	<AdminPanel />
   </PermissionGuard>

   <!-- ❌ Bad: Reveals admin features exist -->
   <PermissionGuard config={adminConfig}>
   	<AdminPanel />
   </PermissionGuard>
   ```

2. **Use Standard Mode for Feature Discovery**

   ```svelte
   <!-- ✅ Good: User learns about available features -->
   <PermissionGuard config={premiumFeatureConfig}>
   	<PremiumFeature />
   </PermissionGuard>
   ```

3. **Combine with Server-Side Protection**
   ```typescript
   // Always validate permissions on the server too
   export const actions = {
   	adminAction: async ({ locals, request }) => {
   		if (!locals.user || locals.user.role !== 'admin') {
   			throw error(403, 'Access denied');
   		}
   		// ... admin action logic
   	}
   };
   ```

### Performance Considerations

- Permission checks are reactive and cached
- Use `silent={true}` sparingly - only for security-sensitive components
- Group related permissions under common contexts

### Debugging

```svelte
<!-- Enable debug logging in development -->
<PermissionGuard config={debugConfig}>
	{#snippet children()}
		<DebugComponent />
	{/snippet}
</PermissionGuard>
```

## Migration Guide

### Upgrading to Silent Mode

If you have existing PermissionGuard components that should use silent mode:

```svelte
<!-- Before -->
<PermissionGuard config={adminConfig}>
	<AdminArea />
</PermissionGuard>

<!-- After -->
<PermissionGuard config={adminConfig} silent={true}>
	<AdminArea />
</PermissionGuard>
```

### Custom Error Messages

```svelte
<PermissionGuard
	{config}
	messages={{
		insufficientPermissions: 'Contact admin for access',
		rateLimited: 'Too many attempts, try again later',
		missingConfig: 'Configuration error'
	}}
>
	<ProtectedContent />
</PermissionGuard>
```

## Troubleshooting

### Common Issues

1. **Permission denied messages showing for admin areas**
   - Solution: Add `silent={true}` to PermissionGuard

2. **Admin users seeing permission errors**
   - Check that user role is correctly set to 'admin'
   - Verify permission context IDs match configuration

3. **Components not rendering for authorized users**
   - Check permission configuration
   - Verify context IDs and action types
   - Test with admin user to isolate permission vs. component issues
