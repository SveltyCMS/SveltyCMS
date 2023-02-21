export interface Schema {
	name: string;
	icon?: string;
	fields: Array<any>;
	strict?: boolean;
	status: 'published' | 'unpublished' | 'draft';
}
