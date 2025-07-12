---
title: 'PermissionGuard Component'
description: 'Advanced permission-based access control component for securing UI elements'
updated: '2025-07-11'
---

# PermissionGuard Component

## Overview

The PermissionGuard component provides permission-based access control that wraps content with conditional rendering and comprehensive error handling. It supports both visible permission enforcement and silent security modes.

## Key Features

- ✅ **Role-based Access Control** - Admin roles, custom permissions, and rate limiting
- ✅ **Silent Mode** - Hide components without revealing their existence
- ✅ **Fallback Messages** - Customizable error messages for different scenarios
- ✅ **Type Safety** - Full TypeScript support with proper interfaces
- ✅ **Flexible Configuration** - Support for various permission contexts

## Props Interface

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

## Usage Examples

### Basic Permission Guard

```svelte
<PermissionGuard
	config={{
		name: 'User Management',
		contextId: 'user:manage',
		action: 'manage',
		contextType: 'user',
		description: 'Allows user management operations'
	}}
>
	<UserManagementPanel />
</PermissionGuard>
```

### Silent Mode (Security-Sensitive)

```svelte
<!-- AdminArea will be completely invisible to non-admin users -->
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

### Custom Error Messages

```svelte
<PermissionGuard
	config={permissionConfig}
	messages={{
		insufficientPermissions: 'Contact your administrator to request access.',
		rateLimited: 'Too many requests. Please wait before trying again.',
		missingConfig: 'Permission configuration error. Contact support.'
	}}
>
	<ProtectedContent />
</PermissionGuard>
```

## Permission Configuration

### Standard Permissions

```typescript
const userManagementConfig = {
	name: 'User Management',
	contextId: 'user:manage',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.USER,
	description: 'Manage user accounts and settings'
};

const contentEditConfig = {
	name: 'Content Editing',
	contextId: 'content:edit',
	action: PermissionAction.EDIT,
	contextType: PermissionType.CONTENT,
	description: 'Edit and publish content'
};
```

### Admin-Only Permissions

```typescript
const adminConfig = {
	name: 'System Administration',
	contextId: 'system:admin',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.SYSTEM,
	description: 'Full system administration access'
};
```

## Security Modes

### Standard Mode (Default)

- Shows error messages when access is denied
- Reveals that protected content exists
- Good for feature discovery and user guidance

### Silent Mode

- No error messages when access is denied
- Component renders nothing if permission denied
- Ideal for admin interfaces and security-sensitive features

## Permission Resolution

The component checks permissions in this order:

1. **Admin Override** - Users with `role: 'admin'` bypass most restrictions
2. **Permission Check** - Validates specific permission from `contextId`
3. **Rate Limiting** - Checks if user has exceeded rate limits
4. **Configuration** - Ensures valid permission configuration exists

## Best Practices

### When to Use Silent Mode

✅ **Use Silent Mode For:**

- Admin interfaces (AdminArea, system settings)
- Security-sensitive features
- Features that shouldn't be discoverable by unauthorized users
- Backend management tools

❌ **Don't Use Silent Mode For:**

- Feature upgrade prompts
- Educational content about available features
- User-facing navigation elements
- Content where users should know about limitations

### Security Considerations

```svelte
<!-- GOOD: Admin area is invisible to non-admins -->
<PermissionGuard config={adminConfig} silent={true}>
	<AdminPanel />
</PermissionGuard>

<!-- GOOD: Feature access with helpful message -->
<PermissionGuard config={premiumConfig}>
	<PremiumFeature />
</PermissionGuard>

<!-- BAD: Security-sensitive feature revealing its existence -->
<PermissionGuard config={adminConfig}>
	<DatabaseManagement />
</PermissionGuard>
```

## Implementation Details

### Permission Validation Logic

```svelte
<script lang="ts">
	// Reactive permission checking
	let user = $derived(page.data.user as User | undefined);
	let permissions = $derived(page.data.permissions || {});
	let permissionData = $derived(
		config?.contextId
			? permissions[config.contextId] || { hasPermission: false, isRateLimited: false }
			: { hasPermission: false, isRateLimited: false }
	);

	let isAdmin = $derived(user?.role?.toLowerCase() === 'admin');
	let hasPermission = $derived(isAdmin || permissionData.hasPermission);
	let shouldShowContent = $derived(!!config && hasPermission && !isRateLimited);
</script>
```

### Conditional Rendering

```svelte
{#if shouldShowContent}
	{@render children?.()}
{:else if !silent && config}
	{#if isRateLimited}
		<p class="text-warning-500" role="alert">{messages.rateLimited}</p>
	{:else}
		<p class="text-error-500" role="alert">{messages.insufficientPermissions}</p>
	{/if}
{:else if !silent && !config}
	<p class="text-error-500" role="alert">{messages.missingConfig}</p>
{/if}
```

## Common Use Cases

### Admin Area Protection

```svelte
<!-- Complete admin interface hidden from non-admins -->
<PermissionGuard config={adminAreaConfig} silent={true}>
	<AdminDashboard />
	<UserManagement />
	<SystemSettings />
</PermissionGuard>
```

### Feature-Specific Permissions

```svelte
<!-- Token management within admin area -->
<PermissionGuard
	config={{
		contextId: 'user:manage',
		action: PermissionAction.MANAGE,
		contextType: PermissionType.USER
	}}
>
	<TokenManagementButtons />
</PermissionGuard>
```

### Content Management

```svelte
<!-- Content editing with helpful feedback -->
<PermissionGuard
	config={contentEditConfig}
	messages={{
		insufficientPermissions: 'You need editor permissions to modify content. Contact your team lead.'
	}}
>
	<ContentEditor />
</PermissionGuard>
```

## Troubleshooting

### Permission Not Working

1. **Check Configuration**: Ensure `contextId` matches server-side permissions
2. **Verify User Data**: Confirm user object includes role and permissions
3. **Admin Override**: Remember that admin users bypass most restrictions
4. **Rate Limiting**: Check if user has exceeded rate limits

### Silent Mode Issues

1. **Nothing Rendering**: This is expected behavior when permission is denied
2. **Debug Mode**: Temporarily remove `silent={true}` to see error messages
3. **Permission Config**: Verify permission configuration is correctly defined

### Performance Considerations

- Permission checks are reactive and update automatically
- Use specific `contextId` values to avoid unnecessary permission lookups
- Consider caching permission results for complex permission trees
