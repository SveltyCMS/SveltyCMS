---
title: 'Database Adapters'
description: 'Implementation guide for authentication database adapters'
icon: 'mdi:database'
published: true
order: 2
---

# Authentication Database Adapters

This guide explains how to implement and use database adapters for the authentication system.

## Core Adapter Interface

```typescript
interface AuthDatabaseAdapter {
	// User operations
	findUserById(id: string): Promise<User>;
	findUserByEmail(email: string): Promise<User>;
	createUser(user: UserInput): Promise<User>;
	updateUser(id: string, data: Partial<User>): Promise<User>;
	deleteUser(id: string): Promise<void>;

	// Session operations
	createSession(session: SessionInput): Promise<Session>;
	findSessionById(id: string): Promise<Session>;
	invalidateSession(id: string): Promise<void>;
	cleanExpiredSessions(): Promise<void>;

	// Role operations
	findRoleById(id: string): Promise<Role>;
	createRole(role: RoleInput): Promise<Role>;
	updateRole(id: string, data: Partial<Role>): Promise<Role>;
	deleteRole(id: string): Promise<void>;
}
```

## MongoDB Adapter Implementation

```typescript
class MongoDBAuthAdapter implements AuthDatabaseAdapter {
	constructor(private db: Db) {}

	async findUserById(id: string): Promise<User> {
		const user = await this.db.collection('users').findOne({ _id: new ObjectId(id) });
		if (!user) throw new NotFoundError('User not found');
		return this.mapUser(user);
	}

	async createUser(user: UserInput): Promise<User> {
		const result = await this.db.collection('users').insertOne({
			...user,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		return this.findUserById(result.insertedId.toString());
	}

	async createSession(session: SessionInput): Promise<Session> {
		const result = await this.db.collection('sessions').insertOne({
			...session,
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + SESSION_TTL)
		});
		return this.findSessionById(result.insertedId.toString());
	}

	private mapUser(doc: any): User {
		return {
			id: doc._id.toString(),
			username: doc.username,
			email: doc.email,
			roles: doc.roles,
			permissions: doc.permissions,
			metadata: doc.metadata
		};
	}
}
```

## PostgreSQL Adapter Implementation

```typescript
class PostgreSQLAuthAdapter implements AuthDatabaseAdapter {
	constructor(private pool: Pool) {}

	async findUserById(id: string): Promise<User> {
		const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
		if (!rows[0]) throw new NotFoundError('User not found');
		return this.mapUser(rows[0]);
	}

	async createUser(user: UserInput): Promise<User> {
		const { rows } = await this.pool.query(
			`INSERT INTO users (username, email, password, roles)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
			[user.username, user.email, user.password, JSON.stringify(user.roles)]
		);
		return this.mapUser(rows[0]);
	}

	async createSession(session: SessionInput): Promise<Session> {
		const { rows } = await this.pool.query(
			`INSERT INTO sessions (user_id, refresh_token, expires_at)
             VALUES ($1, $2, $3)
             RETURNING *`,
			[session.userId, session.refreshToken, new Date(Date.now() + SESSION_TTL)]
		);
		return this.mapSession(rows[0]);
	}

	private mapUser(row: any): User {
		return {
			id: row.id,
			username: row.username,
			email: row.email,
			roles: JSON.parse(row.roles),
			permissions: JSON.parse(row.permissions),
			metadata: JSON.parse(row.metadata)
		};
	}
}
```

## Schema Definitions

### MongoDB Schemas

```typescript
const UserSchema = {
	username: { type: String, required: true, unique: true },
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true },
	roles: [{ type: String }],
	permissions: [
		{
			action: String,
			resource: String,
			conditions: Object
		}
	],
	metadata: {
		createdAt: Date,
		lastLogin: Date,
		loginAttempts: Number,
		status: String
	}
};

const SessionSchema = {
	userId: { type: ObjectId, required: true },
	refreshToken: { type: String, required: true },
	device: {
		type: { userAgent: String, ip: String }
	},
	expiresAt: { type: Date, required: true },
	createdAt: { type: Date, default: Date.now }
};
```

### PostgreSQL Schemas

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    roles JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    refresh_token VARCHAR(255) NOT NULL,
    device JSONB DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

## Custom Adapter Implementation

### Creating a Custom Adapter

1. Implement the `AuthDatabaseAdapter` interface
2. Handle data mapping
3. Implement error handling
4. Add connection management

```typescript
class CustomAuthAdapter implements AuthDatabaseAdapter {
	constructor(private connection: any) {
		// Initialize your database connection
	}

	async connect(): Promise<void> {
		// Handle connection setup
	}

	async disconnect(): Promise<void> {
		// Clean up connection
	}

	// Implement required methods
	async findUserById(id: string): Promise<User> {
		// Custom implementation
	}

	// ... implement other required methods
}
```

## Error Handling

```typescript
class DatabaseError extends Error {
	constructor(
		message: string,
		public code: string,
		public originalError?: Error
	) {
		super(message);
		this.name = 'DatabaseError';
	}
}

function handleDatabaseError(error: any): never {
	if (error.code === 'UNIQUE_VIOLATION') {
		throw new DatabaseError('Duplicate entry', 'DUPLICATE_ENTRY', error);
	}

	throw new DatabaseError('Database operation failed', 'OPERATION_FAILED', error);
}
```

## Next Steps

1. [Custom Authentication](./03_Custom_Auth.md)
2. [Security Best Practices](./04_Security.md)
3. [Performance Optimization](./05_Performance.md)
