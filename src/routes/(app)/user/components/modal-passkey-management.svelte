<!--
@file src/routes/(app)/user/components/modal-passkey-management.svelte
@component
**Passkey & Biometric Authentication Management Modal**

Features:
- View all registered Passkeys and WebAuthn authenticators
- Register new Passkey using native browser WebAuthn API (FaceID, TouchID, Windows Hello, Security Key)
- Revoke registered authenticators with confirmation
- Formatted dates and device transport badges
- Accessible WCAG 2.2 AA modal with keyboard navigation
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { modalState, showConfirm } from '@utils/modal.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { formatDateTime } from '@utils/format-date';
	import { base64UrlToBuffer, bufferToBase64Url, isPasskeySupported } from '@utils/webauthn-client';
	import {
		userpasskey_add,
		userpasskey_add_aria,
		userpasskey_cancel,
		userpasskey_cancelled_description,
		userpasskey_cancelled_title,
		userpasskey_close,
		userpasskey_close_dialog,
		userpasskey_description,
		userpasskey_device_label,
		userpasskey_empty_description,
		userpasskey_empty_title,
		userpasskey_key_number,
		userpasskey_registered_authenticators,
		userpasskey_registered_count,
		userpasskey_registered_description,
		userpasskey_registered_title,
		userpasskey_registration_error_title,
		userpasskey_registration_failed_title,
		userpasskey_registration_options_failed,
		userpasskey_revoke,
		userpasskey_revoke_aria,
		userpasskey_revoke_confirm_body,
		userpasskey_revoke_confirm_button,
		userpasskey_revoke_confirm_title,
		userpasskey_revoked_description,
		userpasskey_revoked_title,
		userpasskey_revocation_error_description,
		userpasskey_revocation_failed_description,
		userpasskey_revocation_failed_title,
		userpasskey_stopped_description,
		userpasskey_synced,
		userpasskey_title,
		userpasskey_type_device,
		userpasskey_type_synced,
		userpasskey_unsupported_description,
		userpasskey_unsupported_title,
		userpasskey_verification_failed_description,
		userpasskey_verification_failed_title
	} from '@src/paraglide/messages';
	import { getPasskeyRegisterOptions, verifyPasskeyRegister } from '@src/routes/login/auth.remote';
	import { revokePasskey } from '../user.remote';
	import type { Authenticator, User } from '@src/databases/auth/types';

	interface Props {
		user?: User;
		onSuccess?: () => void;
	}

	const { user: userProp, onSuccess }: Props = $props();
	const user = $derived(userProp ?? (page.data.user as User) ?? {});
	// One-time mount seed — revoke/register update this list directly; a later
	// `user` prop change must not silently overwrite in-flight edits.
	let authenticators = $state<Authenticator[]>(
		untrack(() => (user?.authenticators as Authenticator[]) || [])
	);
	let isRegistering = $state(false);
	let isRevoking = $state<string | null>(null);

	function getDeviceIcon(deviceType?: string, transports?: string[]): string {
		if (transports?.includes('nfc') || transports?.includes('usb')) return 'mdi:security-network';
		if (transports?.includes('ble')) return 'mdi:bluetooth';
		if (deviceType === 'multiDevice') return 'mdi:cloud-sync';
		return 'mdi:fingerprint';
	}

	function getDeviceLabel(authenticator: Authenticator, idx: number): string {
		const type =
			authenticator.credentialDeviceType === 'multiDevice'
				? userpasskey_type_synced()
				: userpasskey_type_device();
		const date = authenticator.createdAt
			? formatDateTime(authenticator.createdAt, { dateStyle: 'medium' })
			: userpasskey_key_number({ number: idx + 1 });
		return userpasskey_device_label({ type, date });
	}

	async function handleRegisterPasskey() {
		if (!isPasskeySupported()) {
			toast.error({
				title: userpasskey_unsupported_title(),
				description: userpasskey_unsupported_description()
			});
			return;
		}

		isRegistering = true;
		try {
			const res = await getPasskeyRegisterOptions(undefined);
			if (!res.success || !res.options) {
				toast.error({
					title: userpasskey_registration_error_title(),
					description: res.message || userpasskey_registration_options_failed()
				});
				return;
			}

			const options = res.options;
			const credential = (await navigator.credentials.create({
				publicKey: {
					...options,
					challenge: base64UrlToBuffer(options.challenge),
					user: {
						...options.user,
						id: base64UrlToBuffer(options.user.id)
					},
					excludeCredentials: options.excludeCredentials?.map((c) => ({
						...c,
						id: base64UrlToBuffer(c.id),
						transports: c.transports as AuthenticatorTransport[] | undefined
					}))
				}
			})) as PublicKeyCredential | null;

			if (!credential) {
				toast.warning({
					title: userpasskey_cancelled_title(),
					description: userpasskey_cancelled_description()
				});
				return;
			}

			const response = credential.response as AuthenticatorAttestationResponse;
			const verifyRes = await verifyPasskeyRegister({
				attestation: {
					id: credential.id,
					rawId: bufferToBase64Url(credential.rawId),
					type: credential.type,
					response: {
						clientDataJSON: bufferToBase64Url(response.clientDataJSON),
						attestationObject: bufferToBase64Url(response.attestationObject)
					}
				}
			});

			if (verifyRes.success) {
				toast.success({
					title: userpasskey_registered_title(),
					description: userpasskey_registered_description()
				});
				onSuccess?.();
				modalState.close();
			} else {
				toast.error({
					title: userpasskey_verification_failed_title(),
					description: verifyRes.message || userpasskey_verification_failed_description()
				});
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('abort') || message.includes('cancel')) {
				toast.warning({
					title: userpasskey_cancelled_title(),
					description: userpasskey_stopped_description()
				});
			} else {
				toast.error({ title: userpasskey_registration_failed_title(), description: message });
			}
		} finally {
			isRegistering = false;
		}
	}

	function handleRevokePasskey(credentialID: string) {
		showConfirm({
			title: userpasskey_revoke_confirm_title(),
			body: userpasskey_revoke_confirm_body(),
			theme: { variant: 'filled', color: 'error' },
			confirmText: userpasskey_revoke_confirm_button(),
			onConfirm: async () => {
				isRevoking = credentialID;
				try {
					const res = await revokePasskey({ credentialID });
					if (res.success) {
						authenticators = authenticators.filter((a) => a.credentialID !== credentialID);
						toast.success({
							title: userpasskey_revoked_title(),
							description: userpasskey_revoked_description()
						});
						onSuccess?.();
					} else {
						toast.error({
							title: userpasskey_revocation_failed_title(),
							description: res.error || userpasskey_revocation_failed_description()
						});
					}
				} catch (err: unknown) {
					toast.error({
						title: userpasskey_revocation_failed_title(),
						description:
							err instanceof Error ? err.message : userpasskey_revocation_error_description()
					});
				} finally {
					isRevoking = null;
				}
			}
		});
	}
</script>

<div class="flex flex-col gap-6 p-6 text-start">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4 border-b border-surface-500/20 pb-4">
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500 dark:bg-primary-500/20"
			>
				<iconify-icon icon="mdi:fingerprint" width={24} aria-hidden="true"></iconify-icon>
			</div>
			<div>
				<h2 class="text-lg font-bold text-surface-900 dark:text-surface-100">
					{userpasskey_title()}
				</h2>
				<p class="text-xs text-surface-500">{userpasskey_description()}</p>
			</div>
		</div>
		<button
			type="button"
			onclick={() => modalState.close()}
			aria-label={userpasskey_close_dialog()}
			class="rounded-lg p-1.5 text-surface-400 hover:bg-surface-500/10 hover:text-surface-600 dark:hover:text-surface-400"
		>
			<iconify-icon icon="mdi:close" width={20} aria-hidden="true"></iconify-icon>
		</button>
	</div>

	<!-- Passkey list -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-surface-500">
				{userpasskey_registered_authenticators()}
			</h3>
			<Badge variant="surface" size="sm">
				{userpasskey_registered_count({ count: authenticators.length })}
			</Badge>
		</div>

		{#if authenticators.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-500/30 p-8 text-center"
			>
				<div class="mb-2 text-surface-400">
					<iconify-icon icon="mdi:key-outline" width={36} aria-hidden="true"></iconify-icon>
				</div>
				<p class="text-sm font-medium text-surface-600 dark:text-surface-400">
					{userpasskey_empty_title()}
				</p>
				<p class="mt-1 max-w-sm text-xs text-surface-500">
					{userpasskey_empty_description()}
				</p>
			</div>
		{:else}
			<div
				class="divide-y divide-surface-500/15 rounded-xl border border-surface-500/20 bg-surface-500/10"
			>
				{#each authenticators as auth, idx (auth.credentialID)}
					<div class="flex items-center justify-between p-3.5">
						<div class="flex items-center gap-3">
							<div
								class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-500/10 text-surface-600 dark:text-surface-400"
							>
								<iconify-icon
									icon={getDeviceIcon(auth.credentialDeviceType, auth.transports)}
									width={20}
									aria-hidden="true"
								></iconify-icon>
							</div>
							<div>
								<p class="text-sm font-semibold text-surface-900 dark:text-surface-100">
									{getDeviceLabel(auth, idx)}
								</p>
								<div class="flex items-center gap-2 text-xs text-surface-500">
									<span class="font-mono text-[11px] opacity-75"
										>{auth.credentialID.slice(0, 12)}…</span
									>
									{#if auth.credentialBackedUp}
										<span class="inline-flex items-center gap-0.5 text-success-500">
											<iconify-icon icon="mdi:check-circle-outline" width={12} aria-hidden="true"
											></iconify-icon>
											{userpasskey_synced()}
										</span>
									{/if}
								</div>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="text-error-500 hover:bg-error-500/10 hover:border-error-500/40"
							aria-label={userpasskey_revoke_aria()}
							loading={isRevoking === auth.credentialID}
							onclick={() => handleRevokePasskey(auth.credentialID)}
						>
							<iconify-icon icon="mdi:trash-can-outline" width={16} aria-hidden="true"
							></iconify-icon>
							{userpasskey_revoke()}
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer / Actions -->
	<div
		class="flex flex-col-reverse justify-end gap-2 border-t border-surface-500/20 pt-4 sm:flex-row"
	>
		<Button
			variant="outline"
			type="button"
			onclick={() => modalState.close()}
			aria-label={userpasskey_cancel()}
		>
			{userpasskey_close()}
		</Button>
		<Button
			variant="primary"
			type="button"
			loading={isRegistering}
			onclick={handleRegisterPasskey}
			aria-label={userpasskey_add_aria()}
			class="flex items-center justify-center gap-2"
		>
			<iconify-icon icon="mdi:plus-circle-outline" width={18} aria-hidden="true"></iconify-icon>
			{userpasskey_add()}
		</Button>
	</div>
</div>
