import { redirect } from '@sveltejs/kit';
import { auth } from '../db';
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

//import rateLimit from 'express-rate-limit';
//import depthLimit from 'graphql-depth-limit';

import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';

import { schema } from '@src/routes/api/graphql/generateSchema';
import { resolvers } from '@src/routes/api/graphql/resolver';

//TODO: still accessible ... not working
async function authenticate(req, res, next) {
	// Secure this page with session cookie
	const session = req.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		res.redirect(302, `/login`);
	} else {
		next();
	}
}

const yogaApp = createYoga<RequestEvent>({
	// Import schema and resolvers
	schema: createSchema({
		typeDefs: schema,
		resolvers: resolvers
	}),
	// Define the GraphQL endpoint
	graphqlEndpoint: '/api/graphql',
	// Use SvelteKit's Response object
	fetchAPI: globalThis,
	// Add middleware for authentication, rate limiting, and query depth limiting
	plugins: [
		authenticate // Authenticate the user
		//rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), // Limit requests to 100 per 15 minutes
		//depthLimit(10) // Limit query depth to 10
	]
});

export { yogaApp as GET, yogaApp as POST };
