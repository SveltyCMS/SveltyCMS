<!--
@file src/routes/login/components/icons/SigninIcon.svelte
@component
**SigninIcon component**
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	let {
		show = $bindable(true),
		disabled = false,
		onClick = (_event: Event) => {}
	} = $props<{
		show?: boolean;
		disabled?: boolean;
		onClick?: (event: Event) => void;
	}>();

	function handleClick(event: MouseEvent) {
		if (disabled) return;
		event.stopPropagation();
		onClick(event); // Ensure onClick uses the event meaningfully
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'Enter') {
			event.stopPropagation();
			onClick(event); // Ensure onClick uses the event meaningfully
		}
	}
</script>

<div
	class="icon dark:text-dark absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] transition-all duration-300"
	class:hide={!show}
	class:pointer-events-none={!show || disabled}
	class:opacity-50={disabled}
>
	<div onclick={handleClick} onkeydown={handleKeyDown} role="button" tabindex={disabled ? -1 : 0} class="flex cursor-pointer flex-col items-center">
		<div class="relative w-max rounded-full border-4 border-[#2b2f31] p-3">
			<svg
				class="aspect-square h-12 fill-[#2b2f31]"
				xmlns="http://www.w3.org/2000/svg"
				xmlns:xlink="http://www.w3.org/1999/xlink"
				viewBox="0 0 50 50"
			>
				<path
					d="M25 3C19.464844 3 15 7.464844 15 13L15 19C15 22.238281 16.585938 25.144531 19 26.96875L19 31.5C19 31.605469 18.980469 31.695313 18.71875 31.9375C18.457031 32.179688 17.992188 32.503906 17.375 32.8125C16.144531 33.429688 14.367188 34.0625 12.5625 34.9375C10.757813 35.8125 8.886719 36.925781 7.4375 38.53125C5.988281 40.136719 5 42.289063 5 45L5 46L45 46L45 45C45 42.265625 44.011719 40.105469 42.5625 38.5C41.113281 36.894531 39.242188 35.800781 37.4375 34.9375C35.632813 34.074219 33.851563 33.421875 32.625 32.8125C32.011719 32.507813 31.539063 32.210938 31.28125 31.96875C31.023438 31.726563 31 31.625 31 31.5L31 26.96875C33.414063 25.144531 35 22.238281 35 19L35 13C35 7.464844 30.535156 3 25 3 Z M 25 5C29.464844 5 33 8.535156 33 13L33 19C33 21.757813 31.558594 24.242188 29.4375 25.65625L29 25.96875L29 31.5C29 32.273438 29.398438 32.957031 29.90625 33.4375C30.414063 33.917969 31.050781 34.277344 31.75 34.625C33.148438 35.320313 34.867188 35.9375 36.5625 36.75C38.257813 37.5625 39.886719 38.542969 41.0625 39.84375C42.039063 40.921875 42.605469 42.304688 42.8125 44L7.1875 44C7.394531 42.324219 7.964844 40.957031 8.9375 39.875C10.113281 38.570313 11.742188 37.574219 13.4375 36.75C15.132813 35.925781 16.855469 35.289063 18.25 34.59375C18.945313 34.246094 19.589844 33.878906 20.09375 33.40625C20.597656 32.933594 21 32.269531 21 31.5L21 25.96875L20.5625 25.65625C18.441406 24.242188 17 21.757813 17 19L17 13C17 8.535156 20.535156 5 25 5Z"
				/>
			</svg>
		</div>
		<p class="text-center font-semibold uppercase !text-black">{m.form_signin()}</p>
	</div>
</div>

<style lang="postcss">
	.hide {
		animation: _hide 0.3s forwards;
	}
	@keyframes _hide {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
			top: 70%;
		}
	}
</style>
