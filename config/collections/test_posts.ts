
import type { CollectionConfig } from '@src/types/CollectionConfig';
const config: CollectionConfig = {
	name: 'test_posts',
	slug: 'test_posts',
	fields: [
		{ name: 'title', label: 'Title', widget: 'text' },
		{ name: 'content', label: 'Content', widget: 'richtext' },
		{ name: 'status', label: 'Status', widget: 'text' }
	]
};
export default config;
