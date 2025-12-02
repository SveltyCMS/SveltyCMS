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
	value?: string;
	showPassword?: boolean;
	disabled?: boolean;
	icon?: string;
	iconColor?: string; // CSS color string, e.g., '#888' or 'gray'
	inputClass?: string;
	label?: string;
	labelClass?: string;
	minlength?: number;
	maxlength?: number;
	name?: string;
	required?: boolean;
	passwordIconColor?: string; // Renamed for clarity. CSS color string.
	textColor?: string; // CSS color classes, e.g., 'text-tertiary-500 dark:text-primary-500'
	type?: InputType;
	tabindex?: number;
	id?: string;
	autocomplete?: FullAutoFill;
	autocapitalize?: AutoCapitalize;
	spellcheck?: boolean;
	autofocus?: boolean;
	invalid?: boolean; // New: For validation state
	errorMessage?: string; // New: For accessibility
	onClick?: (event: MouseEvent) => void;
	onInput?: (value: string) => void;
	onkeydown?: (event: KeyboardEvent) => void;
	onPaste?: (event: ClipboardEvent) => void;
}

export interface TogglesProps {
	value?: boolean;
	label?: string;
	labelColor?: string;
	iconOn?: string;
	iconOff?: string;
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	title?: string;
	onChange?: (changed: boolean) => void;
}
