<script lang="ts">
	import type { MediaImage } from '@src/utils/types';
	import { SIZES, formatBytes } from '@src/utils/utils';
	import axios from 'axios';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let onselect: any = () => {};

	let files: MediaImage[] = [];

	axios.get('/media/getAll').then((res) => (files = res.data));

	let showInfo = Array.from({ length: files.length }, () => false);
</script>

{#if files.length === 0}
	<!-- Display a message when no media is found -->
	<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
		<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2" />
		<p class="text-lg">{m.mediagallery_nomedia()}</p>
	</div>
{:else}
	<div class="flex max-h-[calc(100%-55px)] flex-wrap items-center justify-center overflow-auto">
		{#each files as file, index}
			<button on:click={() => onselect(file)} class="card relative flex w-[100%] flex-col md:w-[30%]">
				<div class="absolute flex w-full items-center bg-[#2c3844]">
					<button class="ml-[2px] mt-[2px] block w-[30px]" on:click={() => (showInfo[index] = !showInfo[index])}>
						<iconify-icon icon="raphael:info" width="25" class="text-[#00d3d0]"></iconify-icon>
					</button>
					<p class="mx-auto pr-[30px] text-white">{file.thumbnail.name}</p>
				</div>
				{#if !showInfo[index]}
					<img src={file.thumbnail.url} alt={file.thumbnail.name} class="mx-auto mt-auto max-h-[calc(100%-35px)] rounded-md" />
				{:else}
					<table class="mt-[30px] min-h-[calc(100%-30px)] w-full">
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
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.card {
		height: 250px;
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
