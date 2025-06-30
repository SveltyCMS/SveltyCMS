# OAuth Testing Setup Guide

## Setting Up Google OAuth for Testing

### 1. Create a Test Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "New Project"
3. Name it something like `SveltyCMS-Testing` or `YourApp-Dev`
4. Enable the Google+ API and People API

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for testing with any Google account)
3. Fill in required fields:
   - **App name**: `SveltyCMS Test`
   - **User support email**: Your email
   - **Developer contact**: Your email
4. **Scopes**: Add these scopes:
   - `email`
   - `profile`
   - `openid`
5. **Test users**: Add your test email addresses

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Choose **Web application**
4. Set up redirect URIs for local development:

**Authorized JavaScript origins:**

- `http://localhost:5173` (for `bun dev`)

**Authorized redirect URIs:**

- `http://localhost:5173/login/oauth` (for `bun dev`)

**Note:** For production, add your actual domain URLs when deploying.

### 4. Testing OAuth Locally

**Use development server for OAuth testing:**

```bash
# Development server (port 5173) - Recommended for OAuth testing
bun dev
# Navigate to: http://localhost:5173/login
# OAuth redirect URI: http://localhost:5173/login/oauth
```

**Use preview server for production testing:**

```bash
# Preview server (port 4173) - For testing production builds
bun build && bun preview
# Navigate to: http://localhost:4173/login
# OAuth redirect URI: http://localhost:4173/login/oauth (automatically detected)
```

**Important:**

- The system automatically detects the environment and uses the correct redirect URI
- `bun dev` uses `HOST_DEV` (http://localhost:5173)
- `bun preview` uses localhost:4173 (auto-detected)
- Production uses `HOST_PROD` (your actual domain)

**For GitHub Actions:** The automated tests use mock OAuth responses and run against the built application (port 4173) in CI/CD.

### 4. GitHub Actions Testing Configuration

The automated tests are fully configured in `.github/workflows/playwright.yml` with:

- **Mock OAuth credentials** for testing
- **Test environment variables** for all services
- **Built application testing** on port 4173
- **No additional configuration files needed**

```yaml
# Example from playwright.yml
privateEnv.USE_GOOGLE_OAUTH: 'true'
privateEnv.GOOGLE_CLIENT_ID: '123456789-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com'
privateEnv.GOOGLE_CLIENT_SECRET: 'GOCSPX-test_client_secret_for_github_actions'
publicEnv.HOST_PROD: http://localhost:4173
```

### 5. Automated Testing Strategy

The Playwright tests use mocking for reliable CI/CD testing:

1. **Mock OAuth responses** for consistent test results
2. **Test OAuth code paths** without external dependencies
3. **GitHub Actions integration** with predefined test credentials
4. **No manual OAuth flow** required for automated tests

```typescript
// Example test approach
test('OAuth signup flow', async ({ page }) => {
	// Test navigates to OAuth route
	// Mocks Google OAuth responses
	// Verifies user creation and redirect
	// No real Google authentication needed
});
```

### 6. Security Best Practices

1. **Separate test credentials** from production
2. **Use environment variables** for sensitive data
3. **Restrict test OAuth app** to specific domains/IPs
4. **Never commit credentials** to version control
5. **Use mock responses** for automated testing

### 7. Automated Testing Strategy

For CI/CD:

1. **Mock OAuth responses** for unit tests (✅ implemented)
2. **Use test doubles** for Google APIs (✅ implemented)
3. **GitHub Actions** handles all test configuration (✅ implemented)
4. **Real OAuth testing** only during local development

### 8. Debugging OAuth Issues

Common issues and solutions:

1. **invalid_grant error**:
   - Check redirect URI matches exactly
   - Ensure client ID/secret are correct
   - Verify authorization code hasn't expired
   - **Fixed**: Implemented workaround for googleapis v150 PKCE bug

2. **redirect_uri_mismatch**:
   - Add all development URLs to OAuth settings
   - Check for trailing slashes
   - Ensure protocol (http/https) matches

3. **access_denied**:
   - User cancelled OAuth flow
   - App not approved for external users
   - Missing required scopes

4. **Welcome email not sent**:
   - **Fixed**: Updated email API call format to use correct field names
   - Ensure email template 'welcomeUser' exists
   - Check email service configuration

5. **Avatar not saved to database**:
   - **Fixed**: Corrected database upload method call
   - Avatar files are now saved to both disk and database
   - Graceful fallback if database is not ready

### 9. Recent Fixes and Improvements

**Email System (Fixed)**:

- OAuth signup now correctly sends welcome emails
- Fixed field name mismatch in email API call
- Added proper language tag support

**Avatar System (Fixed)**:

- Google OAuth avatars are now properly saved to database
- Fixed database adapter upload method call
- Added graceful fallback for database unavailability
- Improved error handling and logging

**Error Handling**:

- Better error messages for OAuth failures
- Improved logging for debugging
- Graceful degradation when services are unavailable

### 10. Test Account Management

Create dedicated test accounts:

```
Test User 1: svelty-test-user-1@gmail.com
Test User 2: svelty-test-admin@gmail.com
```

This allows consistent testing without affecting real user data.

### 11. Testing Checklist

When testing OAuth functionality, verify:

- [ ] OAuth button appears when `USE_GOOGLE_OAUTH=true`
- [ ] Redirect to Google OAuth works correctly
- [ ] First user signup creates admin account
- [ ] Welcome email is sent successfully
- [ ] Google avatar is downloaded and saved
- [ ] User profile is created with correct data
- [ ] Session is established properly
- [ ] Redirect to collections page works
- [ ] Error handling works for failed OAuth flows

### 12. Automated Test Coverage

The Playwright tests now cover:

- OAuth button visibility and functionality
- OAuth redirect generation
- Successful first user signup flow
- Avatar processing from Google profile
- Welcome email sending
- Error handling for various failure scenarios
- Database integration for user and media storage

Run tests with:

```bash
bun test:playwright
```
