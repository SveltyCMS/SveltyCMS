<script lang="ts">
	import SigninIcon from './icons/SigninIcon.svelte';
	import SigninForm from './SigninForm.svelte';

	export let active: undefined | 0 | 1 = undefined;
</script>

<div
	class:active={active == 0}
	class:inactive={active !== undefined && active !== 0}
	class:hover={active == undefined || active == 1}
	on:click
	on:pointerenter
	on:keyup
	class="relative flex flex-col items-center justify-center gap-3"
>
	<SigninForm show={active == 0} />
	<SigninIcon show={active == 1 || active == undefined} />
</div>

<style>
	div {
		--width: 0%;
		background: white;
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
		border-top-right-radius: 5% 50%;
		border-bottom-right-radius: 5% 50%;
		width: calc(var(--width) + 10%);
	}
</style>
