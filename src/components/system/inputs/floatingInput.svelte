<!-- 
 @file src/components/system/inputs/floatingInput.svelte
 @component 
 **FloatingInput component for handling text and password inputs with floating labels**

 #### Props
 - `value` {string}: The input value (bindable)
 - `showPassword` {boolean}: Initial visibility of password (bindable, default: false)
 - `disabled` {boolean}: Whether the input is disabled (default: false)
 - `icon` {string}: Icon next to the input (default: '')
 - `iconColor` {string}: Icon color (default: 'gray-500')
 - `inputClass` {string}: Additional input classes (default: '')
 - `label` {string}: Input label (default: '')
 - `labelClass` {string}: Additional label classes (default: '')
 - `minlength` {number}: Minimum input length (optional)
 - `maxlength` {number}: Maximum input length (optional)
 - `name` {string}: Input name (default: '')
 - `required` {boolean}: Whether input is required (default: false)
 - `showPasswordBackgroundColor` {'light' | 'dark'}: Password toggle color (default: 'light')
 - `textColor` {string}: Text color class (default: '!text-error-500')
 - `type` {'text' | 'email' | 'password'}: Input type (default: 'text')
 - `tabindex` {number}: Input tabindex (default: 0)
 - `id` {string}: Input ID (default: derived from label or 'defaultInputId')
 - `autocomplete` {string}: Autocomplete attribute (default: null)
 - `onClick` {function}: Click event handler (optional)
 - `onInput` {function}: Input event handler (optional)
 - `onkeydown` {function}: Keydown event handler (optional)

 ### Features
 - Floating labels for better UX
 - Password visibility toggle for password inputs
 - Full ARIA support for accessibility
 - Customizable styling via props
-->

<script lang="ts">
	import type { FloatingInputProps } from './types';

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
		textColor = 'black',
		type = 'text',
		tabindex = 0,
		id = '',
		autocomplete,
		autocapitalize = 'none',
		spellcheck = false,
		autofocus = false,
		invalid = false,
		errorMessage = '',
		onClick,
		onInput,
		onkeydown,
		onPaste
	}: FloatingInputProps = $props();

	let inputElement = $state<HTMLInputElement | null>(null);
	const currentId = $derived(id || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'defaultInputId'));
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

<div class="relative w-full">
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
			style={textColor ? `color: ${textColor};` : ''}
			class="peer block h-12 w-full appearance-none border-0 border-b-2 border-surface-300 bg-transparent pl-8 pr-6 pb-1 pt-5 text-base focus:border-tertiary-600 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-surface-400 dark:focus:border-tertiary-500 {inputClass}"
			class:!border-error-500={invalid}
			class:dark:!border-error-500={invalid}
			class:pr-10={type === 'password'}
			placeholder=" "
			id={currentId}
		/>

		{#if icon}
			<iconify-icon
				{icon}
				width="1.125em"
				class="absolute left-0 top-3"
				style={iconColor !== 'gray' ? `color: ${iconColor};` : ''}
				class:text-surface-500={iconColor === 'gray'}
				class:dark:text-surface-400={iconColor === 'gray'}
				aria-hidden="true"
			></iconify-icon>
		{/if}

		{#if type === 'password'}
			<iconify-icon
				tabindex="0"
				role="button"
				icon={showPassword ? 'bi:eye-fill' : 'bi:eye-slash-fill'}
				aria-label={showPassword ? 'Hide password' : 'Show password'}
				aria-pressed={showPassword}
				class="absolute right-2 top-3 cursor-pointer hover:opacity-75 focus:outline-none text-surface-500 dark:text-surface-400"
				width="24"
				style={passwordIconColor !== 'gray' ? `color: ${passwordIconColor};` : ''}
				onkeydown={handleIconKeyDown}
				onclick={togglePasswordVisibility}
			></iconify-icon>
		{/if}

		{#if label}
			<label
				for={currentId}
				style={textColor ? `color: ${textColor};` : ''}
				class="pointer-events-none absolute left-8 top-1.5 origin-left -translate-y-3 scale-75 transform text-base text-surface-500 transition-all duration-200 ease-in-out peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-base peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-tertiary-500! peer-disabled:text-surface-500 {value
					? `-translate-y-3 scale-75 ${invalid ? 'text-error-500!' : 'text-tertiary-500!'}`
					: ''} {labelClass}"
			>
				{label}
				{#if required}
					<span class="text-error-500" aria-hidden="true">*</span>
				{/if}
			</label>
		{/if}
	</div>

	{#if invalid && errorMessage}
		<p id={errorId} class="mt-1 text-xs text-error-500" role="alert">
			{errorMessage}
		</p>
	{/if}
</div>
