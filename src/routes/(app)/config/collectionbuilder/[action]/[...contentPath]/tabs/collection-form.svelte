<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-form.svelte
@component Collection Definition — Tab 1: name, db_name, description, icon
 -->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		builder_help_collection_tags,
		builder_help_dbname,
		builder_help_definition,
		builder_help_description,
		builder_help_favorite,
		builder_help_icon,
		builder_help_identity,
		builder_help_name,
		builder_help_org_tags,
		builder_help_suggested_tags,
		builder_help_visual,
		builder_tip_def_dbname,
		builder_tip_def_description,
		builder_tip_def_favorite,
		builder_tip_def_icon,
		builder_tip_def_identity,
		builder_tip_def_name,
		builder_tip_def_step,
		builder_tip_def_suggested_tags,
		builder_tip_def_tags,
		builder_tip_def_tags_input,
		builder_tip_def_visual,
		collection_description_placeholder,
		collection_name,
		collection_name_placeholder,
		collectionname_description,
		collectionname_labelicon
	} from '@src/paraglide/messages';

	import { collections, setCollection } from '@src/stores/collection-store.svelte';
	import IconifyIconsPicker from '@src/components/iconify-icons-picker.svelte';
	import Input from '@src/components/ui/input.svelte';
	import Button from '@src/components/ui/button.svelte';
	import Card from '@src/components/ui/card.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import { collectionMetadata, getTagColor } from '@src/stores/collection-metadata-store.svelte';

	let { data = $bindable(null), syncKey = '' } = $props();

	let searchQuery = $state('');
	let selectedIcon = $state(data?.icon || collections.active?.icon || 'bi:collection');

	let name = $state(data?.name ?? '');
	let description = $state(data?.description ?? '');
	// One-time mount seed: the sync effect below owns every later `syncKey` change.
	let lastSyncedKey = $state<string | null>(untrack(() => syncKey));

	const targetId = $derived(
		String(
			data?._id || collections.active?._id || (name ? name.toLowerCase().replace(/\s+/g, '_') : '')
		)
	);
	let tagsInput = $state('');
	const currentTags = $derived(targetId ? collectionMetadata.getTags(targetId) : []);
	const isFavorite = $derived(targetId ? collectionMetadata.isFavorite(targetId) : false);
	const allWorkspaceTags = $derived(collectionMetadata.getAllUniqueTags());
	const suggestedTags = $derived(allWorkspaceTags.filter((t) => !currentTags.includes(t)));

	$effect(() => {
		if (targetId) {
			tagsInput = collectionMetadata.getTags(targetId).join(', ');
		}
	});

	function handleTagsBlur() {
		if (!targetId) return;
		const parsed = tagsInput
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		collectionMetadata.setTags(targetId, parsed);
		tagsInput = parsed.join(', ');
	}

	function removeTag(tag: string) {
		if (!targetId) return;
		collectionMetadata.removeTag(targetId, tag);
		tagsInput = collectionMetadata.getTags(targetId).join(', ');
	}

	function addSuggestedTag(tag: string) {
		if (!targetId) return;
		collectionMetadata.addTag(targetId, tag);
		tagsInput = collectionMetadata.getTags(targetId).join(', ');
	}

	function toggleFavorite() {
		if (!targetId) return;
		collectionMetadata.toggleFavorite(targetId);
	}

	// Sync from route-loaded data when target changes
	$effect(() => {
		const currentSyncKey = syncKey;

		if (currentSyncKey && currentSyncKey !== lastSyncedKey) {
			lastSyncedKey = currentSyncKey;
			const fromData = untrack(() => data);
			const fromStore = untrack(() => collections.active);
			name = fromData?.name ?? '';
			description = fromData?.description ?? '';
			const iconValue =
				(fromData?.icon != null && String(fromData.icon).trim()) ||
				(fromStore?.icon != null && String(fromStore.icon).trim()) ||
				'bi:collection';
			selectedIcon = iconValue;
		}
	});

	let isDbNameManuallyEdited = $state(!!(data?._id || collections.active?._id));
	let dbNameValue = $state(data?._id || collections.active?._id || '');

	$effect(() => {
		if (!isDbNameManuallyEdited) {
			dbNameValue = name
				? name
						.toLowerCase()
						.replace(/\s+/g, '_')
						.replace(/[^a-z0-9_]/g, '')
				: '';
		}
	});

	function handleDbNameInput(e: Event) {
		const target = e.target as HTMLInputElement;
		dbNameValue = target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
		isDbNameManuallyEdited = true;
	}

	function handleDbNameBlur() {
		if (!dbNameValue.trim()) {
			isDbNameManuallyEdited = false;
			dbNameValue = name
				? name
						.toLowerCase()
						.replace(/\s+/g, '_')
						.replace(/[^a-z0-9_]/g, '')
				: '';
		}
	}

	// Sync all fields into the collection store (include slug for save action)
	$effect(() => {
		const currentName = name;
		const currentDbName = dbNameValue;
		const currentDescription = description;
		const currentIcon = selectedIcon || 'bi:collection';
		const currentSlug = currentDbName
			? currentName
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')
			: '';

		untrack(() => {
			const base = collections.active ?? {
				name: '',
				icon: 'bi:collection',
				status: 'unpublish',
				fields: [],
				slug: ''
			};
			if (
				base.name === currentName &&
				base._id === currentDbName &&
				base.description === currentDescription &&
				base.icon === currentIcon &&
				base.slug === currentSlug
			)
				return;

			setCollection({
				...base,
				_id: currentDbName,
				name: currentName,
				description: currentDescription,
				icon: currentIcon,
				slug: currentSlug || base.slug
			});
		});
	});
</script>

<div class="space-y-6">
	<!-- Section Header -->
	<div class="flex items-center gap-3">
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-900/20 dark:text-primary-500"
		>
			<iconify-icon icon="mdi:information-outline" width="24"></iconify-icon>
		</div>
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-bold text-surface-900 dark:text-surface-100">
					Collection Definition
				</h2>
				<SystemTooltip title={builder_tip_def_step()}>
					<HelpIcon ariaLabel={builder_help_definition()} />
				</SystemTooltip>
			</div>
			<p class="text-sm text-surface-500 dark:text-surface-400">
				Step 1: Set up the core identity of your collection. Provide a unique name, choose an icon,
				and optionally add tags and a description.
			</p>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<!-- Left: Name & Database ID -->
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h3
					class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2"
				>
					<iconify-icon icon="mdi:form-textbox" width="18" class="text-tertiary-500"></iconify-icon>
					Identity
				</h3>
				<SystemTooltip title={builder_tip_def_identity()}>
					<HelpIcon ariaLabel={builder_help_identity()} />
				</SystemTooltip>
			</div>

			<div class="space-y-4">
				<div class="space-y-2">
					<div class="flex items-center gap-1.5">
						<label
							for="collection-name-input"
							class="text-sm font-medium leading-none text-surface-600 dark:text-surface-400"
						>
							{collection_name()}
						</label>
						<span class="text-error-500" aria-hidden="true">*</span>
						<SystemTooltip title={builder_tip_def_name()}>
							<HelpIcon ariaLabel={builder_help_name()} />
						</SystemTooltip>
					</div>
					<Input
						id="collection-name-input"
						bind:value={name}
						placeholder={collection_name_placeholder()}
						required
						aria-label={collection_name()}
						data-testid="collection-name-input"
					/>
				</div>

				{#if name}
					<div class="space-y-1 mt-6">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-surface-600 dark:text-surface-400">
								Database Name
							</span>
							<SystemTooltip title={builder_tip_def_dbname()}>
								<HelpIcon ariaLabel={builder_help_dbname()} />
							</SystemTooltip>
						</div>
						<Input
							type="text"
							value={dbNameValue}
							oninput={handleDbNameInput}
							onblur={handleDbNameBlur}
							class="font-mono text-sm font-bold text-tertiary-600 dark:text-primary-500"
							aria-label="Database Name"
						/>
						<p class="text-[11px] text-surface-500 dark:text-surface-400">
							Auto-generated from collection name — used as the database table name
						</p>
					</div>
				{/if}
			</div>
		</Card>

		<!-- Right: Icon & Description -->
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<h3
					class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2"
				>
					<iconify-icon icon="mdi:palette-outline" width="18" class="text-tertiary-500"
					></iconify-icon>
					Visual Identity
				</h3>
				<SystemTooltip title={builder_tip_def_visual()}>
					<HelpIcon ariaLabel={builder_help_visual()} />
				</SystemTooltip>
			</div>

			<div class="space-y-5">
				<div class="space-y-2">
					<div class="flex items-center gap-1.5">
						<span class="text-sm font-medium leading-none text-surface-600 dark:text-surface-400"
							>{collectionname_labelicon()}</span
						>
						<SystemTooltip title={builder_tip_def_icon()}>
							<HelpIcon ariaLabel={builder_help_icon()} />
						</SystemTooltip>
					</div>
					<IconifyIconsPicker
						bind:iconselected={selectedIcon}
						icon={selectedIcon}
						bind:searchQuery
					/>
				</div>

				<div class="space-y-2">
					<div class="flex items-center gap-1.5">
						<label
							for="description"
							class="text-sm font-medium leading-none text-surface-600 dark:text-surface-400"
							>{collectionname_description()}</label
						>
						<SystemTooltip title={builder_tip_def_description()}>
							<HelpIcon ariaLabel={builder_help_description()} />
						</SystemTooltip>
					</div>
					<textarea
						id="description"
						aria-label={collectionname_description()}
						bind:value={description}
						placeholder={collection_description_placeholder()}
						title={collectionname_description()}
						class="w-full rounded border border-surface-500/30 dark:border-surface-500/40 bg-white dark:bg-surface-900 p-3 text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary-500 dark:focus-visible:ring-primary-500 resize-none min-h-32"
					></textarea>
				</div>
			</div>
		</Card>

		<!-- Bottom: Organization & Tags -->
		<Card class="p-6 md:col-span-2">
			<div class="flex items-center justify-between mb-4">
				<h3
					class="text-base font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2"
				>
					<iconify-icon icon="mdi:tag-multiple-outline" width="18" class="text-tertiary-500"
					></iconify-icon>
					Organization & Tags
				</h3>
				<SystemTooltip title={builder_tip_def_tags()}>
					<HelpIcon ariaLabel={builder_help_org_tags()} />
				</SystemTooltip>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
				<!-- Tags Manager -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5">
							<label
								for="collection-tags-input"
								class="text-sm font-medium leading-none text-surface-500 dark:text-surface-50"
							>
								Collection Tags
							</label>
							<SystemTooltip title={builder_tip_def_tags_input()}>
								<HelpIcon ariaLabel={builder_help_collection_tags()} />
							</SystemTooltip>
						</div>
						<span class="text-[11px] text-surface-400"
							>Comma-separated tags for grouping & filtering</span
						>
					</div>

					<Input
						id="collection-tags-input"
						bind:value={tagsInput}
						placeholder="e.g. news, featured, press, marketing"
						onblur={handleTagsBlur}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleTagsBlur();
							}
						}}
						aria-label="Collection Tags"
					/>

					{#if currentTags.length > 0}
						<div class="flex flex-wrap gap-1.5 pt-1">
							{#each currentTags as tag (tag)}
								{@const color = getTagColor(tag)}
								<span
									class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full {color.bg} {color.text} border {color.border}"
								>
									{tag}
									<Button
										variant="ghost"
										size="sm"
										type="button"
										onclick={() => removeTag(tag)}
										class="rounded-full p-0.5 hover:text-error-500 transition-colors"
										aria-label="Remove tag {tag}">&times;</Button
									>
								</span>
							{/each}
						</div>
					{/if}

					{#if suggestedTags.length > 0}
						<div class="pt-2">
							<div class="flex items-center gap-1.5 mb-1.5">
								<span class="text-[11px] font-bold uppercase tracking-wider text-surface-400 block">
									Suggested Tags
								</span>
								<SystemTooltip title={builder_tip_def_suggested_tags()}>
									<HelpIcon ariaLabel={builder_help_suggested_tags()} />
								</SystemTooltip>
							</div>
							<div class="flex flex-wrap gap-1">
								{#each suggestedTags as stag (stag)}
									<Button
										variant="outline"
										size="sm"
										type="button"
										onclick={() => addSuggestedTag(stag)}
										class="text-xs px-2 py-0.5 rounded-md"
										aria-label="Add suggested tag {stag}"
									>
										+ {stag}
									</Button>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Favorite Quick Access -->
				<div
					class="rounded-xl border border-surface-500/30 dark:border-surface-500/40 bg-surface-500/10 dark:bg-surface-800 p-4 space-y-3"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<iconify-icon
								icon={isFavorite ? 'bi:star-fill' : 'bi:star'}
								width="22"
								class={isFavorite ? 'text-warning-500' : 'text-surface-400'}
							></iconify-icon>
							<div>
								<div class="flex items-center gap-1.5">
									<h4 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
										Favorite Collection
									</h4>
									<SystemTooltip title={builder_tip_def_favorite()}>
										<HelpIcon ariaLabel={builder_help_favorite()} />
									</SystemTooltip>
								</div>
								<p class="text-xs text-surface-500 dark:text-surface-400">
									Pin to Favorites filter chip in sidebar and builder board
								</p>
							</div>
						</div>

						<Button
							variant={isFavorite ? 'warning' : 'outline'}
							size="sm"
							type="button"
							onclick={toggleFavorite}
							class="flex items-center gap-1.5 rounded-full"
							aria-label={isFavorite ? 'Favorited collection' : 'Add collection to favorites'}
						>
							<iconify-icon icon={isFavorite ? 'bi:star-fill' : 'bi:star'} width="14"
							></iconify-icon>
							<span>{isFavorite ? 'Favorited' : 'Add to Favorites'}</span>
						</Button>
					</div>
				</div>
			</div>
		</Card>
	</div>
</div>
