import type widgets from '@components/widgets';

// Define Available Roles with Icons
export const roles = {
	admin: 'admin',
	developer: 'developer',
	editor: 'editor',
	user: 'user'
} as const;

// Define a user Role permission that can be overwritten
export type permissions = {
	[K in keyof typeof roles]?: Partial<{
		create?: boolean; // This permission allows users to create new content.
		read?: boolean; // This permission allows users to view the content. They can't make any changes to it.
		write?: boolean; // This permission allows users to create new content and make changes to existing content.
		delete?: boolean; // This permission allows users to remove content from the system

		// Icons permission
		icon?: {
			create?: 'bi:plus-circle-fill';
			read?: 'bi:eye-fill';
			write?: 'bi:pencil-fill';
			delete?: 'bi:trash-fill';
		};

		// Colors permission
		color?: {
			create?: 'primary';
			read?: 'tertiary';
			write?: 'warning';
			delete?: 'error';
		};
		// Admin can do everything
	}> &
		(K extends typeof roles.admin
			? {
					create: true;
					read: true;
					write: true;
					delete: true;
				}
			: {});
};

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	name?: string;
	slug?: string;
	icon?: string;
	description?: string;
	status?: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
	permissions?: permissions;
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[];
	strict?: boolean;
	revision?: boolean;
}
