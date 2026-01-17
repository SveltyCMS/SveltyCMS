/**
 * GraphQL Client for SveltyCMS
 */

import { GRAPHQL_URL, API_TOKEN } from '../config';

export interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string }>;
}

/**
 * Execute a GraphQL query
 */
export async function query<T>(
	queryString: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
	};

	const response = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			query: queryString,
			variables
		})
	});

	const result: GraphQLResponse<T> = await response.json();

	if (result.errors) {
		throw new Error(result.errors.map((e) => e.message).join(', '));
	}

	if (!result.data) {
		throw new Error('No data returned from GraphQL query');
	}

	return result.data;
}

/**
 * Example query: Fetch posts
 */
export async function getPosts(limit = 10) {
	return query<{ posts: Array<unknown> }>(`
		query GetPosts($limit: Int) {
			posts(limit: $limit) {
				id
				title
				slug
				content
			}
		}
	`, { limit });
}
