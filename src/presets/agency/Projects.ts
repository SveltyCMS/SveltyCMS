/**
 * @file src/presets/agency/projects.ts
 * @description Agency portfolio projects schema.
 * @author SveltyCMS
 */

import type { Schema } from '@src/content/types';
import { widgets } from '@src/widgets/proxy';

const Projects: Schema = {
	name: 'Projects',
	slug: 'projects',
	icon: 'mdi:view-grid-plus',
	description: 'Agency portfolio projects',
	fields: [
		widgets.Input({
			label: 'Project Title',
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
			label: 'Client',
			db_fieldName: 'client',
			relation: 'Clients',
			display: ({ data }: { data: any }) => data?.name,
			width: 6
		}),
		widgets.Relation({
			label: 'Services Provided',
			db_fieldName: 'services',
			relation: 'Services',
			display: ({ data }: { data: any }) => data?.title,
			width: 6
		}),
		widgets.Input({
			label: 'Website URL',
			db_fieldName: 'url',
			width: 12
		}),
		widgets.RichText({
			label: 'Description',
			db_fieldName: 'description',
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

export default Projects;
