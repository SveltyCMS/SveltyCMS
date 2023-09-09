import { buildSchema } from 'graphql';

// Define the Query type with only the hello field
const query = `
  type Query {
    hello: String
  }
`;

// Build the GraphQL schema
export const schema = buildSchema(query);

// // src/routes/api/graphql/generateSchema.ts
// import { buildSchema } from 'graphql';
// import collections from '@src/collections';

// // Generate the GraphQL types and fields based on the collection schemas
// const types = collections.map((collection) => {
// 	const fields = collection.fields
// 		.map((field) => `${field.label}: ${field.schema.type}`)
// 		.join('\n');

// 	return `
//     type ${collection.name} {
//       id: ID!
//       ${fields}
//     }
//   `;
// });

// // Define the Query type with a field for each collection
// const query = `
//   type Query {
//     hello: String
//     ${collections.map((collection) => `${collection.name}s: [${collection.name}]`).join('\n')}
//   }
// `;

// // Build the GraphQL schema
// export const schema = buildSchema(`
//   ${types.join('\n')}
//   ${query}
// `);
