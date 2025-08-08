# OAuth Integration

This guide explains **how OAuth authentication works** in SveltyCMS, focusing on Google OAuth implementation.

## OAuth 2.0 Flow Implementation

### Provider Configuration

```typescript
// config/oauth.ts
interface OAuthConfig {
	google: {
		clientId: string;
		clientSecret: string;
		redirectUri: string;
		scopes: string[];
	};
}

const oauthConfig: OAuthConfig = {
	google: {
		clientId: process.env.GOOGLE_CLIENT_ID!,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		redirectUri: `${process.env.PUBLIC_BASE_URL}/auth/callback/google`,
		scopes: ['openid', 'email', 'profile']
	}
};
```

### Authorization URL Generation

```typescript
// src/auth/oauth.ts
export class OAuthProvider {
	static generateAuthUrl(provider: 'google'): string {
		const config = oauthConfig[provider];
		const state = generateSecureState(); // CSRF protection

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			response_type: 'code',
			scope: config.scopes.join(' '),
			state,
			access_type: 'offline', // For refresh tokens
			prompt: 'consent'
		});

		// Store state in session for validation
		session.set('oauth_state', state);

		return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
	}
}
```

### Token Exchange

```typescript
// Handle OAuth callback
export async function handleOAuthCallback(code: string, state: string, provider: 'google'): Promise<AuthResult> {
	// 1. Validate state parameter (CSRF protection)
	const sessionState = session.get('oauth_state');
	if (!sessionState || sessionState !== state) {
		throw new Error('Invalid state parameter');
	}

	// 2. Exchange authorization code for tokens
	const tokenResponse = await exchangeCodeForTokens(code, provider);

	// 3. Get user information from provider
	const userInfo = await getUserInfo(tokenResponse.access_token, provider);

	// 4. Create or update user in database
	const user = await createOrUpdateOAuthUser(userInfo, provider);

	// 5. Generate application JWT tokens
	const tokens = await generateJWTTokens(user);

	return {
		user,
		tokens,
		isNewUser: user.createdAt === user.updatedAt
	};
}

async function exchangeCodeForTokens(code: string, provider: 'google') {
	const config = oauthConfig[provider];

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: config.redirectUri
		})
	});

	if (!response.ok) {
		throw new Error('Token exchange failed');
	}

	return await response.json();
}
```

### User Information Retrieval

```typescript
async function getUserInfo(accessToken: string, provider: 'google'): Promise<OAuthUserInfo> {
	const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		throw new Error('Failed to fetch user info');
	}

	const data = await response.json();

	return {
		providerId: data.id,
		email: data.email,
		name: data.name,
		avatar: data.picture,
		emailVerified: data.verified_email,
		provider: 'google'
	};
}
```

### User Account Management

```typescript
async function createOrUpdateOAuthUser(oauthUser: OAuthUserInfo, provider: string): Promise<User> {
	// Check if user exists by email
	let user = await db.users.findOne({ email: oauthUser.email });

	if (user) {
		// Update existing user with OAuth info
		user = await db.users.updateOne(
			{ _id: user._id },
			{
				$set: {
					[`oauth.${provider}`]: {
						providerId: oauthUser.providerId,
						lastLogin: new Date()
					},
					avatar: oauthUser.avatar || user.avatar,
					emailVerified: oauthUser.emailVerified || user.emailVerified,
					updatedAt: new Date()
				}
			}
		);
	} else {
		// Create new user
		user = await db.users.insertOne({
			email: oauthUser.email,
			username: generateUsernameFromEmail(oauthUser.email),
			name: oauthUser.name,
			avatar: oauthUser.avatar,
			emailVerified: oauthUser.emailVerified,
			oauth: {
				[provider]: {
					providerId: oauthUser.providerId,
					lastLogin: new Date()
				}
			},
			roles: ['user'], // Default role
			status: 'active',
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	return user;
}
```

## OAuth Route Handlers

### Authorization Route

```typescript
// src/routes/auth/oauth/[provider]/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const { provider } = params;

	if (!['google'].includes(provider)) {
		throw error(400, 'Unsupported OAuth provider');
	}

	try {
		const authUrl = OAuthProvider.generateAuthUrl(provider as 'google');
		throw redirect(302, authUrl);
	} catch (err) {
		throw error(500, 'Failed to initiate OAuth flow');
	}
};
```

### Callback Route

```typescript
// src/routes/auth/callback/[provider]/+server.ts
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const { provider } = params;
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	// Handle OAuth errors
	if (error) {
		throw redirect(302, `/auth/login?error=${error}`);
	}

	if (!code || !state) {
		throw redirect(302, '/auth/login?error=missing_parameters');
	}

	try {
		const result = await handleOAuthCallback(code, state, provider as 'google');

		// Set authentication cookies
		cookies.set('access_token', result.tokens.accessToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 15 * 60 // 15 minutes
		});

		cookies.set('refresh_token', result.tokens.refreshToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 7 * 24 * 60 * 60 // 7 days
		});

		// Redirect to dashboard or original destination
		const redirectTo = url.searchParams.get('redirect') || '/dashboard';
		throw redirect(302, redirectTo);
	} catch (err) {
		console.error('OAuth callback error:', err);
		throw redirect(302, '/auth/login?error=oauth_failed');
	}
};
```

## Security Considerations

### State Parameter Validation

```typescript
function generateSecureState(): string {
	return crypto.randomBytes(32).toString('hex');
}

function validateState(receivedState: string, sessionState: string): boolean {
	if (!receivedState || !sessionState) {
		return false;
	}

	// Use constant-time comparison to prevent timing attacks
	return crypto.timingSafeEqual(Buffer.from(receivedState), Buffer.from(sessionState));
}
```

### Token Security

```typescript
class OAuthTokenManager {
	static async storeOAuthTokens(userId: string, tokens: OAuthTokens) {
		// Encrypt refresh tokens before storing
		const encryptedRefreshToken = await encrypt(tokens.refresh_token);

		await db.oauthTokens.upsert({
			where: { userId },
			update: {
				accessToken: tokens.access_token,
				refreshToken: encryptedRefreshToken,
				expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
				updatedAt: new Date()
			},
			create: {
				userId,
				provider: 'google',
				accessToken: tokens.access_token,
				refreshToken: encryptedRefreshToken,
				expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
				createdAt: new Date()
			}
		});
	}

	static async refreshOAuthToken(userId: string): Promise<string> {
		const stored = await db.oauthTokens.findUnique({ where: { userId } });
		if (!stored) throw new Error('No OAuth tokens found');

		const refreshToken = await decrypt(stored.refreshToken);

		// Exchange refresh token for new access token
		const newTokens = await exchangeRefreshToken(refreshToken);

		// Update stored tokens
		await this.storeOAuthTokens(userId, newTokens);

		return newTokens.access_token;
	}
}
```

### Error Handling

```typescript
export class OAuthError extends Error {
	constructor(
		message: string,
		public code: string,
		public provider: string
	) {
		super(message);
		this.name = 'OAuthError';
	}
}

export function handleOAuthError(error: any, provider: string): never {
	if (error.error === 'access_denied') {
		throw new OAuthError('User denied access', 'USER_DENIED', provider);
	}

	if (error.error === 'invalid_grant') {
		throw new OAuthError('Invalid authorization code', 'INVALID_GRANT', provider);
	}

	throw new OAuthError('OAuth authentication failed', 'UNKNOWN_ERROR', provider);
}
```

## Configuration Management

### Environment Variables

```bash
# .env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
PUBLIC_BASE_URL=http://localhost:5173

# OAuth Security
OAUTH_STATE_SECRET=your_state_secret
OAUTH_ENCRYPTION_KEY=your_encryption_key
```

### CLI Installer Integration

The CLI installer handles OAuth setup:

```typescript
async function setupOAuth(config: SetupConfig) {
	if (config.enableOAuth) {
		console.log('Setting up OAuth configuration...');

		// Prompt for OAuth credentials
		const googleClientId = await promptSecure('Google Client ID:');
		const googleClientSecret = await promptSecure('Google Client Secret:');

		// Validate credentials
		await validateOAuthCredentials('google', googleClientId, googleClientSecret);

		// Save to environment
		await updateEnvFile({
			GOOGLE_CLIENT_ID: googleClientId,
			GOOGLE_CLIENT_SECRET: googleClientSecret
		});

		console.log('✅ OAuth configuration complete');
	}
}
```

## Testing OAuth Flow

### Unit Tests

```typescript
describe('OAuth Integration', () => {
	test('should generate valid authorization URL', () => {
		const authUrl = OAuthProvider.generateAuthUrl('google');

		expect(authUrl).toContain('accounts.google.com');
		expect(authUrl).toContain('client_id=');
		expect(authUrl).toContain('state=');
	});

	test('should handle OAuth callback successfully', async () => {
		const mockCode = 'test_auth_code';
		const mockState = 'test_state';

		// Mock external API calls
		mockTokenExchange();
		mockUserInfoFetch();

		const result = await handleOAuthCallback(mockCode, mockState, 'google');

		expect(result.user).toBeDefined();
		expect(result.tokens).toBeDefined();
	});
});
```

### Integration Tests

```typescript
describe('OAuth Flow Integration', () => {
	test('complete OAuth flow', async () => {
		// Start OAuth flow
		const response1 = await request(app).get('/auth/oauth/google').expect(302);

		// Extract state from redirect URL
		const authUrl = response1.headers.location;
		const state = extractStateFromUrl(authUrl);

		// Simulate callback
		const response2 = await request(app).get(`/auth/callback/google?code=test_code&state=${state}`).expect(302);

		expect(response2.headers.location).toBe('/dashboard');
	});
});
```

## Best Practices

1. **State Validation**: Always validate state parameter for CSRF protection
2. **Token Security**: Encrypt stored refresh tokens
3. **Error Handling**: Provide user-friendly error messages
4. **Token Rotation**: Implement automatic token refresh
5. **Scope Limitation**: Request minimal necessary scopes
6. **Audit Logging**: Log all OAuth authentication events
7. **Provider Validation**: Validate OAuth provider responses
