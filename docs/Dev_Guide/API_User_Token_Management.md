---
title: 'User & Token Management API'
description: 'Complete API reference for user and token management endpoints'
updated: '2025-07-11'
---

# User & Token Management API

## Overview

This document covers the REST API endpoints for managing users and invitation tokens in SveltyCMS. All endpoints require appropriate authentication and permissions.

## Authentication

All API endpoints require authentication. Include the session cookie or bearer token in your requests.

```http
Cookie: session=your-session-id
# or
Authorization: Bearer your-api-token
```

## User Management Endpoints

### Get All Users

```http
GET /api/user
```

**Permission Required:** `user:read` or admin role

**Response:**

```json
{
	"success": true,
	"users": [
		{
			"_id": "user123",
			"username": "johndoe",
			"email": "john@example.com",
			"role": "user",
			"blocked": false,
			"activeSessions": 2,
			"lastAccess": "2025-07-11T10:30:00Z",
			"createdAt": "2025-01-15T09:00:00Z",
			"updatedAt": "2025-07-11T10:30:00Z"
		}
	]
}
```

### Batch User Operations

```http
POST /api/user/batch
```

**Permission Required:** `user:manage` or admin role

**Request Body:**

```json
{
  "action": "block" | "unblock" | "delete",
  "ids": ["user1", "user2", "user3"]
}
```

**Response:**

```json
{
	"success": true,
	"message": "Users blocked successfully",
	"results": [
		{
			"id": "user1",
			"success": true,
			"message": "User blocked"
		},
		{
			"id": "user2",
			"success": false,
			"message": "User not found"
		}
	]
}
```

### Update User

```http
PUT /api/user/[userId]
```

**Permission Required:** `user:edit` or admin role (or own user)

**Request Body:**

```json
{
	"username": "newusername",
	"email": "newemail@example.com",
	"role": "editor",
	"blocked": false
}
```

**Response:**

```json
{
	"success": true,
	"message": "User updated successfully",
	"user": {
		"_id": "user123",
		"username": "newusername",
		"email": "newemail@example.com",
		"role": "editor",
		"blocked": false,
		"updatedAt": "2025-07-11T10:30:00Z"
	}
}
```

## Token Management Endpoints

### Get All Tokens

```http
GET /api/token
```

**Permission Required:** `token:read` or admin role

**Query Parameters:**

- `includeExpired=true` - Include expired tokens (default: false)
- `type=user-invite` - Filter by token type
- `email=user@example.com` - Filter by email

**Response:**

```json
{
	"success": true,
	"tokens": [
		{
			"_id": "token123",
			"token": "abc123def456...",
			"email": "newuser@example.com",
			"username": "newuser",
			"role": "user",
			"type": "user-invite",
			"blocked": false,
			"expires": "2025-07-18T23:59:59Z",
			"createdAt": "2025-07-11T10:00:00Z",
			"updatedAt": "2025-07-11T10:00:00Z"
		}
	]
}
```

### Create Token

```http
POST /api/token
```

**Permission Required:** `token:create` or admin role

**Request Body:**

```json
{
	"email": "newuser@example.com",
	"username": "newuser",
	"role": "user",
	"type": "user-invite",
	"expires": "7d"
}
```

**Expiration Options:**

- `"1h"` - 1 hour
- `"1d"` - 1 day
- `"7d"` - 7 days (default)
- `"30d"` - 30 days
- `"90d"` - 90 days

**Response:**

```json
{
	"success": true,
	"message": "Token created and email sent",
	"token": {
		"_id": "token123",
		"token": "abc123def456...",
		"email": "newuser@example.com",
		"expires": "2025-07-18T23:59:59Z"
	}
}
```

### Update Token

```http
PUT /api/token/[tokenId]
```

**Permission Required:** `token:edit` or admin role

**Request Body:**

```json
{
	"email": "updated@example.com",
	"username": "updateduser",
	"role": "editor",
	"expires": "2025-08-11T23:59:59Z",
	"blocked": false
}
```

**Response:**

```json
{
	"success": true,
	"message": "Token updated successfully",
	"token": {
		"_id": "token123",
		"email": "updated@example.com",
		"username": "updateduser",
		"role": "editor",
		"blocked": false,
		"expires": "2025-08-11T23:59:59Z",
		"updatedAt": "2025-07-11T10:30:00Z"
	}
}
```

### Batch Token Operations

```http
POST /api/token/batch
```

**Permission Required:** `token:manage` or admin role

**Request Body:**

```json
{
  "action": "block" | "unblock" | "delete",
  "ids": ["token1", "token2", "token3"]
}
```

**Actions:**

- `block` - Temporarily disable tokens (reversible)
- `unblock` - Re-enable blocked tokens
- `delete` - Permanently delete tokens (irreversible)

**Response:**

```json
{
	"success": true,
	"message": "Tokens blocked successfully",
	"results": [
		{
			"id": "token1",
			"success": true,
			"message": "Token blocked"
		},
		{
			"id": "token2",
			"success": true,
			"message": "Token blocked"
		}
	]
}
```

### Validate Token

```http
POST /api/token/validate
```

**Public endpoint** (no authentication required)

**Request Body:**

```json
{
	"token": "abc123def456...",
	"type": "user-invite"
}
```

**Response (Valid):**

```json
{
	"isValid": true,
	"message": "Token is valid",
	"details": {
		"_id": "token123",
		"email": "user@example.com",
		"username": "username",
		"role": "user",
		"expires": "2025-07-18T23:59:59Z"
	}
}
```

**Response (Invalid):**

```json
{
	"isValid": false,
	"message": "Token is expired, blocked, or invalid"
}
```

### Consume Token

```http
POST /api/token/consume
```

**Public endpoint** (used during registration)

**Request Body:**

```json
{
	"token": "abc123def456...",
	"userId": "user123"
}
```

**Response:**

```json
{
	"success": true,
	"message": "Token consumed successfully"
}
```

## Registration Endpoints

### Sign Up with Token

```http
POST /api/auth/signup
```

**Public endpoint**

**Request Body:**

```json
{
	"username": "newuser",
	"email": "newuser@example.com",
	"password": "securepassword123",
	"confirm_password": "securepassword123",
	"token": "abc123def456..."
}
```

**Response:**

```json
{
	"success": true,
	"message": "User created successfully",
	"user": {
		"_id": "user123",
		"username": "newuser",
		"email": "newuser@example.com",
		"role": "user"
	}
}
```

### OAuth Registration

```http
POST /api/auth/oauth?invite_token=abc123def456...
```

**Public endpoint**

Initiates OAuth flow with invitation token attached.

## Error Responses

### Standard Error Format

```json
{
	"success": false,
	"message": "Error description",
	"code": "ERROR_CODE",
	"details": {
		"field": "validation error message"
	}
}
```

### Common Error Codes

**Authentication Errors:**

- `AUTH_REQUIRED` (401) - Authentication required
- `INSUFFICIENT_PERMISSIONS` (403) - Missing required permissions
- `INVALID_SESSION` (401) - Session expired or invalid

**Validation Errors:**

- `VALIDATION_FAILED` (400) - Request validation failed
- `INVALID_TOKEN` (400) - Token is invalid, expired, or blocked
- `EMAIL_EXISTS` (409) - Email already registered
- `USERNAME_EXISTS` (409) - Username already taken

**Resource Errors:**

- `USER_NOT_FOUND` (404) - User does not exist
- `TOKEN_NOT_FOUND` (404) - Token does not exist
- `RESOURCE_BLOCKED` (403) - Resource is blocked

**Server Errors:**

- `INTERNAL_ERROR` (500) - Internal server error
- `DATABASE_ERROR` (500) - Database operation failed
- `EMAIL_SEND_FAILED` (500) - Failed to send invitation email

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Token Creation:** 10 tokens per hour per user
- **User Operations:** 100 requests per hour per user
- **Registration:** 5 attempts per hour per IP
- **Token Validation:** 20 requests per minute per IP

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1625097600
```

## Permissions Reference

### User Permissions

- `user:read` - View user information
- `user:edit` - Edit user profiles
- `user:manage` - Full user management (block, delete, etc.)
- `user:create` - Create new users

### Token Permissions

- `token:read` - View token information
- `token:create` - Create invitation tokens
- `token:edit` - Edit existing tokens
- `token:manage` - Full token management (block, delete, etc.)

### System Permissions

- `system:admin` - Full system administration access
- `system:audit` - Access to audit logs and reports

## SDKs and Examples

### JavaScript/TypeScript

```typescript
import { SveltyCMSClient } from '@svelty/cms-client';

const client = new SveltyCMSClient({
	baseURL: 'https://your-cms.com',
	sessionToken: 'your-session-token'
});

// Create invitation token
const token = await client.tokens.create({
	email: 'newuser@example.com',
	role: 'user',
	expires: '7d'
});

// Block multiple users
const result = await client.users.batchOperation({
	action: 'block',
	ids: ['user1', 'user2']
});
```

### cURL Examples

**Create Token:**

```bash
curl -X POST https://your-cms.com/api/token \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session" \
  -d '{
    "email": "newuser@example.com",
    "role": "user",
    "expires": "7d"
  }'
```

**Block Users:**

```bash
curl -X POST https://your-cms.com/api/user/batch \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session" \
  -d '{
    "action": "block",
    "ids": ["user1", "user2"]
  }'
```

## Webhook Integration

Configure webhooks to receive notifications about user and token events:

### Events

- `user.created` - New user registered
- `user.updated` - User profile updated
- `user.blocked` - User account blocked
- `token.created` - Invitation token created
- `token.consumed` - Token used for registration
- `token.expired` - Token has expired

### Webhook Payload

```json
{
	"event": "user.created",
	"timestamp": "2025-07-11T10:30:00Z",
	"data": {
		"user": {
			"_id": "user123",
			"username": "newuser",
			"email": "newuser@example.com",
			"role": "user"
		},
		"token": {
			"_id": "token123",
			"consumed": true
		}
	}
}
```
