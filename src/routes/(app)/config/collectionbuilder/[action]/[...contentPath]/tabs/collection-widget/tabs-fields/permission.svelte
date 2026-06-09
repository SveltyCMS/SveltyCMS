<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/tabs-fields/permission.svelte
@component
**AUTH tab: permission and access control for the selected widget/field**

Purpose: Manage permission and access control only (no UI settings like label, helper, width).
Data: All AUTH settings stored in field.permissions (WidgetFieldPermissions).
Features: Visibility (public/private), requiredAuth, readRoles, writeRoles (multi-select).
-->

<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import type { Role } from "@src/databases/auth/types";
import type { WidgetFieldPermissions } from "@src/content/types";
import { collections } from "@src/stores/collection-store.svelte";
import { modalState } from "@utils/modal.svelte";

interface Props {
	/** Roles for role-based access (e.g. from edit page data). Used when not in modal. */
	roles?: Role[];
}

const { roles: rolesProp = [] }: Props = $props();

const DEFAULT_PERMISSIONS: WidgetFieldPermissions = {
	visibility: "public",
	requiredAuth: false,
	readRoles: [],
	writeRoles: [],
};

function isWidgetFieldPermissions(p: unknown): p is WidgetFieldPermissions {
	if (!p || typeof p !== "object") return false;
	const o = p as Record<string, unknown>;
	return (
		("visibility" in o &&
			(o.visibility === "public" || o.visibility === "private")) ||
		("requiredAuth" in o && typeof o.requiredAuth === "boolean") ||
		Array.isArray(o.readRoles) ||
		Array.isArray(o.writeRoles)
	);
}

/** Normalize raw permissions (legacy matrix or new shape) to WidgetFieldPermissions */
function normalizePermissions(raw: unknown): WidgetFieldPermissions {
	if (isWidgetFieldPermissions(raw)) {
		return {
			visibility: raw.visibility ?? DEFAULT_PERMISSIONS.visibility,
			requiredAuth: raw.requiredAuth ?? DEFAULT_PERMISSIONS.requiredAuth,
			readRoles: Array.isArray(raw.readRoles) ? [...raw.readRoles] : [],
			writeRoles: Array.isArray(raw.writeRoles) ? [...raw.writeRoles] : [],
		};
	}
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		const matrix = raw as Record<string, Record<string, boolean>>;
		const readRoles: string[] = [];
		const writeRoles: string[] = [];
		for (const [roleId, perms] of Object.entries(matrix)) {
			if (perms?.read) readRoles.push(roleId);
			if (perms?.write || perms?.update) writeRoles.push(roleId);
		}
		return {
			visibility: "public",
			requiredAuth: false,
			readRoles,
			writeRoles,
		};
	}
	return { ...DEFAULT_PERMISSIONS };
}

// Prefer store target (has __fieldIndex for persistence); fall back to modal value when adding new field
const inModal = $derived(!!modalState.active);
const target = $derived(
	(collections.targetWidget as Record<string, unknown> | undefined) ??
		(inModal
			? (modalState.active?.props?.value as Record<string, unknown> | undefined)
			: undefined),
);
const roles = $derived(
	inModal
		? ((modalState.active?.props as { roles?: Role[] })?.roles ?? rolesProp)
		: rolesProp,
);
const permissions = $derived(normalizePermissions(target?.permissions));

function updatePermissions(next: Partial<WidgetFieldPermissions>) {
	const merged: WidgetFieldPermissions = {
		...permissions,
		...next,
	};
	if (!target) return;
	const updatedTarget = { ...target, permissions: merged };
	collections.setTargetWidget(updatedTarget as any);
	// Store merges into active.fields when __fieldIndex is set; no need to call setCollection here
}

function toggleVisibility() {
	updatePermissions({
		visibility: permissions.visibility === "public" ? "private" : "public",
	});
}

function toggleRoleRead(roleId: string) {
	const set = new SvelteSet(permissions.readRoles ?? []);
	if (set.has(roleId)) set.delete(roleId);
	else set.add(roleId);
	updatePermissions({ readRoles: [...set] });
}

function toggleRoleWrite(roleId: string) {
	const set = new SvelteSet(permissions.writeRoles ?? []);
	if (set.has(roleId)) set.delete(roleId);
	else set.add(roleId);
	updatePermissions({ writeRoles: [...set] });
}
</script>

{#if target}
	<div class="space-y-5 text-surface-100">
		<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900 p-4 shadow-sm">
			<h4 class="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-surface-400">Visibility</h4>
			<button
				type="button"
				role="switch"
				aria-checked={permissions.visibility === 'private'}
				class="flex w-full items-center justify-between rounded border border-surface-200-800 bg-surface-50-950 px-4 py-3 text-start transition-colors hover:border-primary-500/60 hover:bg-surface-100-900"
				onclick={toggleVisibility}
			>
				<span class="font-semibold text-surface-100">{permissions.visibility === 'public' ? 'Public' : 'Private'}</span>
				<iconify-icon icon={permissions.visibility === 'public' ? 'mdi:eye' : 'mdi:eye-off'} width="20" class="text-surface-400"></iconify-icon>
			</button>
			<p class="mt-2 text-xs leading-5 text-surface-400">
				{permissions.visibility === 'public' ? 'Field is visible to everyone by default.' : 'Field is restricted; only allowed roles can access.'}
			</p>
		</div>

		<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900 p-4 shadow-sm">
			<label class="flex cursor-pointer items-center gap-3 rounded border border-surface-200-800 bg-surface-50-950 p-3">
				<input
					type="checkbox"
					class="input checkbox-primary"
					checked={permissions.requiredAuth ?? false}
					onchange={(e) => updatePermissions({ requiredAuth: (e.currentTarget as HTMLInputElement).checked })}
				 aria-label="Input" />
				<span class="text-sm font-semibold text-surface-100">Require authentication</span>
			</label>
			<p class="mt-2 text-xs leading-5 text-surface-400">When enabled, user must be logged in to access this field.</p>
		</div>

		{#if roles.length > 0}
			<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900 p-4 shadow-sm">
				<h4 class="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-surface-400">Read access</h4>
				<p class="mb-3 text-xs leading-5 text-surface-400">Roles that can read this field. Empty = no role restriction (follows visibility).</p>
				<div class="flex flex-wrap gap-2">
					{#each roles as role (role._id)}
						{#if !role.isAdmin}
							<button
								type="button"
								class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {(permissions.readRoles ?? []).includes(role._id)
									? 'preset-filled-tertiary-500 dark:preset-filled-primary-500'
									: 'border-surface-200-800 bg-surface-50-950 text-surface-200 hover:border-primary-500/60 hover:bg-surface-100-900'}"
								onclick={() => toggleRoleRead(role._id)}
							>
								{role.name ?? role._id}
							</button>
						{/if}
					{/each}
				</div>
			</div>
			<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900 p-4 shadow-sm">
				<h4 class="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-surface-400">Write access</h4>
				<p class="mb-3 text-xs leading-5 text-surface-400">Roles that can edit this field.</p>
				<div class="flex flex-wrap gap-2">
					{#each roles as role (role._id)}
						{#if !role.isAdmin}
							<button
								type="button"
								class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {(permissions.writeRoles ?? []).includes(role._id)
									? 'preset-filled-tertiary-500 dark:preset-filled-primary-500'
									: 'border-surface-200-800 bg-surface-50-950 text-surface-200 hover:border-primary-500/60 hover:bg-surface-100-900'}"
								onclick={() => toggleRoleWrite(role._id)}
							>
								{role.name ?? role._id}
							</button>
						{/if}
					{/each}
				</div>
			</div>
		{:else}
			<div class="rounded-2xl border border-dashed border-surface-200-800 bg-surface-100-900 p-4 text-sm text-surface-400">
				No roles defined. Configure roles in Access Management to restrict by role.
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-surface-400">Select a field to configure permissions.</p>
{/if}
