export interface EntryListProps {
	entries?: any[];
	pagination?: {
		currentPage: number;
		pageSize: number;
		totalItems: number;
		pagesCount: number;
	};
	contentLanguage?: string;
}

export interface FieldsProps {
	fields: any[];
	revisions?: any[];
}

import type { FieldInstance } from '@src/content/types';

export interface WidgetLoaderProps {
	loader: () => Promise<{ default: any }>;
	field: FieldInstance;
	WidgetData?: Record<string, any>;
	value?: any;
	tenantId?: string;
}

export interface EntryListMultiButtonProps {
	isCollectionEmpty?: boolean;
	hasSelections?: boolean;
	selectedCount?: number;
	showDeleted?: boolean;
	create: () => void;
	publish: () => void;
	unpublish: () => void;
	schedule: (date: string, action: string) => void;
	clone: () => void;
	delete: (permanent: boolean) => void;
	test: () => void;
}
