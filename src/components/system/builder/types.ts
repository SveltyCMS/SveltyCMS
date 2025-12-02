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
	fields?: FieldInstance[];
	addField?: boolean;
	editField?: boolean;
	selected_widget?: string | null;
	field?: {
		label: string;
		widget: { key: string | null; GuiFields: Record<string, any> };
	};
}
