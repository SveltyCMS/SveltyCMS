# Database Library

Database drivers and adapters with conditional loading for MongoDB and Drizzle (SQL).

## Purpose

Centralized database abstraction with:
- Conditional driver loading (only selected driver is bundled)
- Unified interface for different databases
- Connection pooling and optimization
- Schema management

## Structure

```
shared/database/
├── src/
│   ├── index.ts              # Main export with dynamic loading
│   ├── interface.ts          # Database adapter interface
│   ├── mongodb/              # MongoDB implementation
│   │   ├── adapter.ts
│   │   ├── models/
│   │   └── methods/
│   ├── drizzle/              # Drizzle ORM implementation
│   │   ├── adapter.ts
│   │   ├── schemas/
│   │   └── migrations/
│   └── utils/                # Shared database utilities
├── project.json
├── tsconfig.json
└── README.md
```

## Conditional Loading

**Critical Feature**: Only the configured database driver is loaded and bundled.

### Implementation

```typescript
// src/index.ts
export async function loadDatabaseAdapter() {
  const config = await getConfig();
  
  if (config.database.type === 'mongodb') {
    // Only MongoDB code is bundled when using MongoDB
    const { MongoDBAdapter } = await import('./mongodb/adapter');
    return new MongoDBAdapter(config);
  }
  
  if (config.database.type === 'sql') {
    // Only Drizzle code is bundled when using SQL
    const { DrizzleAdapter } = await import('./drizzle/adapter');
    return new DrizzleAdapter(config);
  }
  
  throw new Error('Invalid database type');
}
```

## Database Adapter Interface

All adapters implement a common interface:

```typescript
interface DatabaseAdapter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // CRUD operations
  find(collection: string, query: object): Promise<any[]>;
  findOne(collection: string, query: object): Promise<any>;
  create(collection: string, data: object): Promise<any>;
  update(collection: string, query: object, data: object): Promise<any>;
  delete(collection: string, query: object): Promise<void>;
  
  // Transactions
  startTransaction(): Promise<Transaction>;
  
  // Schema
  syncSchema(): Promise<void>;
}
```

## MongoDB Support

### Features
- Mongoose ORM
- Schema validation
- Middleware hooks
- Population
- Virtuals

### Configuration

```typescript
{
  database: {
    type: 'mongodb',
    url: 'mongodb://localhost:27017/sveltycms',
    options: {
      // MongoDB-specific options
    }
  }
}
```

## Drizzle (SQL) Support

### Supported Databases
- MariaDB
- PostgreSQL
- MySQL

### Features
- Type-safe queries
- Migrations
- Relations
- Indexes

### Configuration

```typescript
{
  database: {
    type: 'sql',
    driver: 'mariadb', // or 'postgres', 'mysql'
    url: 'mysql://user:pass@localhost:3306/sveltycms',
    options: {
      // Drizzle-specific options
    }
  }
}
```

## Usage in Applications

```typescript
// Load the adapter (only configured driver is bundled)
import { loadDatabaseAdapter } from '@shared/database';

const db = await loadDatabaseAdapter();
await db.connect();

// Use unified interface
const users = await db.find('users', { active: true });
const user = await db.findOne('users', { id: '123' });

await db.create('users', {
  name: 'John Doe',
  email: 'john@example.com'
});
```

## Bundle Optimization

### Without Conditional Loading
- Both MongoDB and Drizzle bundled: ~2MB
- Unnecessary dependencies included

### With Conditional Loading
- Only selected driver bundled: ~500KB
- 75% reduction in database code
- Faster startup and lower memory usage

## Schema Management

### MongoDB Schemas
```typescript
// src/mongodb/models/user.ts
import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  name: String,
  email: { type: String, unique: true }
});

export const User = model('User', userSchema);
```

### Drizzle Schemas
```typescript
// src/drizzle/schemas/user.ts
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).unique()
});
```

## Migrations

### MongoDB
Uses Mongoose schema versioning and migration scripts.

### Drizzle
```bash
# Generate migration
nx run database:migrate:generate

# Apply migration
nx run database:migrate:apply
```

## Testing

```bash
# Test with MongoDB (requires MongoDB running)
DATABASE_TYPE=mongodb nx test database

# Test with Drizzle (requires SQL database)
DATABASE_TYPE=sql nx test database
```

## Dependencies

### Core
- drizzle-orm (only if using SQL)
- mongoose (only if using MongoDB)

### Optional (as needed)
- mariadb
- postgres
- mysql2

## Performance Tips

1. **Connection Pooling**: Configured automatically
2. **Indexes**: Define in schemas for common queries
3. **Caching**: Use Redis for frequently accessed data
4. **Batch Operations**: Use bulk operations when possible
5. **Query Optimization**: Use select fields to reduce data transfer

## Security

- SQL injection prevention (via ORM)
- Input validation
- Prepared statements
- Connection encryption (TLS/SSL)

## Best Practices

1. **Always use the adapter interface** - Never import driver-specific code directly
2. **Test both drivers** - Ensure compatibility
3. **Document schema changes** - Migrations should be documented
4. **Use transactions** - For data consistency
5. **Handle errors gracefully** - Database errors should not crash the app
