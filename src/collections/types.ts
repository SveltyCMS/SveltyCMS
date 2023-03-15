export interface Schema {
	name: string;
	icon?: string;
	id: string;
	fields: Array<any>;
	strict?: boolean;
	status: 'published' | 'unpublished' | 'draft';
}
