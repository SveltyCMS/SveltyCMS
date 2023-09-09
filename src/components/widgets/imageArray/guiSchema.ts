export const GuiSchema = {
	label: { type: String, required: true },
	display: { type: String, required: true },
	db_fieldName: { type: String, required: true },
	// widget?: any;
	// schema?: any;
	// translated: { type: Boolean, required: false },
	icon: { type: String, required: false },

	// Widget Specific parameters
	imageUploadTitle: { type: String, required: false },
	// fields: Widgets;
	required: { type: Boolean, required: false }
};
