export interface Schema {
	id(id: any): unknown;
	name: string;
	icon?: string;
	slug?: string;
	fields: Array<any>;
	strict?: boolean;
	status: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
}
