<!-- 
 @src/routes/api/cms.ts src/components/ui/floating-input.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 FloatingInput Primitive
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
	type?: 'text' | 'email' | 'password';
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
const effectiveType = $derived(showPassword && type === 'password' ? 'text' : type);

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
		<input
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
				'peer block h-12 w-full appearance-none border-0 border-b-2 bg-transparent pl-8 pr-6 pb-1 pt-5 text-base focus:outline-none focus:ring-0 disabled:opacity-50 transition-all duration-200',
				bgTransparent 
					? 'border-white/50 text-white focus:border-white' 
					: 'border-surface-300 focus:border-tertiary-600 dark:border-surface-400 dark:focus:border-tertiary-500 text-surface-900 dark:text-white',
				invalid && '!border-error-500 dark:!border-error-500',
				type === 'password' && 'pr-10',
				inputClass
			)}
			placeholder=" "
			id={currentId}
			{...rest}
		/>

		{#if icon}
			<iconify-icon
				{icon}
				width="18"
				class={cn(
					"absolute left-0 top-3",
					bgTransparent ? "text-white" : "text-surface-500 dark:text-surface-50"
				)}
				aria-hidden="true"
			></iconify-icon>
		{/if}

		{#if type === 'password'}
			<iconify-icon
				tabindex={0}
				role="button"
				icon={showPassword ? 'mdi:eye' : 'mdi:eye-off'}
				aria-label={showPassword ? 'Hide password' : 'Show password'}
				aria-pressed={showPassword}
				class={cn(
					"absolute right-2 top-3 cursor-pointer hover:opacity-75 focus:outline-none",
					bgTransparent ? "text-white" : "text-surface-500 dark:text-surface-50"
				)}
				width="24"
				onkeydown={handleIconKeyDown}
				onclick={togglePasswordVisibility}
			></iconify-icon>
		{/if}

		{#if label}
			<label
				for={currentId}
				class={cn(
					"pointer-events-none absolute left-8 top-1.5 origin-left -translate-y-3 scale-75 transform text-base transition-all duration-200 ease-in-out",
					"peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-base",
					"peer-focus:-translate-y-3 peer-focus:scale-75",
					bgTransparent 
						? "text-white/80 peer-focus:text-white" 
						: "text-surface-500 peer-focus:text-tertiary-500",
					value && "-translate-y-3 scale-75",
					value && !bgTransparent && "text-tertiary-500",
					value && bgTransparent && "text-white",
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
