/**
 * @file src/widgets/custom/phonenumber/types.ts
 * @description Type definitions for the PhoneNumber widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for a phone number input.
 * - **Custom Validation**: Includes a `pattern` property for flexible regex validation.
 */

/**
 * Defines the properties unique to the PhoneNumber widget, configured in the collection builder.
 */
export interface PhoneNumberProps {
	// Placeholder text for the input field
	placeholder?: string;
	/**
	 * A custom regex string to validate the phone number format.
	 * If not provided, a default international format is used.
	 */
	pattern?: string;
}
