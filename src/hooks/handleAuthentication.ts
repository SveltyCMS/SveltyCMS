ts

import type { Handle } from '@sveltejs/kit';
import { auth, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';

export const handleAuthentication: Handle = async ({ event, resolve }) => {

  // ✅ ONLY integration tests bypass auth
  if (event.request.headers.get('x-integration-test') === 'true') {
    return resolve(event);
  }

  const { cookies, locals } = event;

  locals.dbAdapter = dbAdapter;
  if (!auth || !dbAdapter) return resolve(event);

  const sessionId = cookies.get(SESSION_COOKIE_NAME);
  if (!sessionId) return resolve(event);

  const user = await auth.validateSession(sessionId);
  if (user) {
    locals.user = user;
    locals.permissions = user.permissions ?? [];
  } else {
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  }

  return resolve(event);
};
