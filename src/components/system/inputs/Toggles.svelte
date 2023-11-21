<script lang="ts">
	import { generateUniqueId } from '@src/utils/utils';

	export let value: boolean = false;
	export let label: string = '';
	export let icon: any = null;
	let random = generateUniqueId();
</script>

<label for="toggleSwitch{random}" class="text-dark flex cursor-pointer select-none items-center text-white">
	<label for="toggleSwitch{random}" class={`mr-3 flex items-center gap-2 ${value ? 'text-primary-500' : 'text-error-500'}`}>
		<!-- {#if value}
			<iconify-icon icon="wpf:invisible" width="24" class="text-white" />
		{:else}
			<iconify-icon icon="gridicons:not-visible" width="24" class="text-white" />
		{/if} -->
		{label}
	</label>

	<div class="relative">
		<input name={label} type="checkbox" id="toggleSwitch{random}" class="peer sr-only" on:click={() => (value = !value)} />
		<!-- Background -->
		<div class="block h-8 w-14 rounded-full bg-surface-400 peer-checked:bg-primary-500">
			<span class="absolute inset-0 flex items-center justify-end rounded-full border-2 pr-[25px] text-right text-white">
				{value ? (icon ? '' : 'ON') : icon ? '' : 'OFF'}
			</span>
		</div>

		<!-- icon with background color -->
		<div
			class="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-error-500 transition peer-checked:translate-x-6 peer-checked:bg-primary-900"
		>
			{#if value}
				<iconify-icon {icon} width="24" />
			{:else}
				<iconify-icon {icon} width="24" />
			{/if}
		</div>
	</div>
</label>
