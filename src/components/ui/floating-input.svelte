<!--
@file src/components/ui/floating-input.svelte
@component
**SveltyCMS Floating Input — WCAG 3.0 Ready**

Material-style floating label input with password visibility toggle, icon support,
full ARIA validation linkage, and transparent background support for overlays.

### Props
- `value` (string): Bindable input value.
- `showPassword` (boolean): Bindable password visibility toggle.
- `label` (string): Floating label text.
- `type` ('text' | 'email' | 'security'): Input type.
- `icon` (string): Iconify icon next to the input.
- `required` (boolean): Required field indicator.
- `invalid` (boolean): Error state with red border.
- `errorMessage` (string): Error text with `role="alert"`.
- `disabled` (boolean): Disable interaction.
- `autofocus` (boolean): Auto-focus on mount.
- `class` (string): Additional CSS classes.

### Features:
- floating label with peer-focus animation
- password visibility toggle with aria-pressed state
- WCAG 3.0 ready with aria-required, aria-invalid, aria-describedby
- full Svelte 5 runes: $props, $bindable, $derived, $state, $effect
-->

<script lang="ts">
import { cn } from '@utils/cn';
import 'iconify-icon';

interface Props {
	value?: string;
	showPassword?: boolean;
	disabled?: boolean;
	icon?: string;
	iconColor?: string;
	inputClass?: string;
	label?: string;
	labelClass?: string;
	minlength?: number;
	maxlength?: number;
	name?: string;
	required?: boolean;
	passwordIconColor?: string;
	textColor?: string;
	type?: 'text' | 'email' | 'security';
	tabindex?: number;
	id?: string;
	autocomplete?: any;
	autocapitalize?: any;
	spellcheck?: boolean;
	autofocus?: boolean;
	invalid?: boolean;
	errorMessage?: string;
	bgTransparent?: boolean;
	white?: boolean;
	onClick?: (e: MouseEvent) => void;
	onInput?: (val: string) => void;
	onkeydown?: (e: KeyboardEvent) => void;
	onPaste?: (e: ClipboardEvent) => void;
	[key: string]: any;
}

let {
	value = $bindable(''),
	showPassword = $bindable(false),
	disabled = false,
	icon = '',
	iconColor = 'gray',
	inputClass = '',
	label = '',
	labelClass = '',
	minlength,
	maxlength,
	name = '',
	required = false,
	passwordIconColor = 'gray',
	textColor = '',
	type = 'text',
	tabindex = 0,
	id = '',
	autocomplete,
	autocapitalize = 'none',
	spellcheck = false,
	autofocus = false,
	invalid = false,
	errorMessage = '',
	bgTransparent = false,
	white = false,
	onClick,
	onInput,
	onkeydown,
	onPaste,
	...rest
}: Props = $props();

let inputElement = $state<HTMLInputElement | null>(null);
const generatedId = $derived(label ? label.toLowerCase().replace(/\s+/g, '-') : 'defaultInputId');
const currentId = $derived(id || generatedId);
const errorId = $derived(errorMessage ? `error-${currentId}` : undefined);
const effectiveType = $derived(showPassword && type === 'security' ? 'text' : type === 'security' ? 'password' : type);
/** 22px — 18px icon + 4px breathing room */
const inputPaddingStart = $derived(icon ? 'ps-7' : 'ps-2');
const labelStart = $derived(icon ? 'start-5' : 'start-2');

$effect(() => {
	if (autofocus && inputElement) {
		inputElement.focus();
	}
});

function togglePasswordVisibility(event: Event): void {
	event.preventDefault();
	showPassword = !showPassword;
}

function handleIconKeyDown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		togglePasswordVisibility(event);
	}
}
</script>

<div class={cn("relative w-full", bgTransparent && "bg-transparent")}>
	<div class="group relative flex w-full items-center" role="group" aria-labelledby={currentId}>
		<input aria-label={label || undefined}
			bind:this={inputElement}
			bind:value
			{name}
			{minlength}
			{maxlength}
			{disabled}
			{tabindex}
			autocomplete={autocomplete ?? undefined}
			{autocapitalize}
			{spellcheck}
			aria-required={required}
			aria-invalid={invalid}
			aria-describedby={errorId}
			onclick={onClick}
			oninput={(e) => onInput?.(e.currentTarget.value)}
			onpaste={onPaste}
			{onkeydown}
			type={effectiveType}
			class={cn(
				'peer block h-12 w-full appearance-none border-0 border-b-2 pe-6 pb-1 pt-4 text-base disabled:opacity-50 transition-[border-color,outline-color,outline-offset] duration-200',
				inputPaddingStart,
				bgTransparent
					? 'border-white/50 text-white focus:border-white focus:outline-2 focus:outline-white bg-transparent focus:bg-transparent'
					: cn(
							'border-surface-300 focus:border-tertiary-600 focus:outline-2 focus:outline-tertiary-600 dark:border-surface-400 dark:focus:border-tertiary-500 dark:focus:outline-tertiary-500',
							textColor === 'black'
								? 'bg-white  focus:bg-white focus:text-black text-surface-900'
								: 'bg-[#242728] text-white focus:bg-[#242728] focus:text-white'
					  ),
				invalid && 'border-error-500! dark:border-error-500!',
				type === 'security' && 'pe-10',
				textColor === 'black' ? 'autofill-light' : 'autofill-dark',
				inputClass
			)}
			style={textColor ? `color: ${textColor}` : undefined}
			placeholder=" "
			id={currentId}
			{...rest}
		/>

		{#if icon}
			<iconify-icon
				{icon}
				width="18"
				class={cn(
					"absolute inset-s-0 top-3",
					bgTransparent
						? "text-white"
						: iconColor
							? ""
							: "text-surface-500 dark:text-surface-50"
				)}
				style={iconColor ? `color: ${iconColor}` : undefined}
				aria-hidden="true"
			></iconify-icon>
		{/if}

		{#if type === 'security'}
			<iconify-icon
				tabindex={0}
				role="button"
				icon={showPassword ? 'mdi:eye' : 'mdi:eye-off'}
				aria-label={showPassword ? 'Hide password' : 'Show password'}
				aria-pressed={showPassword}
				class={cn(
										"absolute inset-e-2 top-3 hover:opacity-75 focus:outline-none",
					bgTransparent
						? "text-white"
						: passwordIconColor
							? ""
							: "text-surface-500 dark:text-surface-50"
				)}
				style={passwordIconColor ? `color: ${passwordIconColor}` : undefined}
				width="24"
				onkeydown={handleIconKeyDown}
				onclick={togglePasswordVisibility}
			></iconify-icon>
		{/if}

		{#if label}
			<label
				for={currentId}
				class={cn(
					"pointer-events-none absolute top-2.5 origin-start transform text-base transition-all duration-200 ease-in-out",
					labelStart,
					"peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-placeholder-shown:text-base",
					"peer-focus:-translate-y-2 peer-focus:scale-75",
					"peer-not-placeholder-shown:-translate-y-2 peer-not-placeholder-shown:scale-75",
					bgTransparent
						? "text-white/80 peer-focus:text-white peer-not-placeholder-shown:text-white"
						: "text-surface-500 peer-focus:text-tertiary-500 peer-not-placeholder-shown:text-tertiary-500",
					invalid && "text-error-500!",
					labelClass
				)}
			>
				{label}
				{#if required}
					<span class="text-error-500" aria-hidden="true">*</span>
				{/if}
			</label>
		{/if}
	</div>

	{#if invalid && errorMessage}
		<p id={errorId} class="mt-1 text-xs text-error-500" role="alert">{errorMessage}</p>
	{/if}
</div>

<style>
	/* Override Tailwind's global input:focus !important in dark mode */
	:global(.autofill-light:focus) {
		background-color: white !important;
		color: black !important;
	}

	/* Chrome/Brave autofill — keep background stable across all pseudo-states */
	:global(.autofill-light) {
		color-scheme: light;
	}

	:global(.autofill-dark) {
		color-scheme: dark;
	}

	/* Standard autofill */
	:global(.autofill-light:autofill),
	:global(.autofill-light:-webkit-autofill),
	:global(.autofill-light:-webkit-autofill:hover),
	:global(.autofill-light:-webkit-autofill:focus),
	:global(.autofill-light:-webkit-autofill:active) {
		-webkit-box-shadow: 0 0 0 1000px white inset !important;
		box-shadow: 0 0 0 1000px white inset !important;
		-webkit-text-fill-color: black !important;
		caret-color: black !important;
		background-color: white !important;
		color: black !important;
		transition: background-color 99999s ease-out 0s;
	}

	:global(.autofill-dark:autofill),
	:global(.autofill-dark:-webkit-autofill),
	:global(.autofill-dark:-webkit-autofill:hover),
	:global(.autofill-dark:-webkit-autofill:focus),
	:global(.autofill-dark:-webkit-autofill:active) {
		-webkit-box-shadow: 0 0 0 1000px #242728 inset !important;
		box-shadow: 0 0 0 1000px #242728 inset !important;
		-webkit-text-fill-color: white !important;
		caret-color: white !important;
		background-color: #242728 !important;
		color: white !important;
		transition: background-color 99999s ease-out 0s;
	}

	/* Selection */
	:global(.autofill-light)::selection {
		background-color: color-mix(in srgb, var(--color-tertiary-500, #0ea5e9) 35%, white);
		color: black;
	}

	:global(.autofill-dark)::selection {
		background-color: color-mix(in srgb, var(--color-tertiary-500, #0ea5e9) 45%, #242728);
		color: white;
	}
</style>
