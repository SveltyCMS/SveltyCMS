# Hooks Library

Global security and language handling hooks for SveltyCMS applications.

## Purpose

Centralized hooks for:
- Security (authentication, authorization, CSRF)
- Language detection and handling
- Request/response middleware
- Rate limiting
- Session management

## Structure

```
shared/hooks/
├── src/
│   ├── index.ts              # Main exports
│   ├── security/             # Security hooks
│   │   ├── auth.ts           # Authentication
│   │   ├── csrf.ts           # CSRF protection
│   │   ├── rateLimit.ts      # Rate limiting
│   │   └── headers.ts        # Security headers
│   ├── language/             # Language hooks
│   │   ├── detect.ts         # Language detection
│   │   ├── negotiate.ts      # Content negotiation
│   │   └── redirect.ts       # Language redirects
│   └── common/               # Common hooks
│       ├── logging.ts        # Request logging
│       └── error.ts          # Error handling
├── project.json
├── tsconfig.json
└── README.md
```

## Security Hooks

### Authentication Hook

```typescript
// src/security/auth.ts
import { type Handle } from '@sveltejs/kit';

export const authHandle: Handle = async ({ event, resolve }) => {
  // Verify session token
  const token = event.cookies.get('session');
  
  if (token) {
    event.locals.user = await verifyToken(token);
  }
  
  return resolve(event);
};
```

Usage in `hooks.server.ts`:

```typescript
import { authHandle } from '@shared/hooks';

export const handle = authHandle;
```

### CSRF Protection

```typescript
// src/security/csrf.ts
import { type Handle } from '@sveltejs/kit';

export const csrfHandle: Handle = async ({ event, resolve }) => {
  // Skip CSRF check for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
    return resolve(event);
  }
  
  // Verify CSRF token
  const token = event.request.headers.get('x-csrf-token');
  const sessionToken = event.cookies.get('csrf-token');
  
  if (token !== sessionToken) {
    return new Response('CSRF token mismatch', { status: 403 });
  }
  
  return resolve(event);
};
```

### Rate Limiting

```typescript
// src/security/rateLimit.ts
import { type Handle } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter';

const limiter = new RateLimiter({
  // IP + User Agent rate limiting
  IP: [10, 'h'],        // 10 requests per hour per IP
  IPUA: [5, 'm']        // 5 requests per minute per IP+UA
});

export const rateLimitHandle: Handle = async ({ event, resolve }) => {
  const status = await limiter.check(event);
  
  if (status.limited) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'Retry-After': String(status.retryAfter)
      }
    });
  }
  
  return resolve(event);
};
```

### Security Headers

```typescript
// src/security/headers.ts
import { type Handle } from '@sveltejs/kit';

export const securityHeadersHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  
  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  
  return response;
};
```

## Language Hooks

### Language Detection

```typescript
// src/language/detect.ts
import { type Handle } from '@sveltejs/kit';

export const languageDetectHandle: Handle = async ({ event, resolve }) => {
  // Priority: URL param > Cookie > Accept-Language header
  const urlLang = event.url.searchParams.get('lang');
  const cookieLang = event.cookies.get('language');
  const headerLang = event.request.headers.get('accept-language');
  
  const detectedLang = urlLang || cookieLang || parseAcceptLanguage(headerLang) || 'en';
  
  // Store in locals
  event.locals.language = detectedLang;
  
  // Set cookie if changed
  if (detectedLang !== cookieLang) {
    event.cookies.set('language', detectedLang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365 // 1 year
    });
  }
  
  return resolve(event);
};

function parseAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  
  // Parse Accept-Language header
  const languages = header.split(',').map(lang => {
    const [code, q = '1'] = lang.trim().split(';q=');
    return { code: code.split('-')[0], quality: parseFloat(q) };
  });
  
  // Sort by quality
  languages.sort((a, b) => b.quality - a.quality);
  
  return languages[0]?.code || null;
}
```

### Language Redirect

```typescript
// src/language/redirect.ts
import { type Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const languageRedirectHandle: Handle = async ({ event, resolve }) => {
  const url = event.url;
  const pathname = url.pathname;
  
  // Check if path already has language prefix
  const hasLangPrefix = /^\/(en|de|fr|es)\//.test(pathname);
  
  if (!hasLangPrefix && pathname !== '/') {
    const lang = event.locals.language || 'en';
    throw redirect(302, `/${lang}${pathname}`);
  }
  
  return resolve(event);
};
```

## Composing Hooks

Combine multiple hooks using `sequence`:

```typescript
// apps/cms/src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import {
  authHandle,
  csrfHandle,
  rateLimitHandle,
  securityHeadersHandle,
  languageDetectHandle
} from '@shared/hooks';

export const handle = sequence(
  securityHeadersHandle,
  rateLimitHandle,
  csrfHandle,
  authHandle,
  languageDetectHandle
);
```

## Common Hooks

### Request Logging

```typescript
// src/common/logging.ts
import { type Handle } from '@sveltejs/kit';

export const loggingHandle: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  
  const response = await resolve(event);
  
  const duration = Date.now() - start;
  
  console.log({
    method: event.request.method,
    url: event.url.pathname,
    status: response.status,
    duration: `${duration}ms`,
    userAgent: event.request.headers.get('user-agent')
  });
  
  return response;
};
```

### Error Handling

```typescript
// src/common/error.ts
import { type Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

export const errorHandle: Handle = async ({ event, resolve }) => {
  try {
    return await resolve(event);
  } catch (err) {
    console.error('Request error:', err);
    
    // Log to error tracking service
    await logError(err, {
      url: event.url.pathname,
      user: event.locals.user
    });
    
    throw error(500, 'Internal server error');
  }
};
```

## Type Safety

Extend SvelteKit types for locals:

```typescript
// src/app.d.ts
declare namespace App {
  interface Locals {
    user?: {
      id: string;
      email: string;
      role: string;
    };
    language: string;
  }
}
```

## Testing

```bash
nx test hooks
```

Test hooks with mock events:

```typescript
import { authHandle } from '@shared/hooks';

test('authHandle sets user when valid token', async () => {
  const event = createMockEvent({
    cookies: { session: 'valid-token' }
  });
  
  await authHandle({ event, resolve: (e) => e });
  
  expect(event.locals.user).toBeDefined();
});
```

## Performance

- Hooks run on every request - keep them fast
- Use caching where appropriate
- Avoid database queries in hooks when possible
- Use middleware pattern for expensive operations

## Security Best Practices

1. **Always validate input** - Don't trust client data
2. **Use HTTPS** - Secure cookies require it
3. **Set secure cookie flags** - HttpOnly, Secure, SameSite
4. **Rate limit** - Prevent abuse
5. **Log security events** - Monitor for attacks
6. **Keep dependencies updated** - Security patches

## Best Practices

1. **Order matters** - Sequence hooks correctly
2. **Keep hooks focused** - Single responsibility
3. **Test thoroughly** - Security is critical
4. **Document behavior** - Clear comments
5. **Handle errors** - Don't let hooks crash
6. **Monitor performance** - Track hook execution time
