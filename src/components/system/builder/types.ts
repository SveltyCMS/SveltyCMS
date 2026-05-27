/**
 * @file src\components\system\builder\types.ts
 * @description Types for the widget builder
 */

import type { FieldInstance } from '@content/types';

export interface WidgetFieldsProps {
	fields?: FieldInstance[];
	onFieldsUpdate?: (fields: FieldInstance[]) => void;
}

export interface WidgetBuilderProps {
	addField?: boolean;
	fields?: FieldInstance[];
	onFieldsChange?: (fields: FieldInstance[]) => void;
}

export interface AddWidgetProps {
	addField?: boolean;
	editField?: boolean;
	field?: {
		label: string;
		widget: { key: string | null; GuiFields: Record<string, unknown> };
	};
	fields?: FieldInstance[];
	selected_widget?: string | null;
}
