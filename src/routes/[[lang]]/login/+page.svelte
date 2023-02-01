<script lang="ts">
	import RoundLogo from './components/icons/RoundLogo.svelte';
	import Signin from './components/Signin.svelte';
	import SignUp from './components/Signup.svelte';

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';

	// let email: string;
	// let password: string;
</script>

<div class="body" style="background:{background} ">
	<Signin {active} on:click={() => (active = 0)} on:pointerenter={() => (background = '#242728')} />
	<SignUp {active} on:click={() => (active = 1)} on:pointerenter={() => (background = 'white')} />
	{#if active == undefined}
		<div class="z-30"><RoundLogo /></div>
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
