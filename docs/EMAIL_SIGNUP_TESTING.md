# Email Signup Testing Guide

## Setting Up Email Signup Testing

### 1. Local Development Testing

**Use development server for email signup testing:**

```bash
# Development server (port 5173) - Recommended for email signup testing
bun dev
# Navigate to: http://localhost:5173/login
```

### 2. Email Signup Flow

The email signup process works as follows:

1. **First User Signup** (no existing users):
   - Navigate to `/login`
   - Form automatically shows "Sign Up" mode
   - Fill in required fields: `username`, `email`, `password`
   - Submit form
   - User account created with `admin` role
   - Automatic login and redirect to first collection

2. **Subsequent User Signup** (after first user exists):
   - Navigate to `/login`
   - Click "Sign Up" to switch to signup mode
   - Fill in required fields: `username`, `email`, `password`
   - Submit form
   - User account created with `user` role
   - Automatic login and redirect to first collection

### 3. GitHub Actions Testing Configuration

The automated tests are configured in `.github/workflows/playwright.yml`:

```yaml
# Email/SMTP configuration for testing
privateEnv.SMTP_HOST: ''
privateEnv.SMTP_PORT: ''
privateEnv.SMTP_EMAIL: 'test@example.com'
privateEnv.SMTP_PASSWORD: ''

# Database configuration
privateEnv.DB_TYPE: 'mongodb'
privateEnv.DB_HOST: mongodb://localhost
privateEnv.DB_PORT: 27017
privateEnv.DB_NAME: SveltyCMS
privateEnv.DB_USER: admin
privateEnv.DB_PASSWORD: admin

# Application configuration
publicEnv.HOST_PROD: http://localhost:4173
publicEnv.PASSWORD_LENGTH: '8'
```

### 4. Automated Testing Strategy

The Playwright tests use the following approach:

1. **Mock SMTP services** for email testing
2. **Test signup form validation**
3. **Test user creation and authentication**
4. **Test first user vs subsequent user behavior**
5. **Test redirect to first collection**

### 5. Test Files

#### Email Signup Tests

- **Location**: `/tests/playwright/signupfirstuser.spec.ts`
- **Coverage**: First user signup, form validation, authentication
- **Environment**: Uses GitHub Actions test environment

#### User Management Tests

- **Location**: `/tests/playwright/user.spec.ts`
- **Coverage**: User operations, permissions, session management
- **Environment**: Uses GitHub Actions test environment

### 6. Key Test Scenarios

```typescript
// Example test scenarios covered

test('First user signup', async ({ page }) => {
	// Navigate to login page
	// Verify signup form is shown (no existing users)
	// Fill signup form with valid data
	// Submit form
	// Verify user creation
	// Verify automatic login
	// Verify redirect to first collection
});

test('Subsequent user signup', async ({ page }) => {
	// Create first user (setup)
	// Navigate to login page
	// Click "Sign Up" to switch modes
	// Fill signup form
	// Submit form
	// Verify user creation with 'user' role
	// Verify automatic login
	// Verify redirect to first collection
});

test('Form validation', async ({ page }) => {
	// Test required field validation
	// Test email format validation
	// Test password length validation
	// Test duplicate email handling
});
```

### 7. Email Configuration for Testing

#### Local Development

- **SMTP**: Not required for basic signup testing
- **Email validation**: Tests form validation only
- **Welcome emails**: Optional for testing

#### Production Setup

- **SMTP Configuration**: Required for welcome emails
- **Email templates**: Located in email template system
- **Email verification**: Optional enhancement

### 8. Database State Management

For testing, the system:

1. **Cleans database** between test runs
2. **Manages user count** to determine first user status
3. **Creates collections** for redirect testing
4. **Handles sessions** for authentication testing

### 9. Common Testing Issues

#### First User Detection

```typescript
// The system determines first user by counting users
// Make sure database is clean for first user tests
await dbAdapter.user.deleteMany({});
```

#### Collection Redirect

```typescript
// After signup, users are redirected to first collection
// Ensure collections exist for redirect testing
// Use centralized getFirstCollectionRedirectUrl() utility
```

#### Session Management

```typescript
// Users are automatically logged in after signup
// Sessions are created and validated
// Cookie management handled automatically
```

### 10. Security Best Practices

1. **Use test databases** for automated testing
2. **Mock email services** in CI/CD
3. **Validate form inputs** thoroughly
4. **Test password requirements**
5. **Handle duplicate emails** gracefully

### 11. Development vs Production

#### Development

- **Database**: Local MongoDB
- **Email**: Optional SMTP configuration
- **Sessions**: In-memory storage
- **Testing**: Manual testing with real forms

#### GitHub Actions

- **Database**: MongoDB service container
- **Email**: Mocked SMTP services
- **Sessions**: In-memory storage
- **Testing**: Automated Playwright tests

### 12. Debugging Signup Issues

Common issues and solutions:

1. **Database connection errors**:
   - Check MongoDB service status
   - Verify connection string format
   - Check database permissions

2. **Form validation errors**:
   - Check password length requirements
   - Verify email format validation
   - Test required field handling

3. **Redirect errors**:
   - Ensure collections exist
   - Check collection path generation
   - Verify UUID-based routing

4. **Session errors**:
   - Check session creation
   - Verify cookie handling
   - Test authentication state

This covers the complete email signup testing workflow for both local development and automated CI/CD testing.
