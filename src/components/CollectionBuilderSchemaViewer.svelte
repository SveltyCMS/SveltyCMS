<!--
@file src/components/CollectionBuilderSchemaViewer.svelte
@component
**Renders a detailed, read-only view of a collection's schema fields based on its definition in the centralized preset source.**

Designed as a visual schema inspector for developers to understand what data structure a given blueprint provides.
-->
<script lang="ts">
	// Local Schema type since presets.ts only exports Preset
	interface SchemaField {
		key: string;
		type: string;
		label: string;
		db_fieldName: string;
		required?: boolean;
		[key: string]: unknown;
	}

	interface Schema {
		name: string;
		description?: string;
		fields: SchemaField[];
	}

	// Component properties using $props() (Svelte 5 Runes)
	let { schema }: {
		schema?: Schema | undefined;
	} = $props();

	// Calculate currentSchema using $derived (falls back to schema prop directly)
	const currentSchema = $derived(schema);

	/** @type {(props: { label: string; db_fieldName: string; type: string; required?: 'Required' | 'Optional' }) => string} */
	const MockInput = ({ label, db_fieldName, type, required }: {
		label: string;
		db_fieldName: string;
		type: string;
		required?: 'Required' | 'Optional';
	}) => `
		<div class="col-span-full flex items-center justify-between border p-2 rounded dark:border-surface-700">
			<label class="font-semibold text-[0.9rem] text-black/80">${label}</label>
			<input type="${type}" placeholder="${db_fieldName}" disabled class="w-64 bg-surface-100 dark:bg-surface-700 p-1 rounded" />
			<span class="text-sm text-error-500">(${required} ${type})</span>
		</div>`;

	/** @type {(props: { label: string; db_fieldName: string }) => string} */
	const MockRichText = ({ label, db_fieldName }: {
		label: string;
		db_fieldName: string;
	}) => `
		<div class="col-span-full p-2 border rounded dark:border-surface-700">
			<label class="font-semibold text-[0.9rem]">${label}</label>
			<textarea placeholder="${db_fieldName}" disabled rows="3" class="w-full bg-surface-100 dark:bg-surface-700 p-2 rounded"></textarea>
		</div>`;

	/** @type {(props: { label: string;  relation: string }) => string} */
	const MockRelation = ({ label, relation }: {
		label: string;
		relation: string;
	}) => `
		<div class="col-span-full flex items-center justify-between border p-2 rounded dark:border-surface-700">
			<label class="font-semibold text-[0.9rem] text-black/80">${label}</label>
			<select disabled class="p-1 rounded bg-surface-100 dark:bg-surface-700">
				<option selected>${relation} (Mock)</option>
			</select>
		</div>`;

	/**
	 * Renders a mock component HTML based on the field definition.
	 */
	function getFieldComponentHtml(field: SchemaField): string {
		switch (field.type) {
			case 'rich-text':
				return MockRichText({ label: field.label, db_fieldName: field.db_fieldName });
			case 'relation':
				return MockRelation({ label: field.label, relation: field.relation as string });
			default: {
				const requiredStatus = field.required ? 'Required' : 'Optional';
				return MockInput({ label: field.label, db_fieldName: field.db_fieldName, type: field.type || 'text', required: requiredStatus });
			}
		}
	}
</script>

<section class="p-6 border rounded-xl bg-white dark:bg-[#0d0f12] shadow-lg">
	<!-- Header -->
	<div class="flex items-center gap-4 pb-3 border-b border-surface-200 dark:border-surface-700 mb-4">
		<h2 class="text-2xl font-bold text-black dark:text-white">{currentSchema?.name || 'Unknown Schema'}</h2>
		<div class="flex flex-col gap-1.5">
			<p class="text-[0.8rem] text-surface-500 dark:text-surface-400">{currentSchema?.description || ''}</p>
		</div>
	</div>

	<!-- Schema Details -->
	<div>
		<h3 class="text-xl font-semibold mb-4 border-b pb-2">Defined Fields ({currentSchema?.fields.length ?? 0} fields)</h3>
		<div class="space-y-6 p-4 bg-surface-50 dark:bg-[#1a1c20] rounded-lg/50 shadow-inner">
			{#if currentSchema?.fields && currentSchema.fields.length > 0}
				{#each currentSchema.fields as field (field.key)}
					<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 border-b pb-6">
						{@html getFieldComponentHtml(field)}
					</div>
				{/each}
			{:else}
				<p class="text-surface-500 dark:text-surface-400">No fields are currently defined for this schema.</p>
			{/if}
		</div>
	</div>
</section>
