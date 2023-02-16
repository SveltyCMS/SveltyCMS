<script lang="ts">
	import type { ActionData } from './$types';
	import RoundLogo from './components/icons/RoundLogo.svelte';

	import Signin from './components/Signin.svelte';
	import SignUp from './components/Signup.svelte';

	export let form: ActionData;

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';
</script>

<div class="body" style="background:{background} ">
	<Signin
		signInError={form?.type === 'SIGN_IN_ERROR' ? form.message : undefined}
		{active}
		on:click={() => (active = 0)}
		on:pointerenter={() => (background = '#242728')}
	/>
	<SignUp
		singUpError={form?.type === 'SIGN_UP_ERROR' ? form.message : undefined}
		{active}
		on:click={() => (active = 1)}
		on:pointerenter={() => (background = 'white')}
	/>
	{#if active == undefined}
		<div class="">
			<RoundLogo />
		</div>
	{/if}
</div>

<style>
	.body {
		width: 100vw;
		height: 100vh;
		display: flex;
		background: linear-gradient(90deg, #242728 50%, white 50%);
	}
	:global(html, body, body > div, .body) {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}
</style>
