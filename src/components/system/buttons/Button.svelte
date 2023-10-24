<script>
	export let textColor = 'white';
	export let bgColor = 'gray';
	export let border = 'none;';
</script>

<button on:click class={$$props.class} style={`color: ${textColor}; background-color: ${bgColor}; border: ${border};`}>
	<slot />
</button>

<style>
	button {
		padding: 10px 30px;
		text-align: center;
		border-radius: 6px;
		transition: background-color 0.2s ease-in-out;
		user-select: none;
	}
	button:hover {
		background-color: #4fdc4f !important;
	}
	button:active {
		transform: scale(0.9);
	}
</style>
