/**
 * @file apps/cms/src/content/types.ts
 * @description Defines the application-level TypeScript interfaces for content modeling and runtime data.
 */

import type { WidgetRegistry as widgets } from '@shared/stores/widgetStore.svelte';

// Shared types
export * from '@cms/types';

// Widget field type definition
export type WidgetKeys = keyof widgets;
export type WidgetTypes = widgets[WidgetKeys];

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
	contentLanguage?: string;
}

export interface WidgetLoaderProps {
	loader: () => Promise<{ default: any }>;
	field: any; // Use any for now to avoid circular dependency with FieldInstance if needed
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

export interface MinimalContentNode {
	name: string;
	path: string;
	nodeType: 'category';
}

export interface Category {
	id: number;
	name: string;
	icon: string;
	order: number;
	collections: string[];
	subcategories?: Category[];
}

export type ContentNodeOperatianType = 'create' | 'delete' | 'move' | 'rename' | 'update';

export type ContentNodeOperation = {
	type: ContentNodeOperatianType;
	node: any; // Use any to avoid circularity with ContentNode if needed
};

export interface SystemPreferences {
	preferences: any[]; // Use any or import DashboardWidgetConfig
	loading: boolean;
	error: string | null;
}

export interface DropIndicator {
	show: boolean;
	position: number;
	targetIndex?: number;
}

export interface WidgetComponent {
	component: unknown;
	props: Record<string, unknown>;
}

export interface WidgetMeta {
	id: string;
	label: string;
	icon: string;
	component: string;
	defaultSize: any; // Use any or import WidgetSize
	name?: string;
	description?: string;
	settings?: Record<string, unknown>;
}

// --- Import/Export Types ---

export interface ExportMetadata {
	exported_at: string;
	cms_version: string;
	environment: string;
	exported_by: string;
	export_id: string;
}

export interface ExportOptions {
	includeSettings: boolean;
	includeCollections: boolean;
	includeSensitive: boolean;
	format: 'json' | 'zip';
	groups?: string[];
	collections?: string[];
	sensitivePassword?: string;
}

export interface ImportOptions {
	strategy: 'skip' | 'overwrite' | 'merge';
	dryRun: boolean;
	validateOnly: boolean;
	sensitivePassword?: string;
}

export interface ExportData {
	metadata: ExportMetadata;
	settings?: Record<string, unknown>;
	collections?: CollectionExport[];
	encryptedSensitive?: string;
	hasSensitiveData?: boolean;
}

export interface CollectionExport {
	id: string;
	name: string;
	label: string;
	description?: string;
	schema: unknown;
	fields: unknown[];
	permissions?: string[];
	settings?: Record<string, unknown>;
	documents?: Record<string, unknown>[];
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface ValidationError {
	path: string;
	message: string;
	code: string;
}

export interface ValidationWarning {
	path: string;
	message: string;
	code: string;
}

export interface Conflict {
	type: 'setting' | 'collection';
	key: string;
	current: unknown;
	import: unknown;
	recommendation: 'skip' | 'overwrite' | 'merge';
}

export interface ImportResult {
	success: boolean;
	imported: number;
	skipped: number;
	merged: number;
	errors: ImportError[];
	conflicts: Conflict[];
}

export interface ImportError {
	key: string;
	message: string;
	code: string;
}

export const SENSITIVE_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'CLIENT_SECRET', 'PRIVATE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY'];

export type SortOrder = 0 | 1 | -1;

export interface TableHeader {
	label: string;
	name: string;
	id: string;
	visible: boolean;
	width?: number;
	sortable?: boolean;
}

export interface PaginationSettings {
	collectionId: string | null;
	density: 'compact' | 'normal' | 'comfortable';
	sorting: {
		sortedBy: string;
		isSorted: SortOrder;
	};
	currentPage: number;
	rowsPerPage: number;
	filters: Record<string, string>;
	displayTableHeaders: TableHeader[];
	pagesCount?: number;
	totalItems?: number;
}

export interface TablePaginationProps {
	currentPage: number;
	pagesCount?: number;
	rowsPerPage: number;
	rowsPerPageOptions?: number[];
	totalItems?: number;
	onUpdatePage?: (page: number) => void;
	onUpdateRowsPerPage?: (rows: number) => void;
}

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = 'Names' | 'Posts' | 'Relation' | 'WidgetTest' | 'Menu';
/* AUTOGEN_END: ContentTypes */
