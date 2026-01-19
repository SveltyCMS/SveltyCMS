/**
 * @file config/collections/Collections/Tasks.ts
 * @description Collection for managing client tasks with approval workflow and pricing
 */

import type { Schema } from '@cms/content/types';
import { widgets } from '@cms/widgets/proxy';

export const schema: Schema = {
	icon: 'mdi:clipboard-check',
	status: 'publish',
	slug: 'tasks',
	description: 'Task management with client approval workflow and cost tracking',
	revision: true,

	fields: [
		widgets.Input({
			label: 'Task Title',
			db_fieldName: 'taskTitle',
			required: true,
			translated: false,
			icon: 'mdi:text-box',
			placeholder: 'Enter task title',
			helper: 'Brief title describing the task or feature'
		}),

		widgets.Relation({
			label: 'Client',
			db_fieldName: 'clientId',
			required: true,
			collection: 'Clients',
			displayField: 'clientName',
			icon: 'mdi:account',
			helper: 'Select the client requesting this task'
		}),

		widgets.RichText({
			label: 'Description',
			db_fieldName: 'description',
			required: true,
			translated: false,
			icon: 'mdi:text',
			helper: 'Detailed description of the task, feature request, or support ticket'
		}),

		widgets.Number({
			label: 'Estimated Hours',
			db_fieldName: 'estimatedHours',
			required: true,
			min: 0,
			step: 0.5,
			icon: 'mdi:clock-outline',
			placeholder: '8.0',
			helper: 'Estimated time to complete this task in hours'
		}),

		widgets.Currency({
			label: 'Estimated Cost',
			db_fieldName: 'estimatedCost',
			required: true,
			currencyCode: 'USD',
			minValue: 0,
			icon: 'mdi:currency-usd',
			placeholder: '1200.00',
			helper: 'Calculated cost based on estimated hours × client hourly rate'
		}),

		widgets.Radio({
			label: 'Approval Status',
			db_fieldName: 'approvalStatus',
			required: true,
			icon: 'mdi:check-circle',
			legend: 'Current approval status',
			options: [
				{ label: 'Pending Approval', value: 'pending' },
				{ label: 'Approved', value: 'approved' },
				{ label: 'Rejected', value: 'rejected' },
				{ label: 'Changes Requested', value: 'changes_requested' }
			],
			helper: 'Client approval status for this task'
		}),

		widgets.Radio({
			label: 'Work Status',
			db_fieldName: 'workStatus',
			required: true,
			icon: 'mdi:progress-check',
			legend: 'Current work status',
			options: [
				{ label: 'Not Started', value: 'not_started' },
				{ label: 'In Progress', value: 'in_progress' },
				{ label: 'Completed', value: 'completed' },
				{ label: 'On Hold', value: 'on_hold' }
			],
			helper: 'Development work status'
		}),

		widgets.Number({
			label: 'Actual Hours',
			db_fieldName: 'actualHours',
			required: false,
			min: 0,
			step: 0.5,
			icon: 'mdi:clock-check',
			placeholder: '7.5',
			helper: 'Actual time spent on this task (for billing)'
		}),

		widgets.Date({
			label: 'Approval Date',
			db_fieldName: 'approvalDate',
			required: false,
			icon: 'mdi:calendar-check',
			helper: 'Date when client approved this task'
		}),

		widgets.Date({
			label: 'Completion Date',
			db_fieldName: 'completionDate',
			required: false,
			icon: 'mdi:calendar-check',
			helper: 'Date when task was completed'
		}),

		widgets.RichText({
			label: 'Client Feedback',
			db_fieldName: 'clientFeedback',
			required: false,
			translated: false,
			icon: 'mdi:message-text',
			helper: 'Feedback or comments from the client about this task'
		}),

		widgets.RichText({
			label: 'Internal Notes',
			db_fieldName: 'internalNotes',
			required: false,
			translated: false,
			icon: 'mdi:note',
			helper: 'Internal notes for developers (not visible to client)'
		})
	]
};
