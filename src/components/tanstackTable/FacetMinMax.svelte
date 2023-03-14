<script lang="ts">
	import type { ColumnDef, FiltersColumn, Table } from '@tanstack/svelte-table';

	export let column: ColumnDef<any, unknown>;
	export let table: Table<any>;

	type FacetVals = {
		min: number | undefined;
		max: number | undefined;
	};

	function getMinMax(columnId?: string): FacetVals {
		if (!columnId) return { min: undefined, max: undefined };
		const column = table.getColumn(columnId);
		if (!column) return { min: undefined, max: undefined };

		const facets = column.getFacetedMinMaxValues();
		if (!facets) return { min: undefined, max: undefined };

		return { min: facets[0], max: facets[1] };
	}

	let facetVals = getMinMax(column.id);

	function handleValueChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = target.value;
		const name = target.name;

		if (name === 'min') {
			(column as unknown as FiltersColumn<any>).setFilterValue((old: [number, number]) => [
				value,
				old?.[1] ?? facetVals.max
			]);
		} else {
			(column as unknown as FiltersColumn<any>).setFilterValue((old: [number, number]) => [
				old?.[0] ?? facetVals.min,
				value
			]);
		}
	}
</script>

<div>
	<div>
		<label for="min"
			>Min
			<input
				type="number"
				name="min"
				min={facetVals.min}
				max={facetVals.max}
				on:change={handleValueChange}
				placeholder={facetVals.min?.toString()}
				value={facetVals.min}
			/>
		</label>
	</div>

	<div>
		<label for="max"
			>Max
			<input
				type="number"
				name="max"
				min={facetVals.min}
				max={facetVals.max}
				on:change={handleValueChange}
				placeholder={facetVals.max?.toString()}
				value={facetVals.max}
			/>
		</label>
	</div>
</div>
