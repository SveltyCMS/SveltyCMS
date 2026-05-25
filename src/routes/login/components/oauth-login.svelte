<!--
@file src/routes/login/components/oauth-login.svelte
@component
**OAuth Login button**

### Props
- `showGoogleOAuth`: boolean — whether to render the Google OAuth button (controlled by parent/server)
- `showGithubOAuth`: boolean — whether to render the GitHub OAuth button (controlled by parent/server)
- `firstCollectionPath`: string — passed from parent; avoids a server round-trip on hover

### Features:
- Prefetches first collection on hover for instant navigation post-auth
- Accessible Google sign-in button with <span> (not <p>) inside <button>
-->

<script lang="ts">
import { preloadData } from "$app/navigation";

const {
	showGoogleOAuth = true,
	showGithubOAuth = true,
	firstCollectionPath = "",
}: {
	showGoogleOAuth?: boolean;
	showGithubOAuth?: boolean;
	firstCollectionPath?: string;
} = $props();

let prefetched = $state(false);

/**
 * Parent already has firstCollectionPath from the load function.
 * Use it directly instead of firing a ?/prefetch server action on every hover.
 * This eliminates an unnecessary server round-trip.
 */
async function prefetchFirstCollection() {
	if (prefetched || !firstCollectionPath) return;
	prefetched = true;
	try {
		await preloadData(firstCollectionPath);
	} catch (error) {
		console.error("OAuth prefetch failed:", error);
	}
}
</script>

<!--
	The parent (SignIn / SignUp) already gates showOAuth on the
	USE_GOOGLE_OAUTH env var via pageData.showOAuth, so double-checking
	it here is unnecessary. Using <span> instead of <p> because <p> is a
	block element and invalid inside an inline context like <button>.
-->
<div class="flex flex-col gap-2 w-full sm:w-auto">
	{#if showGoogleOAuth}
		<form
			id="google-oauth-login"
			action="?/signInOAuth"
			method="post"
			class="flex flex-col items-center justify-center w-full"
		>
			<button
				form="google-oauth-login"
				type="submit"
				aria-label="Sign in with Google"
				class="preset-filled-surface-500 btn w-full"
				onmouseenter={prefetchFirstCollection}
			>
				<iconify-icon icon="flat-color-icons:google" width={24} aria-hidden="true"></iconify-icon>
				<span>Sign in with Google</span>
			</button>
		</form>
	{/if}

	{#if showGithubOAuth}
		<form
			id="github-oauth-login"
			action="?/signInOAuthGithub"
			method="post"
			class="flex flex-col items-center justify-center w-full"
		>
			<button
				form="github-oauth-login"
				type="submit"
				aria-label="Sign in with GitHub"
				class="preset-filled-surface-500 btn w-full"
				onmouseenter={prefetchFirstCollection}
			>
				<iconify-icon icon="mdi:github" width={24} aria-hidden="true"></iconify-icon>
				<span>Sign in with GitHub</span>
			</button>
		</form>
	{/if}
</div>
