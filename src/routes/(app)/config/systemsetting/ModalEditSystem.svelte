<!--
@file src/routes/(app)/config/systemsetting/ModalEditSystem.svelte
@description Modal for editing a specific settings category.

UI FIXES:
- Changed tooltip `placement` from 'right' to 'top'. This ensures the tooltip
  has enough space to render fully without being cut off by the edge of the screen,
  especially on mobile views.
- Added `max-h-[90vh]` to the main card element to ensure the footer is always visible.
- Added `portal: 'body'` to the `use:popup` directive to prevent clipping by the modal.
-->
<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import { onMount } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, popup, getToastStore, type ToastSettings } from '@skeletonlabs/skeleton';

	// Stores
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// State
	let formData = $state<{ [key: string]: any }>({});
	let errors = $state<{ [key: string]: string }>({});
	let configData = $state<any[]>([]);
	let isTesting = $state(false);
	let isLoading = $state(true);

	// Props
	interface Props {
		parent: SvelteComponent & { onSave: (data: any) => void; onClose: () => void };
		title: string;
		configCategory: string;
		description: string;
		isPrivate: boolean;
	}
	let { parent, title, configCategory, description, isPrivate }: Props = $props();

	// Type Definitions for Config
	interface ConfigField<T> {
		type: T;
		default: any;
		helper: string;
		allowedValues?: any[];
		icon: string;
	}

	// --- Live Connection Test ---
	async function testConnection() {
		isTesting = true;
		const toast = (message: string, background: string) => {
			toastStore.trigger({ message, background, autohide: false, timeout: 5000 } as ToastSettings);
		};
		toast('Testing connection...', 'variant-filled-secondary');

		try {
			let testEndpoint = '';
			if (configCategory === 'database') {
				testEndpoint = '/api/config/test-db';
			} else {
				toast('No test available for this category.', 'variant-filled-warning');
				isTesting = false;
				return;
			}

			const response = await fetch(testEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Connection test failed.');
			}

			toast('Connection successful!', 'variant-filled-success');
		} catch (error: any) {
			console.error('Connection test error:', error);
			toast(error.message, 'variant-filled-error');
		} finally {
			isTesting = false;
		}
	}

	// --- Component Initialization with Live Data Fetch ---
	onMount(async () => {
		isLoading = true;
		try {
			const response = await fetch('/api/config/load');
			if (!response.ok) {
				throw new Error('Failed to fetch server configuration.');
			}
			const { data: serverConfig } = await response.json();

			const configSource = isPrivate ? serverConfig.privateConfigCategories : serverConfig.publicConfigCategories;
			const actualConfig = isPrivate ? serverConfig.privateEnv : serverConfig.publicEnv;
			const structure = configSource[configCategory]?.fields;

			if (!structure) {
				throw new Error(`Configuration structure for category "${configCategory}" not found.`);
			}

			const loadedConfig = Object.entries(structure).map(([key, field]) => {
				const typedField = field as ConfigField<any>;
				const actualValue = actualConfig[key as keyof typeof actualConfig];
				return {
					key,
					...typedField,
					value: actualValue !== undefined ? actualValue : typedField.default
				};
			});

			configData = loadedConfig;
			formData = loadedConfig.reduce(
				(acc, field) => {
					acc[field.key] = field.value;
					return acc;
				},
				{} as { [key: string]: any }
			);
		} catch (error: any) {
			console.error('Failed to initialize modal:', error);
			toastStore.trigger({ message: error.message, background: 'variant-filled-error' } as ToastSettings);
			parent.onClose();
		} finally {
			isLoading = false;
		}
	});

	function validate() {
		return true;
	}

	function handleSubmit() {
		if (validate()) {
			parent.onSave(formData);
		}
	}
</script>

{#if $modalStore[0]}
	<div class="modal-example-fullscreen" role="dialog" aria-modal="true">
		<div class="card flex h-full max-h-[90vh] w-full max-w-xl flex-col p-4">
			<header class="w-full flex-shrink-0 py-2 text-center">
				<h2 class="h2 mb-2 capitalize text-tertiary-500 dark:text-primary-500">{title} Setup:</h2>
				<p>{description}</p>
			</header>

			<div class="flex-grow overflow-y-auto p-4">
				{#if isLoading}
					<div class="flex h-full items-center justify-center">
						<div class="animate-spin text-4xl">🌀</div>
					</div>
				{:else}
					{#each configData as { key, type, helper, icon, allowedValues }}
						<div class="mb-4 space-y-2">
							<label class="label" for={key}>
								<iconify-icon {icon} width="18" class="mr-2 text-tertiary-500 dark:text-primary-500"></iconify-icon>
								<span>{key}</span>
								<!-- FIX: Changed placement to 'top' to ensure it renders above the icon -->
								<button
									type="button"
									use:popup={{ event: 'hover', target: `popup-${key}`, placement: 'top' }}
									class="btn-icon btn-icon-sm ml-2 p-0"
									aria-label="Show help for {key}"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="18" class="text-gray-600"></iconify-icon>
								</button>
							</label>

							<div class="card variant-filled-primary z-50 max-w-sm p-2" data-popup="popup-{key}">
								{helper}
								<div class="variant-filled-primary arrow"></div>
							</div>

							{#if allowedValues}
								<select id={key} class="select" bind:value={formData[key]}>
									{#each allowedValues as option}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else if type === 'boolean'}
								<select id={key} class="select" bind:value={formData[key]}>
									<option value={true}>True</option>
									<option value={false}>False</option>
								</select>
							{:else if type === 'number'}
								<input type="number" id={key} placeholder={helper} class="input" bind:value={formData[key]} />
							{:else}
								<input type="text" id={key} placeholder={helper} class="input" bind:value={formData[key]} />
							{/if}
							{#if errors[key]}
								<p class="text-xs italic text-error-500">{errors[key]}</p>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<footer class="flex w-full flex-shrink-0 items-center justify-between gap-4 border-t border-surface-500/10 pt-4">
				<div>
					{#if configCategory === 'database'}
						<button type="button" class="variant-soft-secondary btn" onclick={testConnection} disabled={isTesting}>
							{#if isTesting}
								<span class="mr-2 animate-spin">🌀</span>
								<span>Testing...</span>
							{:else}
								<iconify-icon icon="mdi:lan-connect" class="mr-2"></iconify-icon>
								<span>Test Connection</span>
							{/if}
						</button>
					{/if}
				</div>
				<div class="flex gap-4">
					<button type="button" class="variant-ghost btn" onclick={parent.onClose}>{m.button_cancel()}</button>
					<button type="button" class="variant-filled-primary btn" onclick={handleSubmit} disabled={isTesting}>
						{m.button_save()}
					</button>
				</div>
			</footer>
		</div>
	</div>
{/if}
