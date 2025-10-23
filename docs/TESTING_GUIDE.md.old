# SveltyCMS Testing Guide

## Overview

This guide covers testing strategies for SveltyCMS authentication and user management flows. All tests are designed to work in both local development and automated CI/CD environments.

## Test Coverage

### 1. Authentication Methods

#### Email Signup Testing

- **Documentation**: [EMAIL_SIGNUP_TESTING.md](./EMAIL_SIGNUP_TESTING.md)
- **Test File**: `/tests/playwright/signupfirstuser.spec.ts`
- **Coverage**: Form validation, user creation, first user vs subsequent users

#### OAuth Testing

- **Documentation**: [OAUTH_TESTING_SETUP.md](./OAUTH_TESTING_SETUP.md)
- **Test File**: `/tests/playwright/oauth-signup-firstuser.spec.ts`
- **Coverage**: Google OAuth flow, token exchange, user creation

#### User Management Testing

- **Test File**: `/tests/playwright/user.spec.ts`
- **Coverage**: User operations, permissions, sessions

### 2. GitHub Actions Integration

All tests are fully configured in `.github/workflows/playwright.yml`:

```yaml
strategy:
  matrix:
    test-file: [
        '/tests/playwright/signupfirstuser.spec.ts', # Email signup
        '/tests/playwright/user.spec.ts', # User management
        '/tests/playwright/oauth-signup-firstuser.spec.ts' # OAuth signup
      ]
```

#### Key Features:

- ✅ **MongoDB service container** for database testing
- ✅ **Mock OAuth credentials** for OAuth testing
- ✅ **Mock SMTP services** for email testing
- ✅ **Test environment variables** for all services
- ✅ **Built application testing** on port 4173
- ✅ **Parallel test execution** for faster CI/CD

### 3. Local Development Testing

#### Prerequisites

```bash
# Start development server
bun dev

# Run specific test
npx playwright test signupfirstuser.spec.ts
npx playwright test oauth-signup-firstuser.spec.ts
npx playwright test user.spec.ts

# Run all tests
npx playwright test
```

#### Environment Setup

- **OAuth**: Requires real Google OAuth credentials (see OAuth testing guide)
- **Email**: Works without SMTP configuration for basic testing
- **Database**: Uses local MongoDB instance

### 4. Test Environment Configuration

#### No Additional Files Needed

The testing configuration is **entirely handled** by GitHub Actions workflow:

- ❌ **No `.env.test` required** - All environment variables in workflow
- ❌ **No test scripts required** - Tests run directly via Playwright
- ❌ **No manual configuration** - Everything automated

#### Environment Variables

All test environment variables are defined in `playwright.yml`:

- Database connection (MongoDB service)
- OAuth credentials (mock values)
- SMTP configuration (mock values)
- Application settings (test values)

### 5. Testing Strategy

#### Unit Testing

- **Framework**: Bun test
- **Location**: `/tests/bun/`
- **Coverage**: Individual functions and utilities

#### Integration Testing

- **Framework**: Playwright
- **Location**: `/tests/playwright/`
- **Coverage**: Full user flows and authentication

#### CI/CD Testing

- **Platform**: GitHub Actions
- **Environment**: Ubuntu with MongoDB service
- **Coverage**: All authentication flows with mocked services

### 6. Test Data Management

#### Database State

- **Clean slate**: Each test starts with empty database
- **User creation**: Tests handle first user vs subsequent user scenarios
- **Collection setup**: Default collections created for redirect testing

#### Mock Services

- **OAuth responses**: Mocked Google API responses
- **Email services**: Mocked SMTP for welcome emails
- **External APIs**: All external dependencies mocked

### 7. Common Testing Patterns

#### First User Detection

```typescript
// System determines first user by counting existing users
// Tests ensure clean database state for accurate testing
```

#### Collection Redirects

```typescript
// After signup/login, users redirect to first collection
// Uses centralized getFirstCollectionRedirectUrl() utility
// All authentication flows use same redirect logic
```

#### Session Management

```typescript
// Automatic session creation after successful authentication
// Session validation and cookie handling tested
// Works for both email and OAuth authentication
```

### 8. Debugging Test Failures

#### Check Test Logs

- View GitHub Actions logs for detailed error information
- Check Playwright reports for step-by-step failure analysis
- Monitor database connection and service startup

#### Common Issues

1. **Database connection**: MongoDB service not ready
2. **Timing issues**: Page load timing in CI environment
3. **Mock configuration**: Incorrect mock response format
4. **Environment variables**: Missing or incorrect test values

#### Local Debugging

```bash
# Run tests with debug mode
npx playwright test --debug

# Run specific test with headed browser
npx playwright test signupfirstuser.spec.ts --headed

# Generate test report
npx playwright show-report
```

### 9. Test Maintenance

#### Updating Tests

- Tests automatically run on every push and pull request
- Update test selectors if UI components change
- Maintain mock responses if external API formats change

#### Adding New Tests

1. Create test file in `/tests/playwright/`
2. Add test file to GitHub Actions matrix
3. Follow existing patterns for database setup and cleanup
4. Use centralized utilities for common operations

### 10. Security Testing

#### Authentication Security

- Password validation and requirements
- Session security and expiration
- CSRF protection and validation
- OAuth flow security

#### Data Protection

- User data validation and sanitization
- Database access control
- API endpoint protection
- Input validation testing

## Quick Reference

### Run All Tests Locally

```bash
bun test                           # Run bun tests
npx playwright test               # Run playwright tests
```

### Run Specific Test Categories

```bash
npx playwright test signupfirstuser.spec.ts    # Email signup
npx playwright test oauth-signup-firstuser.spec.ts  # OAuth signup
npx playwright test user.spec.ts              # User management
```

### View Test Results

```bash
npx playwright show-report        # View detailed test report
```

### GitHub Actions

- Tests run automatically on push/PR
- View results in Actions tab
- Download test artifacts for detailed analysis

This testing setup ensures comprehensive coverage of all authentication flows with minimal configuration overhead and maximum reliability in CI/CD environments.
