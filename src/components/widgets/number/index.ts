import type { Display } from "../types";
import type { Number_Field, Number_Params } from "./types";

let widget = ({
	// Accept parameters from collection
	db_fieldName,
	icon,
	placeholder,
	required,
	display,
}:Number_Params) => {
	if (!display) display = (data: any, field: any, entry: any) => data;

	let field = { schema: {}, db_fieldName, icon, placeholder, required, display } as Number_Field;

	field.schema[db_fieldName] = "string";

	field.widget = async () => {
		// @ts-ignore
		return (await import("./Number.svelte")).default;
	};
	return field;
};

export default widget