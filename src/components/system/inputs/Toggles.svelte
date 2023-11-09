<script lang="ts">
	export let value: boolean = false;
	export let label: string = '';
	export let OnIcon: any = null;
	export let OffIcon: any = null;
</script>

<label for="toggleSwitch" class="text-dark flex cursor-pointer select-none items-center dark:text-white">
	<label for="toggleSwitch" class="mr-3 text-primary-500">{label}</label>

	<div class="relative">
		<input type="checkbox" id="toggleSwitch" class="peer sr-only" bind:checked={value} />
		<!-- Background -->
		<div class="block h-8 w-14 rounded-full bg-surface-400 peer-checked:bg-primary-500">
			<span class="absolute inset-0 flex items-center justify-end pr-4 text-white">
				{value ? (OnIcon ? '' : 'ON') : OffIcon ? '' : 'OFF'}
			</span>
		</div>

		<!-- icon with background color -->
		<div
			class="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-error-500 transition peer-checked:translate-x-6 peer-checked:bg-primary-900"
		>
			{#if value}
				<iconify-icon icon={OnIcon} width="24" />
			{:else}
				<iconify-icon icon={OffIcon} width="24" />
			{/if}
		</div>
	</div>
</label>
