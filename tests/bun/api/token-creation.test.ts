import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mockEnvironment } from '../mocks/environment';
import { mockSvelteKitContext } from '../helpers/sveltekit-mocks';

// Mock the environment and SvelteKit context
mockEnvironment();

describe('User Token Creation API', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = mockSvelteKitContext();
  });

  afterEach(() => {
    // Clean up any test data
  });

  describe('API Token Generation', () => {
    test('should create API token for authenticated user', async () => {
      // Mock authenticated user
      mockContext.locals.user = {
        id: 'user123',
        email: 'test@example.com',
        role: 'editor'
      };

      const request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test API Token',
          permissions: ['read', 'write'],
          expiresIn: '30d'
        })
      });

      // Import and test the token creation endpoint
      const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
      const response = await POST({ request, locals: mockContext.locals });

      expect(response.status).toBe(201);
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.tokenId).toBeDefined();
      expect(result.token).toMatch(/^sveltycms_[a-zA-Z0-9]{32,}$/);
    });

    test('should reject token creation for unauthenticated user', async () => {
      const request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Token',
          permissions: ['read']
        })
      });

      const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
      const response = await POST({ request, locals: {} });

      expect(response.status).toBe(401);
      
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication');
    });

    test('should validate token creation parameters', async () => {
      mockContext.locals.user = { id: 'user123', role: 'admin' };

      // Test missing name
      let request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: ['read']
        })
      });

      const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
      let response = await POST({ request, locals: mockContext.locals });

      expect(response.status).toBe(400);
      
      let result = await response.json();
      expect(result.error).toContain('name');

      // Test invalid permissions
      request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Token',
          permissions: ['invalid_permission']
        })
      });

      response = await POST({ request, locals: mockContext.locals });
      expect(response.status).toBe(400);
      
      result = await response.json();
      expect(result.error).toContain('permission');
    });

    test('should respect user role permissions for token creation', async () => {
      // Test editor role creating token with admin permissions
      mockContext.locals.user = { id: 'user123', role: 'editor' };

      const request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin Token',
          permissions: ['admin', 'delete_users']
        })
      });

      const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
      const response = await POST({ request, locals: mockContext.locals });

      expect(response.status).toBe(403);
      
      const result = await response.json();
      expect(result.error).toContain('insufficient permissions');
    });
  });

  describe('Token Management', () => {
    test('should list user tokens', async () => {
      mockContext.locals.user = { id: 'user123', role: 'editor' };

      const request = new Request('http://localhost/api/tokens');
      
      const { GET } = await import('../../../src/routes/api/tokens/+server.ts');
      const response = await GET({ request, locals: mockContext.locals });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.tokens)).toBe(true);
    });

    test('should revoke specific token', async () => {
      mockContext.locals.user = { id: 'user123', role: 'editor' };

      const request = new Request('http://localhost/api/tokens/token123', {
        method: 'DELETE'
      });

      // Mock token deletion endpoint
      const { DELETE } = await import('../../../src/routes/api/tokens/[id]/+server.ts');
      const response = await DELETE({ 
        request, 
        locals: mockContext.locals,
        params: { id: 'token123' }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.message).toContain('revoked');
    });

    test('should update token permissions', async () => {
      mockContext.locals.user = { id: 'user123', role: 'admin' };

      const request = new Request('http://localhost/api/tokens/token123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: ['read', 'write'],
          name: 'Updated Token Name'
        })
      });

      const { PATCH } = await import('../../../src/routes/api/tokens/[id]/+server.ts');
      const response = await PATCH({ 
        request, 
        locals: mockContext.locals,
        params: { id: 'token123' }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.token.permissions).toEqual(['read', 'write']);
    });

    test('should prevent updating other users tokens', async () => {
      mockContext.locals.user = { id: 'user123', role: 'editor' };

      const request = new Request('http://localhost/api/tokens/other-user-token', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: ['read']
        })
      });

      const { PATCH } = await import('../../../src/routes/api/tokens/[id]/+server.ts');
      const response = await PATCH({ 
        request, 
        locals: mockContext.locals,
        params: { id: 'other-user-token' }
      });

      expect(response.status).toBe(403);
      
      const result = await response.json();
      expect(result.error).toContain('access denied');
    });
  });

  describe('Token Authentication', () => {
    test('should authenticate API requests with valid token', async () => {
      const request = new Request('http://localhost/api/collections', {
        headers: {
          'Authorization': 'Bearer sveltycms_validtoken123'
        }
      });

      // Mock token validation middleware
      const isValidToken = await import('../../../src/lib/auth/token-validation');
      const tokenData = await isValidToken.validateApiToken('sveltycms_validtoken123');

      expect(tokenData).toBeDefined();
      expect(tokenData.userId).toBeDefined();
      expect(tokenData.permissions).toBeDefined();
    });

    test('should reject requests with invalid token', async () => {
      const request = new Request('http://localhost/api/collections', {
        headers: {
          'Authorization': 'Bearer invalid_token'
        }
      });

      const isValidToken = await import('../../../src/lib/auth/token-validation');
      
      try {
        await isValidToken.validateApiToken('invalid_token');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('invalid token');
      }
    });

    test('should enforce token permissions', async () => {
      // Mock token with limited permissions
      const limitedToken = 'sveltycms_readonlytoken';
      
      const request = new Request('http://localhost/api/collections', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${limitedToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'New Collection' })
      });

      // This should be rejected due to insufficient permissions
      const { POST } = await import('../../../src/routes/api/collections/+server.ts');
      const response = await POST({ 
        request, 
        locals: { 
          apiToken: { permissions: ['read'] }
        }
      });

      expect(response.status).toBe(403);
      
      const result = await response.json();
      expect(result.error).toContain('insufficient permissions');
    });

    test('should handle expired tokens', async () => {
      const expiredToken = 'sveltycms_expiredtoken123';
      
      const isValidToken = await import('../../../src/lib/auth/token-validation');
      
      try {
        await isValidToken.validateApiToken(expiredToken);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('expired');
      }
    });
  });

  describe('Token Security', () => {
    test('should generate cryptographically secure tokens', async () => {
      mockContext.locals.user = { id: 'user123', role: 'admin' };

      const tokens = [];
      
      // Generate multiple tokens to test uniqueness
      for (let i = 0; i < 10; i++) {
        const request = new Request('http://localhost/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Test Token ${i}`,
            permissions: ['read']
          })
        });

        const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
        const response = await POST({ request, locals: mockContext.locals });
        const result = await response.json();
        
        tokens.push(result.token);
      }

      // Verify all tokens are unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);

      // Verify token format and length
      tokens.forEach(token => {
        expect(token).toMatch(/^sveltycms_[a-zA-Z0-9]+$/);
        expect(token.length).toBeGreaterThan(20);
      });
    });

    test('should hash tokens before storing', async () => {
      mockContext.locals.user = { id: 'user123', role: 'admin' };

      const request = new Request('http://localhost/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Security Test Token',
          permissions: ['read']
        })
      });

      const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
      const response = await POST({ request, locals: mockContext.locals });
      const result = await response.json();

      // The returned token should be different from what's stored in DB
      // This test would need to verify the database storage
      expect(result.token).toBeDefined();
      expect(result.tokenId).toBeDefined();
    });

    test('should enforce rate limiting for token creation', async () => {
      mockContext.locals.user = { id: 'user123', role: 'admin' };

      // Attempt to create many tokens rapidly
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const request = new Request('http://localhost/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Rate Limit Test ${i}`,
            permissions: ['read']
          })
        });

        const { POST } = await import('../../../src/routes/api/tokens/+server.ts');
        promises.push(POST({ request, locals: mockContext.locals }));
      }

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});