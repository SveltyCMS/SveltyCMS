<!-- 
 @file src/components/system/inputs/floatingInput.svelte
 @description FloatingInput component for handling text and password inputs with floating labels
 -->

<script lang="ts">
	type AutocompleteType = 'on' | 'off' | null;
	type InputType = 'text' | 'email' | 'password';
	type BackgroundColorType = 'light' | 'dark';

	let {
		value = $bindable(''),
		showPassword = false,
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
		autocomplete = null,
		onClick,
		onInput
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
		autocomplete?: AutocompleteType;
		onClick?: (event: MouseEvent) => void;
		onInput?: (value: string) => void;
	}>();

	let inputElement = $state<HTMLInputElement>();
	let currentId = $state(id || getIdValue(label));
	let isPasswordVisible = $state(showPassword);

	function handleClick(event: MouseEvent): void {
		event.stopPropagation();
		onClick?.(event);
	}

	function handleIconKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			togglePasswordVisibility(event);
		}
	}

	function getIdValue(label: string): string {
		return label?.trim() ? label.toLowerCase().replace(/\s+/g, '-') : 'defaultInputId';
	}

	function togglePasswordVisibility(event: Event): void {
		event.preventDefault();
		isPasswordVisible = !isPasswordVisible;
	}

	$effect(() => {
		if (type === 'password' && inputElement) {
			inputElement.type = isPasswordVisible ? 'text' : 'password';
		}
	});
</script>

<div class="group relative w-full">
	<input
		bind:this={inputElement}
		bind:value
		oninput={(e) => onInput?.(e.currentTarget.value)}
		onclick={handleClick}
		autocomplete={autocomplete || undefined}
		id={currentId}
		{name}
		{required}
		{disabled}
		{minlength}
		{maxlength}
		aria-describedby="{currentId}-error"
		class="{inputClass} peer relative block w-full appearance-none border-0 border-b-2 border-surface-300 bg-transparent pl-6 !text-{textColor} focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-400 dark:focus:border-tertiary-500"
	/>

	{#if icon}
		<iconify-icon aria-hidden="true" {icon} width="1.125em" class="absolute top-3 text-{iconColor}"></iconify-icon>
	{/if}

	{#if type === 'password'}
		<iconify-icon
			{tabindex}
			role="button"
			icon={isPasswordVisible ? 'bi:eye-fill' : 'bi:eye-slash-fill'}
			aria-label="Toggle password visibility"
			aria-pressed={isPasswordVisible}
			class={`absolute right-0 ${showPasswordBackgroundColor === 'light' ? 'text-surface-700' : 'text-surface-300'}`}
			width="1.5em"
			onkeydown={handleIconKeyDown}
			onclick={togglePasswordVisibility}
		></iconify-icon>
	{/if}

	{#if label}
		<label
			for={currentId}
			class="{labelClass} pointer-events-none absolute left-6 transform text-sm text-surface-400 transition-all duration-200 ease-in-out peer-placeholder-shown:-top-1 peer-placeholder-shown:text-base peer-placeholder-shown:text-surface-400 peer-focus:-left-0 peer-focus:-top-1.5 peer-focus:text-xs peer-focus:text-tertiary-500"
		>
			{label}
			{#if required}
				<span class="text-error-500">*</span>
			{/if}
		</label>
	{/if}
</div>

<style lang="postcss">
	div {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
</style>
