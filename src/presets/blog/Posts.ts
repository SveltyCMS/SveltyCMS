/**
 * @file src/presets/blog/Posts.ts
 * @description Blog posts and articles schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Posts: Schema = {
	name: 'Posts',
	slug: 'posts',
	icon: 'mdi:post',
	description: 'Blog posts and articles',
	fields: [
		widgets.Input({
			label: 'Title',
			db_fieldName: 'title',
			required: true,
			translated: true,
			width: 8
		}),
		widgets.Input({
			label: 'Slug',
			db_fieldName: 'slug',
			required: true,
			width: 4
		}),
		widgets.Relation({
			label: 'Author',
			db_fieldName: 'author',
			relation: 'Authors',
			display: ({ data }: { data: any }) => `${data?.name}`,
			width: 6
		}),
		widgets.Relation({
			label: 'Categories',
			db_fieldName: 'categories',
			relation: 'Categories',
			display: ({ data }: { data: any }) => data?.name,
			width: 6
		}),
		widgets.Input({
			label: 'Published Date',
			db_fieldName: 'publishedDate',
			type: 'date',
			width: 6
		}),
		widgets.RichText({
			label: 'Content',
			db_fieldName: 'content',
			translated: true,
			width: 12
		}),
		widgets.Seo({
			label: 'SEO',
			db_fieldName: 'seo',
			width: 12
		})
	]
};

export default Posts;
