import type widgets from '@components/widgets';

// Auth
import type { Permissions } from '@src/auth/types';

// Define a new `Schema` interface that represents the shape of an object with several properties
export interface Schema {
	name?: string;
	slug?: string;
	icon?: string;
	description?: string;
	status?: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
	permissions?: Permissions;
	fields: ReturnType<(typeof widgets)[keyof typeof widgets]>[];
	strict?: boolean;
	revision?: boolean;
}
export type CollectionContent = 'ImageArray' | 'Media' | 'Menu' | 'Names' | 'Posts' | 'Posts2' | 'Products' | 'Relation' | 'WidgetTest';
export type CollectionNames = 'ImageArray'|'Media'|'Menu'|'Names'|'Posts'|'Posts2'|'Products'|'Relation'|'WidgetTest';