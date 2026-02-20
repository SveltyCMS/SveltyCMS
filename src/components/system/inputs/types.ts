/**
 * @file src/components/system/inputs/types.ts
 * @description Types for input components
 */

export type FullAutoFill =
	| 'on'
	| 'off'
	| 'name'
	| 'honorific-prefix'
	| 'given-name'
	| 'additional-name'
	| 'family-name'
	| 'honorific-suffix'
	| 'nickname'
	| 'email'
	| 'username'
	| 'new-password'
	| 'current-password'
	| 'one-time-code'
	| 'organization-title'
	| 'organization'
	| 'street-address'
	| 'address-line1'
	| 'address-line2'
	| 'address-line3'
	| 'address-level1'
	| 'address-level2'
	| 'address-level3'
	| 'country'
	| 'country-name'
	| 'postal-code'
	| 'cc-name'
	| 'cc-given-name'
	| 'cc-additional-name'
	| 'cc-family-name'
	| 'cc-number'
	| 'cc-exp'
	| 'cc-exp-month'
	| 'cc-exp-year'
	| 'cc-csc'
	| 'cc-type'
	| 'transaction-currency'
	| 'transaction-amount'
	| 'language'
	| 'bday'
	| 'bday-day'
	| 'bday-month'
	| 'bday-year'
	| 'sex'
	| 'tel'
	| 'url'
	| 'photo';

export type InputType = 'text' | 'email' | 'password';

export type AutoCapitalize = 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';

export interface FloatingInputProps {
	autocapitalize?: AutoCapitalize;
	autocomplete?: FullAutoFill;
	autofocus?: boolean;
	disabled?: boolean;
	errorMessage?: string; // New: For accessibility
	icon?: string;
	iconColor?: string; // CSS color string, e.g., '#888' or 'gray'
	id?: string;
	inputClass?: string;
	invalid?: boolean; // New: For validation state
	label?: string;
	labelClass?: string;
	maxlength?: number;
	minlength?: number;
	name?: string;
	onClick?: (event: MouseEvent) => void;
	onInput?: (value: string) => void;
	onkeydown?: (event: KeyboardEvent) => void;
	onPaste?: (event: ClipboardEvent) => void;
	passwordIconColor?: string; // Renamed for clarity. CSS color string.
	required?: boolean;
	showPassword?: boolean;
	spellcheck?: boolean;
	tabindex?: number;
	textColor?: string; // CSS color classes, e.g., 'text-tertiary-500 dark:text-primary-500'
	type?: InputType;
	value?: string;
	[key: string]: unknown;
}

export interface TogglesProps {
	disabled?: boolean;
	iconOff?: string;
	iconOn?: string;
	label?: string;
	labelColor?: string;
	onChange?: (changed: boolean) => void;
	size?: 'sm' | 'md' | 'lg';
	title?: string;
	value?: boolean;
}
