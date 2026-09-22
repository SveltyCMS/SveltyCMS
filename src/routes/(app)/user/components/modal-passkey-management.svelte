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
			authenticator.credentialDeviceType === 'multiDevice' ? 'Passkey (Synced)' : 'Device Passkey';
		const date = authenticator.createdAt
			? formatDateTime(authenticator.createdAt, { dateStyle: 'medium' })
			: `Key #${idx + 1}`;
		return `${type} · ${date}`;
	}

	async function handleRegisterPasskey() {
		if (!isPasskeySupported()) {
			toast.error({
				title: 'Passkeys Unsupported',
				description: 'Your browser or device does not support WebAuthn Passkeys.'
			});
			return;
		}

		isRegistering = true;
		try {
			const res = await getPasskeyRegisterOptions(undefined);
			if (!res.success || !res.options) {
				toast.error({
					title: 'Registration Error',
					description: res.message || 'Failed to obtain passkey registration options.'
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
				toast.warning({ title: 'Cancelled', description: 'Passkey registration was cancelled.' });
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
					title: 'Passkey Registered',
					description: 'You can now sign in using your biometric passkey.'
				});
				onSuccess?.();
				modalState.close();
			} else {
				toast.error({
					title: 'Verification Failed',
					description: verifyRes.message || 'Failed to verify passkey.'
				});
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('abort') || message.includes('cancel')) {
				toast.warning({ title: 'Cancelled', description: 'Passkey registration stopped.' });
			} else {
				toast.error({ title: 'Registration Failed', description: message });
			}
		} finally {
			isRegistering = false;
		}
	}

	function handleRevokePasskey(credentialID: string) {
		showConfirm({
			title: 'Revoke this Passkey?',
			body: 'You will no longer be able to use this passkey to sign in to your account.',
			theme: { variant: 'filled', color: 'error' },
			confirmText: 'Revoke Passkey',
			onConfirm: async () => {
				isRevoking = credentialID;
				try {
					const res = await revokePasskey({ credentialID });
					if (res.success) {
						authenticators = authenticators.filter((a) => a.credentialID !== credentialID);
						toast.success({
							title: 'Passkey Revoked',
							description: 'The passkey has been removed.'
						});
						onSuccess?.();
					} else {
						toast.error({
							title: 'Revocation Failed',
							description: res.error || 'Failed to remove passkey.'
						});
					}
				} catch (err: unknown) {
					toast.error({
						title: 'Revocation Failed',
						description: err instanceof Error ? err.message : 'Error removing passkey.'
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
					Passkeys &amp; Biometrics
				</h2>
				<p class="text-xs text-surface-500">
					Sign in securely using Touch ID, Face ID, Windows Hello, or hardware security keys.
				</p>
			</div>
		</div>
		<button
			type="button"
			onclick={() => modalState.close()}
			aria-label="Close dialog"
			class="rounded-lg p-1.5 text-surface-400 hover:bg-surface-500/10 hover:text-surface-600 dark:hover:text-surface-400"
		>
			<iconify-icon icon="mdi:close" width={20} aria-hidden="true"></iconify-icon>
		</button>
	</div>

	<!-- Passkey list -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-surface-500">
				Registered Authenticators
			</h3>
			<Badge variant="surface" size="sm">
				{authenticators.length} registered
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
					No Passkeys configured
				</p>
				<p class="mt-1 max-w-sm text-xs text-surface-500">
					Add a passkey to enable instant, zero-password sign-in with your fingerprint, face, or
					security key.
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
											Synced
										</span>
									{/if}
								</div>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="text-error-500 hover:bg-error-500/10 hover:border-error-500/40"
							aria-label="Revoke this passkey"
							loading={isRevoking === auth.credentialID}
							onclick={() => handleRevokePasskey(auth.credentialID)}
						>
							<iconify-icon icon="mdi:trash-can-outline" width={16} aria-hidden="true"
							></iconify-icon>
							Revoke
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
		<Button variant="outline" type="button" onclick={() => modalState.close()} aria-label="Cancel">
			Close
		</Button>
		<Button
			variant="primary"
			type="button"
			loading={isRegistering}
			onclick={handleRegisterPasskey}
			aria-label="Add new Passkey"
			class="flex items-center justify-center gap-2"
		>
			<iconify-icon icon="mdi:plus-circle-outline" width={18} aria-hidden="true"></iconify-icon>
			Add New Passkey
		</Button>
	</div>
</div>
