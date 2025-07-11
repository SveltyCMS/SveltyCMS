---
title: 'API Reference'
description: 'Complete API documentation for SveltyCMS'
icon: 'mdi:api-off'
---

# API Reference

Complete reference for SveltyCMS's REST and GraphQL APIs, including authentication, endpoints, and examples.

## Authentication

### REST Authentication

1. **JWT Authentication**

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "roles": ["editor"]
  }
}
```

2. **API Key Authentication**

```http
GET /api/content
Authorization: Bearer api_key_12345
```

### GraphQL Authentication

1. **HTTP Header**

```graphql
# Headers
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
}

# Query
query {
  me {
    id
    email
    roles
  }
}
```

## REST API

### Content Management

1. **Create Content**

```http
POST /api/content/{type}
Content-Type: application/json
Authorization: Bearer token

{
  "title": "Example Post",
  "content": "Content here...",
  "status": "draft"
}

Response:
{
  "id": "123",
  "title": "Example Post",
  "content": "Content here...",
  "status": "draft",
  "createdAt": "2024-01-20T12:00:00Z"
}
```

2. **Read Content**

```http
GET /api/content/{type}/{id}
Authorization: Bearer token

Response:
{
  "id": "123",
  "title": "Example Post",
  "content": "Content here...",
  "status": "published",
  "createdAt": "2024-01-20T12:00:00Z",
  "updatedAt": "2024-01-20T13:00:00Z"
}
```

3. **Update Content**

```http
PATCH /api/content/{type}/{id}
Content-Type: application/json
Authorization: Bearer token

{
  "title": "Updated Title",
  "status": "published"
}

Response:
{
  "id": "123",
  "title": "Updated Title",
  "content": "Content here...",
  "status": "published",
  "updatedAt": "2024-01-20T14:00:00Z"
}
```

4. **Delete Content**

```http
DELETE /api/content/{type}/{id}
Authorization: Bearer token

Response:
{
  "success": true,
  "message": "Content deleted"
}
```

### Media Management

1. **Upload File**

```http
POST /api/media/upload
Content-Type: multipart/form-data
Authorization: Bearer token

Form Data:
- file: [binary]
- type: "image"
- alt: "Example image"

Response:
{
  "id": "123",
  "url": "/uploads/image.jpg",
  "type": "image",
  "size": 12345,
  "metadata": {
    "width": 800,
    "height": 600,
    "format": "jpeg"
  }
}
```

2. **Get Media**

```http
GET /api/media/{id}
Authorization: Bearer token

Response:
{
  "id": "123",
  "url": "/uploads/image.jpg",
  "type": "image",
  "size": 12345,
  "metadata": {
    "width": 800,
    "height": 600,
    "format": "jpeg"
  },
  "createdAt": "2024-01-20T12:00:00Z"
}
```

### User Management

1. **Create User**

```http
POST /api/users
Content-Type: application/json
Authorization: Bearer token

{
  "email": "user@example.com",
  "password": "password123",
  "roles": ["editor"]
}

Response:
{
  "id": "123",
  "email": "user@example.com",
  "roles": ["editor"],
  "createdAt": "2024-01-20T12:00:00Z"
}
```

2. **Get User**

```http
GET /api/users/{id}
Authorization: Bearer token

Response:
{
  "id": "123",
  "email": "user@example.com",
  "roles": ["editor"],
  "createdAt": "2024-01-20T12:00:00Z",
  "lastLogin": "2024-01-20T13:00:00Z"
}
```

## GraphQL API

### Schema Types

1. **Content Type**

```graphql
type Content {
	id: ID!
	type: String!
	title: String!
	content: String
	status: String!
	author: User
	createdAt: DateTime!
	updatedAt: DateTime!
	publishedAt: DateTime
	metadata: JSON
}
```

2. **User Type**

```graphql
type User {
	id: ID!
	email: String!
	roles: [String!]!
	profile: UserProfile
	createdAt: DateTime!
	lastLogin: DateTime
}

type UserProfile {
	name: String
	avatar: String
	bio: String
}
```

### Queries

1. **Get Content**

```graphql
query GetContent($id: ID!) {
  content(id: $id) {
    id
    title
    content
    status
    author {
      id
      email
    }
    createdAt
    updatedAt
  }
}

# Variables
{
  "id": "123"
}
```

2. **List Content**

```graphql
query ListContent($type: String!, $status: String) {
  contents(type: $type, status: $status) {
    edges {
      node {
        id
        title
        status
        createdAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Variables
{
  "type": "post",
  "status": "published"
}
```

### Mutations

1. **Create Content**

```graphql
mutation CreateContent($input: CreateContentInput!) {
  createContent(input: $input) {
    id
    title
    content
    status
    createdAt
  }
}

# Variables
{
  "input": {
    "type": "post",
    "title": "Example Post",
    "content": "Content here...",
    "status": "draft"
  }
}
```

2. **Update Content**

```graphql
mutation UpdateContent($id: ID!, $input: UpdateContentInput!) {
  updateContent(id: $id, input: $input) {
    id
    title
    content
    status
    updatedAt
  }
}

# Variables
{
  "id": "123",
  "input": {
    "title": "Updated Title",
    "status": "published"
  }
}
```

### Subscriptions

1. **Content Changes**

```graphql
subscription OnContentChange($type: String!) {
  contentChanged(type: $type) {
    id
    title
    status
    updatedAt
  }
}

# Variables
{
  "type": "post"
}
```

## API Clients

### JavaScript/TypeScript

1. **REST Client**

```typescript
import { CmsClient } from '@sveltycms/client';

const client = new CmsClient({
	url: 'https://api.example.com',
	token: 'your-token'
});

// Get content
const post = await client.content.get('post', '123');

// Create content
const newPost = await client.content.create('post', {
	title: 'New Post',
	content: 'Content here...'
});
```

2. **GraphQL Client**

```typescript
import { GraphQLClient } from '@sveltycms/client';

const client = new GraphQLClient({
	url: 'https://api.example.com/graphql',
	token: 'your-token'
});

// Query content
const { post } = await client.query({
	query: `
    query GetPost($id: ID!) {
      post(id: $id) {
        id
        title
        content
      }
    }
  `,
	variables: { id: '123' }
});
```

## Error Handling

### Error Responses

1. **REST Errors**

```json
{
	"error": {
		"code": "UNAUTHORIZED",
		"message": "Invalid token",
		"details": {
			"field": "authorization",
			"reason": "Token expired"
		}
	}
}
```

2. **GraphQL Errors**

```json
{
	"errors": [
		{
			"message": "Not authorized",
			"path": ["content"],
			"extensions": {
				"code": "FORBIDDEN",
				"details": "Insufficient permissions"
			}
		}
	]
}
```

### Error Codes

| Code               | Description                |
| ------------------ | -------------------------- |
| `BAD_REQUEST`      | Invalid request parameters |
| `UNAUTHORIZED`     | Authentication required    |
| `FORBIDDEN`        | Insufficient permissions   |
| `NOT_FOUND`        | Resource not found         |
| `VALIDATION_ERROR` | Input validation failed    |
| `INTERNAL_ERROR`   | Server error               |

## Rate Limiting

### Limits

| Plan       | Rate Limit | Burst Limit |
| ---------- | ---------- | ----------- |
| Free       | 60/minute  | 100/minute  |
| Pro        | 300/minute | 500/minute  |
| Enterprise | Custom     | Custom      |

### Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1579521600
```

## Webhooks

### Configuration

```http
POST /api/webhooks
Content-Type: application/json
Authorization: Bearer token

{
  "url": "https://example.com/webhook",
  "events": ["content.published", "media.uploaded"],
  "secret": "webhook_secret_123"
}
```

### Payload Example

```json
{
	"event": "content.published",
	"timestamp": "2024-01-20T12:00:00Z",
	"data": {
		"id": "123",
		"type": "post",
		"title": "Example Post",
		"status": "published"
	}
}
```

## Best Practices

### Performance

1. Use field selection
2. Implement caching
3. Batch requests
4. Use compression
5. Monitor usage

### Security

1. Use HTTPS
2. Rotate tokens
3. Validate inputs
4. Rate limit
5. Audit logs

## Need Help?

- Check [Documentation](../index.md)
- Join [Discord](https://discord.gg/sveltycms)
- Open [Issue](https://github.com/SveltyCMS/SveltyCMS/issues)
- Contact [Support](mailto:support@sveltycms.com)
