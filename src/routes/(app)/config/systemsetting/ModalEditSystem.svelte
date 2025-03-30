<!-- 
@file src/routes/(app)/config/systemsetting/ModalEditSystem.svelte
@component
**ModalEditSystem component for editing system settings**

Features: 
- Displays a modal for editing system settings
- Validates form data before submission
- Displays tooltips for each configuration field
- Saves the form data on successful validation
- Displays error messages for invalid form data
-->
<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import type { PopupSettings } from '@skeletonlabs/skeleton-svelte';

	// Database
	import { dbAdapter } from '@src/databases/db';

	const modalStore = getModalStore();
	const cBase = 'bg-surface-100-900 w-screen h-screen p-4 flex justify-center items-center';

	let formData = $state<{ [key: string]: any }>({});
	let errors = $state<{ [key: string]: string }>({});

	interface Props {
		parent: SvelteComponent;
		title: string;
		configCategory: string;
		description: string;
		isPrivate: boolean;
	}

	let { parent, title, configCategory, description, isPrivate }: Props = $props();

	interface ConfigField<T> {
		type: T;
		default: any;
		helper: string;
		allowedValues?: any[];
		icon: string;
	}

	interface ConfigCategory {
		description: string;
		icon: string;
		fields: { [key: string]: ConfigField<any> };
	}

	// Load actual configuration values
	const actualConfig = isPrivate ? privateEnv : publicEnv;

	// Get content structure from database
	const getContentStructure = async () => {
		if (!dbAdapter) {
			console.error('Database adapter is not available');
			return {};
		}
		const contentNode = await dbAdapter.getContentNodes();
		const configCategoryNode = contentNode.find((node: { path: string }) => node.path === configCategory);
		return configCategoryNode?.fields || {};
	};

	import { onMount } from 'svelte';

	let configData = $state({});

	onMount(async () => {
		configData = await getContentStructure();

		// Merge actual configuration values with defaults
		configData = Object.entries(configData).map(([key, field]) => {
			const typedField = field as ConfigField<any>;
			return {
				key,
				...typedField,
				value: actualConfig[key as keyof typeof actualConfig] !== undefined ? actualConfig[key as keyof typeof actualConfig] : typedField.default
			};
		});

		console.log('Config Data:', configData);
	});

	function validate() {
		errors = {};
		for (const { key, type, value, allowedValues } of configData) {
			if (formData[key] === undefined || formData[key] === '') {
				errors[key] = `${key} is required`;
			} else if (allowedValues && !allowedValues.includes(formData[key])) {
				errors[key] = `${key} must be one of ${allowedValues.join(', ')}`;
			} else if (type === 'number' && isNaN(Number(formData[key]))) {
				errors[key] = `${key} must be a number`;
			} else if (type === 'boolean' && typeof formData[key] !== 'boolean') {
				errors[key] = `${key} must be true or false`;
			}
		}
		return Object.keys(errors).length === 0;
	}

	function handleSubmit() {
		if (validate()) {
			// Handle valid data submission
			console.log('Valid data:', formData);
			parent.onSave(formData);
		} else {
			console.log('Errors:', errors);
		}
	}

	// Popup Tooltips
	function getPopupSettings(key: string): PopupSettings {
		return {
			event: 'hover',
			target: `popup${key}`,
			placement: 'right'
		};
	}
</script>

{#if $modalStore[0]}
	<div class="modal-example-fullscreen {cBase}">
		<div class="flex h-full w-full max-w-xl flex-col items-center">
			<div class="top-0 w-full py-2 text-center">
				<h2 class="h2 text-tertiary-500 dark:text-primary-500 mb-2 capitalize">{title} Setup:</h2>
				<p>{description}</p>
			</div>
			<form onsubmit={preventDefault(handleSubmit)} class="wrapper w-full grow overflow-y-auto p-4">
				{#each configData as { key, value, type, helper, icon, allowedValues }}
					<div class="mb-4">
						<label class="mb-2 block" for={key}>
							<iconify-icon {icon} width="18" class="text-tertiary-500 dark:text-primary-500 mr-2"></iconify-icon>
							{key}
							<span use:popup={getPopupSettings(key)} class=" ml-2 p-0">
								<iconify-icon icon="mdi:help-circle-outline" width="18" class=" text-gray-600"></iconify-icon>
							</span>

							<!-- Popup Tooltip with the arrow element -->
							<div class="card preset-filled z-50 max-w-sm p-2" data-popup={`popup${key}`}>
								{helper}
								<div class="preset-filled arrow"></div>
							</div>
						</label>

						{#if allowedValues}
							<select id={key} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]}>
								{#each allowedValues as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else if type === 'boolean'}
							<select id={key} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]}>
								<option value={true}>True</option>
								<option value={false}>False</option>
							</select>
						{:else if type === 'number'}
							<input type="number" id={key} placeholder={helper} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]} />
						{:else}
							<input type="text" id={key} placeholder={helper} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]} />
						{/if}
						{#if errors[key]}
							<p class="text-error-500 text-xs italic">{errors[key]}</p>
						{/if}
					</div>
				{/each}
			</form>
			<div class="bg-surface-100-900 sticky bottom-0 z-10 m-2 flex w-full justify-between py-2">
				<button type="button" class="preset-filled btn" onclick={parent.onClose}>{m.button_cancel()}</button>
				<button type="submit" class="preset-filled btn">{m.button_save()}</button>
			</div>
		</div>
	</div>
{/if}
