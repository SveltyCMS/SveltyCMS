<!--
@file src/routes/share/[token]/+page.svelte
@component
**Premium public share landing page with password protection support and file download**

### Features:
- Token-driven dark/light share surface (system fonts, no remote asset loads)
- Dynamic download button
- Cryptographic password protection verification
- Performance-focused responsive layout
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { formatBytes } from '@utils/file';
	import { toast } from '@src/stores/toast.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let isVerifying = $state(false);
	let passwordError = $state(false);
	let isDownloading = $state(false);

	// Helper to format file types
	function formatMime(mime: string | undefined = undefined) {
		if (!mime) return 'FILE';
		return mime.split('/')[1]?.toUpperCase() || mime.toUpperCase();
	}

	function getFileIcon(type: string | undefined = undefined) {
		switch (type) {
			case 'image':
				return 'mdi:image-outline';
			case 'video':
				return 'mdi:video-outline';
			case 'audio':
				return 'mdi:music-note';
			default:
				return 'mdi:file-document-outline';
		}
	}

	function handleDownloadClick(e: MouseEvent) {
		if (data.passwordRequired && !password) {
			toast.error('Please enter the password to download this file.');
			e.preventDefault();
			return;
		}
		isDownloading = true;
		setTimeout(() => {
			isDownloading = false;
		}, 3000);
	}

	async function handleVerifyPassword(e: SubmitEvent) {
		e.preventDefault();
		if (!password) return;

		isVerifying = true;
		passwordError = false;

		const downloadUrl = `/api/media/share?id=${data.mediaId}&token=${data.token}&password=${encodeURIComponent(password)}`;

		try {
			// Test the password against the download API endpoint
			const res = await fetch(downloadUrl);

			if (res.ok) {
				// The API answers `{ success, data }`; a wrong password returns
				// `data.passwordRequired: true` instead of a file.
				const body = (await res.json().catch(() => null)) as {
					data?: { passwordRequired?: boolean };
				} | null;

				if (body?.data?.passwordRequired) {
					passwordError = true;
				} else {
					// Password is correct, let's trigger the download!
					toast.success('Password verified! Starting download...');
					window.location.href = downloadUrl;
				}
			} else {
				passwordError = true;
				toast.error('Verification failed.');
			}
		} catch {
			toast.error('An error occurred during verification.');
		} finally {
			isVerifying = false;
		}
	}
</script>

<svelte:head>
	<title>Share: {data.filename} - SveltyCMS</title>
	<meta name="description" content="Download shared file from SveltyCMS" />
</svelte:head>

<div class="share-page-container">
	<div class="background-glows">
		<div class="glow glow-1"></div>
		<div class="glow glow-2"></div>
	</div>

	<div class="card-wrapper animate-fade-in">
		<div class="logo-area">
			<span class="logo-text">SVELTY<span class="accent">CMS</span></span>
		</div>

		<div class="file-card">
			<div class="icon-glow-wrapper">
				<div class="file-icon-box">
					<iconify-icon icon={getFileIcon(data.type)} width="48"></iconify-icon>
				</div>
			</div>

			<h1 class="file-title" title={data.filename}>{data.filename}</h1>

			<div class="file-meta">
				<span class="meta-tag">{formatMime(data.mimeType)}</span>
				<span class="meta-separator">•</span>
				<span class="meta-size">{formatBytes(data.size)}</span>
			</div>

			{#if data.passwordRequired}
				<form onsubmit={handleVerifyPassword} class="password-form">
					<p class="form-instruction">This shared file is password protected.</p>

					<div class="password-field">
						<Input
							label="Password"
							type="password"
							bind:value={password}
							placeholder="Enter password..."
							autocomplete="current-password"
							required
							error={passwordError ? 'Incorrect password. Please try again.' : undefined}
							oninput={() => (passwordError = false)}
							inputClass="text-(--admin-text-body)"
						>
							{#snippet pre()}
								<iconify-icon icon="mdi:lock-outline" width="20"></iconify-icon>
							{/snippet}
						</Input>
					</div>

					<Button variant="outline" type="submit" disabled={isVerifying} class="glow-effect">
						{#if isVerifying}
							<iconify-icon icon="mdi:loading" class="animate-spin" width="20"></iconify-icon>
							<span>Verifying...</span>
						{:else}
							<iconify-icon icon="mdi:key-outline" width="20"></iconify-icon>
							<span>Unlock & Download</span>
						{/if}
					</Button>
				</form>
			{:else}
				<div class="download-action-area">
					<p class="form-instruction">Click the button below to download the file directly.</p>

					<Button
						href="/api/media/share?id={data.mediaId}&token={data.token}"
						onclick={handleDownloadClick}
						class="glow-effect download-link w-full rounded-xl bg-linear-to-br from-tertiary-500 to-tertiary-600 py-3.5 px-6 font-semibold text-white shadow-[0_10px_15px_-3px_rgba(37,99,235,0.3)] hover:translate-y-0.5 hover:shadow-[0_15px_20px_-3px_rgba(37,99,235,0.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
						download={data.filename}
						disabled={isDownloading}
					>
						{#if isDownloading}
							<iconify-icon icon="mdi:loading" class="animate-spin" width="20"></iconify-icon>
							<span>Downloading...</span>
						{:else}
							<iconify-icon icon="mdi:download-outline" width="20"></iconify-icon>
							<span>Download File</span>
						{/if}
					</Button>
				</div>
			{/if}
		</div>

		<div class="footer-note">Secured by SveltyCMS high-performance asset engine.</div>
	</div>
</div>

<style>
	.share-page-container {
		display: flex;
		min-height: 100dvh;
		width: 100%;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		padding: 2rem;
		box-sizing: border-box;
		background-color: var(--admin-bg-page, var(--color-surface-950));
		color: var(--admin-text-body, var(--color-surface-100));
		font-family: var(
			--font-sans,
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			'Helvetica Neue',
			Arial,
			sans-serif
		);
	}

	.background-glows {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}

	.glow {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.15;
	}

	.glow-1 {
		top: 20%;
		inset-inline-start: 25%;
		width: 300px;
		height: 300px;
		background: var(--color-tertiary-500);
	}

	.glow-2 {
		bottom: 25%;
		inset-inline-end: 25%;
		width: 350px;
		height: 350px;
		background: var(--color-primary-500);
	}

	.card-wrapper {
		position: relative;
		z-index: 10;
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.logo-area {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		opacity: 0.8;
	}

	.accent {
		color: var(--color-tertiary-500);
	}

	.file-card {
		width: 100%;
		background: rgb(17 24 39 / 0.6);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 24px;
		padding: 3rem 2.5rem;
		box-sizing: border-box;
		box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		/* The card is always a dark glass surface, so its text stays on the
		   light end of the ramp even when the page itself is in light mode. */
		color: var(--color-surface-50);
	}

	.icon-glow-wrapper {
		position: relative;
		margin-bottom: 1.5rem;
	}

	.icon-glow-wrapper::after {
		content: '';
		position: absolute;
		inset: -5px;
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		border-radius: 20px;
		filter: blur(8px);
		opacity: 0.4;
		z-index: -1;
	}

	.file-icon-box {
		width: 80px;
		height: 80px;
		background: var(--color-surface-800);
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-tertiary-400);
	}

	.file-title {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: var(--color-surface-50);
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: var(--color-surface-400);
		margin-bottom: 2.5rem;
	}

	.meta-tag {
		background: rgb(59 130 246 / 0.1);
		color: var(--color-tertiary-400);
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.75rem;
		letter-spacing: 0.05em;
	}

	.meta-separator {
		opacity: 0.3;
	}

	.form-instruction {
		font-size: 0.925rem;
		color: var(--color-surface-400);
		margin-bottom: 1.25rem;
	}

	.password-form,
	.download-action-area {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.password-field {
		width: 100%;
		margin-bottom: 1.25rem;
		text-align: start;
	}

	.footer-note {
		font-size: 0.75rem;
		color: var(--color-surface-500);
		text-align: center;
	}

	/* Micro-animations */
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(15px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-fade-in,
		.animate-spin {
			animation: none;
		}
	}
</style>
