import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  // TODO: Replace with real setup completion check
  return new Response(JSON.stringify({ isComplete: false }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
