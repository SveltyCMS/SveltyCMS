export const resolvers = {
	Query: {
		// Test hello
		hello: () => 'SvelteKit - GraphQL Yoga works on SimpleCMS'
	}
};
// import collections from '@src/collections';

// export const resolvers = {
// 	Query: {
// 		// Test hello
// 		hello: () => 'SvelteKit - GraphQL Yoga works on SimpleCMS',

// 		//Dynamic Collection
// 		...collections.reduce((acc, collection) => {
// 			acc[collection.name] = async (parent: any, args: any, context: any) => {
// 				// Check if the user is authorized to access the data
// 				if (!context.user || !context.user.isAuthorized) {
// 					throw new Error('Unauthorized');
// 				}

// 				// Fetch the data from the MongoDB database
// 				const data = await context.db.collection(collection.name).find().toArray();

// 				// Return the data
// 				return data;
// 			};
// 			return acc;
// 		}, {})
// 	}
// };
