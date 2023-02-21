<script lang="ts">
	import SignupIcon from './icons/SignupIcon.svelte';
	import SignupForm from './SignupForm.svelte';

	export let active: undefined | 0 | 1 = undefined;
	export let firstUserExists = false;
</script>

<div
	class:active={active == 1}
	class:inactive={active !== undefined && active !== 1}
	class:hover={active == undefined || active == 0}
	on:click
	on:pointerenter
	on:keydown
	class="relative flex flex-col items-center justify-center gap-3"
>
	<SignupForm show={active == 1} {firstUserExists} />
	<SignupIcon show={active == 0 || active == undefined} />
</div>

<style>
	div {
		--width: 0%;
		background: #242728;
		flex-grow: 1;
		width: var(--width);
		transition: 0.4s;
	}
	.active {
		--width: 90%;
	}
	.inactive {
		--width: 10%;
	}
	.hover:hover {
		border-top-left-radius: 5% 50%;
		border-bottom-left-radius: 5% 50%;
		width: calc(var(--width) + 10%);
	}
</style>
