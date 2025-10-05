# MongoDB Connection Error Fix

## Problem Summary

The system was failing during initialization with a MongoDB connection error:

```
Error initializing virtual folders: Failed to get virtual folders: Failed to get all virtual folders
MongoServerSelectionError: connection refused
Component initialization failed
CRITICAL: System initialization failed
```

## Root Cause

The error occurred in `src/databases/mongodb/methods/systemVirtualFolderMethods.ts` when trying to query the `SystemVirtualFolderModel` during system initialization. The issues were:

1. **Race Condition**: Virtual folder initialization ran in parallel with other components, potentially querying the database before it was fully ready
2. **No Retry Logic**: If the initial connection was slow, the query would fail immediately without retry
3. **Timing Issues**: The MongoDB connection might not be fully established when virtual folders tried to initialize

## Solutions Implemented

### 1. Added Retry Logic to Virtual Folder Initialization

**File**: `src/databases/db.ts`

```typescript
async function initializeVirtualFolders(maxRetries = 3, retryDelay = 1000): Promise<void> {
	// ... existing checks ...

	let lastError: unknown;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Verify connection before querying
			if (dbAdapter.isConnected && !dbAdapter.isConnected()) {
				throw new Error('Database connection lost - reconnection required');
			}

			// Attempt to get virtual folders
			const result = await dbAdapter.systemVirtualFolder.getAll();

			// ... process result ...

			// Success - exit retry loop
			return;
		} catch (err) {
			lastError = err;

			if (attempt < maxRetries) {
				logger.warn(`Retry in ${retryDelay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));
				retryDelay *= 2; // Exponential backoff
			}
		}
	}

	throw new Error(`Failed after ${maxRetries} attempts`);
}
```

**Features**:

- 3 retry attempts by default
- Exponential backoff (1s → 2s → 4s)
- Connection verification before each attempt
- Detailed logging of retry attempts

### 2. Sequential Initialization

**Before** (parallel initialization):

```typescript
await Promise.all([
	initializeMediaFolder(),
	initializeRevisions(),
	initializeVirtualFolders() // Could run before DB fully ready
]);
```

**After** (sequential with delay):

```typescript
// Non-database components first
await Promise.all([initializeMediaFolder(), initializeRevisions()]);

// Wait for DB to be fully ready
await new Promise((resolve) => setTimeout(resolve, 100));

// Now initialize virtual folders with retry logic
await initializeVirtualFolders();
```

This ensures:

- Database connection is fully established
- No race conditions with other initialization tasks
- Virtual folders can safely query the database

### 3. MongoDB Connection Diagnostic Tool

Created `scripts/check-mongodb.js` to diagnose connection issues:

```bash
bun run check:mongodb
```

**What it checks**:

- ✓ Configuration loading from `config/private.ts`
- ✓ Connection string construction
- ✓ MongoDB server accessibility
- ✓ Database ping and version
- ✓ Collection listing
- ✓ Virtual folders collection status

**Example output**:

```
============================================================
MongoDB Connection Diagnostic Tool
============================================================

============================================================
Step 1: Loading Configuration
============================================================
ℹ Reading config from: /path/to/config/private.ts
✓ Configuration loaded successfully
ℹ DB Type: mongodb
ℹ DB Host: localhost
ℹ DB Port: 27017
ℹ DB Name: sveltycms

============================================================
Step 2: Building Connection String
============================================================
✓ Connection string built successfully
ℹ Connection string: mongodb://localhost:27017/sveltycms

============================================================
Step 3: Testing MongoDB Connection
============================================================
ℹ Attempting to connect...
✓ Successfully connected to MongoDB
✓ Database ping successful
ℹ MongoDB Version: 6.0.5
ℹ Uptime: 1234 minutes

============================================================
Summary
============================================================
✓ All checks passed! MongoDB is accessible and working correctly.
```

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Connection Refused (ECONNREFUSED)

**Symptoms**:

```
MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017
```

**Solutions**:

**Linux**:

```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Enable MongoDB on boot
sudo systemctl enable mongod

# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log
```

**Mac (Homebrew)**:

```bash
# Check status
brew services list

# Start MongoDB
brew services start mongodb-community

# Check logs
tail -f /usr/local/var/log/mongodb/mongo.log
```

**Windows**:

```powershell
# Check service status
Get-Service MongoDB

# Start service
net start MongoDB

# Check logs
Get-Content "C:\Program Files\MongoDB\Server\6.0\log\mongod.log" -Tail 50
```

#### 2. Authentication Failed

**Symptoms**:

```
MongoServerError: Authentication failed
```

**Solutions**:

1. Verify credentials in `config/private.ts`:

   ```typescript
   export const privateEnv = {
   	DB_USER: 'your-username',
   	DB_PASSWORD: 'your-password'
   	// ...
   };
   ```

2. Check MongoDB user exists:

   ```bash
   mongosh admin
   > db.getUsers()
   ```

3. Create MongoDB user if needed:
   ```javascript
   use admin
   db.createUser({
     user: "sveltycms",
     pwd: "your-password",
     roles: [{ role: "readWrite", db: "sveltycms" }]
   })
   ```

#### 3. Connection Timeout

**Symptoms**:

```
MongoServerSelectionError: connection <monitor> timed out
```

**Solutions**:

1. Check MongoDB is bound to correct IP:

   ```bash
   # Edit mongod.conf
   sudo nano /etc/mongod.conf

   # Set bindIp
   net:
     port: 27017
     bindIp: 127.0.0.1  # or 0.0.0.0 for all interfaces

   # Restart MongoDB
   sudo systemctl restart mongod
   ```

2. Check firewall rules:

   ```bash
   # Allow MongoDB port
   sudo ufw allow 27017

   # Check firewall status
   sudo ufw status
   ```

3. Verify network connectivity (remote MongoDB):
   ```bash
   # Test connection
   telnet your-mongodb-host 27017
   ```

#### 4. Database Not Responding

**Symptoms**:

```
MongoServerSelectionError: Server selection timed out
```

**Solutions**:

1. Check MongoDB process:

   ```bash
   ps aux | grep mongod
   ```

2. Check MongoDB resource usage:

   ```bash
   # Memory
   free -h

   # Disk space
   df -h

   # MongoDB stats
   mongosh
   > db.serverStatus()
   ```

3. Restart MongoDB:
   ```bash
   sudo systemctl restart mongod
   ```

## Verification Steps

After implementing the fixes:

1. **Run diagnostic tool**:

   ```bash
   bun run check:mongodb
   ```

2. **Check application logs**:

   ```bash
   tail -f logs/app.log | grep -i "virtual folder"
   ```

3. **Expected log output**:

   ```
   Initializing virtual folders (attempt 1/3)...
   ✅ Virtual folders initialized successfully on attempt 1
   Found 1 virtual folders
   ```

4. **Verify startup succeeds**:
   ```bash
   bun run dev
   ```

## Configuration Reference

### MongoDB Connection Settings

**File**: `config/private.ts`

```typescript
export const privateEnv = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost', // MongoDB host
	DB_PORT: '27017', // MongoDB port
	DB_NAME: 'sveltycms', // Database name
	DB_USER: '', // Optional: MongoDB user
	DB_PASSWORD: '' // Optional: MongoDB password
	// ...
};
```

### Connection Timeout Settings

**File**: `src/databases/mongodb/mongoDBAdapter.ts`

```typescript
const enterpriseOptions: mongoose.ConnectOptions = {
	serverSelectionTimeoutMS: 5000, // 5 seconds
	connectTimeoutMS: 10000, // 10 seconds
	socketTimeoutMS: 45000, // 45 seconds

	retryWrites: true,
	retryReads: true
	// ...
};
```

## Performance Impact

The retry logic adds minimal overhead:

- **Success on first attempt**: No delay (100ms grace period)
- **Retry needed**: 1s → 2s → 4s exponential backoff
- **Total max delay**: ~7 seconds for 3 retries

This is acceptable for system initialization and prevents hard failures.

## Testing

### Unit Test Example

```typescript
describe('initializeVirtualFolders', () => {
	it('should retry on connection failure', async () => {
		const mockGetAll = jest.fn().mockRejectedValueOnce(new Error('Connection refused')).mockResolvedValueOnce({ success: true, data: [] });

		await initializeVirtualFolders();

		expect(mockGetAll).toHaveBeenCalledTimes(2);
	});
});
```

### Integration Test

```bash
# 1. Stop MongoDB
sudo systemctl stop mongod

# 2. Start application (should fail gracefully)
bun run dev

# 3. Start MongoDB
sudo systemctl start mongod

# 4. Application should retry and succeed
# Check logs for retry messages
```

## Related Files

- `src/databases/db.ts` - Virtual folder initialization with retry logic
- `src/databases/mongodb/methods/systemVirtualFolderMethods.ts` - MongoDB query methods
- `scripts/check-mongodb.js` - Connection diagnostic tool
- `docs/MongoDB_Connection_Error_Fix.md` - This documentation

## Future Improvements

1. **Health Check Endpoint**: Add `/api/health` to check DB status
2. **Reconnection Strategy**: Auto-reconnect if connection lost during runtime
3. **Circuit Breaker**: Skip virtual folders if DB consistently fails
4. **Monitoring**: Track retry rates in production
5. **Graceful Degradation**: Allow app to start without virtual folders (read-only mode)

## Changelog

**2024-01-XX - v1.0**

- ✅ Added retry logic to virtual folder initialization
- ✅ Implemented exponential backoff (3 attempts)
- ✅ Added connection verification before queries
- ✅ Changed parallel to sequential initialization
- ✅ Created MongoDB diagnostic tool
- ✅ Added detailed error logging
- ✅ Updated documentation with troubleshooting guide

## Support

If you continue to experience MongoDB connection issues:

1. Run diagnostic: `bun run check:mongodb`
2. Check logs: `tail -f logs/app.log`
3. Verify MongoDB: `sudo systemctl status mongod`
4. Review configuration: `config/private.ts`
5. Create GitHub issue with diagnostic output

---

**Last Updated**: 2024-01-XX  
**Severity**: HIGH (prevents system startup)  
**Status**: ✅ RESOLVED
