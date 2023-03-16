<script lang="ts">
	import { PUBLIC_LANGUAGE } from '$env/static/public';
	import { language } from '$src/stores/store';

	export let dropDownData: Array<any> = [];
	export let showDropDown: boolean;
	export let selected;
	export let display: any;
	let value = '';
	let data: Array<any> = [];
	let filteredData = data;
	$: {
		filteredData = data.filter((x: any) => {
			return value ? x.item.includes(value) : true;
		});
		value;
		data;
	}
	$: process_data(dropDownData, $language);
	async function process_data(dropDownData: Array<any>, lang: any) {
		let temp = [];
		for (let item of dropDownData) {
			//console.log(item);
			temp.push({
				item: (await display(item))[$language] || (await display(item))[PUBLIC_LANGUAGE],
				_id: item._id
			});
		}
		data = temp;
	}
</script>

{#if showDropDown}
	<div class="container text-black">
		<input bind:value class="form-input" />
		{#each filteredData as item}
			<p
				on:click={() => {
					selected = item;
					showDropDown = false;
				}}
			>
				{item.item}
			</p>
		{/each}
	</div>
{/if}

<style>
	.container {
		background-color: white;
		margin-top: 5px;
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}
	p {
		padding: 10px;
	}
	p:hover {
		background-color: #65dfff;
		color: white;
	}
</style>
