# Database Integration

This guide explains **how SveltyCMS handles database integration** and supports multiple database types.

## Database Abstraction Layer

SveltyCMS uses a database abstraction layer that allows seamless switching between different database types without changing application code.

### Supported Databases

#### MongoDB (Recommended)

```javascript
// Example MongoDB configuration
const mongoConfig = {
	type: 'mongodb',
	url: 'mongodb://localhost:27017/sveltycms',
	options: {
		useNewUrlParser: true,
		useUnifiedTopology: true
	}
};
```

**Advantages:**

- Native JSON document storage
- Flexible schema evolution
- Built-in indexing and aggregation
- Horizontal scaling capabilities

#### PostgreSQL

```javascript
// Example PostgreSQL configuration
const pgConfig = {
	type: 'postgresql',
	url: 'postgresql://user:password@localhost:5432/sveltycms',
	options: {
		ssl: false,
		poolSize: 10
	}
};
```

**Advantages:**

- ACID compliance
- Advanced SQL features
- Strong consistency
- Mature ecosystem

#### SQLite (Development)

```javascript
// Example SQLite configuration
const sqliteConfig = {
	type: 'sqlite',
	url: 'file:./data/sveltycms.db',
	options: {
		enableWAL: true
	}
};
```

**Advantages:**

- Zero configuration
- File-based storage
- Perfect for development
- Fast for small datasets

## How Connection Management Works

### Connection Pool

```typescript
class DatabaseManager {
	private pool: ConnectionPool;

	async initialize() {
		this.pool = await createConnectionPool({
			type: config.database.type,
			url: config.database.url,
			poolSize: config.database.poolSize || 10
		});
	}

	async getConnection() {
		return await this.pool.acquire();
	}

	async releaseConnection(connection: Connection) {
		await this.pool.release(connection);
	}
}
```

### Transaction Handling

```typescript
async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
	const connection = await db.getConnection();
	const transaction = await connection.beginTransaction();

	try {
		const result = await callback(transaction);
		await transaction.commit();
		return result;
	} catch (error) {
		await transaction.rollback();
		throw error;
	} finally {
		await db.releaseConnection(connection);
	}
}
```

## Migration Strategies

### Schema Evolution

```typescript
interface Migration {
	version: string;
	up: (db: Database) => Promise<void>;
	down: (db: Database) => Promise<void>;
}

class MigrationManager {
	async runMigrations() {
		const currentVersion = await this.getCurrentVersion();
		const pendingMigrations = await this.getPendingMigrations(currentVersion);

		for (const migration of pendingMigrations) {
			await migration.up(this.database);
			await this.updateVersion(migration.version);
		}
	}
}
```

### Collection Schema Management

```typescript
// Dynamic collection schema
interface CollectionSchema {
	name: string;
	fields: FieldDefinition[];
	indexes: IndexDefinition[];
	relationships: RelationshipDefinition[];
}

async function createCollection(schema: CollectionSchema) {
	// Create collection/table based on database type
	switch (db.type) {
		case 'mongodb':
			await createMongoCollection(schema);
			break;
		case 'postgresql':
			await createPostgreSQLTable(schema);
			break;
		case 'sqlite':
			await createSQLiteTable(schema);
			break;
	}
}
```

## Performance Optimization

### Indexing Strategy

```typescript
class IndexManager {
	async createOptimalIndexes(collection: string, fields: FieldDefinition[]) {
		// Analyze query patterns
		const queryPatterns = await this.analyzeQueries(collection);

		// Create compound indexes for common query combinations
		for (const pattern of queryPatterns) {
			await this.createIndex(collection, pattern.fields, {
				background: true,
				sparse: pattern.sparse
			});
		}
	}
}
```

### Query Optimization

```typescript
class QueryOptimizer {
	async optimizeQuery(query: Query): Promise<OptimizedQuery> {
		// Analyze query structure
		const analysis = await this.analyzeQuery(query);

		// Apply optimizations based on database type
		switch (this.dbType) {
			case 'mongodb':
				return this.optimizeMongoQuery(query, analysis);
			case 'postgresql':
				return this.optimizePostgreSQLQuery(query, analysis);
			default:
				return query;
		}
	}
}
```

### Caching Layer

```typescript
class DatabaseCache {
	private cache = new Map<string, CachedResult>();

	async getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
		const cached = this.cache.get(key);

		if (cached && !this.isExpired(cached)) {
			return cached.data;
		}

		const data = await fetcher();
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: 300000 // 5 minutes
		});

		return data;
	}
}
```

## Database Configuration in CLI Installer

The CLI installer automatically configures the database connection:

1. **Database Type Selection**: Choose from supported options
2. **Connection Testing**: Verify database connectivity
3. **Schema Creation**: Initialize required tables/collections
4. **Index Creation**: Set up optimal indexes
5. **Sample Data**: Optional test data insertion

### Configuration Files Generated

#### Private Configuration

```typescript
// config/private.ts
export const database = {
	type: 'mongodb',
	url: process.env.DATABASE_URL,
	options: {
		maxPoolSize: 10,
		minPoolSize: 2,
		maxIdleTimeMS: 30000
	}
};
```

#### Public Configuration

```typescript
// config/public.ts
export const database = {
	type: 'mongodb', // Non-sensitive info only
	features: ['transactions', 'indexing', 'aggregation']
};
```

## Error Handling

### Connection Errors

```typescript
class DatabaseErrorHandler {
	async handleConnectionError(error: ConnectionError) {
		switch (error.code) {
			case 'CONNECTION_TIMEOUT':
				await this.retryConnection();
				break;
			case 'AUTH_FAILED':
				throw new ConfigurationError('Database authentication failed');
			case 'DATABASE_NOT_FOUND':
				await this.createDatabase();
				break;
			default:
				throw error;
		}
	}
}
```

### Data Validation

```typescript
async function validateData(data: any, schema: Schema): Promise<ValidationResult> {
	const validator = new SchemaValidator(schema);
	const result = await validator.validate(data);

	if (!result.valid) {
		throw new ValidationError('Data validation failed', result.errors);
	}

	return result;
}
```

## Monitoring and Health Checks

### Database Health

```typescript
class DatabaseHealth {
	async checkHealth(): Promise<HealthStatus> {
		const startTime = Date.now();

		try {
			await this.db.ping();
			const responseTime = Date.now() - startTime;

			return {
				status: 'healthy',
				responseTime,
				timestamp: new Date()
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				error: error.message,
				timestamp: new Date()
			};
		}
	}
}
```

### Performance Metrics

```typescript
class DatabaseMetrics {
	async collectMetrics(): Promise<DatabaseMetrics> {
		return {
			connectionPoolSize: await this.getPoolSize(),
			activeConnections: await this.getActiveConnections(),
			queryLatency: await this.getAverageQueryLatency(),
			errorRate: await this.getErrorRate(),
			cacheHitRatio: await this.getCacheHitRatio()
		};
	}
}
```

## Best Practices

1. **Connection Pooling**: Always use connection pools for better performance
2. **Transaction Management**: Use transactions for data consistency
3. **Index Strategy**: Create indexes based on query patterns
4. **Error Handling**: Implement comprehensive error handling
5. **Monitoring**: Set up health checks and performance monitoring
6. **Security**: Use parameterized queries to prevent injection attacks
7. **Backup Strategy**: Implement regular backup procedures
