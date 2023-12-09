import type widgets from '@src/components/widgets';

// Define Available Roles with Icons
export const roles = {
	admin: 'admin',
	developer: 'developer',
	editor: 'editor',
	user: 'user'
} as const;

// Define a user Role permission that can be overwritten
export type permissions = {
	[K in (typeof roles)[keyof typeof roles]]: {
		// User Permissions
		read?: boolean; // This permission allows users to view the content. They can’t make any changes to it.
		write?: boolean; // This permission allows users to create new content and make changes to existing content.
		delete?: boolean; //This permission allows users to remove content from the system
		// Admin can do everything
	} & (K extends typeof roles.admin ? { read?: true; write?: true; delete?: true } : {});
};

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	permissions?: permissions;
	name?: string;
	icon?: string;
	slug?: string;
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[];
	strict?: boolean;
	status?: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
}

// export const roles = {
// 	admin: { name: 'admin', icon: 'material-symbols:verified-outline' },
// 	developer: { name: 'developer', icon: 'material-symbols:supervised-user-circle' },
// 	editor: { name: 'editor', icon: 'mdi:user-edit' },
// 	user: { name: 'user', icon: 'material-symbols:supervised-user-circle' }
// } as const;

// Define a new `permissions` type using a mapped type
// The `admin` role has a default exception, with both `read` and `write`
// type permissions = {
// 	[K in (typeof roles)[keyof typeof roles]]?: {
// 		read?: boolean; // This permission allows users to view the content. They can’t make any changes to it.
// 		write?: boolean; // This permission allows users to create new content and make changes to existing content.
// 		delete?: boolean; //This permission allows users to remove content from the system
// 	};
// };
