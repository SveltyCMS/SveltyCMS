export interface Schema {
	name: string;
	icon?: string;
	slug?: string;
	fields: Array<any>;
	strict?: boolean;
	status: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
}
