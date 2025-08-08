---
title: 'Session Management'
description: 'Covers how sessions are managed within the system, including their creation, expiration, and deletion, to ensure secure user interactions.'
---

# Session Management

## Overview

This document covers how sessions are managed within the system, including their creation, expiration, and deletion, to ensure secure user interactions.

## Session Lifecycle

### Creation

Sessions are initiated upon user login. A session ID is generated and stored in the database along with the user ID and expiration timestamp.

### Expiration

Sessions have a set duration and expire when the duration lapses. The system checks session expiration and invalidates expired sessions automatically.

### Deletion

Sessions can be terminated either through user logout or automatically upon expiration. This ensures that no stale sessions remain in the system.

## Methods and Their Purposes

- `createSession(data: { userId: string; expires: number }): Promise<Session>`
  - **Purpose**: Creates a new session for a user.
  - **Parameters**: `data` - Object containing user ID and session expiration time.

- `destroySession(sessionId: string): Promise<void>`
  - **Purpose**: Destroys a session by its ID.
  - **Parameters**: `sessionId` - The ID of the session to destroy.

- `validateSession(sessionId: string): Promise<User | null>`
  - **Purpose**: Validates a session ID and returns the associated user.
  - **Parameters**: `sessionId` - The ID of the session to validate.

- `invalidateAllUserSessions(userId: string): Promise<void>`
  - **Purpose**: Invalidates all sessions associated with a user ID.
  - **Parameters**: `userId` - The ID of the user whose sessions to invalidate.

## Database Schema

### Sessions Table

| Column Name | Data Type | Description                        |
| ----------- | --------- | ---------------------------------- |
| id          | INT       | Primary key, auto-increments       |
| user_id     | INT       | Foreign key to Users table         |
| token       | VARCHAR   | Secure session token               |
| expires_at  | DATETIME  | Timestamp when the session expires |
| created_at  | DATETIME  | Timestamp of session creation      |

## Data Structure

### Session

```typescript
export interface Session {
	id: string; // Unique identifier for the session
	userId: string; // The ID of the user who owns the session
	expires: Date; // When the session expires
}
```
