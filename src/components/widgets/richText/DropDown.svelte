<script lang="ts">
	let expanded = false;

	export let icon = '';
	export let label = '';
	export let show = false;
	export let items: {
		name: string;
		icon?: string;
		onClick: () => void;
		active: () => boolean;
	}[] = [];

	$: selected = items.filter((item) => item.active())[0];
</script>

<button class="wrapper" class:hidden={!show} on:click={() => (expanded = !expanded)}>
	<button class="selected arrow" class:arrow_up={expanded}>
		<iconify-icon icon={icon || selected?.icon} width="20"></iconify-icon>

		<p class="max-w-[80px] overflow-hidden whitespace-nowrap">{selected ? selected.name : label}</p>
	</button>

	<!-- Dropdown menu -->
	<button
		class="absolute left-0 top-full flex w-full cursor-pointer flex-col items-center divide-y text-nowrap rounded border-[1px] bg-white dark:bg-surface-500"
		class:!hidden={!expanded}
	>
		<!-- DropDown list -->
		{#each items as item}
			<button
				class="variant-filled-surface btn w-full gap-1"
				on:click|stopPropagation={() => {
					item.onClick();
					expanded = false;
				}}
				class:active={item.active}
			>
				<iconify-icon icon={item.icon} width="20"></iconify-icon>
				{item.name}
			</button>
		{/each}
	</button>
</button>

<style lang="postcss">
	.selected {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
		text-wrap: nowrap;
		text-overflow: ellipsis ' [..]';
	}
	.wrapper {
		z-index: 10;
		position: relative;
		width: 150px;
		box-shadow: 0px 0px 3px 0px #3e1717;
		padding: 10px;
		cursor: pointer;
		border-radius: 4px;
	}

	.arrow::after {
		content: '';
		transform: translateY(-50%);
		border: solid #6b6b6b;
		border-width: 0 3px 3px 0;
		display: inline-block;
		padding: 3px;
		transform: rotate(45deg);
		margin-right: 10px;
		transition: transform 0.1s ease-in;
		margin-left: auto;
	}

	.arrow_up::after {
		transform: rotate(225deg);
	}
</style>
