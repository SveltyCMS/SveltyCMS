 <script lang="ts"> 
 import { readdir } from 'fs';
import sharp from 'sharp';
import {
  createSvelteTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
} from '@tanstack/svelte-table';

let folder: string;
let name: string;
let date: Date;
let media = [];
let search = '';
let sort = 'changed';
let view = 'grid';

const mediaDir = `${process.cwd()}/src/media`;
const cacheDir = `${mediaDir}/cache`;
const files = readdirSync(mediaDir, { withFileTypes: true });
const thumbnails = files
  .filter((file) => file.isDirectory())
  .flatMap((dir) =>
    readdirSync(`${mediaDir}/${dir.name}`, { withFileTypes: true })
      .filter(
        (file) =>
          /\.(jpe?g|png|gif|pdf|svg)$/i.test(file.name) &&
          !/\.webp$|\.avif$/i.test(file.name)
      )
      .map((file) => {
        const thumbnailPath = `${cacheDir}/${dir.name}/${file.name}.webp`;
        try {
          const stats = Deno.statSync(thumbnailPath);
          if (
            stats.mtime <
            Deno.statSync(`${mediaDir}/${dir.name}/${file.name}`).mtime
          ) {
            throw new Error('File has been updated');
          }
        } catch (e) {
          if (/\.pdf$/i.test(file.name)) {
            sharp(`${mediaDir}/${dir.name}/${file.name}`)
              .resize(100)
              .flatten({ background: { r: 255, g: 255, b: 255 } })
              .jpeg()
              .toFile(thumbnailPath);
          } else {
            sharp(`${mediaDir}/${dir.name}/${file.name}`)
              .resize(100)
              .webp()
              .toFile(thumbnailPath);
          }
        }
        return {
          path: thumbnailPath.replace(/\.webp$/, '.jpg'),
          name: file.name,
          folder: dir.name,
          date: Deno.statSync(`${mediaDir}/${dir.name}/${file.name}`).mtime,
        };
      })
  );

function dateFormatter(date: number) {
  return new Date(date).toLocaleString();
}

function typeFormatter(type: string) {
  return type;
}

// Define the table columns
const columns = [
  {
    field: 'folder',
    header: 'Folder',
  },
  {
    field: 'name',
    header: 'Name',
  },
  {
    field: 'date',
    header: 'Date',
    formatter: dateFormatter,
  },
  {
    field: 'type',
    header: 'Type',
    formatter: typeFormatter,
  },
];

const data = thumbnails
  .filter(({ name }) => name.includes(search))
  .sort((a, b) =>
    sort === 'changed' ? b.date - a.date : a.date - b.date
  );
  
</script>

<div class="container mx-auto">
    <h1 class="text-3xl font-bold mb-4">Media Library</h1>

    <div class="flex flex-wrap justify-between items-center mb-4">
      <div class="flex-1 mr-4">
        <input type="text" bind:value={search} placeholder="Search by name" class="w-full px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200" > 
      </div>

      <div class="flex-none">
        <div class="flex items-center">
          <label class="mr-2 text-gray-700 dark:text-gray-300">Sort by:</label>
          <select bind:value={sort} class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
            <option value="changed">Changed date</option>
            <option value="uploaded">Uploaded date</option>
          </select>
        </div>
      </div>

      <div class="flex-none">
        <div class="flex items-center">
          <label class="mr-2 text-gray-700 dark:text-gray-300">View:</label>
          <select bind:value={view} class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
      </div>
    </div> 
</div>

{#if view === 'list'}
<Table {data}>
  <Column field="folder" header="Folder" />
  <Column field="name" header="Name" />
  <Column field="date" header="Date" formatter={dateFormatter} />
  <Column field="type" header="Type" formatter={typeFormatter} />
</Table>

	{#if sort === 'changed'}
		{#each thumbnails
			.filter(({ name }) => name.includes(search))
			.sort((a, b) => b.date - a.date) as { path, name, folder }}
			<div>
				<h2>{folder}</h2>
				<p>{name}</p>
				<p>{new Date(date).toLocaleString()}</p>
				{#if /\.pdf$/i.test(name)}
					<embed src={path} width="100" height="100" />
				{:else}
					<img src={path} alt={name} />
				{/if}
			</div>
		{/each}
	{:else}
		{#each thumbnails
			.filter(({ name }) => name.includes(search))
			.sort((a, b) => a.date - b.date) as { path }}
			<div>
				<h2>{folder}</h2>
				<p>{name}</p>
				<p>{new Date(date).toLocaleString()}</p>
				{#if /\.pdf$/i.test(name)}
					<embed src={path} width="100" height="100" />
				{:else}
					<img src={path} alt={name} />
				{/if}
			</div>
		{/each}
	{/if}
{:else if view === 'grid'}
<!-- Grid view -->
<div class="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    {#each thumbnails.filter(({ name }) => name.includes(search)) as { path, name, folder }}
      <div class="card shadow-md rounded-lg">
        {#if /\.pdf$/i.test(name)}
          <embed class="w-full" src={path} width="100" height="100" />
        {:else}
          <img class="w-full" src={path} alt={name} />
        {/if}
        <div class="p-4">
          <h2 class="text-lg font-medium">{name}</h2>
          <p class="text-gray-500">{folder}</p>
          <p class="text-gray-500">{new Date(date).toLocaleString()}</p>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, max-content));
	}

	.grid-item {
		margin: 10px;
	}

	.grid-item img {
		width: 100%;
	}
</style>
