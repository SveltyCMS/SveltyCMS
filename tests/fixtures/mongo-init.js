// MongoDB initialization script for testing
db = db.getSiblingDB('SveltyCMS_Test');

// Create test user with admin privileges
db.createUser({
  user: 'admin',
  pwd: 'admin',
  roles: [
    {
      role: 'readWrite',
      db: 'SveltyCMS_Test'
    }
  ]
});

// Create basic collections that SveltyCMS expects
db.createCollection('users');
db.createCollection('sessions');
db.createCollection('content');
db.createCollection('media');
db.createCollection('system_preferences');

print('MongoDB test database initialized successfully');