<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import { privateConfigCategories, publicConfigCategories } from '@root/config/guiConfig';

	export let parent: SvelteComponent;
	export let title: string;
	export let configCategory: string;
	export let description: string;
	export let isPrivate: boolean;

	// Skeleton
	import { getModalStore, popup, type PopupSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex justify-center items-center';
	let formData = {};
	let errors = {};

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

	// Determine the category config based on whether it's private or public
	const categoryConfig: ConfigCategory = isPrivate ? privateConfigCategories[configCategory] : publicConfigCategories[configCategory];
	const configData = Object.entries(categoryConfig.fields).map(([key, field]: [string, ConfigField<any>]) => ({
		key,
		...field,
		value: field.default
	}));

	function validate() {
		errors = {};
		for (const { key, type, value, allowedValues } of configData) {
			if (!formData[key] || (typeof formData[key] === 'string' && formData[key].trim() === '')) {
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
			parent.onClose();
		} else {
			console.log('Errors:', errors);
		}
	}

	// Initialize form data with default values
	$: formData = configData.reduce((acc, { key, value }) => {
		acc[key] = value;
		return acc;
	}, {});

	// Popup Tooltips
	const popupFeatured: PopupSettings = {
		event: 'hover',
		target: 'popupFeatured',
		placement: 'right'
	};
</script>

{#if $modalStore[0]}
	<div class="modal-example-fullscreen {cBase}">
		<div class="flex flex-col items-center space-y-4">
			<h2 class="h2 capitalize text-tertiary-500 dark:text-primary-500">{title}</h2>
			<p>{description}</p>
			<form on:submit|preventDefault={handleSubmit} class="wrapper w-full max-w-lg">
				{#each configData as { key, value, type, helper, icon, allowedValues }}
					<div class="mb-4">
						<label class="mb-2 block" for={key}>
							<iconify-icon {icon} width="18" class="mr-2 text-tertiary-500 dark:text-primary-500" />
							{key}

							<button use:popup={popupFeatured} class="btn-sm ml-2 p-0">
								<iconify-icon icon="mdi:help-circle-outline" width="18" class=" text-gray-600" />
							</button>

							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled z-50 max-w-sm p-2" data-popup="popupFeatured">
								{helper}
								<div class="variant-filled arrow" />
							</div>
						</label>

						{#if allowedValues}
							<select id={key} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]}>
								{#each allowedValues as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else if type === 'boolean'}
							<input type="checkbox" id={key} class="input text-tertiary-500 dark:text-primary-500" bind:checked={formData[key]} />
						{:else if type === 'number'}
							<input type="number" id={key} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]} />
						{:else}
							<input type="text" id={key} class="input text-tertiary-500 dark:text-primary-500" bind:value={formData[key]} />
						{/if}
						{#if errors[key]}
							<p class="text-xs italic text-error-500">{errors[key]}</p>
						{/if}
					</div>
				{/each}
				<div class="flex justify-between space-x-4">
					<button type="button" class="variant-filled btn" on:click={parent.onClose}>Close</button>
					<button type="submit" class="variant-filled btn">Save</button>
				</div>
			</form>
		</div>
	</div>
{/if}
