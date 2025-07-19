# Authentication System

This section explains **how SveltyCMS authentication works** - from JWT implementation to OAuth integration and session management.

## How Authentication Works

### 🔑 [JWT Implementation](./Token_Management.md)

**Token generation and validation**

- JWT structure and claims
- Token signing and verification
- Refresh token handling
- Token expiration management

### 🌐 [OAuth Integration](./OAuth_Implementation.md)

**Google OAuth flow**

- OAuth 2.0 implementation
- Provider configuration
- Callback handling
- User account linking

### 🔒 [Session Management](./Session_Management.md)

**Secure session handling**

- Session creation and storage
- Session validation
- Session cleanup
- Security considerations

### 🛡️ [Implementation Details](./Implementation.md)

**Technical implementation**

- Authentication middleware
- Route protection
- API authentication
- Error handling

## Authentication Flow

### Standard Login Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as Database

    C->>S: POST /auth/login {email, password}
    S->>DB: Validate credentials
    DB->>S: User data
    S->>S: Generate JWT tokens
    S->>C: {accessToken, refreshToken, user}
```

### OAuth Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant O as OAuth Provider
    participant DB as Database

    C->>S: GET /auth/oauth/google
    S->>O: Redirect to OAuth provider
    O->>C: Authorization code
    C->>S: GET /auth/callback?code=xxx
    S->>O: Exchange code for tokens
    O->>S: Access token + user info
    S->>DB: Create/update user
    S->>C: {accessToken, refreshToken, user}
```

## Key Concepts

- **JWT Tokens**: Stateless authentication with signed tokens
- **Refresh Tokens**: Long-lived tokens for access token renewal
- **OAuth Integration**: Third-party authentication support
- **Session Security**: Secure session management with HTTPOnly cookies
- **Role-based Access**: Integration with authorization system

## Security Features

- **Token Signing**: HMAC-SHA256 or RSA signatures
- **Token Rotation**: Automatic refresh token rotation
- **Rate Limiting**: Login attempt rate limiting
- **Session Timeout**: Configurable session expiration
- **CSRF Protection**: Cross-site request forgery prevention
