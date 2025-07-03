# Authentication & Permissions System

## Overview

This document describes the new simplified authentication and permissions system that consolidates your previous 10+ auth files into just 3 core files, while ensuring **admins automatically have ALL permissions**.

## Key Improvements

### 🎯 **Admin Override**:

- **Admins automatically get ALL permissions** - no need to manually assign every permission
- Simplified permission checking with admin bypass logic
- Reduced complexity while maintaining security

### 📁 **File Consolidation**:

- **Before**: 10+ scattered auth files
- **After**: 3 core files (`auth.ts`, `permissions.ts`, `sessionStore.ts`)
- Easier maintenance and debugging

### 🚀 **Performance**:

- Permission checking logic
- Reduced database queries
- Better caching strategies

## Core Files

### 1. `src/auth/auth.ts`

**Main authentication system with consolidated logic**

```typescript
// Key features:
- User, Role, Permission interfaces
- Auth class with all auth operations
- Admin override logic built-in
- Session and token management
- Simplified permission checking
```

### 2. `src/auth/permissions.ts`

**Permission checking utilities with admin override**

```typescript
// Key features:
- hasPermission() - check by permission ID
- checkUserPermission() - backwards compatibility
- isAdmin() - check if user is admin
- getAllPermissions() - get all available permissions
- ADMIN OVERRIDE: Admins automatically pass all checks
```

### 3. `src/auth/sessionStore.ts`

**Unified session storage with Redis fallback**

```typescript
// Key features:
- Redis session store with in-memory fallback
- Automatic cleanup of expired sessions
- Simple interface for session management
```

## Admin Permission Logic

### How Admin Override Works

```typescript
// In any permission check:
if (userRole.isAdmin) {
	logger.debug(`Admin user ${user.email} granted permission: ${permissionId}`);
	return true; // ✅ ADMIN GETS ALL PERMISSIONS
}

// Regular permission checking for non-admins
return userRole.permissions.includes(permissionId);
```

### Admin Role Configuration

```typescript
// config/roles.ts
{
    _id: 'admin',
    name: 'Administrator',
    description: 'Administrator - Full access to all system features',
    isAdmin: true,           // 🔑 This flag grants ALL permissions
    permissions: [],         // Empty - admins get ALL permissions automatically
    icon: 'material-symbols:verified-outline',
    color: 'gradient-primary'
}
```

## Usage Examples

### 1. Check if User Has Permission

```typescript
import { hasPermission } from '@src/auth/permissions';

// Simple permission check
if (hasPermission(user, 'collections:create')) {
	// User can create collections
	// Note: Admins automatically pass this check
}
```

### 2. Check Permission with Config (Backwards Compatibility)

```typescript
import { checkUserPermission } from '@src/auth/permissions';

const config = {
	contextId: 'config:accessManagement',
	name: 'Access Management',
	action: 'manage',
	contextType: 'configuration'
};

const { hasPermission } = await checkUserPermission(user, config);
if (hasPermission) {
	// User has access management permission
	// Note: Admins automatically pass this check
}
```

### 3. Check if User is Admin

```typescript
import { isAdmin } from '@src/auth/permissions';

if (isAdmin(user)) {
	// User is admin - has ALL permissions automatically
}
```

### 4. Get All Permissions for a Role

```typescript
import { getPermissionsByRole } from '@src/auth/permissions';

const permissions = getPermissionsByRole('admin');
// For admin role, this returns ALL available permissions
```

## Permission Structure

### Core Permissions

```typescript
// System permissions
'system:dashboard'; // Dashboard access
'system:admin'; // Admin access
'system:settings'; // Settings management

// API permissions
'api:graphql'; // GraphQL API access
'api:collections'; // Collections API access
'api:export'; // Export API access
'api:user'; // User API access

// Collection permissions
'collections:create'; // Create collections
'collections:read'; // Read collections
'collections:update'; // Update collections
'collections:delete'; // Delete collections

// Content permissions
'content:editor'; // Content editor
'content:builder'; // Content builder
'content:images'; // Image management

// User management
'user:manage'; // Manage users
'user:create'; // Create users

// Configuration
'config:accessManagement'; // Access management
'config:collectionManagement'; // Collection management
'config:widgetManagement'; // Widget management
'config:themeManagement'; // Theme management
```

## Benefits of New System

### 1. **Simplified Admin Management**

- ✅ Admins automatically get ALL permissions
- ✅ No need to manually assign every permission to admin role
- ✅ Future permissions automatically granted to admins

### 2. **Easier Maintenance**

- ✅ 3 core files instead of 10+
- ✅ Centralized permission logic
- ✅ Consistent admin override behavior

### 3. **Better Performance**

- ✅ Simplified permission checking
- ✅ Reduced database queries
- ✅ Better caching strategies

### 4. **Backwards Compatibility**

- ✅ Existing permission checks still work
- ✅ Gradual migration possible
- ✅ Same API surface for most functions

## Security Considerations

### Admin Override Security

- Admin override is **intentional and secure**
- Only users with `isAdmin: true` get full access
- Admin status is controlled at the role level
- Logging shows when admin override is used

### Permission Validation

- Non-admin users still go through full permission validation
- Permission checks are cached for performance
- Invalid permissions are logged and denied

## Testing the New System

### 1. Test Admin Access

```bash
# Run the app
bun devv

# Login as admin user
# Verify admin can access all areas
# Check logs for "Admin user granted permission" messages
```

### 2. Test Non-Admin Access

```bash
# Login as non-admin user (developer, editor, user)
# Verify they only have assigned permissions
# Verify they cannot access admin-only areas
```

### 3. Test Permission Checking

```bash
# Check browser console for permission logs
# Verify permission checks are working correctly
# Test API endpoints with different user roles
```

## Troubleshooting

### Common Issues

1. **"Permission denied" for admin users**
   - Check if user role has `isAdmin: true`
   - Verify role is properly assigned to user
   - Check logs for admin override messages

2. **Import errors after migration**
   - Update imports to use new file paths
   - Use `@src/auth/permissions` instead of old files
   - Check for circular dependencies

3. **Session issues**
   - Clear browser cookies
   - Restart the application
   - Check Redis connection if using Redis

### Debug Commands

```bash
# Check user role and permissions
console.log('User:', user);
console.log('Role:', user.role);
console.log('Is Admin:', isAdmin(user));

# Check available permissions
console.log('All Permissions:', getAllPermissions());
console.log('User Permissions:', getPermissionsByRole(user.role));
```

## Next Steps

1. **Test the simplified system** with your existing users
2. **Remove old auth files** once you're confident the new system works
3. **Update any remaining imports** to use the new auth system
4. **Consider adding new permissions** - they'll automatically be granted to admins

---

**🎉 Congratulations!** You now have a much simpler, more maintainable auth system where **admins automatically have ALL permissions**.
