<script lang="ts">
	import type { ImageFiles } from '@src/utils/types';
	import { SIZES, formatBytes } from '@src/utils/utils';
	import axios from 'axios';

	export let onselect: any = () => {};

	let files: ImageFiles[] = [];

	axios.get('/media/getAll').then((res) => (files = res.data));
</script>

<div class="flex max-h-[calc(100%-55px)] flex-wrap items-center justify-center overflow-auto">
	{#each files as file}
		<button on:click={() => onselect(file)} class="card flex w-[100%] flex-col md:w-[30%]">
			<img src={file.thumbnail.url} alt="" class="mx-auto mb-2 max-h-[250px]" />

			<table class="mt-auto">
				<tbody>
					{#each Object.keys(SIZES) as size}
						<tr>
							<td class="!pl-[10px]">
								{size}
							</td>
							<td>
								{file[size].width}x{file[size].height}
							</td>
							<td>
								{formatBytes(file[size].size)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</button>
	{/each}
</div>

<style>
	.card {
		height: 450px;
		margin: 10px;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 5px 4px 15px rgb(0 0 0 / 62%);
		cursor: pointer;
		overflow: auto;
	}
	.card::-webkit-scrollbar-thumb {
		border-radius: 50px;
		background-color: #0eb4c4;
	}
	.card::-webkit-scrollbar {
		width: 10px;
	}
	td {
		padding: 10px;
	}
	tbody {
		background-color: #202832;
		color: white;
	}
	tbody tr:nth-child(2n + 1) {
		padding: 5px 0;
		background-color: #2c3844;
	}
</style>
