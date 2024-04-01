import type widgets from '@components/widgets';

// Auth
import type { permissions } from '@src/auth/types';

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

export const sanitizePermissions = (permissions: any) => {
	const res = Object.keys(permissions).reduce((acc, r) => {
		acc[r] = Object.keys(permissions[r]).reduce((acc, p) => {
			if (permissions[r][p] == false) {
				acc[p] = false;
			}
			return acc;
		}, {});
		if (Object.keys(acc[r]).length == 0) delete acc[r];
		return acc;
	}, {});
	if (Object.keys(res).length == 0) return undefined;
	return res;
};

export type CollectionLabels = 'ImageArray' | 'Media' | 'Menu' | 'Names' | 'Post' | 'Posts2' | 'Products' | 'Relation' | 'WidgetTest';
