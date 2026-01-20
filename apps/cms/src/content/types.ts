/**
 * @file apps/cms/src/content/types.ts
 * @description Defines the application-level TypeScript interfaces for content modeling and runtime data.
 */

import type { WidgetRegistry as widgets } from '@cms/stores/widgetStore.svelte';

// Shared types
export {
	type FieldValue,
	StatusTypes,
	type StatusType,
	type DatabaseId,
	type ISODateString,
	type BaseEntity,
	type Translation,
	type ContentNode,
	type Schema,
	type ContentNodeOperation,
	type ConfigEntity,
	type ConfigSyncStatus,
	type NavigationNode,
	type IContentManager,
	type MinimalContentNode,
	type FieldInstance,
	type FieldDefinition,
	type WidgetSize,
	type DashboardWidgetConfig,
	type DropIndicator,
	type Layout,
	type SystemPreferencesDocument,
	type RevisionData,
	type CollectionEntry,
	type SortOrder,
	type PaginationSettings,
	type TableHeader,
	type EntryListProps,
	type TablePaginationProps,
	type WidgetComponent,
	type WidgetMeta,
	type GuiFieldConfig,
	type WidgetType,
	type WidgetMetadata,
	type WidgetDefinition,
	type WidgetFactory,
	type FieldConfig,
	type Widget,
	type WidgetFunction,
	type WidgetModule,
	type WidgetParam,
	type WidgetPlaceholder,
	type WidgetRegistryEntry,
	type ExportMetadata,
	type ExportOptions,
	type CollectionExport,
	type ExportData,
	type ImportOptions,
	type ValidationError,
	type ValidationWarning,
	type ValidationResult,
	type Conflict,
	type ImportResult
} from '@cms/types';

// Widget field type definition
export type WidgetKeys = keyof widgets;
export type WidgetTypes = widgets[WidgetKeys];

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

export interface Category {
	id: number;
	name: string;
	icon: string;
	order: number;
	collections: string[];
	subcategories?: Category[];
}

export type ContentNodeOperatianType = 'create' | 'delete' | 'move' | 'rename' | 'update';

export interface SystemPreferences {
	preferences: any[]; // Use any or import DashboardWidgetConfig
	loading: boolean;
	error: string | null;
}

// --- Import/Export Types ---

export interface ImportError {
	key: string;
	message: string;
	code: string;
}

export const SENSITIVE_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'CLIENT_SECRET', 'PRIVATE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY'];

/* AUTOGEN_START: ContentTypes */
export type ContentTypes = 'Names' | 'Posts' | 'Relation' | 'WidgetTest' | 'Menu';
/* AUTOGEN_END: ContentTypes */
