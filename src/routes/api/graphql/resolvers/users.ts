import type { DatabaseAdapter } from '@src/routes/api/databases/databaseAdapter';
import type { AuthDBAdapter } from '@src/auth/authDBAdapter';

function generateGraphQLTypeDefsFromSchema(schema: any, typeName: string) {
	const fields = Object.keys(schema)
		.map((key) => {
			let type;
			switch (typeof schema[key]) {
				case 'string':
					type = 'String';
					break;
				case 'boolean':
					type = 'Boolean';
					break;
				case 'object':
					type = schema[key] === Date ? 'String' : 'String';
					break;
				default:
					type = 'String';
			}
			return `${key}: ${type}`;
		})
		.join('\n');

	return `
        type ${typeName} {
            ${fields}
        }
    `;
}

export function userTypeDefs(authDBAdapter: AuthDBAdapter) {
	const userSchema = authDBAdapter.getUserSchema();
	return generateGraphQLTypeDefsFromSchema(userSchema, 'User');
}

export function userResolvers(dbAdapter: DatabaseAdapter) {
	return {
		Query: {
			users: async () => {
				return await dbAdapter.findMany('auth_users', {});
			}
		}
	};
}
