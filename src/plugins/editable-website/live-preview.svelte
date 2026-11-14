<!--
 @file src/plugins/editable-website/live-preview.svelte
 @component Live Preview with bidirectional handshake and visual editing.
 Securely syncs CMS state with an external website preview using Svelte 5 runes.

 Uses collection schema livePreview / previewTargetUrl for dynamic origin resolution.
 Signs ephemeral preview tokens via /api/preview/authorize.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Loader from '@components/ui/loader.svelte';
	import UpgradePrompt from '@components/ui/upgrade-prompt.svelte';
	import Badge from '@components/ui/badge.svelte';
	import type { User } from '@auth/types';
	import type { CollectionEntry, Schema } from '@src/content/types';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@src/utils/logger';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { formatTime } from '@utils/format-date';
	import { saveEntry } from '@utils/entry-actions';
	import { fade } from 'svelte/transition';

	import {
		EDITABLE_WEBSITE_EXTENSION_ID,
		EDITABLE_WEBSITE_PRICE,
		fetchEditableWebsiteLicense,
		type EditableWebsiteLicenseView
	} from './license-gate';
	import {
		dispatchPreviewUpdate,
		fieldNameFromElement,
		isCmsInboundMessage,
		isCompatibleProtocolVersion,
		mergePreviewEdits,
		PREVIEW_PROTOCOL_VERSION,
		resolveFrameTargetOrigin
	} from './protocol';
	import type { CmsEditModeMessage, CmsFieldSelectMessage, CmsUpdateMessage } from './types';

	interface Props {
		collection: { value: Schema } | Schema;
		contentLanguage: string;
		currentCollectionValue: CollectionEntry;
		tenantId: string;
		user: User;
		active?: boolean;
	}

	let {
		collection,
		contentLanguage,
		currentCollectionValue,
		tenantId,
		active = false
	}: Props = $props();

	let iframeEl = $state<HTMLIFrameElement | null>(null);
	// Split Canvas renders a second iframe; both frames must receive every message.
	let mobileIframeEl = $state<HTMLIFrameElement | null>(null);
	let isConnected = $state(false);
	let visualEditingEnabled = $state(true);
	let previewWidth = $state('100%');
	let authorizedUrl = $state('');
	let isLoadingUrl = $state(false);
	let shouldRender = $state(false);
	let pendingPreviewEdits = $state(0);
	let lastSyncSource = $state<'visual' | 'form' | null>(null);
	let authError = $state<string | null>(null);
	// Trailing coalescer for form → preview pushes (one post per burst, not per keystroke).
	let syncTimer: ReturnType<typeof setTimeout> | null = null;
	// Preview → entry persistence (the workflow gate still applies through saveEntry).
	const AUTOSAVE_KEY = 'svelty:preview:autosave';
	let autoSaveEnabled = $state(
		typeof localStorage !== 'undefined' && localStorage.getItem(AUTOSAVE_KEY) === '1'
	);
	let autoSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let autoSaveAt = $state('');
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let isSavingLive = $state(false);
	let licenseStatus = $state<EditableWebsiteLicenseView & { loaded: boolean }>({
		active: false,
		daysRemaining: null,
		loaded: false
	});

	const licenseActive = $derived(licenseStatus.loaded && licenseStatus.active);

	function setAutoSave(enabled: boolean) {
		autoSaveEnabled = enabled;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(AUTOSAVE_KEY, enabled ? '1' : '0');
		}
		if (!enabled && autoSaveTimer) {
			clearTimeout(autoSaveTimer);
			autoSaveTimer = null;
		}
		autoSaveStatus = 'idle';
	}

	/**
	 * Persist the current entry through the normal save lane so the publication
	 * workflow, required-field checks and audit hooks all still run. Autosave
	 * never raises the status; the explicit Publish action does.
	 */
	async function persistLive(data: Record<string, unknown>, publish = false): Promise<boolean> {
		if (isSavingLive) return false;
		isSavingLive = true;
		autoSaveStatus = 'saving';
		try {
			const ok = await saveEntry(data, publish, { silent: true });
			autoSaveStatus = ok ? 'saved' : 'error';
			if (ok) autoSaveAt = formatTime(new Date(), contentLanguage);
			return ok;
		} catch (err) {
			logger.error('[Live Preview] Auto-save failed', { error: err });
			autoSaveStatus = 'error';
			return false;
		} finally {
			isSavingLive = false;
		}
	}

	function scheduleAutoSave(data: Record<string, unknown>) {
		if (!autoSaveEnabled) return;
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(() => {
			autoSaveTimer = null;
			void persistLive(data);
		}, 900);
	}

	async function publishNow() {
		const ok = await persistLive(currentCollectionValue as Record<string, unknown>, true);
		if (ok) toast.success('Published to the live site');
	}

	$effect(() => {
		let cancelled = false;
		fetchEditableWebsiteLicense().then((status) => {
			if (!cancelled) {
				licenseStatus = { ...status, loaded: true };
			}
		});
		return () => {
			cancelled = true;
		};
	});

	const resolvedSchema = $derived.by(() => {
		if (!collection) return undefined;
		if (
			typeof collection === 'object' &&
			'value' in collection &&
			(collection as { value: Schema }).value
		) {
			return (collection as { value: Schema }).value as Schema & { previewTargetUrl?: string };
		}
		return collection as Schema & { previewTargetUrl?: string };
	});

	const livePreviewPattern = $derived.by(() => {
		const schema = resolvedSchema;
		if (!schema) return publicEnv.HOST_PROD || 'http://localhost:5173';
		if (schema.previewTargetUrl) return schema.previewTargetUrl;
		if (typeof schema.livePreview === 'string') return schema.livePreview;
		if (schema.livePreview === true) return '/{slug}?lang={lang}';
		return publicEnv.HOST_PROD || 'http://localhost:5173';
	});

	const previewTargetUrl = $derived(livePreviewPattern);

	const allowedOrigins = $derived(
		[
			previewTargetUrl,
			publicEnv.HOST_PROD,
			publicEnv.HOST_DEV,
			// Dev-only: never widen the accepted message origin in production.
			import.meta.env.DEV ? 'http://localhost:5173' : null
		]
			.filter(Boolean)
			.map((url) => {
				try {
					const fallbackOrigin =
						typeof window !== 'undefined'
							? window.location.origin
							: publicEnv.HOST_PROD || (import.meta.env.DEV ? 'http://localhost:5173' : '');
					const normalized = url!.startsWith('http') ? url! : `${fallbackOrigin}${url}`;
					return new URL(normalized).origin;
				} catch {
					return null;
				}
			})
			.filter(Boolean) as string[]
	);

	async function refreshAuthorizedUrl() {
		if (!shouldRender || !currentCollectionValue || !licenseActive) return;

		isLoadingUrl = true;
		authError = null;
		try {
			const res = await fetch('/api/preview/authorize', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					schema: resolvedSchema,
					entry: currentCollectionValue,
					contentLanguage,
					tenantId,
					previewTargetUrl: livePreviewPattern
				})
			});

			if (res.ok) {
				const { previewUrl } = await res.json();
				if (typeof previewUrl === 'string' && previewUrl) {
					authorizedUrl = previewUrl;
				} else {
					authError =
						'The preview service returned no URL. Check PREVIEW_SECRET and PREVIEW_BASE_URL.';
					authorizedUrl = '';
				}
			} else if (res.status === 403) {
				licenseStatus = { active: false, daysRemaining: 0, loaded: true };
				authorizedUrl = '';
				toast.error('Live Preview requires an active Editable Website license or trial');
			} else if (res.status === 401) {
				authError = 'Your session expired. Sign in again to start Live Preview.';
				authorizedUrl = '';
			} else {
				logger.error('Preview authorize failed', { status: res.status });
				authError = `Preview authorization failed (HTTP ${res.status}).`;
				authorizedUrl = '';
			}
		} catch (err) {
			logger.error('Failed to generate secure preview URL', { error: err });
			authError = 'Could not reach the preview service. Check your connection and retry.';
			authorizedUrl = '';
		} finally {
			isLoadingUrl = false;
		}
	}

	$effect(() => {
		if (active && !shouldRender) {
			shouldRender = true;
		}
	});

	$effect(() => {
		if (shouldRender && (currentCollectionValue?._id || currentCollectionValue?.slug)) {
			// Re-authorize when the entry, language, target pattern or tenant changes.
			void contentLanguage;
			void livePreviewPattern;
			void tenantId;
			refreshAuthorizedUrl();
		}
	});

	function frameTargets(): HTMLIFrameElement[] {
		return [iframeEl, mobileIframeEl].filter(
			(frame): frame is HTMLIFrameElement => !!frame?.contentWindow
		);
	}

	function previewTargetOrigin(): string | null {
		return resolveFrameTargetOrigin(authorizedUrl, publicEnv.HOST_DEV || 'http://localhost:5173');
	}

	function sendUpdate() {
		if (!isConnected || !authorizedUrl) return;
		const targetOrigin = previewTargetOrigin();
		// Never fall back to "*": a missing origin would broadcast the entry to any embedder.
		if (!targetOrigin) return;
		const frames = frameTargets();
		if (frames.length === 0) return;

		const message: CmsUpdateMessage = {
			type: 'svelty:update',
			collection: resolvedSchema?.name || resolvedSchema?._id || 'unknown',
			data: currentCollectionValue as Record<string, unknown>
		};
		const editModeMsg: CmsEditModeMessage = {
			type: 'svelty:edit-mode',
			enabled: visualEditingEnabled
		};

		// Split Canvas has two frames; both must stay in sync.
		for (const frame of frames) {
			frame.contentWindow!.postMessage(message, targetOrigin);
			frame.contentWindow!.postMessage(editModeMsg, targetOrigin);
		}
	}

	/** Coalesce rapid form edits into one push (trailing, 60 ms). */
	function scheduleSync() {
		if (!isConnected || !shouldRender || !currentCollectionValue) return;
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			syncTimer = null;
			sendUpdate();
		}, 60);
	}

	/** CMS → preview: highlight the element for the focused form field. */
	function postFieldSelect(fieldName: string) {
		const targetOrigin = previewTargetOrigin();
		if (!targetOrigin) return;
		const message: CmsFieldSelectMessage = { type: 'svelty:field:select', fieldName };
		for (const frame of frameTargets()) {
			frame.contentWindow!.postMessage(message, targetOrigin);
		}
	}

	$effect(() => {
		// Track the entry so any edit retriggers; the timer coalesces the burst.
		void currentCollectionValue;
		if (isConnected && shouldRender) {
			lastSyncSource = 'form';
			scheduleSync();
		}
	});

	// Flush a pending push when the tab unmounts so the last edit is not lost.
	$effect(() => {
		return () => {
			if (syncTimer) {
				clearTimeout(syncTimer);
				syncTimer = null;
				sendUpdate();
			}
			if (autoSaveTimer) {
				clearTimeout(autoSaveTimer);
				autoSaveTimer = null;
			}
		};
	});

	function applyPreviewEdits(msg: Parameters<typeof mergePreviewEdits>[1]) {
		const merged = mergePreviewEdits(currentCollectionValue as Record<string, unknown>, msg);
		pendingPreviewEdits++;
		lastSyncSource = 'visual';
		dispatchPreviewUpdate({
			data: merged,
			fieldName: msg.type === 'svelty:document:update' ? msg.fieldName : undefined,
			source: 'visual'
		});
		if (autoSaveEnabled) {
			scheduleAutoSave(merged);
			toast.info('Preview changes synced — auto-saving to the entry');
		} else {
			toast.info('Preview changes synced to editor — save to persist');
		}
	}

	function handleMessage(event: MessageEvent) {
		if (!allowedOrigins.includes(event.origin)) return;
		if (!isCmsInboundMessage(event.data)) return;

		const data = event.data;

		if (data.type === 'svelty:init') {
			isConnected = true;
			if (!isCompatibleProtocolVersion(data.version, PREVIEW_PROTOCOL_VERSION)) {
				toast.warning(
					`Preview bridge ${String(data.version)} does not match CMS protocol ${PREVIEW_PROTOCOL_VERSION}. Update the site starter and the plugin together.`
				);
			}
			sendUpdate();
			logger.info('[Live Preview] Handshake completed', {
				version: data.version || 'unknown'
			});
		}

		if (data.type === 'svelty:navigate') {
			// The preview cancels navigation; tell the editor instead of failing silently.
			toast.info('Navigation is paused inside Live Preview — use Open to visit the page.');
		}

		if (data.type === 'svelty:field:click' && visualEditingEnabled) {
			document.dispatchEvent(
				new CustomEvent('svelty:focus-field', {
					detail: { fieldName: data.fieldName },
					bubbles: true,
					composed: true
				})
			);
		}

		if (data.type === 'svelty:save' || data.type === 'svelty:document:update') {
			applyPreviewEdits(data);
		}
	}

	$effect(() => {
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	});

	// Reverse direction: focusing a CMS field highlights the matching element in
	// the preview (the site-side listener handles `svelty:field:select`).
	$effect(() => {
		if (!shouldRender || !isConnected || !visualEditingEnabled) return;
		const handleFocus = (event: FocusEvent) => {
			const name = fieldNameFromElement(event.target as HTMLElement | null);
			if (!name) return;
			// Only mirror real entry fields (the form ids controls by db_fieldName).
			if (!(name in (currentCollectionValue as Record<string, unknown>))) return;
			postFieldSelect(name);
		};
		document.addEventListener('focusin', handleFocus);
		return () => document.removeEventListener('focusin', handleFocus);
	});

	$effect(() => {
		if (isConnected) {
			sendUpdate();
		}
	});

	function copyUrl() {
		if (authorizedUrl) {
			navigator.clipboard.writeText(authorizedUrl);
			toast.success('Preview URL copied to clipboard');
		}
	}

	function pushToPreview() {
		sendUpdate();
		toast.success('Changes pushed to preview');
	}
</script>

{#snippet previewError()}
	<div class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
		<iconify-icon icon="mdi:alert-circle-outline" width="32" class="text-error-500"></iconify-icon>
		<p class="text-sm text-surface-500">{authError}</p>
		<Button variant="primary" size="sm" onclick={() => refreshAuthorizedUrl()}>Retry</Button>
	</div>
{/snippet}

<div class="flex h-150 flex-col p-4">
	{#if !licenseStatus.loaded}
		<div class="flex flex-1 flex-col items-center justify-center gap-3">
			<Loader variant="circle" width="size-10" height="size-10" ariaLabel="Checking license" />
			<p class="text-sm text-surface-500">Checking Live Preview license…</p>
		</div>
	{:else if !licenseActive}
		<UpgradePrompt
			extensionId={EDITABLE_WEBSITE_EXTENSION_ID}
			price={`${EDITABLE_WEBSITE_PRICE} · 14-day trial`}
			title="Unlock visual frontpage editing"
			message="Your SvelteKit site and Svedit layout are included free. The Editable Website plugin adds Live Preview — edit hero, text, and CTA blocks inline from the CMS. Standard form editing works without a license."
			class="flex-1"
		/>
	{:else if !shouldRender}
		<div
			class="flex flex-1 flex-col items-center justify-center gap-4 rounded border border-dashed border-surface-500 bg-surface-500/10 dark:bg-surface-900/50"
		>
			<iconify-icon icon="mdi:eye-outline" width="48" class="text-surface-400"></iconify-icon>
			<div class="text-center">
				<p class="text-lg font-bold text-surface-600 dark:text-surface-400">Live Preview Ready</p>
				<p class="text-sm text-surface-500">
					Bidirectional sync · protocol v{PREVIEW_PROTOCOL_VERSION}
				</p>
				{#if licenseStatus.daysRemaining && licenseStatus.daysRemaining > 0 && !licenseStatus.hasLicense}
					<Badge variant="tertiary" size="sm">
						Trial · {licenseStatus.daysRemaining} day{licenseStatus.daysRemaining === 1 ? '' : 's'} left
					</Badge>
				{/if}
			</div>
			<Button variant="primary" onclick={() => (shouldRender = true)}>Start Preview</Button>
		</div>
	{:else}
		<div class="mb-4 flex items-center justify-between gap-3">
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<iconify-icon
					icon="mdi:open-in-new"
					width="20"
					class="text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
				<input
					aria-label="Preview URL"
					type="text"
					class="input grow truncate font-mono text-sm"
					readonly
					value={authorizedUrl}
					placeholder={isLoadingUrl ? 'Authorizing...' : 'URL not available'}
				/>
				<Button
					variant="outline"
					onclick={copyUrl}
					disabled={!authorizedUrl}
					title="Copy Preview URL"
					aria-label="Copy preview URL"
					size="sm"
					class="preset-outlined-surface-500"
				>
					<iconify-icon icon="mdi:content-copy" width={16}></iconify-icon>
				</Button>
			</div>

			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={pushToPreview}
					disabled={!isConnected}
					title="Push CMS changes to preview"
					aria-label="Push to preview"
				>
					<iconify-icon icon="mdi:sync" width={16}></iconify-icon>
					<span class="hidden sm:inline">Push</span>
				</Button>

				<Button
					variant={autoSaveEnabled ? 'primary' : 'outline'}
					size="sm"
					onclick={() => setAutoSave(!autoSaveEnabled)}
					aria-pressed={autoSaveEnabled}
					title="Auto-save preview edits to the entry"
					aria-label="Toggle auto-save"
				>
					<iconify-icon icon="mdi:content-save-autosize" width={16}></iconify-icon>
					<span class="hidden sm:inline">Auto-save</span>
				</Button>

				<Button
					variant="tertiary"
					size="sm"
					onclick={publishNow}
					disabled={!isConnected || isSavingLive}
					title="Publish this entry"
					aria-label="Publish entry"
				>
					<iconify-icon icon="mdi:rocket-launch-outline" width={16}></iconify-icon>
					<span class="hidden sm:inline">Publish</span>
				</Button>

				<Button
					variant="primary"
					onclick={() => (visualEditingEnabled = !visualEditingEnabled)}
					title="Toggle Click-to-Edit"
					aria-label="Toggle Click-to-Edit"
					size="sm"
					class={visualEditingEnabled ? '' : 'preset-soft-surface'}
				>
					<iconify-icon icon="mdi:cursor-default-click" width={16}></iconify-icon>
					<span class="hidden sm:inline">Visual Edit</span>
				</Button>

				<Button
					variant="primary"
					size="sm"
					href={authorizedUrl}
					target="_blank"
					rel="noopener noreferrer"
					disabled={!authorizedUrl}
				>
					<iconify-icon icon="mdi:open-in-new" width={16}></iconify-icon>
					<span class="hidden sm:inline">Open</span>
				</Button>
			</div>
		</div>

		<div class="mb-3 flex justify-center gap-1">
			{#each [{ label: 'Desktop', width: '100%', icon: 'mdi:monitor' }, { label: 'Tablet', width: '768px', icon: 'mdi:tablet' }, { label: 'Mobile', width: '375px', icon: 'mdi:cellphone' }, { label: 'Split Canvas', width: 'canvas', icon: 'mdi:view-parallel' }] as device (device.label)}
				<Button
					variant={previewWidth === device.width ? 'primary' : 'outline'}
					onclick={() => (previewWidth = device.width)}
					title={device.label}
					aria-label={device.label}
					size="sm"
					class="min-w-0 px-2"
				>
					<iconify-icon icon={device.icon} width={18}></iconify-icon>
					<span class="ms-1 hidden text-xs sm:inline">{device.label}</span>
				</Button>
			{/each}
		</div>

		<div
			class="relative flex-1 overflow-hidden rounded border border-surface-500/30 bg-surface-500/10 dark:bg-surface-900"
		>
			{#if previewWidth === 'canvas'}
				{#if authorizedUrl}
					<div class="flex h-full w-full gap-2 overflow-x-auto p-2">
						<!-- Desktop Viewport -->
						<div
							class="flex h-full min-w-145 flex-1 flex-col overflow-hidden rounded border border-surface-500/20 bg-white shadow-xs"
						>
							<div
								class="flex items-center justify-between border-b border-surface-500/10 bg-surface-500/10 px-2 py-1 text-[11px] font-medium text-surface-500"
							>
								<span>Desktop View</span>
								<span>Fluid</span>
							</div>
							<iframe
								bind:this={iframeEl}
								src={authorizedUrl}
								title="Desktop Live Preview"
								class="h-full w-full transition-opacity duration-500"
								style:opacity={active ? 1 : 0.3}
								sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
							></iframe>
						</div>
						<!-- Mobile Viewport -->
						<div
							class="flex h-full w-93.75 shrink-0 flex-col overflow-hidden rounded border border-surface-500/20 bg-white shadow-xs"
						>
							<div
								class="flex items-center justify-between border-b border-surface-500/10 bg-surface-500/10 px-2 py-1 text-[11px] font-medium text-surface-500"
							>
								<span>Mobile View</span>
								<span>375px</span>
							</div>
							<iframe
								bind:this={mobileIframeEl}
								src={authorizedUrl}
								title="Mobile Live Preview"
								class="h-full w-full transition-opacity duration-500"
								style:opacity={active ? 1 : 0.3}
								sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
							></iframe>
						</div>
					</div>
				{:else if authError && !isLoadingUrl}
					{@render previewError()}
				{:else}
					<div class="flex h-full flex-col items-center justify-center gap-3">
						<div
							class="h-8 w-8 animate-spin rounded-full border-4 border-surface-500/30 border-t-primary-500"
						></div>
						<p class="text-sm text-surface-500">Generating secure preview session...</p>
					</div>
				{/if}
			{:else}
				<div
					class="h-full w-full bg-white transition-all duration-300"
					style="width: {previewWidth}; margin: 0 auto;"
				>
					{#if authorizedUrl}
						<iframe
							bind:this={iframeEl}
							src={authorizedUrl}
							title="Live Preview Content"
							class="h-full w-full transition-opacity duration-500"
							style:opacity={active ? 1 : 0.3}
							sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
						></iframe>

						{#if !isConnected}
							<div
								transition:fade
								class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
							>
								<div class="text-center text-white">
									<div
										class="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white"
									></div>
									<p class="font-medium">Connecting Handshake...</p>
								</div>
							</div>
						{/if}
					{:else if authError && !isLoadingUrl}
						{@render previewError()}
					{:else}
						<div class="flex h-full flex-col items-center justify-center gap-3">
							<div
								class="h-8 w-8 animate-spin rounded-full border-4 border-surface-500/30 border-t-primary-500"
							></div>
							<p class="text-sm text-surface-500">Generating secure preview session...</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div
			role="status"
			aria-live="polite"
			class="mt-2 flex items-center justify-center gap-2 text-center text-[10px] uppercase tracking-wider text-surface-500"
		>
			<span>
				Status:
				<span class={isConnected ? 'text-success-500' : 'text-warning-500'}>
					{isConnected ? 'Synced' : 'Handshaking'}
				</span>
			</span>
			<span>·</span>
			<span>Visual Edit: {visualEditingEnabled ? 'On' : 'Off'}</span>
			{#if autoSaveEnabled}
				<span>·</span>
				<span
					class:text-error-500={autoSaveStatus === 'error'}
					class:text-success-500={autoSaveStatus === 'saved'}
				>
					{autoSaveStatus === 'saving'
						? 'Saving…'
						: autoSaveStatus === 'saved'
							? `Auto-saved ${autoSaveAt}`
							: autoSaveStatus === 'error'
								? 'Auto-save failed'
								: 'Auto-save on'}
				</span>
			{/if}
			{#if pendingPreviewEdits > 0}
				<Badge variant="warning" size="sm">{pendingPreviewEdits} from preview</Badge>
			{/if}
			{#if lastSyncSource}
				<span>· Last: {lastSyncSource}</span>
			{/if}
		</div>
	{/if}
</div>
