<script lang="ts">
	import { run, preventDefault } from 'svelte/legacy';

	import type { SvelteComponent } from 'svelte';
	import { privateConfigCategories, publicConfigCategories } from '@root/config/guiConfig';
	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();
	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex justify-center items-center';

	let formData = $state({});
	let errors = $state({});

	interface Props {
		parent: SvelteComponent;
		title: string;
		configCategory: string;
		description: string;
		isPrivate: boolean;
	}

	let {
		parent,
		title,
		configCategory,
		description,
		isPrivate
	}: Props = $props();

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

	// Determine the category config based on whether it's private or public
	const categoryConfig: ConfigCategory = isPrivate ? privateConfigCategories[configCategory] : publicConfigCategories[configCategory];

	// Merge actual configuration values with defaults
	const configData = Object.entries(categoryConfig.fields).map(([key, field]: [string, ConfigField<any>]) => ({
		key,
		...field,
		value: actualConfig[key] !== undefined ? actualConfig[key] : field.default
	}));

	console.log('Config Data:', configData);

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

	// Initialize form data with actual values or defaults
	run(() => {
		formData = configData.reduce((acc, { key, value }) => {
			acc[key] = value;
			return acc;
		}, {});
	});

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
				<h2 class="h2 mb-2 capitalize text-tertiary-500 dark:text-primary-500">{title} Setup:</h2>
				<p>{description}</p>
			</div>
			<form onsubmit={preventDefault(handleSubmit)} class="wrapper w-full flex-grow overflow-y-auto p-4">
				{#each configData as { key, value, type, helper, icon, allowedValues }}
					<div class="mb-4">
						<label class="mb-2 block" for={key}>
							<iconify-icon {icon} width="18" class="mr-2 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{key}
							<span use:popup={getPopupSettings(key)} class=" ml-2 p-0">
								<iconify-icon icon="mdi:help-circle-outline" width="18" class=" text-gray-600"></iconify-icon>
							</span>

							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled z-50 max-w-sm p-2" data-popup={`popup${key}`}>
								{helper}
								<div class="variant-filled arrow"></div>
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
							<p class="text-xs italic text-error-500">{errors[key]}</p>
						{/if}
					</div>
				{/each}
			</form>
			<div class="bg-surface-100-800-token sticky bottom-0 z-10 m-2 flex w-full justify-between py-2">
				<button type="button" class="variant-filled btn" onclick={parent.onClose}>{m.button_cancel()}</button>
				<button type="submit" class="variant-filled btn">{m.button_save()}</button>
			</div>
		</div>
	</div>
{/if}
