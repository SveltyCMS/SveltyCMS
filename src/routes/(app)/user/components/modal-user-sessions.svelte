<!--
@file src/routes/(app)/user/components/modal-user-sessions.svelte
@component
@description Admin modal for inspecting and revoking active user sessions.
Features:
- Fetches active sessions via GET /api/user/sessions?admin=1&userId=X
- Surfaces device category, browser, operating system, IP address, and last active timestamp
- Identifies current device session with a badge
- Supports revoking individual sessions via DELETE /api/user/sessions/:id?admin=1
- Supports revoking all other sessions with confirmation
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Avatar from '@components/ui/avatar.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { showConfirm } from '@utils/modal.svelte';
	import { normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import type { User } from '@src/databases/auth/types';
	import { page } from '$app/state';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { formatDateTime } from '@utils/format-date';

	interface SessionItem {
		_id: string;
		id?: string;
		ip?: string;
		ipAddress?: string;
		userAgent?: string;
		lastAccess?: string | Date;
		lastActiveAt?: string | Date;
		isCurrent?: boolean;
		createdAt?: string | Date;
		expires?: string | Date;
	}

	interface Props {
		close?: (val?: unknown) => void;
		user: User;
	}

	let { close = () => {}, user }: Props = $props();

	let sessions = $state<SessionItem[]>([]);
	let loading = $state(true);
	let revokingId = $state<string | null>(null);
	let revokingAll = $state(false);

	function parseDevice(ua = ''): { device: string; browser: string; icon: string } {
		const lower = ua.toLowerCase();
		let icon = 'mdi:laptop';
		let device = 'Desktop / Laptop';

		if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
			icon = 'mdi:cellphone';
			device = 'Mobile Device';
		} else if (lower.includes('ipad') || lower.includes('tablet')) {
			icon = 'mdi:tablet';
			device = 'Tablet';
		}

		let browser = 'Unknown Browser';
		if (lower.includes('firefox')) browser = 'Firefox';
		else if (lower.includes('edg/')) browser = 'Edge';
		else if (lower.includes('chrome')) browser = 'Chrome';
		else if (lower.includes('safari')) browser = 'Safari';
		else if (lower.includes('curl')) browser = 'CLI / cURL';
		else if (lower.includes('postman')) browser = 'Postman API';

		let os = '';
		if (lower.includes('windows')) os = 'Windows';
		else if (lower.includes('macintosh') || lower.includes('mac os')) os = 'macOS';
		else if (lower.includes('linux')) os = 'Linux';
		else if (lower.includes('android')) os = 'Android';
		else if (lower.includes('iphone') || lower.includes('ios')) os = 'iOS';

		return {
			device: os ? `${device} (${os})` : device,
			browser,
			icon
		};
	}

	function formatTime(val?: string | Date): string {
		if (!val) return 'Recently';
		return formatDateTime(
			val,
			{
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			},
			undefined,
			String(val)
		);
	}

	async function loadSessions() {
		loading = true;
		try {
			const uid = String(user._id ?? '');
			const res = await fetch(`/api/user/sessions?admin=1&userId=${encodeURIComponent(uid)}`);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to retrieve active sessions');
			}
			const json = await res.json();
			if (json.success && Array.isArray(json.data)) {
				sessions = json.data;
			} else {
				sessions = [];
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error loading sessions';
			toast.error(msg);
			sessions = [];
		} finally {
			loading = false;
		}
	}

	async function handleRevoke(sessionId: string) {
		revokingId = sessionId;
		try {
			const res = await fetch(`/api/user/sessions/${encodeURIComponent(sessionId)}?admin=1`, {
				method: 'DELETE',
				headers: clientJsonHeaders((page.data as any)?.csrfToken)
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to revoke session');
			}
			sessions = sessions.filter((s) => (s._id || s.id) !== sessionId);
			toast.success('Session revoked successfully');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to revoke session';
			toast.error(msg);
		} finally {
			revokingId = null;
		}
	}

	async function handleRevokeAll() {
		const confirmed = await showConfirm({
			title: 'Revoke All Sessions',
			body: `Are you sure you want to revoke all active sessions for ${user.username || user.email}? The user will be logged out everywhere.`,
			confirmText: 'Revoke All',
			cancelText: 'Cancel'
		});
		if (!confirmed) return;

		revokingAll = true;
		try {
			for (const s of sessions) {
				const sid = s._id || s.id;
				if (!sid) continue;
				await fetch(`/api/user/sessions/${encodeURIComponent(sid)}?admin=1`, {
					method: 'DELETE',
					headers: clientJsonHeaders((page.data as any)?.csrfToken)
				}).catch(() => {});
			}
			sessions = [];
			toast.success('All sessions have been revoked');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error revoking all sessions';
			toast.error(msg);
		} finally {
			revokingAll = false;
		}
	}

	onMount(() => {
		void loadSessions();
	});
</script>

<div class="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 p-4 sm:p-6" data-testid="modal-user-sessions">
	<!-- Header with user context -->
	<div class="flex items-center justify-between border-b border-surface-500/20 pb-4">
		<div class="flex items-center gap-3">
			<Avatar
				src={normalizeAvatarUrl(user.avatar ?? '/Default_User.svg')}
				initials={user.username ? user.username.slice(0, 2).toUpperCase() : 'US'}
				size="size-11"
				class="rounded-full border border-surface-500/30"
			/>
			<div>
				<div class="flex items-center gap-2">
					<h2 class="text-base font-semibold text-surface-900 dark:text-surface-50">
						{user.username || user.email}
					</h2>
					<Badge preset="tonal" color="primary" size="sm">
						{user.role || 'user'}
					</Badge>
				</div>
				<p class="text-xs text-surface-500 dark:text-surface-400">
					{user.email} • ID: <span class="font-mono">{user._id}</span>
				</p>
			</div>
		</div>
		<Button
			variant="ghost"
			size="sm"
			type="button"
			onclick={() => close()}
			aria-label="Close modal"
			class="h-8 w-8 min-w-0 p-0"
		>
			<iconify-icon icon="mdi:close" width="18"></iconify-icon>
		</Button>
	</div>

	<!-- Sessions List -->
	<div class="flex min-h-56 max-h-96 flex-col gap-2 overflow-y-auto pe-1">
		{#if loading}
			<div class="flex flex-1 items-center justify-center py-8 text-surface-500">
				<iconify-icon icon="mdi:loading" width="28" class="animate-spin text-primary-500"></iconify-icon>
				<span class="ms-2 text-sm">Loading active sessions...</span>
			</div>
		{:else if sessions.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center py-10 text-center text-surface-500">
				<iconify-icon icon="mdi:shield-check-outline" width="36" class="mb-2 text-success-500"></iconify-icon>
				<p class="text-sm font-medium">No active sessions found.</p>
				<p class="text-xs opacity-75">This user has no logged-in devices currently active.</p>
			</div>
		{:else}
			{#each sessions as s (s._id || s.id)}
				{@const info = parseDevice(s.userAgent)}
				<div
					class="flex items-center justify-between gap-3 rounded-lg border border-surface-500/20 bg-surface-500/10 p-3 transition-colors hover:bg-surface-500/10 dark:border-surface-500/40 dark:bg-surface-800/40 dark:hover:bg-surface-800/80"
				>
					<div class="flex items-center gap-3 min-w-0">
						<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-500/10 text-surface-700 dark:bg-surface-700 dark:text-surface-200">
							<iconify-icon icon={info.icon} width="22"></iconify-icon>
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
									{info.browser} on {info.device}
								</span>
								{#if s.isCurrent}
									<Badge preset="tonal" color="success" size="sm">
										Current Device
									</Badge>
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
								<span>IP: <span class="font-mono font-medium">{s.ip || s.ipAddress || '127.0.0.1'}</span></span>
								<span>•</span>
								<span>Last active: {formatTime(s.lastAccess || s.lastActiveAt)}</span>
							</div>
						</div>
					</div>

					<Button
						variant="ghost"
						size="sm"
						type="button"
						disabled={revokingId === (s._id || s.id)}
						onclick={() => handleRevoke(s._id || s.id || '')}
						aria-label="Revoke this session"
						class="shrink-0 text-error-500 hover:bg-error-500/10 hover:text-error-600 dark:hover:bg-error-500/20"
					>
						{#if revokingId === (s._id || s.id)}
							<iconify-icon icon="mdi:loading" width="16" class="animate-spin"></iconify-icon>
						{:else}
							<iconify-icon icon="mdi:trash-can-outline" width="16" class="me-1"></iconify-icon>
							<span>Revoke</span>
						{/if}
					</Button>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Footer Actions -->
	<div class="flex items-center justify-between border-t border-surface-500/20 pt-4">
		<div>
			{#if sessions.length > 1}
				<Button
					variant="outline"
					size="sm"
					type="button"
					disabled={revokingAll || loading}
					onclick={handleRevokeAll}
					class="text-error-500 hover:bg-error-500/10 hover:text-error-600 dark:border-error-500/30"
				>
					{#if revokingAll}
						<iconify-icon icon="mdi:loading" width="16" class="animate-spin me-1"></iconify-icon>
						<span>Revoking all...</span>
					{:else}
						<iconify-icon icon="mdi:account-off-outline" width="16" class="me-1"></iconify-icon>
						<span>Revoke All Sessions</span>
					{/if}
				</Button>
			{/if}
		</div>
		<Button variant="secondary" size="md" type="button" onclick={() => close()}>
			Close
		</Button>
	</div>
</div>
