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
-->

<script lang="ts">
	type InputType = 'text' | 'email' | 'password';
	type BackgroundColorType = 'light' | 'dark';

	// Props with bindable value and showPassword
	let {
		value = $bindable(''),
		showPassword = $bindable(false),
		disabled = false,
		icon = '',
		iconColor = 'gray-500',
		inputClass = '',
		label = '',
		labelClass = '',
		minlength,
		maxlength,
		name = '',
		required = false,
		showPasswordBackgroundColor = 'light',
		textColor = '!text-error-500',
		type = 'text',
		tabindex = 0,
		id = '',
		autocomplete = null as string | null,
		onClick,
		onInput,
		onkeydown,
		onPaste
	} = $props<{
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
		showPasswordBackgroundColor?: BackgroundColorType;
		textColor?: string;
		type?: InputType;
		tabindex?: number;
		id?: string;
		autocomplete?: string | null;
		onClick?: ((event: MouseEvent) => void) | undefined;
		onInput?: ((value: string) => void) | undefined;
		onkeydown?: ((event: KeyboardEvent) => void) | undefined;
		onPaste?: ((event: ClipboardEvent) => void) | undefined;
	}>();

	// State
	let inputElement = $state<HTMLInputElement>();
	let isPasswordVisible = $state(showPassword);
	let currentId = $derived(id || (label ? label.toLowerCase().replace(/\s+/g, '-') : 'defaultInputId'));

	// Derived input type for password toggle
	const effectiveType = $derived(isPasswordVisible && type === 'password' ? 'text' : type);

	// Sync showPassword with isPasswordVisible
	$effect(() => {
		isPasswordVisible = showPassword;
	});

	// Event handlers
	function handleClick(event: MouseEvent): void {
		event.stopPropagation();
		onClick?.(event);
	}

	function togglePasswordVisibility(event: Event): void {
		event.preventDefault();
		isPasswordVisible = !isPasswordVisible;
		showPassword = isPasswordVisible; // Sync back to bindable prop
	}

	function handleIconKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			togglePasswordVisibility(event);
		}
	}

	// Sync input element type (fallback for edge cases)
	$effect(() => {
		if (inputElement && type === 'password') {
			inputElement.type = effectiveType;
		}
	});
</script>

<div class="group relative w-full" role="group" aria-labelledby={currentId}>
	<input
		bind:this={inputElement}
		bind:value
		{name}
		{minlength}
		{maxlength}
		{required}
		{disabled}
		{tabindex}
		{autocomplete}
		onclick={handleClick}
		oninput={(e) => onInput?.(e.currentTarget.value)}
		onpaste={onPaste}
		{onkeydown}
		type={effectiveType}
		class="peer block w-full appearance-none border-0 border-b-2 border-surface-300 bg-transparent pl-6 text-{textColor} focus:border-tertiary-600 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-surface-400 dark:focus:border-tertiary-500 {inputClass}"
		placeholder=" "
		id={currentId}
	/>

	{#if icon}
		<iconify-icon {icon} width="1.125em" class="absolute left-1 top-3 text-{iconColor}" aria-hidden="true" role="presentation"></iconify-icon>
	{/if}

	{#if type === 'password'}
		<iconify-icon
			tabindex={0}
			role="button"
			icon={isPasswordVisible ? 'bi:eye-fill' : 'bi:eye-slash-fill'}
			aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
			aria-pressed={isPasswordVisible}
			class="absolute right-2 top-3 text-{showPasswordBackgroundColor === 'light'
				? 'surface-700'
				: 'surface-300'} hover:text-tertiary-500 focus:outline-none"
			width="24"
			onkeydown={handleIconKeyDown}
			onclick={togglePasswordVisibility}
		></iconify-icon>
	{/if}

	{#if label}
		<label
			for={currentId}
			class="pointer-events-none absolute left-6 top-0 transform text-sm text-surface-400 transition-all duration-200 ease-in-out peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:text-surface-400 peer-focus:-top-1.5 peer-focus:text-xs peer-focus:text-tertiary-500 peer-disabled:text-surface-500 {value
				? '-top-1.5 text-xs text-tertiary-500'
				: ''} {labelClass}"
		>
			{label}
			{#if required}
				<span class="text-error-500" aria-hidden="true">*</span>
			{/if}
		</label>
	{/if}
</div>

<style lang="postcss">
	.group {
		@apply relative flex w-full items-center;
	}
</style>
