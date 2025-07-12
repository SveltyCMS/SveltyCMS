---
title: 'Token Management'
description: 'Handles the lifecycle and management of authentication tokens, used for tasks such as password resets and email verification.'
updated: '2025-07-11'
---

# Token Management

## Overview

Token Management handles the lifecycle and management of authentication tokens, used for tasks such as password resets, email verification, and user invitations. The system now includes advanced token blocking capabilities and improved security features.

## Key Features

- ✅ **Token Creation & Validation** - Secure token generation and validation
- ✅ **Token Blocking System** - Block/unblock tokens without affecting expiration
- ✅ **Batch Operations** - Manage multiple tokens simultaneously
- ✅ **Role-based Tokens** - Tokens can carry role information for user creation
- ✅ **Svelte 5 Compatible** - Updated UI components for better user experience

## Methods and Their Purposes

### Core Token Operations

- `createToken(data: { user_id: string; email: string; expires: Date; type: string; username?: string; role?: string }): Promise<string>`
  - **Purpose**: Creates a new token for a user with optional role information.
  - **Parameters**: `data` - Object containing user ID, email, expiration date, token type, and optional username/role.
  - **Returns**: The generated token string.

- `validateToken(token: string, userId?: string, tokenType?: string): Promise<{ success: boolean; message: string }>`
  - **Purpose**: Validates a token, checking expiration and blocked status.
  - **Parameters**: `token` - The token to validate. `userId` - Optional user ID. `tokenType` - Optional token type filter.
  - **Security**: Automatically checks if token is blocked or expired.

- `consumeToken(token: string, userId?: string): Promise<{ status: boolean; message: string }>`
  - **Purpose**: Consumes a token, marking it as used and invalid for future use.
  - **Parameters**: `token` - The token to consume. `userId` - Optional user ID.

### Registration & Invitation Tokens

- `validateRegistrationToken(token: string): Promise<{ isValid: boolean; message: string; details?: Token }>`
  - **Purpose**: Validates tokens specifically for user registration/invitation.
  - **Returns**: Validation result with full token details including role information.
  - **Use Case**: Used during signup process to get user role from invitation token.

- `consumeRegistrationToken(token: string): Promise<{ success: boolean; message: string }>`
  - **Purpose**: Consumes a registration token after successful user creation.

### Token Blocking System

- `blockTokens(tokenIds: string[]): Promise<{ success: boolean; message: string; results: any[] }>`
  - **Purpose**: Blocks multiple tokens simultaneously without affecting their expiration dates.
  - **Security**: Blocked tokens cannot be used for authentication but remain in the system for audit purposes.

- `unblockTokens(tokenIds: string[]): Promise<{ success: boolean; message: string; results: any[] }>`
  - **Purpose**: Unblocks previously blocked tokens, making them usable again (if not expired).

### Data Retrieval

- `getAllTokens(): Promise<Token[]>`
  - **Purpose**: Retrieves all tokens from the database.
  - **Admin Only**: Requires admin privileges.

- `getTokenByValue(token: string): Promise<Token | null>`
  - **Purpose**: Retrieves a complete token record by its value.
  - **Returns**: Full token object with all fields including role and blocked status.

## Data Structure

### Token Interface

```typescript
export interface Token {
	_id: string; // Unique identifier for the token
	user_id: string; // The ID of the user who owns the token
	token: string; // The token string
	email: string; // Email associated with the token
	expires: Date; // When the token expires (ISO date string)
	type: string; // Type of the token (e.g., 'create', 'register', 'reset', 'user-invite')
	blocked?: boolean; // Whether the token is blocked (NEW FEATURE)
	username?: string; // Username associated with the token
	role?: string; // Role associated with the token (used for user creation)
	createdAt?: Date; // When the token was created
	updatedAt?: Date; // When the token was last updated
}
```

### Token Types

- `'user-invite'` - Invitation tokens for new user registration
- `'reset'` - Password reset tokens
- `'verify'` - Email verification tokens
- `'create'` - User creation tokens

## API Endpoints

### Batch Operations

- `POST /api/token/batch` - Perform batch operations on tokens

  ```json
  {
    "action": "block" | "unblock" | "delete",
    "ids": ["token1", "token2", ...]
  }
  ```

- `PUT /api/token/[tokenID]` - Update individual token
  ```json
  {
  	"email": "user@example.com",
  	"role": "user",
  	"username": "newusername",
  	"expires": "2025-12-31T23:59:59.000Z"
  }
  ```

## Security Considerations

### Token Blocking vs Expiration

- **Blocking**: Reversible action, token remains in database for audit
- **Expiration**: Permanent, token becomes invalid after expiry date
- **Best Practice**: Use blocking for temporary suspension, expiration for permanent invalidation

### Role Security

- Registration tokens carry role information from admin who created the invitation
- Role is applied during user creation process
- Tokens validate both expiration and blocked status before allowing use

### Validation Chain

1. Check if token exists in database
2. Verify token is not expired (`expires > new Date()`)
3. Verify token is not blocked (`blocked !== true`)
4. Validate token type matches expected usage
5. Check any additional context-specific requirements

## Usage Examples

### Creating an Invitation Token

```typescript
const tokenAdapter = new TokenAdapter();

// Create invitation token with role
const token = await tokenAdapter.createToken({
	user_id: 'admin-user-id',
	email: 'newuser@example.com',
	expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
	type: 'user-invite',
	username: 'newuser',
	role: 'editor'
});
```

### Validating Registration Token

```typescript
// Validate token during signup
const validation = await auth.validateRegistrationToken(token);

if (validation.isValid && validation.details) {
	// Create user with role from token
	const newUser = await auth.createUser({
		email: validation.details.email,
		username: formData.username,
		password: formData.password,
		role: validation.details.role || 'user', // Fallback to 'user'
		isRegistered: true
	});
}
```

### Blocking Tokens

```typescript
// Block multiple tokens
const result = await tokenAdapter.blockTokens(['token1', 'token2']);

// Unblock tokens
const result = await tokenAdapter.unblockTokens(['token1', 'token2']);
```

## Troubleshooting

### Common Issues

1. **"Role is required" error during signup**
   - **Cause**: Token validation not returning role information
   - **Solution**: Ensure `getTokenByValue` returns all token fields including `role`
   - **Check**: Verify token was created with role information

2. **Blocked tokens still working**
   - **Cause**: Token validation not checking `blocked` status
   - **Solution**: Update token validation to check `blocked: true`
   - **Check**: Ensure admin UI shows correct blocked status

3. **Token pasting not working in signup form**
   - **Cause**: SignUp component not using proper Svelte 5 syntax
   - **Solution**: Use `bind:value` instead of custom event handlers
   - **Check**: Verify FloatingInput component supports `bind:value`

4. **Permission errors showing to non-admin users**
   - **Cause**: PermissionGuard showing access denial messages
   - **Solution**: Use `silent={true}` for security-sensitive components
   - **Check**: AdminArea should be invisible to non-admin users

### Debug Tips

- Check browser console for token validation logs
- Verify token structure in database includes all required fields
- Test token blocking/unblocking in admin interface
- Confirm role assignment during user creation process
